// Import from a Google Maps "Saved places" list, exported via Google
// Takeout (takeout.google.com -> Saved -> export -> one CSV per list).
// Everything here runs client-side on the file the user picks — no network
// call, no external service (see CLAUDE.md Section 3.1).
//
// Real export files vary in two ways depending on the account's locale:
// delimiter (";" in many European locales, "," elsewhere) and header
// language (German "Titel/Notiz/Kommentar" vs English "Title/Note/Comment").
// Both are detected rather than assumed. The exported file's text encoding
// has also been observed as something other than UTF-8 in the wild (e.g.
// Mac OS Roman) depending on how it was produced/touched before import, so
// decoding falls back accordingly.

const KNOWN_HEADERS = {
  titel: "name",
  title: "name",
  name: "name",
  notiz: "note",
  note: "note",
  url: "url",
  link: "url",
  tags: "tags",
  kommentar: "comment",
  comment: "comment",
};

// A Note field commonly looks like "7/10" or "7/10\nfree text comment".
// Only a whole number out of 10 on its own line is treated as a rating;
// anything else (recommendations, cuisine notes, etc.) is left as a plain
// comment with no rating, i.e. imported as a wishlist entry.
const RATING_PATTERN = /^\s*(\d{1,2})\s*\/\s*10\.?\s*$/;

export async function decodeImportFile(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // Not valid UTF-8 — fall back to the one other encoding observed in
    // real exports. "macintosh" is the WHATWG label for Mac OS Roman.
    return new TextDecoder("macintosh").decode(buffer);
  }
}

// Quote-aware delimited-text parser (handles quoted fields that span
// multiple physical lines, e.g. a multi-line Note). Returns an array of
// rows, each an array of field strings.
function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // skip; \n (below) ends the row
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Scans the first few rows for one that looks like a real header (at least
// 2 cells matching a known column name), skipping any junk/placeholder
// rows some exports prepend (e.g. "Column1;Column2;...").
function detectHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const columnMap = {};
    let matches = 0;
    rows[i].forEach((cell, idx) => {
      const key = KNOWN_HEADERS[cell.trim().toLowerCase()];
      if (key && !(key in columnMap)) {
        columnMap[key] = idx;
        matches++;
      }
    });
    if (matches >= 2) {
      return { headerIndex: i, columnMap };
    }
  }
  return null;
}

function parseNoteField(note) {
  if (!note) return { rating: null, comment: "" };
  const normalized = note.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const match = lines[0].trim().match(RATING_PATTERN);
  if (match) {
    const outOfTen = Math.max(0, Math.min(10, Number(match[1])));
    // 0-5/10 -> 0 stars, then 6/10..10/10 -> 1..5 stars (not a halving scale).
    const rating = Math.min(5, Math.max(0, outOfTen - 5));
    return { rating, comment: lines.slice(1).join("\n").trim() };
  }
  return { rating: null, comment: normalized.trim() };
}

// Parses the raw CSV text into generic { name, google_maps_url, rating,
// comment, tags } entries. `rating` is null when nothing parseable was
// found (destined to become a wishlist entry, not a visited one).
export function parseGoogleMapsExport(text) {
  for (const delimiter of [";", ","]) {
    const rows = parseDelimited(text, delimiter);
    const header = detectHeader(rows);
    if (!header) continue;

    const dataRows = rows
      .slice(header.headerIndex + 1)
      .filter((r) => r.some((cell) => cell.trim() !== ""));

    const entries = [];
    for (const row of dataRows) {
      const get = (col) => {
        const idx = header.columnMap[col];
        return idx !== undefined && row[idx] !== undefined ? row[idx].trim() : "";
      };
      const name = get("name");
      const url = get("url");
      if (!name && !url) continue;

      const { rating, comment: noteComment } = parseNoteField(get("note"));
      const extraComment = get("comment");
      const comment = [noteComment, extraComment].filter(Boolean).join("\n");
      const tagsRaw = get("tags");
      const tags = tagsRaw
        ? tagsRaw.split(/[,|]/).map((t) => t.trim()).filter(Boolean)
        : [];

      entries.push({ name, google_maps_url: url, rating, comment, tags });
    }
    return { entries, error: null };
  }
  return {
    entries: [],
    error:
      "Couldn't find a recognizable header row (expected columns like Title/Titel, URL, Note/Notiz).",
  };
}

// Converts generic parsed entries into ratings.json-shaped objects, skipping
// any whose google_maps_url already exists (no duplicate restaurants on a
// repeat import).
export function buildRatingsFromImport(entries, { createdBy, existingUrls, generateId }) {
  const toAdd = [];
  let skippedDuplicates = 0;

  for (const entry of entries) {
    if (entry.google_maps_url && existingUrls.has(entry.google_maps_url)) {
      skippedDuplicates++;
      continue;
    }
    const isWishlist = entry.rating === null;
    toAdd.push({
      id: generateId(),
      name: entry.name || "(unnamed)",
      google_maps_url: entry.google_maps_url,
      status: isWishlist ? "wishlist" : "visited",
      rating: isWishlist ? null : entry.rating,
      price_level: null,
      comment: entry.comment || "",
      tags: entry.tags,
      visited_at: null,
      created_by: createdBy,
      created_at: new Date().toISOString(),
    });
  }

  return { toAdd, skippedDuplicates };
}
