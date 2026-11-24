// Phase 2 (CLAUDE.md Section 10): the shared file (everyone in the data
// repo) and my private file (only me). Pure functions: merging both into
// one document for display, and deciding what goes into which file.
// Without a private file (`priv` = null) everything is shared and behaves
// exactly like the single-user app.

import { addPersonal, addToWishlist, removeFromWishlist, setPersonal, dropPersonal } from "./data.js";

const isPlainObject = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const tagColorsOf = (doc) => (isPlainObject(doc.tag_colors) ? doc.tag_colors : {});

// One document for display. Shared restaurants get my personal tags and
// note when I have some (else whatever is stored on them — the old
// single-user format, until the migration); private restaurants keep
// theirs. Each restaurant is marked with `visibility`, and shared ones on
// my wishlist with `onMyWishlist`. Visits come from both files; tag colours
// (Section 9.9) from both, mine first.
export function mergeFiles(shared, priv) {
  if (!priv) {
    return { ...shared, restaurants: shared.restaurants.map((r) => ({ ...r, visibility: "shared" })) };
  }
  const personal = isPlainObject(priv.personal) ? priv.personal : {};
  const wished = new Set(Array.isArray(priv.wishlist) ? priv.wishlist : []);
  const sharedIds = new Set(shared.restaurants.map((r) => r.id));
  return {
    version: shared.version,
    // My colours win; the shared file's are only a fallback (the old
    // single-user format, until the migration).
    tag_colors: { ...tagColorsOf(shared), ...tagColorsOf(priv) },
    restaurants: [
      ...shared.restaurants.map((r) => {
        const mine = personal[r.id];
        return {
          ...r,
          ...(mine ? { tags: mine.tags || [], note: mine.note || "" } : {}),
          visibility: "shared",
          onMyWishlist: wished.has(r.id),
        };
      }),
      // A restaurant in both files (only possible after an interrupted
      // move) is shown once, as shared.
      ...priv.restaurants.filter((r) => !sharedIds.has(r.id)).map((r) => ({ ...r, visibility: "private" })),
    ],
    visits: [...shared.visits, ...priv.visits],
  };
}

// The facts about a place, without my tags and note (what a shared file
// stores about a restaurant).
export function placeFacts(restaurant) {
  const { tags, note, visibility, onMyWishlist, ...facts } = restaurant;
  return facts;
}

// Splits a list of new or matched places (the import plan format of
// googleImport.js applyImport: { restaurant, visit, decision, sameAs,
// differentFrom }) by file:
// - matched to an existing restaurant ("same"): that restaurant's file
// - new: rated → shared, wishlist (no visit) → private (Section 10.3)
// For the shared file, tags and note are taken off the restaurant and
// returned as my personal entries instead; a visit on a shared restaurant
// takes it off my wishlist, and a wishlist entry matched to an existing
// shared restaurant puts that one on my wishlist.
// Returns { shared: plan items, private: plan items, personal: [{ id,
// tags, note }], wish: [ids], unwish: [ids] }. `fileOf(id)` → "shared" |
// "private".
export function routePlan(plan, { twoFiles, fileOf }) {
  const out = { shared: [], private: [], personal: [], wish: [], unwish: [] };
  for (const item of plan) {
    if (!twoFiles) {
      out.shared.push(item);
      continue;
    }
    const target = item.decision === "same" && item.sameAs ? fileOf(item.sameAs) : item.visit ? "shared" : "private";
    if (target === "private") {
      out.private.push(item);
      continue;
    }
    const id = item.decision === "same" ? item.sameAs : item.restaurant.id;
    const tags = item.restaurant.tags || [];
    const note = item.restaurant.note || "";
    out.shared.push({ ...item, restaurant: { ...placeFacts(item.restaurant), tags: [], note: "" } });
    if (tags.length || note) out.personal.push({ id, tags, note });
    if (item.visit) out.unwish.push(id);
    else if (item.decision === "same") out.wish.push(id);
  }
  // New shared restaurants carry no tags/note fields at all.
  out.shared = out.shared.map((item) =>
    item.decision === "same" || !twoFiles ? item : { ...item, restaurant: placeFacts(item.restaurant) }
  );
  return out;
}

// My personal entries and wishlist changes from routePlan, applied to the
// private file.
export function applyPersonalChanges(priv, { personal = [], wish = [], unwish = [] }) {
  let next = priv;
  for (const entry of personal) next = addPersonal(next, entry.id, entry);
  for (const id of wish) next = addToWishlist(next, id);
  return unwish.length ? removeFromWishlist(next, unwish) : next;
}

