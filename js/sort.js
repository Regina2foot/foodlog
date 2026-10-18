// Pure sorting helpers for the restaurant list. Rated restaurants sort by
// their most recent visit; wishlist places (no visit) sort last on rating
// and date.

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
    case "rating":
    default:
      return list.sort(compareBy((r) => r.latest?.rating ?? -1, dir));
  }
}
