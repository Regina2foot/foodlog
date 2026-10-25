// The data document stored as foodlog.json in the data repo (CLAUDE.md
// Section 15.1): { version, restaurants: [...], visits: [...] }.
// Pure functions only — every change returns a new document, so the
// write-conflict retry can re-apply a change to freshly fetched data.

export const DATA_FILE = "foodlog.json";
export const DATA_VERSION = 2;

export function emptyDoc() {
  return { version: DATA_VERSION, restaurants: [], visits: [] };
}

// Tolerates missing/odd fields (Section 6) so a hand-edited or older file
// never breaks the app.
export function normalizeDoc(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyDoc();
  const isObject = (x) => x && typeof x === "object" && !Array.isArray(x);
  return {
    ...raw,
    version: raw.version || DATA_VERSION,
    restaurants: Array.isArray(raw.restaurants) ? raw.restaurants.filter(isObject) : [],
    visits: Array.isArray(raw.visits) ? raw.visits.filter(isObject) : [],
  };
}

export function generateId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export function hasLocation(restaurant) {
  return Number.isFinite(restaurant.lat) && Number.isFinite(restaurant.lng);
}

const byNewestVisit = (a, b) =>
  (b.visited_at || "").localeCompare(a.visited_at || "") || (b.created_at || "").localeCompare(a.created_at || "");

// Restaurants joined with their visits, for display: `visits` newest
// first, `latest` = most recent visit (null for a wishlist place).
// `isArchived`: marked as closed (`archived_at` set) — kept for the
// record, but left out of Rated/Wishlist, the map and Find locations.
export function buildRestaurantViews(doc) {
  const visitsByRestaurant = new Map();
  for (const visit of doc.visits) {
    if (!visitsByRestaurant.has(visit.restaurant_id)) visitsByRestaurant.set(visit.restaurant_id, []);
    visitsByRestaurant.get(visit.restaurant_id).push(visit);
  }
  return doc.restaurants.map((r) => {
    const visits = (visitsByRestaurant.get(r.id) || []).sort(byNewestVisit);
    return {
      ...r,
      tags: Array.isArray(r.tags) ? r.tags : [],
      visits,
      latest: visits[0] || null,
      isWishlist: visits.length === 0,
      isArchived: Boolean(r.archived_at),
    };
  });
}

export function addRestaurant(doc, restaurant, firstVisit = null) {
  return {
    ...doc,
    restaurants: [...doc.restaurants, restaurant],
    visits: firstVisit ? [...doc.visits, { ...firstVisit, restaurant_id: restaurant.id }] : doc.visits,
  };
}

export function updateRestaurant(doc, id, changes) {
  return { ...doc, restaurants: doc.restaurants.map((r) => (r.id === id ? { ...r, ...changes } : r)) };
}

// Deletes restaurants together with all of their visits.
export function deleteRestaurants(doc, ids) {
  const remove = new Set(ids);
  return {
    ...doc,
    restaurants: doc.restaurants.filter((r) => !remove.has(r.id)),
    visits: doc.visits.filter((v) => !remove.has(v.restaurant_id)),
  };
}

export function addVisit(doc, visit) {
  return { ...doc, visits: [...doc.visits, visit] };
}

export function updateVisit(doc, id, changes) {
  return { ...doc, visits: doc.visits.map((v) => (v.id === id ? { ...v, ...changes } : v)) };
}

export function deleteVisit(doc, id) {
  return { ...doc, visits: doc.visits.filter((v) => v.id !== id) };
}

