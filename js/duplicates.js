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

function profileOf(visits) {
  const urls = new Set();
  const placeKeys = new Set();
  const wordSets = new Map();
  for (const v of visits) {
    const url = (v.google_maps_url || "").trim();
    if (url) urls.add(url);
    const key = extractPlaceKey(url);
    if (key) placeKeys.add(key);
    const words = significantWords(normalizeName(v.name));
    if (words.length) wordSets.set(words.join(" "), words);
  }
  return { urls, placeKeys, wordSets: [...wordSets.values()] };
}

function compareProfiles(p, q) {
  for (const u of p.urls) if (q.urls.has(u)) return "place";
  for (const k of p.placeKeys) if (q.placeKeys.has(k)) return "place";
  // Both point at known places, and they're different ones: e.g. two
  // branches of a chain. Same name doesn't make them duplicates.
  if (p.placeKeys.size > 0 && q.placeKeys.size > 0) return null;
  for (const a of p.wordSets) {
    for (const b of q.wordSets) {
      if (wordSetsMatch(a, b)) return "name";
    }
  }
  return null;
}

// "Not the same restaurant" decisions are stored on entries as
// `not_same_as: [entry ids]` (CLAUDE.md Section 8). Two restaurants count
// as dismissed if any entry of one names any entry of the other.
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function notSamePairs(restaurants) {
  const pairs = new Set();
  for (const r of restaurants) {
    for (const v of r.visits) {
      for (const other of v.not_same_as || []) pairs.add(pairKey(v.id, other));
    }
  }
  return pairs;
}

function markedDifferent(a, b, pairs) {
  if (pairs.size === 0) return false;
  return a.visits.some((v) => b.visits.some((w) => pairs.has(pairKey(v.id, w.id))));
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
  const dismissed = notSamePairs(restaurants);
  const parent = restaurants.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  for (let i = 0; i < restaurants.length; i++) {
    for (let j = i + 1; j < restaurants.length; j++) {
      if (compareProfiles(profiles[i], profiles[j]) && !markedDifferent(restaurants[i], restaurants[j], dismissed)) {
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
