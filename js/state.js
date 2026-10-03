// Holds and derives the in-memory list of ratings (one entry per visit).

export function createEmptyState() {
  return {
    ratings: [],
    sha: null, // GitHub Contents API blob sha, needed for conflict-safe writes
  };
}

// The Google Maps link is optional (Section 9). When present it's the
// grouping key for repeat visits (Section 8); when absent, each visit is
// its own group (visit.id) since there's no reliable way to know two
// link-less entries are the same place. `groupKey` is used everywhere
// internally to identify a restaurant/group; `google_maps_url` on the
// returned restaurant stays the real (possibly empty) value for display.
function groupKeyFor(visit) {
  return visit.google_maps_url || `__no-url-${visit.id}`;
}

// Groups visits into restaurants (see CLAUDE.md Section 8/13). Each
// restaurant carries all its visits, newest first, plus a convenience
// "latest" pointer used for the list view and for sorting.
export function groupByRestaurant(ratings) {
  const groups = new Map();

  for (const visit of ratings) {
    const key = groupKeyFor(visit);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(visit);
  }

  const restaurants = [];
  for (const [key, visits] of groups) {
    const sortedVisits = [...visits].sort((a, b) =>
      (b.visited_at || "").localeCompare(a.visited_at || "")
    );
    restaurants.push({
      groupKey: key,
      google_maps_url: sortedVisits[0].google_maps_url,
      name: sortedVisits[0].name,
      latest: sortedVisits[0],
      visits: sortedVisits,
    });
  }

  return restaurants;
}

export function addRating(ratings, rating) {
  return [...ratings, rating];
}

export function updateRating(ratings, id, changes) {
  return ratings.map((r) => (r.id === id ? { ...r, ...changes } : r));
}

export function removeRating(ratings, id) {
  return ratings.filter((r) => r.id !== id);
}

// Removes every visit belonging to any of the given restaurant groupKeys
// (i.e. deleting a whole restaurant row from the list removes all of its
// visits, not just the one shown).
export function removeRestaurantGroups(ratings, groupKeys) {
  const keys = groupKeys instanceof Set ? groupKeys : new Set(groupKeys);
  return ratings.filter((r) => !keys.has(groupKeyFor(r)));
}

export function generateId() {
  return crypto.randomUUID().slice(0, 8);
}