// --- One-time move of the owner's old single-user data (Section 10.4) -----
// Before the private file existed, the shared file held everything: my
// wishlist (restaurants without visits), my tags and notes inline on every
// restaurant, and my tag colours. The move puts all of that into my private
// file, so friends only see the places I rated and my visits. What the app
// shows doesn't change: a shared restaurant that already has a personal
// entry keeps it (that's what's shown), the others get one from their
// inline tags/note.

const hasInline = (r) => (Array.isArray(r.tags) && r.tags.length > 0) || Boolean(r.note);
const isOldWishlist = (shared, me) => {
  const visited = new Set(shared.visits.map((v) => v.restaurant_id));
  return (r) => !visited.has(r.id) && (!r.created_by || r.created_by === "unknown" || r.created_by === me);
};

// What's still to move: { wishlist: restaurants to move, tagged: shared
// restaurants with tags/note inline, colors: whether the shared file holds
// tag colours, foreign: number of places without visits added by someone
// else }. Only my own wishlist entries (created_by me) — a friend's
// shared place without visits is never taken.
export function migrationPlan(shared, me) {
  const wished = isOldWishlist(shared, me);
  const wishlist = shared.restaurants.filter(wished);
  const tagged = shared.restaurants.filter((r) => !wished(r) && hasInline(r));
  const colors = isPlainObject(shared.tag_colors) && Object.keys(shared.tag_colors).length > 0;
  // Places without visits added by another account stay shared (counted
  // only so the app can say so).
  const visited = new Set(shared.visits.map((v) => v.restaurant_id));
  const foreign = shared.restaurants.filter((r) => !visited.has(r.id) && !wished(r)).length;
  return { wishlist, tagged, colors, foreign, needed: wishlist.length > 0 || tagged.length > 0 || colors };
}

// Save 1 — the private file gets: the wishlist restaurants (with the tags
// and note shown for them), a personal entry for every tagged shared
// restaurant that has none yet, and the shared file's tag colours (mine
// win where both have one). Safe to repeat: nothing is added twice.
export function migratePrivate(priv, shared, me) {
  const { wishlist, tagged } = migrationPlan(shared, me);
  const personal = isPlainObject(priv.personal) ? priv.personal : {};
  const have = new Set(priv.restaurants.map((r) => r.id));
  const moved = wishlist
    .filter((r) => !have.has(r.id))
    .map((r) => {
      const mine = personal[r.id];
      return mine ? { ...r, tags: mine.tags || [], note: mine.note || "" } : { ...r };
    });
  let next = dropPersonal({ ...priv, restaurants: [...priv.restaurants, ...moved] }, wishlist.map((r) => r.id));
  for (const r of tagged) {
    if (!personal[r.id]) next = setPersonal(next, r.id, { tags: r.tags || [], note: r.note || "" });
  }
  const colors = { ...tagColorsOf(shared), ...tagColorsOf(priv) };
  return Object.keys(colors).length ? { ...next, tag_colors: colors } : next;
}

// Save 2 — the shared file loses only what the private file (as saved in
// step 1) now really holds: wishlist restaurants that are in it (and still
// have no visits), tags/note of restaurants with a personal entry, and the
// tag colours it has. Anything not covered stays, so a failed or partial
// first save can never lose data — the move can simply be run again.
export function migrateShared(shared, priv, me) {
  const inPrivate = new Set(priv.restaurants.map((r) => r.id));
  const personal = isPlainObject(priv.personal) ? priv.personal : {};
  const wished = isOldWishlist(shared, me);
  const restaurants = shared.restaurants
    .filter((r) => !(wished(r) && inPrivate.has(r.id)))
    .map((r) => {
      if (!hasInline(r) || !personal[r.id]) return r;
      const { tags, note, ...rest } = r;
      return rest;
    });
  const next = { ...shared, restaurants };
  if (!isPlainObject(shared.tag_colors)) return next;
  const privColors = tagColorsOf(priv);
  const left = Object.entries(shared.tag_colors).filter(([tag]) => !Object.prototype.hasOwnProperty.call(privColors, tag));
  const { tag_colors, ...rest } = next;
  return left.length ? { ...rest, tag_colors: Object.fromEntries(left) } : rest;
}
