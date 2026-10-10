// Duplicate detection between restaurants. Pure functions, no network:
// short share links (maps.app.goo.gl/...) can't be resolved without asking
// Google (CLAUDE.md Section 3.1), so those fall back to name similarity.
//
// "place" match: same Google place (identical link, or the same place ID
// embedded in two different long links). Reliable.
// "name" match: similar names only. A hint, never acted on automatically.

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
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Shorter name must be a whole-word prefix of the longer one (Google often
// appends a description: "Suigyo Izakaya - Japanisches Restaurant ...").
const MIN_PREFIX_LENGTH = 5;

function normalizedNamesMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= MIN_PREFIX_LENGTH && long.startsWith(short + " ");
}

export function namesMatch(a, b) {
  return normalizedNamesMatch(normalizeName(a), normalizeName(b));
}

function profileOf(visits) {
  const urls = new Set();
  const placeKeys = new Set();
  const names = new Set();
  for (const v of visits) {
    const url = (v.google_maps_url || "").trim();
    if (url) urls.add(url);
    const key = extractPlaceKey(url);
    if (key) placeKeys.add(key);
    const name = normalizeName(v.name);
    if (name) names.add(name);
  }
  return { urls, placeKeys, names: [...names] };
}

function compareProfiles(p, q) {
  for (const u of p.urls) if (q.urls.has(u)) return "place";
  for (const k of p.placeKeys) if (q.placeKeys.has(k)) return "place";
  // Both point at known places, and they're different ones: e.g. two
  // branches of a chain. Same name doesn't make them duplicates.
  if (p.placeKeys.size > 0 && q.placeKeys.size > 0) return null;
  for (const a of p.names) {
    for (const b of q.names) {
      if (normalizedNamesMatch(a, b)) return "name";
    }
  }
  return null;
}

// Returns (entry) => [{ restaurant, reason }], "place" matches first.
// Profiles are computed once, so checking many entries (an import) is cheap.
export function createMatcher(restaurants) {
  const profiles = restaurants.map((r) => ({ restaurant: r, profile: profileOf(r.visits) }));
  return (entry) => {
    const p = profileOf([entry]);
    const matches = [];
    for (const { restaurant, profile } of profiles) {
      const reason = compareProfiles(p, profile);
      if (reason) matches.push({ restaurant, reason });
    }
    return matches.sort((a, b) => (a.reason === b.reason ? 0 : a.reason === "place" ? -1 : 1));
  };
}

// Groups restaurants that look like the same place (transitively: if A~B
// and B~C, all three end up in one group). Only groups of 2+ are returned,
// each sorted by name, groups ordered by their first name.
export function findDuplicateGroups(restaurants) {
  const profiles = restaurants.map((r) => profileOf(r.visits));
  const parent = restaurants.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  for (let i = 0; i < restaurants.length; i++) {
    for (let j = i + 1; j < restaurants.length; j++) {
      if (compareProfiles(profiles[i], profiles[j])) {
        parent[find(i)] = find(j);
      }
    }
  }

  const groups = new Map();
  restaurants.forEach((r, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(r);
  });

  const byName = (a, b) => (a.name || "").localeCompare(b.name || "");
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort(byName))
    .sort((a, b) => byName(a[0], b[0]));
}
