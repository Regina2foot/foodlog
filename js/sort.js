// Pure sorting helpers for the restaurant list. Rating and date use each
// restaurant's most recent visit (wishlist places have none and sort last);
// "added" uses when the restaurant itself was added.

function compareBy(getValue, dir) {
  const factor = dir === "asc" ? 1 : -1;
  return (a, b) => {
    const va = getValue(a);
    const vb = getValue(b);
    if (va < vb) return -1 * factor;
    if (va > vb) return 1 * factor;
    return 0;
  };
}

export function sortRestaurants(restaurants, field, dir = "desc") {
  const list = [...restaurants];
  switch (field) {
    case "name":
      return list.sort(compareBy((r) => (r.name || "").toLowerCase(), dir));
    case "date":
      return list.sort(compareBy((r) => r.latest?.visited_at || "", dir));
    case "added":
      return list.sort(compareBy((r) => r.created_at || "", dir));
    case "rating":
    default:
      return list.sort(compareBy((r) => r.latest?.rating ?? -1, dir));
  }
}

// Map tab filter (CLAUDE.md Section 15.3). `ratings`: a Set of
// "wishlist" and/or star values "0"–"5" (judged by the latest visit, like
// the list), any combination; empty = everything. `tags`: a Set — empty =
// any; otherwise the restaurant needs at least one of them.
export const STAR_VALUES = ["0", "1", "2", "3", "4", "5"];

export function matchesMapFilter(restaurant, { ratings = new Set(), tags = new Set() } = {}) {
  if (tags.size > 0 && !(restaurant.tags || []).some((t) => tags.has(t))) return false;
  if (ratings.size === 0) return true;
  if (restaurant.isWishlist) return ratings.has("wishlist");
  const value = restaurant.latest?.rating;
  return Number.isFinite(value) && ratings.has(String(value));
}
