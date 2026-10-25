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

function validCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}

// Coordinates from a long Google Maps link, read offline (CLAUDE.md
// Section 9.6). "!3d<lat>!4d<lng>" is the place itself; "@<lat>,<lng>" is
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

// The restaurant's two ways into Google Maps, shown as separate buttons so
// the user can check that they agree. Both are only opened in a new tab —
// the app itself never calls any Google service.
// - search: a Google Maps search for name + address; without an address
//   the exact coordinates, else just the name. `by` says which (for the
//   button label). Null only without a name.
// - savedLink: the stored google_maps_url (e.g. from the Google import),
//   if it's a safe http(s) link; else null.
export function googleMapsLinksFor(restaurant) {
  const search = (query) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  let found = null;
  if (restaurant.address) found = { url: search(`${restaurant.name}, ${restaurant.address}`), by: "address" };
  else if (Number.isFinite(restaurant.lat) && Number.isFinite(restaurant.lng)) {
    found = { url: search(`${restaurant.lat},${restaurant.lng}`), by: "position" };
  } else if (restaurant.name) found = { url: search(restaurant.name), by: "name" };
  return { search: found, savedLink: isSafeHttpUrl(restaurant.google_maps_url) ? restaurant.google_maps_url : null };
}
