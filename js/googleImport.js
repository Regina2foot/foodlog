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

import { extractCoordsFromMapsUrl } from "./maps.js";

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
// A leading whole number out of 10 is read as a star rating, but the note
// text is copied into the comment unchanged either way — the "N/10" is
// not stripped out. No leading rating found means no rating parsed, i.e.
// imported as a wishlist entry (still with the full note as the comment).
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
  const normalized = note.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const firstLine = normalized.split("\n")[0].trim();
  const match = firstLine.match(RATING_PATTERN);
  // The star rating is derived from the note, but the note text itself
  // (including the original "N/10") is kept in the comment verbatim —
  // it's not rewritten or stripped, just also parsed.
  if (match) {
    const outOfTen = Math.max(0, Math.min(10, Number(match[1])));
    // 0-5/10 -> 0 stars, then 6/10..10/10 -> 1..5 stars (not a halving scale).
    const rating = Math.min(5, Math.max(0, outOfTen - 5));
    return { rating, comment: normalized };
  }
  return { rating: null, comment: normalized };
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

// Turns parsed entries into new restaurants (CLAUDE.md Section 15.4): one
// restaurant per place, plus a first visit when the note carried an N/10
// rating (its comment keeps the note verbatim). Without a rating the note
// becomes the restaurant's own note, i.e. a wishlist place. `bulkTag` (the
// import tag) is added to every restaurant. Places the caller already knows
// as the same Google place (`isKnownPlace(url)`) are skipped.
export function buildImport(entries, { createdBy, isKnownPlace, generateId, bulkTag }) {
  const items = [];
  let skippedDuplicates = 0;
  const now = new Date();
  const createdAt = now.toISOString();

  for (const entry of entries) {
    if (entry.google_maps_url && isKnownPlace(entry.google_maps_url)) {
      skippedDuplicates++;
      continue;
    }
    const rated = entry.rating !== null;
    const coords = extractCoordsFromMapsUrl(entry.google_maps_url);
    const restaurant = {
      id: generateId(),
      name: entry.name || "(unnamed)",
      google_maps_url: entry.google_maps_url,
      tags: [...new Set([...(entry.tags || []), ...(bulkTag ? [bulkTag] : [])])],
      note: rated ? "" : entry.comment || "",
      created_by: createdBy,
      created_at: createdAt,
    };
    if (coords) Object.assign(restaurant, coords);
    // The export has no real visit date, so a rated place gets the import
    // date (Section 11.3).
    const visit = rated
      ? {
          id: generateId(),
          restaurant_id: restaurant.id,
          rating: entry.rating,
          price_level: null,
          comment: entry.comment || "",
          visited_at: createdAt.slice(0, 10),
          created_by: createdBy,
          created_at: createdAt,
        }
      : null;
    items.push({ restaurant, visit });
  }

  return { items, skippedDuplicates };
}

// Applies a reviewed import plan to the document. Each item:
// { restaurant, visit, decision: "add" | "same", sameAs, differentFrom }.
// - "add": the new restaurant (+ visit). `differentFrom` (restaurant ids the
//   user said it is *not*) is remembered in not_same_as.
// - "same": `sameAs` is the existing restaurant's id. It gets the imported
//   link if it had none, missing coordinates, the imported tags, the note if
//   it had none; the imported visit (only if the place carried a rating) is
//   added to it. If it no longer exists, falls back to "add".
export function applyImport(doc, plan) {
  let next = { ...doc, restaurants: [...doc.restaurants], visits: [...doc.visits] };
  for (const { restaurant, visit, decision, sameAs, differentFrom = [] } of plan) {
    const existing = decision === "same" ? next.restaurants.find((r) => r.id === sameAs) : null;
    if (!existing) {
      next.restaurants.push(differentFrom.length ? { ...restaurant, not_same_as: [...differentFrom] } : restaurant);
      if (visit) next.visits.push(visit);
      continue;
    }
    const updated = { ...existing, tags: [...new Set([...(existing.tags || []), ...(restaurant.tags || [])])] };
    if (!updated.google_maps_url && restaurant.google_maps_url) updated.google_maps_url = restaurant.google_maps_url;
    if (!Number.isFinite(updated.lat) && Number.isFinite(restaurant.lat)) {
      updated.lat = restaurant.lat;
      updated.lng = restaurant.lng;
    }
    if (!updated.note && restaurant.note) updated.note = restaurant.note;
    next.restaurants = next.restaurants.map((r) => (r.id === existing.id ? updated : r));
    if (visit) next.visits.push({ ...visit, restaurant_id: existing.id });
  }
  return next;
}
