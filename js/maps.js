// Google Maps link handling and validation (see CLAUDE.md Section 4.1: only
// http/https URLs may ever be opened, no other scheme).

export function isSafeHttpUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

export function openMapsUrl(value) {
  if (!isSafeHttpUrl(value)) {
    throw new Error("Refusing to open an unsafe or invalid URL");
  }
  window.open(value, "_blank", "noopener,noreferrer");
}

// Extracts a restaurant name from a full Google Maps URL, e.g.
// https://www.google.com/maps/place/Trattoria+Milano/@41.9,12.5,17z/...
// Short share links (maps.app.goo.gl/...) carry no such segment and can't
// be resolved client-side (see CLAUDE.md Section 8), so this returns null
// for them and the caller falls back to asking the user to type a name.
export function extractNameFromMapsUrl(value) {
  if (!isSafeHttpUrl(value)) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  const match = parsed.pathname.match(/\/place\/([^/@]+)/);
  if (!match) return null;
  const raw = match[1].replace(/\+/g, " ");
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  decoded = decoded.trim();
  return decoded || null;
}
