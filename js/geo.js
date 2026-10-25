// Place search and reverse lookup via Nominatim (OpenStreetMap), approved in
// CLAUDE.md Section 3.1. Sends only the typed search text (plus the visible
// map area as a bias) or a tapped position — never ratings, comments, tags
// or the token. Usage policy: at most 1 request per second, no searching
// while typing, no repeated identical requests — enforced here.

const BASE = "https://nominatim.openstreetmap.org";
const MIN_INTERVAL_MS = 1100;

let lastRequestAt = 0;
let queue = Promise.resolve();
const cache = new Map();

// Serializes all requests and spaces them at least MIN_INTERVAL_MS apart;
// identical requests are answered from memory.
function rateLimitedJson(url) {
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Place search failed (status ${response.status})`);
    const data = await response.json();
    cache.set(url, data);
    return data;
  });
  queue = run.catch(() => {});
  return run;
}

// "Musterstraße 12, Berlin, Germany" from Nominatim's address details.
export function formatAddress(address) {
  if (!address) return "";
  const street = address.road || address.pedestrian || address.footway || address.square || "";
  const streetLine = [street, address.house_number].filter(Boolean).join(" ");
  const place =
    address.city || address.town || address.village || address.municipality || address.suburb || address.county || "";
  return [streetLine, place, address.country].filter(Boolean).join(", ");
}

const round6 = (x) => Math.round(Number(x) * 1e6) / 1e6;

function toPlace(item) {
  return {
    name: item.name || (item.display_name || "").split(",")[0] || "",
    address: formatAddress(item.address) || item.display_name || "",
    lat: round6(item.lat),
    lng: round6(item.lon),
    osm: item.osm_type && item.osm_id ? `${item.osm_type}/${item.osm_id}` : null,
    category: item.category || "",
    kind: item.type || "",
  };
}

// Places matching `query`, preferring (not limited to) `viewbox`
// = [west, south, east, north].
export async function searchPlaces(query, viewbox = null) {
  const params = new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", limit: "8" });
  if (viewbox) {
    params.set("viewbox", viewbox.map((x) => x.toFixed(4)).join(","));
    params.set("bounded", "0");
  }
  const data = await rateLimitedJson(`${BASE}/search?${params}`);
  return (Array.isArray(data) ? data : []).map(toPlace);
}

// Simpler versions of an address to try when the full text isn't found,
// most specific first. Google adds things Nominatim doesn't know, e.g.
// "Weichselstraße 44, 12045 Berlin-Bezirk Neukölln": first drop such
// district additions ("12045 Berlin"), then keep only street + postal code.
const DISTRICT_SUFFIX = /[\s-]+(Bezirk|Ortsteil|Stadtteil|Stadtbezirk|district|borough)\b.*$/i;

export function addressVariants(text) {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  const variants = [parts.join(", "), parts.map((p) => p.replace(DISTRICT_SUFFIX, "")).join(", ")];
  const postcode = text.match(/\b\d{4,5}\b/);
  if (parts.length > 1 && postcode && !parts[0].includes(postcode[0])) variants.push(`${parts[0]}, ${postcode[0]}`);
  return [...new Set(variants.filter(Boolean))];
}

// Looks up an address, falling back to simpler versions of it (one
// request each, still rate-limited) until something is found.
export async function searchAddress(text, viewbox = null) {
  for (const variant of addressVariants(text)) {
    const places = await searchPlaces(variant, viewbox);
    if (places.length > 0) return places;
  }
  return [];
}

// Categories that are actual venues (restaurants, bars, cafés, shops…), as
// opposed to buildings, streets or areas.
const VENUE_CATEGORIES = new Set(["amenity", "shop", "tourism", "leisure"]);

// What's at a tapped position. If the nearest object is a venue, it's taken
// as the place (its name, OSM reference and exact coordinates). Otherwise
// only its address is used, with the tapped coordinates and no name — a
// street or building name would be a wrong restaurant name. Null if
// there's nothing there at all.
export async function lookupPosition(lat, lng) {
  const params = new URLSearchParams({
    lat: String(round6(lat)),
    lon: String(round6(lng)),
    format: "jsonv2",
    addressdetails: "1",
    zoom: "18",
  });
  const data = await rateLimitedJson(`${BASE}/reverse?${params}`);
  if (!data || data.error) return null;
  const place = toPlace(data);
  if (VENUE_CATEGORIES.has(place.category)) return place;
  return { ...place, name: "", osm: null, lat: round6(lat), lng: round6(lng) };
}
