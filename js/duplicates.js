// Duplicate detection between restaurants. Pure functions, no network:
// short share links (maps.app.goo.gl/...) can't be resolved without asking
// Google (CLAUDE.md Section 3.1), so those fall back to name similarity.
//
// Matches are between restaurants (CLAUDE.md Section 9.8): same
// Google place / same OSM reference ("place"), similar name at the same
// spot ("nearby"), or similar name only ("name"). Never acted on
// automatically — the user decides.

// Long Google Maps links embed a feature ID "0x<hex>:0x<hex>" (e.g.
// "!1s0x47a8...:0x17f8..." or "ftid=0x...:0x..."); its second half is the
// place's CID, which "?cid=<decimal>" links carry directly. All three
// normalize to the CID as a decimal string.
export function extractPlaceKey(url) {
  if (!url) return null;
  let s = url;
  try {
    s = decodeURIComponent(url);
  } catch {
    // keep the raw string
  }
  let m = s.match(/(?:!1s|ftid=)0x[0-9a-f]+:0x([0-9a-f]+)/i);
  if (m) return BigInt("0x" + m[1]).toString();
  m = s.match(/[?&]cid=(\d+)/);
  if (m) return BigInt(m[1]).toString();
  return null;
}

export function normalizeName(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/&/g, " and ")
    .replace(/['’‘`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Generic words that say what kind of place it is rather than which one;
// ignored so "Restaurant Toscana" matches "Toscana".
const FILLER_WORDS = new Set([
  "restaurant", "restaurante", "ristorante", "cafe", "caffe", "coffee", "bar",
  "bistro", "pizzeria", "trattoria", "osteria", "taverna", "kitchen", "grill",
  "imbiss", "the", "and", "und", "la", "le", "les", "il", "lo", "el", "der",
  "die", "das", "de", "di", "da", "del", "du", "zum", "zur", "im", "am",
]);

// Fewer letters than this in the shorter name's important words: too
// little to go on (e.g. "Bao"), no name match.
const MIN_SIGNIFICANT_LETTERS = 4;

export function significantWords(normalizedName) {
  return [...new Set(normalizedName.split(" ").filter((w) => w && !FILLER_WORDS.has(w)))];
}

function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

// Equal, or a small typo in a longer word (1 edit from 5 letters, 2 from 8).
function wordsMatch(a, b) {
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  if (shorter < 5) return false;
  return editDistance(a, b) <= (shorter >= 8 ? 2 : 1);
}

// Every important word of the shorter name appears (in any order, typos
// tolerated) in the longer one — covers Google's appended descriptions
// ("Suigyo Izakaya - Japanisches Restaurant ..."), reordered words and
// generic prefixes.
function wordSetsMatch(a, b) {
  if (a.length === 0 || b.length === 0) return false;
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  if (small.join("").length < MIN_SIGNIFICANT_LETTERS) return false;
  return small.every((w) => large.some((x) => wordsMatch(w, x)));
}

export function namesMatch(a, b) {
  return wordSetsMatch(significantWords(normalizeName(a)), significantWords(normalizeName(b)));
}

// Distance in metres between two { lat, lng } points (haversine).
export function distanceMeters(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// Similar name *and* this close = very likely the same place.
const SAME_SPOT_METERS = 60;
// Further apart than this = different places, whatever the name says
// (e.g. two branches of a chain).
const DIFFERENT_PLACE_METERS = 300;

// Addresses as the app stores them come from Nominatim ("Street 12, City,
// Country"). Their key is everything but the country, normalized — but
// only when the first part has a house number: "Street, City" alone would
// make every place on that street look like the same address.
function addressKey(address) {
  const parts = (address || "").split(",").map((p) => normalizeName(p)).filter(Boolean);
  if (parts.length < 2 || !/\d/.test(parts[0])) return null;
  return parts.slice(0, -1).join("|");
}

// Works on anything restaurant-shaped: { name, google_maps_url, osm, lat, lng, address }.
function profileOf(r) {
  const url = (r.google_maps_url || "").trim();
  const placeKey = extractPlaceKey(url);
  const words = significantWords(normalizeName(r.name));
  return {
    url: url || null,
    placeKey,
    osm: r.osm || null,
    coords: Number.isFinite(r.lat) && Number.isFinite(r.lng) ? { lat: r.lat, lng: r.lng } : null,
    address: addressKey(r.address),
    words,
  };
}

// "place" = same Google link/place ID or same OSM reference (reliable).
// "nearby" = similar name and within SAME_SPOT_METERS (strong).
// "name" = similar name only (a hint). null = not a match.
function compareProfiles(p, q) {
  if (p.url && p.url === q.url) return "place";
  if (p.placeKey && p.placeKey === q.placeKey) return "place";
  if (p.osm && p.osm === q.osm) return "place";
  // Both point at known places, and they're different ones.
  if (p.placeKey && q.placeKey) return null;
  if (p.osm && q.osm) return null;
  const distance = p.coords && q.coords ? distanceMeters(p.coords, q.coords) : null;
  if (distance !== null && distance > DIFFERENT_PLACE_METERS) return null;
  if (!wordSetsMatch(p.words, q.words)) return null;
  return distance !== null && distance <= SAME_SPOT_METERS ? "nearby" : "name";
}

const REASON_ORDER = { place: 0, nearby: 1, name: 2 };

// "Not the same restaurant" decisions: restaurant ids in `not_same_as`
// (CLAUDE.md Section 8), checked in both directions.
function markedDifferent(a, b) {
  return (a.not_same_as || []).includes(b.id) || (b.not_same_as || []).includes(a.id);
}

// Returns (candidate) => [{ restaurant, reason }], strongest matches first.
// Profiles are computed once, so checking many candidates (an import) is
// cheap. The candidate is restaurant-shaped and not yet saved.
export function createMatcher(restaurants) {
  const profiles = restaurants.map((r) => ({ restaurant: r, profile: profileOf(r) }));
  return (candidate) => {
    const p = profileOf(candidate);
    const matches = [];
    for (const { restaurant, profile } of profiles) {
      const reason = compareProfiles(p, profile);
      if (reason) matches.push({ restaurant, reason });
    }
    return matches.sort((a, b) => REASON_ORDER[a.reason] - REASON_ORDER[b.reason]);
  };
}

// Same address: both addresses (with house number) agree; if either has
// none, both positions within SAME_ADDRESS_METERS. With two different
// addresses the positions don't count — neighbouring shops can be 10 m
// apart.
const SAME_ADDRESS_METERS = 20;

function sameAddress(p, q) {
  if (p.address && q.address) return p.address === q.address;
  return Boolean(p.coords && q.coords) && distanceMeters(p.coords, q.coords) <= SAME_ADDRESS_METERS;
}

// The duplicates list's categories (CLAUDE.md Section 9.8), strongest first.
export const DUPLICATE_SECTIONS = [
  { key: "same", title: "Similar name, same address", hint: "almost certainly the same" },
  { key: "address", title: "Same address, different name", hint: "quite likely the same" },
  { key: "elsewhere", title: "Similar name, different address", hint: "probably different, e.g. branches of a chain" },
  { key: "unknown", title: "Similar name, no location to compare", hint: "check them" },
];

// Which category a pair of restaurants belongs to, or null.
function pairCategory(p, q) {
  const samePlace =
    (p.url && p.url === q.url) || (p.placeKey && p.placeKey === q.placeKey) || (p.osm && p.osm === q.osm);
  const differentKnownPlaces =
    (p.placeKey && q.placeKey && p.placeKey !== q.placeKey) || (p.osm && q.osm && p.osm !== q.osm);
  const similar = wordSetsMatch(p.words, q.words);
  const address = sameAddress(p, q);
  if (samePlace || (similar && address)) return "same";
  if (address && !differentKnownPlaces) return "address";
  if (!similar) return null;
  const located = (x) => Boolean(x.coords || x.address);
  return located(p) && located(q) ? "elsewhere" : "unknown";
}

// For the "Show possible duplicates" view: [{ key, title, hint, groups }]
// in DUPLICATE_SECTIONS order, only non-empty ones. Within a category,
// restaurants are grouped transitively (A~B and B~C → one group); a
// restaurant can appear in more than one category. Pairs marked as
// different are skipped. Groups are sorted by name.
export function findDuplicateSections(restaurants) {
  const profiles = restaurants.map(profileOf);
  const pairsByCategory = new Map(DUPLICATE_SECTIONS.map(({ key }) => [key, []]));
  for (let i = 0; i < restaurants.length; i++) {
    for (let j = i + 1; j < restaurants.length; j++) {
      if (markedDifferent(restaurants[i], restaurants[j])) continue;
      const category = pairCategory(profiles[i], profiles[j]);
      if (category) pairsByCategory.get(category).push([i, j]);
    }
  }

  const byName = (a, b) => (a.name || "").localeCompare(b.name || "");
  const groupsOf = (pairs) => {
    const parent = new Map();
    const find = (i) => {
      if (!parent.has(i)) parent.set(i, i);
      const p = parent.get(i);
      if (p === i) return i;
      const root = find(p);
      parent.set(i, root);
      return root;
    };
    for (const [i, j] of pairs) parent.set(find(i), find(j));
    const groups = new Map();
    for (const i of parent.keys()) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(restaurants[i]);
    }
    return [...groups.values()].map((g) => g.sort(byName)).sort((a, b) => byName(a[0], b[0]));
  };

  return DUPLICATE_SECTIONS.map((section) => ({ ...section, groups: groupsOf(pairsByCategory.get(section.key)) })).filter(
    (section) => section.groups.length > 0
  );
}
