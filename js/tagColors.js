// One distinct colour per tag (CLAUDE.md Section 9.9). Colours are stored in
// the data file (`tag_colors`: { tag: "#rrggbb" }) once assigned, so adding
// a tag never shifts the others and every device shows the same ones.
// A tag without a stored colour gets the first automatic colour that
// doesn't look like one already in use (colorsLookAlike): first the preset
// swatches (PALETTE, in AUTO_ORDER), after those colours spread around the
// colour wheel by the golden angle. Such tags are served in the order they
// first appeared (earliest created_at of a restaurant carrying them, then
// by name). The user can pick another colour in Settings → Tags.
const GOLDEN_ANGLE = 137.508;
const LIGHTNESS = [48, 34, 62]; // close hues also differ in lightness

// The swatches offered in Settings → Tags: clearly different from each
// other, all readable on the light map and on white. No grey — grey means
// "no tags" on the map.
export const PALETTE = [
  "#e6194b", "#f58231", "#d4a017", "#8fbf26",
  "#3cb44b", "#469990", "#1fa8c9", "#4363d8",
  "#000075", "#911eb4", "#9d7bd8", "#f032e6",
  "#e57fa8", "#800000", "#9a6324", "#808000",
];

// The same swatches in the order automatic colours use them: each next
// one clearly different from the ones before.
const AUTO_ORDER = [
  "#e6194b", "#4363d8", "#3cb44b", "#f58231",
  "#911eb4", "#1fa8c9", "#d4a017", "#f032e6",
  "#469990", "#9a6324", "#000075", "#8fbf26",
  "#800000", "#9d7bd8", "#808000", "#e57fa8",
];

// How different two colours look ("redmean" weighted RGB distance; 0 =
// identical, ~765 = black vs white). Below SIMILAR they're easy to mix up
// on a small dot. The swatches are all at least 90 apart.
const SIMILAR = 85;

function rgbOf(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

export function colorsLookAlike(a, b) {
  const [r1, g1, b1] = rgbOf(a);
  const [r2, g2, b2] = rgbOf(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) < SIMILAR;
}

// Only plain hex colours are used from the file — the values end up in CSS
// (and the map markers' HTML), so anything else is ignored.
export const isTagColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function wheelColor(i) {
  return hslToHex(Math.round((i * GOLDEN_ANGLE) % 360), 65, LIGHTNESS[i % 3]);
}

// The first automatic colour that doesn't look like any of `used`. With
// very many tags nothing may be left that's clearly different; then the
// first wheel colour not used exactly.
function freeAutomaticColor(used) {
  const free = (c) => !used.some((u) => colorsLookAlike(u, c));
  const fromPalette = AUTO_ORDER.find(free);
  if (fromPalette) return fromPalette;
  for (let i = 0; i < 360; i++) if (free(wheelColor(i))) return wheelColor(i);
  for (let i = 0; ; i++) if (!used.includes(wheelColor(i))) return wheelColor(i);
}

// The valid stored colours of a document, as a Map.
export function storedTagColors(doc) {
  const raw = doc && doc.tag_colors;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return new Map();
  return new Map(Object.entries(raw).filter(([, color]) => isTagColor(color)));
}

// Every tag of the document's restaurants → its colour (stored, or the
// first automatic one that doesn't look like a colour in use).
export function computeTagColors(doc) {
  const firstSeen = new Map();
  for (const r of doc.restaurants || []) {
    for (const tag of r.tags || []) {
      const at = r.created_at || "";
      if (!firstSeen.has(tag) || at < firstSeen.get(tag)) firstSeen.set(tag, at);
    }
  }
  const ordered = [...firstSeen.entries()]
    .sort(([tagA, atA], [tagB, atB]) => atA.localeCompare(atB) || tagA.localeCompare(tagB))
    .map(([tag]) => tag);

  const stored = storedTagColors(doc);
  const used = ordered.filter((tag) => stored.has(tag)).map((tag) => stored.get(tag).toLowerCase());
  const colors = new Map();
  for (const tag of ordered) {
    if (stored.has(tag)) {
      colors.set(tag, stored.get(tag));
      continue;
    }
    const color = freeAutomaticColor(used);
    used.push(color);
    colors.set(tag, color);
  }
  return colors;
}

// `target` with a stored colour for every tag of `all` (the whole data as
// shown — with two files, the merged document) that has none yet. Returns
// `target` itself when there's nothing to add.
export function withTagColors(target, all) {
  const stored = storedTagColors(all);
  const missing = [...computeTagColors(all)].filter(([tag]) => !stored.has(tag));
  if (missing.length === 0) return target;
  return { ...target, tag_colors: Object.fromEntries([...storedTagColors(target), ...missing]) };
}

// Sets a tag's colour (`null` = back to automatic: the entry is removed and
// the same save hands it the first automatic colour not like the others).
export function setTagColor(doc, tag, color) {
  const colors = storedTagColors(doc);
  if (color === null) colors.delete(tag);
  else if (isTagColor(color)) colors.set(tag, color);
  else return doc;
  return { ...doc, tag_colors: Object.fromEntries(colors) };
}

// Keeps the stored colours in step with renaming/deleting a tag. A renamed
// tag takes its colour along, unless it's merged into a tag that already
// has one; a deleted tag's colour is freed.
export function renameTagColor(doc, from, to) {
  const colors = storedTagColors(doc);
  if (!colors.has(from)) return doc;
  if (!colors.has(to)) colors.set(to, colors.get(from));
  colors.delete(from);
  return { ...doc, tag_colors: Object.fromEntries(colors) };
}

export function deleteTagColor(doc, tag) {
  return storedTagColors(doc).has(tag) ? setTagColor(doc, tag, null) : doc;
}
