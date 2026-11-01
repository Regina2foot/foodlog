// Phase 2 (CLAUDE.md Section 10): the shared file (everyone in the data
// repo) and my private file (only me). Pure functions: merging both into
// one document for display, and deciding what goes into which file.
// Without a private file (`priv` = null) everything is shared and behaves
// exactly like the single-user app.

import { addPersonal, addToWishlist, removeFromWishlist } from "./data.js";

const isPlainObject = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);

// One document for display. Shared restaurants get my personal tags and
// note when I have some (else whatever is stored on them — the old
// single-user format, until the migration); private restaurants keep
// theirs. Each restaurant is marked with `visibility`, and shared ones on
// my wishlist with `onMyWishlist`. Visits come from both files.
export function mergeFiles(shared, priv) {
  if (!priv) {
    return { ...shared, restaurants: shared.restaurants.map((r) => ({ ...r, visibility: "shared" })) };
  }
  const personal = isPlainObject(priv.personal) ? priv.personal : {};
  const wished = new Set(Array.isArray(priv.wishlist) ? priv.wishlist : []);
  const sharedIds = new Set(shared.restaurants.map((r) => r.id));
  return {
    version: shared.version,
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
