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

// Categories that are actual venues (restaurants, bars, cafés, shops…), as
// opposed to buildings, streets or areas.
const VENUE_CATEGORIES = new Set(["amenity", "shop", "tourism", "leisure"]);

const round6 = (x) => Math.round(Number(x) * 1e6) / 1e6;

// Only a venue keeps its OSM reference: a building or address point found
// by an address search isn't the restaurant itself, and two restaurants in
// one building must not look like the same place to duplicate detection.
// Unnamed objects (e.g. a house number) get no name rather than "1".
export function isVenue(place) {
  return VENUE_CATEGORIES.has(place.category);
}

function toPlace(item) {
  const venue = VENUE_CATEGORIES.has(item.category);
  const bb = Array.isArray(item.boundingbox) ? item.boundingbox.map(Number) : null;
  return {
    name: item.name || "",
    address: formatAddress(item.address) || item.display_name || "",
    lat: round6(item.lat),
    lng: round6(item.lon),
    osm: venue && item.osm_type && item.osm_id ? `${item.osm_type}/${item.osm_id}` : null,
    category: item.category || "",
    kind: item.type || "",
    // [west, south, east, north]; Nominatim gives [south, north, west, east].
    bbox: bb && bb.length === 4 && bb.every(Number.isFinite) ? [bb[2], bb[0], bb[3], bb[1]] : null,
  };
}

// Places matching `query`, preferring `viewbox` = [west, south, east,
// north] — or, with bounded: true, only places inside it.
export async function searchPlaces(query, viewbox = null, { bounded = false } = {}) {
  const params = new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", limit: "8" });
  if (viewbox) {
    params.set("viewbox", viewbox.map((x) => x.toFixed(4)).join(","));
    params.set("bounded", bounded ? "1" : "0");
  }
  const data = await rateLimitedJson(`${BASE}/search?${params}`);
  return (Array.isArray(data) ? data : []).map(toPlace);
}

// The area a free-text place ("Berlin", "Tokyo", "Toscana, Italy") covers,
// for searches limited to it: { name, viewbox } or null if not found.
export async function findArea(text) {
  const places = await searchPlaces(text);
  const area = places.find((p) => p.bbox);
  return area ? { name: area.address || area.name || text, viewbox: area.bbox } : null;
}

// Search text as pasted, made friendlier for Nominatim. Google addresses
// carry things Nominatim doesn't know, so when the full text finds nothing,
// simpler versions are tried in turn (most specific first):
//   1. the text as pasted (minus links, Plus Codes, "〒", line breaks)
//   2. cleaned: district additions dropped ("12045 Berlin-Bezirk Neukölln"
//      → "12045 Berlin"), floor/suite parts dropped, house-number ranges
//      cut to the first number ("21-24" → "21"), Italian-style province
//      codes after the city dropped ("00184 Roma RM" → "00184 Roma")
//      and a house number written as its own part joined to its street
//      ("Piazza del Colosseo, 1" → "Piazza del Colosseo 1")
//   3. without a leading name/building part (a first part with no digits)
//   4. street + postal code
//   5. street + city
// Only for addresses (text with a number in it); every version keeps a
// number: never just a city, which would put the restaurant in the middle
// of town instead of reporting "not found".
const PLUS_CODE = /\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/gi;
const DISTRICT_SUFFIX = /[\s-]+(Bezirk|Ortsteil|Stadtteil|Stadtbezirk|Gemeinde|district|borough|arrondissement)\b.*$/i;
const UNIT_PART = /^(suite|ste\.?|unit|apt\.?|apartment|floor|fl\.?|etage|stock|\d+\.?\s*(og|etage|stock|floor)|eg|og|ug)\b/i;
// Second number at most 3 digits, so postal codes like "100-8111" stay.
const HOUSE_RANGE = /([A-Za-zÀ-ÿ.]\s+\d+)[a-z]?\s*[-–]\s*\d{1,3}[a-z]?\b/;
const PROVINCE_CODE = /^(.*\p{L}.*?)\s+[A-Z]{2}$/u;
const POSTCODE = /\b(\d{4}\s?[A-Z]{2}|\d{5}|\d{4}|\d{3}-\d{4})\b/;

function cleanPart(part) {
  return part.replace(DISTRICT_SUFFIX, "").replace(HOUSE_RANGE, "$1").replace(PROVINCE_CODE, "$1").trim();
}

export function searchVariants(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^https?:\/\//i.test(l));
  const joined = lines.join(", ");
  const base = joined.replace(PLUS_CODE, "").replace(/〒\s*/g, "").replace(/\s+/g, " ");
  const parts = base.split(",").map((p) => p.trim()).filter(Boolean);
  const variants = [parts.join(", ")];
  // A place name (no digits) is only ever searched as typed.
  const isAddress = /\d/.test(joined);
  if (isAddress) {
    const cleaned = [];
    for (const part of parts.filter((p) => !UNIT_PART.test(p)).map(cleanPart).filter(Boolean)) {
      if (/^\d+[a-z]?$/i.test(part) && cleaned.length > 0 && !/\d/.test(cleaned[cleaned.length - 1])) {
        cleaned[cleaned.length - 1] += ` ${part}`;
      } else {
        cleaned.push(part);
      }
    }
    variants.push(cleaned.join(", "));
    const withoutName = !/\d/.test(cleaned[0]) && cleaned.length >= 3 ? cleaned.slice(1) : cleaned;
    variants.push(withoutName.join(", "));
    // Street = first part with a number and a word; the postal code is
    // looked for only in the parts after it.
    const streetIndex = withoutName.findIndex((p) => /\d/.test(p) && /\p{L}{3,}/u.test(p));
    const street = withoutName[streetIndex];
    const postcodePart = streetIndex >= 0 ? withoutName.slice(streetIndex + 1).find((p) => POSTCODE.test(p)) : null;
    if (street && postcodePart) {
      const postcode = postcodePart.match(POSTCODE)[0];
      variants.push(`${street}, ${postcode}`);
      const city = postcodePart.replace(POSTCODE, "").trim();
      if (/\p{L}/u.test(city)) variants.push(`${street}, ${city}`);
    }
  }
  return [...new Set(variants.filter((v) => v && (!isAddress || /\d/.test(v))))];
}

// Results that are only a street, town or area, not a building or venue.
// For an address with a house number that means the number wasn't matched
// (e.g. a whole 3 km street), so better versions are tried first.
// ("place/house" is an exact address point, so it doesn't count.)
const isVaguePlace = (p) =>
  p.category === "highway" || ((p.category === "place" || p.category === "boundary") && p.kind !== "house");
const isVague = (places) => places.every(isVaguePlace);

// Searches for `text` (a place name or a pasted address), falling back to
// simpler versions of it (one request each, still rate-limited) until
// something precise is found. Returns { places, vague }: vague = only a
// street/area was found (the first such answer), so the position should be
// checked. A plain name search (no digits) takes whatever it finds first.
export async function searchWithFallbacks(text, viewbox = null) {
  const isAddress = /\d/.test(text);
  let fallback = null;
  for (const variant of searchVariants(text)) {
    const places = await searchPlaces(variant, viewbox);
    if (places.length === 0) continue;
    if (!isAddress || !isVague(places)) return { places, vague: false };
    fallback = fallback || places;
  }
  return { places: fallback || [], vague: Boolean(fallback) };
}


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