// Merges restaurants into one (Section 15.1): the one with the most visits
// (then the oldest) is kept; the others' visits move onto it; tags are
// united, notes joined; location, address, osm and link are filled from
// the others where the kept one has none; references to the removed ones
// in other restaurants' not_same_as now point to the kept one.
export function mergeRestaurants(doc, ids) {
  const idSet = new Set(ids);
  const views = buildRestaurantViews(doc).filter((r) => idSet.has(r.id));
  if (views.length < 2) return doc;
  views.sort((a, b) => b.visits.length - a.visits.length || (a.created_at || "").localeCompare(b.created_at || ""));
  const keepId = views[0].id;
  const others = views.slice(1).map((v) => v.id);
  const otherSet = new Set(others);
  const sources = views.map((v) => doc.restaurants.find((r) => r.id === v.id));

  const merged = { ...sources[0] };
  merged.tags = [...new Set(sources.flatMap((r) => r.tags || []))];
  merged.note = [...new Set(sources.map((r) => (r.note || "").trim()).filter(Boolean))].join("\n");
  for (const r of sources.slice(1)) {
    if (!hasLocation(merged) && hasLocation(r)) {
      merged.lat = r.lat;
      merged.lng = r.lng;
    }
    for (const field of ["address", "osm", "google_maps_url"]) {
      if (!merged[field] && r[field]) merged[field] = r[field];
    }
  }
  merged.not_same_as = [...new Set(sources.flatMap((r) => r.not_same_as || []))].filter(
    (x) => x !== keepId && !otherSet.has(x)
  );

  return {
    ...doc,
    restaurants: doc.restaurants
      .filter((r) => !otherSet.has(r.id))
      .map((r) => {
        if (r.id === keepId) return merged;
        if (!(r.not_same_as || []).some((x) => otherSet.has(x))) return r;
        return { ...r, not_same_as: [...new Set(r.not_same_as.map((x) => (otherSet.has(x) ? keepId : x)))] };
      }),
    visits: doc.visits.map((v) => (otherSet.has(v.restaurant_id) ? { ...v, restaurant_id: keepId } : v)),
  };
}

// Records that the given restaurants are all different from each other
// (each lists the others in not_same_as), so they're never suggested as
// duplicates again.
export function markRestaurantsDifferent(doc, ids) {
  const idSet = new Set(ids);
  return {
    ...doc,
    restaurants: doc.restaurants.map((r) =>
      idSet.has(r.id)
        ? { ...r, not_same_as: [...new Set([...(r.not_same_as || []), ...[...idSet].filter((x) => x !== r.id)])] }
        : r
    ),
  };
}

// Renames a tag on every restaurant. Renaming to a tag that already exists
// merges the two (a restaurant never ends up with the same tag twice). The
// tag keeps its place in each list, so its colour usually stays the same.
export function renameTag(doc, from, to) {
  return {
    ...doc,
    restaurants: doc.restaurants.map((r) =>
      (r.tags || []).includes(from) ? { ...r, tags: [...new Set(r.tags.map((t) => (t === from ? to : t)))] } : r
    ),
  };
}

// Removes a tag from every restaurant (the restaurants themselves stay).
export function deleteTag(doc, tag) {
  return {
    ...doc,
    restaurants: doc.restaurants.map((r) =>
      (r.tags || []).includes(tag) ? { ...r, tags: r.tags.filter((t) => t !== tag) } : r
    ),
  };
}

// For the given restaurants: adds every tag in `add` (if missing) and
// removes every tag in `remove`.
export function changeTags(doc, ids, { add = [], remove = [] }) {
  const idSet = new Set(ids);
  const removeSet = new Set(remove);
  return {
    ...doc,
    restaurants: doc.restaurants.map((r) => {
      if (!idSet.has(r.id)) return r;
      const kept = (r.tags || []).filter((t) => !removeSet.has(t));
      return { ...r, tags: [...new Set([...kept, ...add])] };
    }),
  };
}

// Restaurants that exist in an `older` version of the document but not in
// `doc` now: [{ restaurant, visitCount, merged }]. `merged` = some of its
// old visits still exist under another restaurant, i.e. it was merged
// away rather than deleted (bringing it back would return it without
// those visits).
export function missingRestaurants(doc, older) {
  const nowRestaurants = new Set(doc.restaurants.map((r) => r.id));
  const nowVisits = new Set(doc.visits.map((v) => v.id));
  return older.restaurants
    .filter((r) => !nowRestaurants.has(r.id))
    .map((restaurant) => {
      const visits = older.visits.filter((v) => v.restaurant_id === restaurant.id);
      return { restaurant, visitCount: visits.length, merged: visits.some((v) => nowVisits.has(v.id)) };
    });
}

// Brings the given restaurants back from `older`, with the visits they had
// then. Anything that exists again meanwhile (same id) is left alone, so
// running it twice changes nothing.
export function restoreRestaurants(doc, older, ids) {
  const wanted = new Set(ids);
  const nowRestaurants = new Set(doc.restaurants.map((r) => r.id));
  const nowVisits = new Set(doc.visits.map((v) => v.id));
  return {
    ...doc,
    restaurants: [...doc.restaurants, ...older.restaurants.filter((r) => wanted.has(r.id) && !nowRestaurants.has(r.id))],
    visits: [...doc.visits, ...older.visits.filter((v) => wanted.has(v.restaurant_id) && !nowVisits.has(v.id))],
  };
}
