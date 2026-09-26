// Holds and derives the in-memory list of ratings (one entry per visit).

export function createEmptyState() {
  return {
    ratings: [],
    sha: null, // GitHub Contents API blob sha, needed for conflict-safe writes
  };
}

// Groups visits into restaurants by exact google_maps_url match (see CLAUDE.md
// Section 8/13). Each restaurant carries all its visits, newest first, plus a
// convenience "latest" pointer used for the list view and for sorting.
export function groupByRestaurant(ratings) {
  const groups = new Map();

  for (const visit of ratings) {
    const key = visit.google_maps_url;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(visit);
  }

  const restaurants = [];
  for (const [googleMapsUrl, visits] of groups) {
    const sortedVisits = [...visits].sort((a, b) =>
      (b.visited_at || "").localeCompare(a.visited_at || "")
    );
    restaurants.push({
      google_maps_url: googleMapsUrl,
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

export function generateId() {
  return crypto.randomUUID().slice(0, 8);
}
