// One distinct colour per tag, computed (not stored), so it's identical on
// every device. Tags are numbered in the order they first appeared
// (earliest created_at of an entry carrying them, then by name), and
// numbers are spread around the colour wheel by the golden angle — no two
// tags ever share a hue. Deleting every early entry of a tag can renumber
// tags and shift colours; accepted in exchange for storing nothing.
const GOLDEN_ANGLE = 137.508;

export function computeTagColors(ratings) {
  const firstSeen = new Map();
  for (const r of ratings) {
    for (const tag of r.tags || []) {
      const at = r.created_at || "";
      if (!firstSeen.has(tag) || at < firstSeen.get(tag)) firstSeen.set(tag, at);
    }
  }
  const ordered = [...firstSeen.entries()]
    .sort(([tagA, atA], [tagB, atB]) => atA.localeCompare(atB) || tagA.localeCompare(tagB))
    .map(([tag]) => tag);

  // Tags whose hues end up close together (e.g. numbers 8 apart, ~20°) also
  // differ in lightness, via a 3-step cycle, so they stay easy to tell apart.
  const lightness = [48, 34, 62];
  const colors = new Map();
  ordered.forEach((tag, i) => {
    const hue = Math.round((i * GOLDEN_ANGLE) % 360);
    colors.set(tag, `hsl(${hue} 65% ${lightness[i % 3]}%)`);
  });
  return colors;
}
