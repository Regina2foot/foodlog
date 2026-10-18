// Map tab (CLAUDE.md Section 15.3): Leaflet (vendored, global `L`) with
// OpenStreetMap tiles — the only map service contacted (Section 3.1).
// Restaurant text is always set via textContent, never as HTML.

import { buildStarsDisplay, buildTagDots } from "./render.js";
import { hasLocation } from "./data.js";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
// Required by the OSM tile usage policy. Static text, no user data.
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const MARKER_STYLE = {
  rated: { radius: 7, color: "#a84f06", weight: 2, fillColor: "#d4820a", fillOpacity: 0.9 },
  wishlist: { radius: 7, color: "#3b7dd8", weight: 2, fillColor: "#ffffff", fillOpacity: 1 },
};

let map = null;
let markerLayer = null;
let hasFitted = false;

function ensureMap(container) {
  if (map) return;
  map = L.map(container, { worldCopyJump: true });
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  map.setView([20, 0], 2);
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

  const located = restaurants.filter(hasLocation);
  for (const r of located) {
    L.circleMarker([r.lat, r.lng], r.isWishlist ? MARKER_STYLE.wishlist : MARKER_STYLE.rated)
      .bindPopup(() => buildPopup(r, tagColors, onOpenRestaurant))
      .addTo(markerLayer);
  }

  if (!hasFitted && located.length > 0) {
    const bounds = L.latLngBounds(located.map((r) => [r.lat, r.lng]));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    hasFitted = true;
  }
  return located.length;
}
