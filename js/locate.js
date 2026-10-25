// "Find locations" (CLAUDE.md Section 15.3): finds each restaurant by name
// inside one area the user names per run. No DOM here; the panel is in
// locateView.js. Every search goes through geo.js, so the Nominatim limit
// of 1 request per second always holds.
//
// Careful by design: a wrong automatic location is worse than none (the
// user can still choose from the review list). Rules:
// - A result only counts if it's a venue (restaurant, café, bar, shop…)
//   whose name agrees with the restaurant's full name (namesAgree).
// - Several such venues (a chain) are never resolved by guessing.
// - If words were dropped from the end of the name to find it ("Burger-
//   meister Schlesisches Tor" → "Burgermeister"), they're looked up as a
//   place in the area. If they are one, only a match at that place counts
//   (within 800 m, or inside it if it's a district). If they aren't, a match is accepted only if it's the one and
//   only in the area — and never once the name turned out to be a chain.

import { searchPlaces, isVenue } from "./geo.js";
import { namesMatch, normalizeName, significantWords } from "./duplicates.js";

// Within this distance of the place named by the dropped words (unless
// that place is a whole district, see hintBox).
const NEAR_HINT_METERS = 800;

// Common first/last parts of compound names, split off as a separate word
// for one extra search ("Berlinburger" → "Berlin burger"), together with
// the words of the area itself.
const COMPOUND_PARTS = [
  "burger", "pizza", "pasta", "kebab", "kebap", "doner", "döner", "sushi", "ramen",
  "curry", "grill", "haus", "house", "bar", "cafe", "café", "bistro", "bakery",
];

// Same name ignoring spaces ("Berlinburger" = "Berlin Burger"), or the
// usual name match from duplicate detection (generic words ignored, small
// typos tolerated, the shorter name's words all in the longer one).
export function namesAgree(a, b) {
  const compactA = normalizeName(a).replace(/ /g, "");
  return (compactA.length >= 4 && compactA === normalizeName(b).replace(/ /g, "")) || namesMatch(a, b);
}

const isFiller = (word) => significantWords(normalizeName(word)).length === 0;

function splitCompound(word, parts) {
  const lower = word.toLowerCase();
  for (const part of parts) {
    if (lower.length - part.length < 3) continue;
    if (lower.startsWith(part)) return `${word.slice(0, part.length)} ${word.slice(part.length)}`;
    if (lower.endsWith(part)) return `${word.slice(0, -part.length)} ${word.slice(-part.length)}`;
  }
  return word;
}

// The searches to try, in order: [{ query, tail }]. `tail` = words dropped
// from the end of the name (to be checked as a location), "" if none.
//   1. the name as stored
//   2. the part before " - ", "(", "," etc. (Google appends descriptions)
//   3. without generic words ("Melt Cafe Creperie" → "Melt Creperie")
//   4. compound words split ("Berlinburger" → "Berlin burger")
//   5. dropping words from the end, one at a time, while something
//      meaningful is left ("Burgermeister Schlesisches Tor" →
//      "Burgermeister Schlesisches" → "Burgermeister")
export function searchPlan(name, areaText = "") {
  const full = (name || "").trim();
  const short = full.split(/\s[-–—|·:]\s|\s*\(|,/)[0].trim();
  const words = short.split(/\s+/).filter(Boolean);
  const plain = words.filter((w) => !isFiller(w));
  const areaParts = normalizeName(areaText).split(" ").filter((w) => w.length >= 4);
  const parts = [...areaParts, ...COMPOUND_PARTS];
  const split = plain.map((w) => splitCompound(w, parts)).join(" ");

  const plan = [full, short, plain.join(" "), split].map((query) => ({ query, tail: "" }));
  for (let keep = words.length - 1; keep >= 1; keep--) {
    const head = words.slice(0, keep);
    if (significantWords(normalizeName(head.join(" "))).join("").length < 4) break;
    plan.push({ query: head.join(" "), tail: words.slice(keep).join(" ") });
  }
  const seen = new Set();
  return plan.filter(({ query }) => query && !seen.has(query) && seen.add(query));
}

// Results that are a venue with a name agreeing with `name`.
export function matchingVenues(name, places) {
  return places.filter((p) => isVenue(p) && p.name && namesAgree(name, p.name));
}

// The one matching venue, or null (the simple case; used in tests).
export function confidentMatch(name, places) {
  const matching = matchingVenues(name, places);
  return matching.length === 1 ? matching[0] : null;
}

// A small square around a point, as a viewbox [west, south, east, north].
function boxAround({ lat, lng }, meters) {
  const dLat = meters / 111320;
  const dLng = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

// Where "right there" is for the place named by the dropped words: a
// district/neighbourhood (OSM place/boundary) counts as its whole area;
// anything else (station, street, building) as the 800 m around it.
function hintBox(hint) {
  const isArea = (hint.category === "place" || hint.category === "boundary") && hint.bbox;
  return isArea ? hint.bbox : boxAround(hint, NEAR_HINT_METERS);
}

const inBox = ([west, south, east, north], p) => p.lng >= west && p.lng <= east && p.lat >= south && p.lat <= north;

const placeKey = (p) => `${p.name}|${p.lat}|${p.lng}`;

// Looks up one restaurant inside the area ({ viewbox, areaText }). Returns
// { match, candidates }: match = a result the rules above accept, or null;
// candidates = everything found, for the user to choose from.
export async function locateOne(restaurant, { viewbox, areaText = "" }) {
  const name = restaurant.name;
  const candidates = new Map();
  const search = async (query, box) => {
    const places = await searchPlaces(query, box, { bounded: true });
    for (const p of places) if (!candidates.has(placeKey(p))) candidates.set(placeKey(p), p);
    return matchingVenues(name, places);
  };
  const result = (match) => ({ match, candidates: [...candidates.values()] });

  let isChain = false;
  for (const { query, tail } of searchPlan(name, areaText)) {
    const matching = await search(query, viewbox);
    if (matching.length === 0) continue;
    if (!tail) {
      if (matching.length === 1 && !isChain) return result(matching[0]);
      isChain = true;
      continue;
    }
    // Words were dropped: are they a place in the area (station, street,
    // district…)? Then only a match right there counts.
    const hints = await searchPlaces(tail, viewbox, { bounded: true });
    const hint = hints.find((p) => matchingVenues(name, [p]).length === 0);
    if (hint) {
      const box = hintBox(hint);
      const near = matching.filter((p) => inBox(box, p));
      if (near.length === 1) return result(near[0]);
      if (near.length === 0) {
        // A chain can have more branches than one search returns: look
        // again, only around that place.
        const local = (await search(query, box)).filter((p) => inBox(box, p));
        if (local.length === 1) return result(local[0]);
      }
      return result(null);
    }
    if (matching.length === 1 && !isChain) return result(matching[0]);
    isChain = true;
  }
  return result(null);
}

// Works through `restaurants` in order: onResult(restaurant, { match,
// candidates }) for each. Checks shouldStop() before each restaurant.
// A failed search (offline, service refusing) stops the run rather than
// failing every remaining restaurant: returns { done, error }.
export async function locateAll(restaurants, area, { onProgress, onResult, shouldStop }) {
  for (let i = 0; i < restaurants.length; i++) {
    if (shouldStop()) return { done: false, error: null };
    const restaurant = restaurants[i];
    onProgress(i, restaurant);
    let result;
    try {
      result = await locateOne(restaurant, area);
    } catch (error) {
      return { done: false, error };
    }
    onResult(restaurant, result);
  }
  return { done: true, error: null };
}
