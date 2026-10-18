// Map tab (CLAUDE.md Section 15.3): Leaflet (vendored, global `L`) with
// OpenStreetMap tiles — the only map service contacted (Section 3.1).
// Restaurant text is always set via textContent, never as HTML.

import { buildStarsDisplay, buildTagDots } from "./render.js";
import { hasLocation } from "./data.js";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
// Required by the OSM tile usage policy. Static text, no user data.
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

// bubblingMouseEvents: false — otherwise tapping a marker would also count
// as a tap on the map underneath and start a "what's here?" lookup.
const BASE_STYLE = { bubblingMouseEvents: false };
const MARKER_STYLE = {
  rated: { ...BASE_STYLE, radius: 7, color: "#a84f06", weight: 2, fillColor: "#d4820a", fillOpacity: 0.9 },
  wishlist: { ...BASE_STYLE, radius: 7, color: "#3b7dd8", weight: 2, fillColor: "#ffffff", fillOpacity: 1 },
  result: { ...BASE_STYLE, radius: 6, color: "#555", weight: 2, fillColor: "#bbb", fillOpacity: 0.9 },
  candidate: { ...BASE_STYLE, radius: 10, color: "#c0392b", weight: 3, fillColor: "#ffffff", fillOpacity: 0.6 },
};

let map = null;
let markerLayer = null;
let resultLayer = null;
let candidateLayer = null;
let hasFitted = false;
const markersById = new Map();
let clickHandler = null;

function ensureMap(container) {
  if (map) return;
  map = L.map(container, { worldCopyJump: true });
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  resultLayer = L.layerGroup().addTo(map);
  candidateLayer = L.layerGroup().addTo(map);
  map.setView([20, 0], 2);
  map.on("click", (e) => clickHandler && clickHandler(e.latlng.lat, e.latlng.lng));
}

function buildPopup(restaurant, tagColors, onOpen) {
  const box = document.createElement("div");
  box.className = "map-popup";
  const name = document.createElement("strong");
  name.textContent = restaurant.name;
  box.appendChild(name);
  const line = document.createElement("div");
  line.className = "map-popup-line";
  line.appendChild(buildStarsDisplay(restaurant.latest ? restaurant.latest.rating : null));
  line.appendChild(buildTagDots(restaurant.tags, tagColors));
  box.appendChild(line);
  const open = document.createElement("button");
  open.type = "button";
  open.textContent = "Open";
  open.addEventListener("click", () => onOpen(restaurant.id));
  box.appendChild(open);
  return box;
}

// Draws one marker per restaurant that has a location. Must be called while
// the map's container is visible (Leaflet needs its size). On the first
// call with any markers, zooms to fit them; afterwards the view is left as
// the user set it. Returns how many restaurants are shown.
export function renderMap(container, restaurants, { tagColors, onOpenRestaurant }) {
  ensureMap(container);
  map.invalidateSize();
  markerLayer.clearLayers();
  markersById.clear();

  const located = restaurants.filter(hasLocation);
  for (const r of located) {
    const marker = L.circleMarker([r.lat, r.lng], r.isWishlist ? MARKER_STYLE.wishlist : MARKER_STYLE.rated)
      .bindPopup(() => buildPopup(r, tagColors, onOpenRestaurant))
      .addTo(markerLayer);
    markersById.set(r.id, marker);
  }

  if (!hasFitted && located.length > 0) {
    const bounds = L.latLngBounds(located.map((r) => [r.lat, r.lng]));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    hasFitted = true;
  }
  return located.length;
}

// Called with (lat, lng) whenever the map itself (not a marker) is tapped.
export function onMapTap(handler) {
  clickHandler = handler;
}

// The visible area as [west, south, east, north], used to bias searches.
export function visibleArea() {
  if (!map) return null;
  const b = map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

export function focusRestaurant(id) {
  const marker = markersById.get(id);
  if (!marker) return;
  hasFitted = true;
  map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16));
  marker.openPopup();
}

// Search results as small grey markers; tapping one calls onChoose(place).
// Zooms to show them all.
export function showSearchResults(places, onChoose) {
  resultLayer.clearLayers();
  for (const place of places) {
    L.circleMarker([place.lat, place.lng], MARKER_STYLE.result)
      .on("click", () => onChoose(place))
      .addTo(resultLayer);
  }
  if (places.length > 0) {
    hasFitted = true;
    map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 16 });
  }
}

// One highlighted position with a popup whose content the caller builds
// (and may update later, e.g. once a lookup returns).
export function showCandidate(lat, lng, content) {
  candidateLayer.clearLayers();
  const marker = L.circleMarker([lat, lng], MARKER_STYLE.candidate).addTo(candidateLayer);
  marker.bindPopup(content, { autoClose: false, closeOnClick: false }).openPopup();
  hasFitted = true;
  if (map.getZoom() < 15) map.setView([lat, lng], 16);
  else map.panTo([lat, lng]);
  return { update: () => marker.getPopup().update() };
}

export function clearPicking() {
  if (!map) return;
  resultLayer.clearLayers();
  candidateLayer.clearLayers();
}
