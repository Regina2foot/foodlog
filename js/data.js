// The data document stored as foodlog.json in the data repo (CLAUDE.md
// Section 8): { version, restaurants: [...], visits: [...] }.
// Pure functions only — every change returns a new document, so the
// write-conflict retry can re-apply a change to freshly fetched data.

import { renameTagColor, deleteTagColor } from "./tagColors.js";

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

// The city in an address as the app stores it (Nominatim's "Street 12,
// City, Country"): the last part before the country that has no digits.
// Null without a usable address.
export function cityOf(address) {
  const parts = (address || "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const named = parts.slice(0, -1).filter((p) => !/\d/.test(p));
  return named.length ? named[named.length - 1] : null;
}

export function hasLocation(restaurant) {
  return Number.isFinite(restaurant.lat) && Number.isFinite(restaurant.lng);
}

const byNewestVisit = (a, b) =>
  (b.visited_at || "").localeCompare(a.visited_at || "") || (b.created_at || "").localeCompare(a.created_at || "");

// Restaurants joined with their visits, for display: `visits` newest
// first, `latest` = most recent visit (null without visits).
// `isRated`: has at least one visit (anyone's). `isWishlist`: on *my*
// wishlist (Section 10.2) — I haven't rated it, and it's either a private
// place without visits, a shared one I put on my wishlist
// (`onMyWishlist`, from the private file), or a shared one without any
// visits that I added (so a single-user file works as before). `me` is
// my GitHub login (null = unknown → treated as mine). A restaurant can be
// both rated (by friends) and on my wishlist.
// `isArchived`: marked as closed (`archived_at` set) — kept for the
// record, but left out of Rated/Wishlist, the map and Find locations.
// `city`: from the address (cityOf), for the list's city filter.
export function buildRestaurantViews(doc, { me = null } = {}) {
  const isMine = (createdBy) => !me || !createdBy || createdBy === "unknown" || createdBy === me;
  const visitsByRestaurant = new Map();
  for (const visit of doc.visits) {
    if (!visitsByRestaurant.has(visit.restaurant_id)) visitsByRestaurant.set(visit.restaurant_id, []);
    visitsByRestaurant.get(visit.restaurant_id).push(visit);
  }
  return doc.restaurants.map((r) => {
    const visits = (visitsByRestaurant.get(r.id) || []).sort(byNewestVisit);
    const ratedByMe = visits.some((v) => isMine(v.created_by));
    const unvisitedAndMine = visits.length === 0 && (r.visibility === "private" || isMine(r.created_by));
    return {
      ...r,
      tags: Array.isArray(r.tags) ? r.tags : [],
      visits,
      latest: visits[0] || null,
      isRated: visits.length > 0,
      isWishlist: !ratedByMe && (Boolean(r.onMyWishlist) || unvisitedAndMine),
      isArchived: Boolean(r.archived_at),
      city: cityOf(r.address),
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

// Merges restaurants into one (Section 8): the one with the most visits
// (then the oldest) is kept; the others' visits move onto it; tags are
// united, notes joined; location, address, osm and link are filled from
// the others where the kept one has none; references to the removed ones
// in other restaurants' not_same_as now point to the kept one.
// Which of `ids` a merge keeps (exported so a caller can move personal
// tags/notes onto the same one): most visits, then the oldest.
export function mergeKeepId(doc, ids) {
  const idSet = new Set(ids);
  const views = buildRestaurantViews(doc).filter((r) => idSet.has(r.id));
  views.sort((a, b) => b.visits.length - a.visits.length || (a.created_at || "").localeCompare(b.created_at || ""));
  return views[0]?.id || null;
}

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
// tag keeps its place in each list and takes its stored colour along.
// Also applies to my personal tags on shared restaurants (`personal` in
// the private file, Section 10.2).
export function renameTag(doc, from, to) {
  const rename = (tags) => [...new Set(tags.map((t) => (t === from ? to : t)))];
  return mapPersonal(
    {
      ...renameTagColor(doc, from, to),
      restaurants: doc.restaurants.map((r) => ((r.tags || []).includes(from) ? { ...r, tags: rename(r.tags) } : r)),
    },
    (entry) => ((entry.tags || []).includes(from) ? { ...entry, tags: rename(entry.tags) } : entry)
  );
}

// Removes a tag from every restaurant (the restaurants themselves stay),
// including my personal tags on shared restaurants. Its colour is freed.
export function deleteTag(doc, tag) {
  const drop = (tags) => tags.filter((t) => t !== tag);
  return mapPersonal(
    {
      ...deleteTagColor(doc, tag),
      restaurants: doc.restaurants.map((r) => ((r.tags || []).includes(tag) ? { ...r, tags: drop(r.tags) } : r)),
    },
    (entry) => ((entry.tags || []).includes(tag) ? { ...entry, tags: drop(entry.tags) } : entry)
  );
}

// --- The private file's extras (Section 10.2) ----------------------------
// `personal`: { "<shared restaurant id>": { tags, note } } — my own tags
// and note on shared restaurants. `wishlist`: ids of shared restaurants on
// my wishlist. Both only exist in a private file.

const isPlainObject = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const personalOf = (doc) => (isPlainObject(doc.personal) ? doc.personal : {});
const wishlistOf = (doc) => (Array.isArray(doc.wishlist) ? doc.wishlist : []);

function mapPersonal(doc, fn) {
  if (!isPlainObject(doc.personal)) return doc;
  return { ...doc, personal: Object.fromEntries(Object.entries(doc.personal).map(([id, entry]) => [id, fn(entry)])) };
}

// Replaces my tags and/or note on a shared restaurant (fields left out
// stay as they are). An entry with neither is removed.
export function setPersonal(doc, id, { tags, note }) {
  const current = personalOf(doc)[id] || {};
  const next = { tags: tags ?? current.tags ?? [], note: note ?? current.note ?? "" };
  const personal = { ...personalOf(doc) };
  if (next.tags.length || next.note) personal[id] = next;
  else delete personal[id];
  return { ...doc, personal };
}

// Adds tags (union) and a note (only if I have none yet) — for imports and
// "this is the same restaurant", which add rather than replace.
export function addPersonal(doc, id, { tags = [], note = "" }) {
  const current = personalOf(doc)[id] || {};
  return setPersonal(doc, id, {
    tags: [...new Set([...(current.tags || []), ...tags])],
    note: current.note || note || "",
  });
}

// Forgets my tags/note and wishlist entry for restaurants that are gone or
// moved into this file.
export function dropPersonal(doc, ids) {
  const remove = new Set(ids);
  const personal = Object.fromEntries(Object.entries(personalOf(doc)).filter(([id]) => !remove.has(id)));
  return { ...doc, personal, wishlist: wishlistOf(doc).filter((id) => !remove.has(id)) };
}

export function addToWishlist(doc, id) {
  return { ...doc, wishlist: [...new Set([...wishlistOf(doc), id])] };
}

export function removeFromWishlist(doc, ids) {
  const remove = new Set(ids);
  return { ...doc, wishlist: wishlistOf(doc).filter((id) => !remove.has(id)) };
}

// After merging shared restaurants: my tags/notes of the removed ones move
// onto the kept one, and it stays on my wishlist if any of them was.
export function mergePersonal(doc, keepId, otherIds) {
  const personal = personalOf(doc);
  let next = doc;
  for (const id of otherIds) if (personal[id]) next = addPersonal(next, keepId, personal[id]);
  const wished = otherIds.some((id) => wishlistOf(doc).includes(id));
  next = dropPersonal(next, otherIds);
  return wished ? addToWishlist(next, keepId) : next;
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
