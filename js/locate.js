// "Locate restaurants without a location" (CLAUDE.md Section 15.3): finds
// each restaurant by name inside one area the user names per run. No DOM
// here; the panel is in locateView.js. Every search goes through geo.js,
// so the Nominatim limit of 1 request per second always holds.

import { searchPlaces, isVenue } from "./geo.js";
import { namesMatch } from "./duplicates.js";

// Names from Google often carry extras that make a search fail ("Suigyo
// Izakaya - Japanisches Restaurant Berlin", "Café X (Mitte)"), so the part
// before such a separator is tried second. A name of 3+ words is then also
// tried without its last word, which is often a district or branch that
// OpenStreetMap doesn't have ("Café Einstein Stammhaus" → "Café Einstein").
export function nameVariants(name) {
  const full = (name || "").trim();
  const short = full.split(/\s[-–—|·:]\s|\s*\(|,/)[0].trim();
  const words = short.split(/\s+/);
  const shorter = words.length >= 3 ? words.slice(0, -1).join(" ") : "";
  return [...new Set([full, short, shorter].filter(Boolean))];
}

// The one result that's clearly this restaurant: a venue (restaurant, café,
// bar, shop…) whose name matches. Null if there's none or more than one;
// then the user decides.
export function confidentMatch(name, places) {
  const matching = places.filter((p) => isVenue(p) && p.name && namesMatch(name, p.name));
  return matching.length === 1 ? matching[0] : null;
}

const placeKey = (p) => `${p.name}|${p.lat}|${p.lng}`;

// Looks up one restaurant inside `viewbox` (only results inside it count).
// Returns { match, candidates }: match = the confident result or null;
// candidates = everything found, for the user to choose from.
export async function locateOne(restaurant, viewbox) {
  const candidates = new Map();
  for (const variant of nameVariants(restaurant.name)) {
    const places = await searchPlaces(variant, viewbox, { bounded: true });
    for (const p of places) if (!candidates.has(placeKey(p))) candidates.set(placeKey(p), p);
    const match = confidentMatch(restaurant.name, places);
    if (match) return { match, candidates: [...candidates.values()] };
  }
  return { match: null, candidates: [...candidates.values()] };
}

// Works through `restaurants` in order: onResult(restaurant, { match,
// candidates }) for each. Checks shouldStop() before each restaurant.
// A failed search (offline, service refusing) stops the run rather than
// failing every remaining restaurant: returns { done, error }.
export async function locateAll(restaurants, viewbox, { onProgress, onResult, shouldStop }) {
  for (let i = 0; i < restaurants.length; i++) {
    if (shouldStop()) return { done: false, error: null };
    const restaurant = restaurants[i];
    onProgress(i, restaurant);
    let result;
    try {
      result = await locateOne(restaurant, viewbox);
    } catch (error) {
      return { done: false, error };
    }
    onResult(restaurant, result);
  }
  return { done: true, error: null };
}
