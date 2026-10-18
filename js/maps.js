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

function validCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}

// Coordinates from a long Google Maps link, read offline (CLAUDE.md
// Section 15.3). "!3d<lat>!4d<lng>" is the place itself; "@<lat>,<lng>" is
// only the map's view centre, used as a fallback. Takeout export links and
// short share links carry neither, so this returns null for them.
export function extractCoordsFromMapsUrl(value) {
  if (!value) return null;
  let s = value;
  try {
    s = decodeURIComponent(value);
  } catch {
    // keep the raw string
  }
  let m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) return validCoords(Number(m[1]), Number(m[2]));
  m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return validCoords(Number(m[1]), Number(m[2]));
  return null;
}

// The link behind "Open in Google Maps": the saved Google link if there is
// one; otherwise a Google Maps search for name + address, or the exact
// coordinates. It's only opened in a new tab — the app itself never calls
// any Google service. Null when there's nothing to go on.
export function googleMapsLinkFor(restaurant) {
  if (isSafeHttpUrl(restaurant.google_maps_url)) return restaurant.google_maps_url;
  let query = null;
  if (restaurant.address) query = `${restaurant.name}, ${restaurant.address}`;
  else if (Number.isFinite(restaurant.lat) && Number.isFinite(restaurant.lng)) query = `${restaurant.lat},${restaurant.lng}`;
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}
