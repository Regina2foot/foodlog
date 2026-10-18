// Restaurant detail view: full visit history, a rating/price-over-time
// chart (hand-rolled SVG, see CLAUDE.md Section 13), and the
// "Open in Google Maps" action. All user-supplied text is set via
// textContent, never innerHTML (see CLAUDE.md Section 4.1).

import { buildStarsDisplay, buildTagDot, formatPrice, formatDate, renderStarPicker, renderPricePicker, renderTagPicker } from "./render.js";
import { googleMapsLinkFor } from "./maps.js";
import { hasLocation } from "./data.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.appendChild(child);
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

// Two stacked plots over the restaurant's rated visits (oldest left):
// rating on a 0–5 axis, price on a €–€€€ axis, dates along the bottom.
// Wishlist entries have no rating/price and are left out. Returns null if
// there's nothing to plot.
const CHART = {
  width: 320,
  padLeft: 34,
  padRight: 14,
  rating: { top: 22, height: 80 },
  price: { top: 132, height: 50 },
  dateLabelY: 200,
  height: 208,
};

export function buildHistoryChart(visits) {
  const rated = visits
    .filter((v) => v.rating !== null && v.rating !== undefined)
    .sort((a, b) => (a.visited_at || "").localeCompare(b.visited_at || ""));
  if (rated.length === 0) return null;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${CHART.width} ${CHART.height}`,
    width: "100%",
    role: "img",
    "aria-label": "Rating and price level over time",
    class: "history-chart",
  });

  // Points are inset from both ends so they don't sit on the y-axis and
  // the outermost date labels aren't clipped.
  const inset = 24;
  const plotWidth = CHART.width - CHART.padLeft - CHART.padRight - 2 * inset;
  const xAt = (i) =>
    CHART.padLeft + inset + (rated.length === 1 ? plotWidth / 2 : (i * plotWidth) / (rated.length - 1));

  function text(x, y, content, attrs = {}) {
    const t = svgEl("text", { x, y, "font-size": 10, fill: "currentColor", ...attrs });
    t.textContent = content;
    svg.appendChild(t);
  }

  function line(x1, y1, x2, y2, attrs = {}) {
    svg.appendChild(svgEl("line", { x1, y1, x2, y2, stroke: "currentColor", ...attrs }));
  }

  // One plot: title, y-axis with tick labels + faint grid, x-axis, data.
  function plot({ top, height }, title, ticks, min, max, values, color) {
    const yAt = (v) => top + height - ((v - min) / (max - min)) * height;
    text(0, top - 8, title, { "font-weight": 600 });
    for (const { value, label } of ticks) {
      const y = yAt(value);
      line(CHART.padLeft, y, CHART.width - CHART.padRight, y, { "stroke-opacity": 0.12 });
      text(CHART.padLeft - 6, y + 3.5, label, { "text-anchor": "end", "fill-opacity": 0.7 });
    }
    line(CHART.padLeft, top, CHART.padLeft, top + height, { "stroke-opacity": 0.5 });
    line(CHART.padLeft, top + height, CHART.width - CHART.padRight, top + height, { "stroke-opacity": 0.5 });

    const points = values
      .map((v, i) => (v === null || v === undefined || v < min ? null : { x: xAt(i), y: yAt(Math.min(max, v)) }))
      .filter(Boolean);
    if (points.length > 1) {
      svg.appendChild(
        svgEl("polyline", {
          points: points.map((p) => `${p.x},${p.y}`).join(" "),
          fill: "none",
          stroke: color,
          "stroke-width": 2,
        })
      );
    }
    for (const p of points) svg.appendChild(svgEl("circle", { cx: p.x, cy: p.y, r: 3.5, fill: color }));
  }

  plot(
    CHART.rating,
    "Rating",
    [0, 1, 2, 3, 4, 5].map((v) => ({ value: v, label: `${v}★` })),
    0,
    5,
    rated.map((v) => v.rating),
    "#d4820a"
  );
  plot(
    CHART.price,
    "Price",
    [1, 2, 3].map((v) => ({ value: v, label: "€".repeat(v) })),
    1,
    3,
    rated.map((v) => v.price_level),
    "#3b7dd8"
  );

  // Date labels under the x-axis; thinned out so they never overlap.
  const every = Math.ceil(rated.length / 5);
  rated.forEach((v, i) => {
    if (i % every !== 0 && i !== rated.length - 1) return;
    text(xAt(i), CHART.dateLabelY, formatDate(v.visited_at), { "text-anchor": "middle", "font-size": 9, "fill-opacity": 0.7 });
  });

  return svg;
}

// One visit as a two-line card: date, stars, price and actions on top;
// the comment underneath (if any).
function renderVisitCard(visit, { onEdit, onDelete }) {
  const card = el("div", { className: "visit-card" });

  const editButton = el("button", { type: "button", textContent: "Edit" });
  editButton.addEventListener("click", () => onEdit(visit.id));
  const deleteButton = el("button", { type: "button", textContent: "Delete" });
  deleteButton.addEventListener("click", () => {
    if (confirm(`Delete this visit (${formatDate(visit.visited_at) || "no date"})?`)) {
      onDelete(visit.id);
    }
  });

  card.appendChild(
    el("div", { className: "visit-line" }, [
      el("span", { className: "visit-date", textContent: formatDate(visit.visited_at) || "—" }),
      buildStarsDisplay(visit.rating ?? 0),
      el("span", { className: "visit-price", textContent: formatPrice(visit.price_level) }),
      el("span", { className: "visit-actions" }, [editButton, deleteButton]),
    ])
  );
  if (visit.comment) {
    card.appendChild(
      el("div", { className: "visit-line visit-details" }, [
        el("span", { className: "visit-comment", textContent: visit.comment }),
      ])
    );
  }
  return card;
}

function labeled(labelText, control) {
  return el("label", { className: "edit-field" }, [document.createTextNode(labelText), control]);
}

// Form for a visit: a new one (visit = null) or editing an existing one.
// onSave(fields) gets { rating, price_level, comment, visited_at }.
function renderVisitForm(visit, { onSave, onCancel }) {
  const card = el("div", { className: "visit-card visit-edit" });

  const ratingPicker = el("span", { className: "star-picker" });
  ratingPicker.dataset.value = String(visit?.rating ?? 0);
  const pricePicker = el("span", { className: "price-picker" });
  pricePicker.dataset.value = String(visit?.price_level ?? 0);
  renderStarPicker(ratingPicker, () => {});
  renderPricePicker(pricePicker, () => {});

  const commentInput = el("textarea", { rows: 2, value: visit?.comment || "", placeholder: "How was it?" });
  const dateInput = el("input", { type: "date", value: visit?.visited_at || new Date().toISOString().slice(0, 10) });

  const saveButton = el("button", { type: "button", textContent: visit ? "Save" : "Add visit" });
  saveButton.addEventListener("click", () => {
    const price = Number(pricePicker.dataset.value || 0);
    onSave({
      rating: Number(ratingPicker.dataset.value || 0),
      price_level: price > 0 ? price : null,
      comment: commentInput.value.trim(),
      visited_at: dateInput.value || new Date().toISOString().slice(0, 10),
    });
  });
  const cancelButton = el("button", { type: "button", textContent: "Cancel" });
  cancelButton.addEventListener("click", onCancel);

  card.append(
    el("div", { className: "edit-fields" }, [
      labeled("Rating", ratingPicker),
      labeled("Price", pricePicker),
      labeled("Comment", commentInput),
      labeled("Visit date", dateInput),
    ]),
    el("div", { className: "form-actions" }, [saveButton, cancelButton])
  );
  return card;
}

// Edit form for the restaurant itself (not a visit): name, Google link,
// tags, note, plus "Delete restaurant".
function renderRestaurantForm(restaurant, allTags, tagColors, { onSave, onCancel, onDelete }) {
  const card = el("div", { className: "visit-card visit-edit" });
  const nameInput = el("input", { type: "text", value: restaurant.name || "" });
  const linkInput = el("input", {
    type: "text",
    value: restaurant.google_maps_url || "",
    placeholder: "https://maps.app.goo.gl/...",
  });
  const noteInput = el("textarea", { rows: 2, value: restaurant.note || "", placeholder: "e.g. who recommended it" });

  let selectedTags = [...(restaurant.tags || [])];
  const tagsContainer = el("div", { className: "tag-picker" });
  const refreshTags = () =>
    renderTagPicker(
      tagsContainer,
      allTags,
      selectedTags,
      (next) => {
        selectedTags = next;
        refreshTags();
      },
      tagColors
    );
  refreshTags();

  const saveButton = el("button", { type: "button", textContent: "Save" });
  saveButton.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    onSave({
      name,
      google_maps_url: linkInput.value.trim(),
      note: noteInput.value.trim(),
      tags: selectedTags,
    });
  });
  const cancelButton = el("button", { type: "button", textContent: "Cancel" });
  cancelButton.addEventListener("click", onCancel);
  const deleteButton = el("button", { type: "button", textContent: "Delete restaurant", className: "danger-btn" });
  deleteButton.addEventListener("click", () => {
    const visits = restaurant.visits.length;
    if (confirm(`Delete "${restaurant.name}"${visits ? ` and its ${visits} visit(s)` : ""}? This cannot be undone.`)) {
      onDelete();
    }
  });

  card.append(
    el("div", { className: "edit-fields" }, [
      labeled("Name", nameInput),
      labeled("Google Maps link (optional)", linkInput),
      labeled("Tags", tagsContainer),
      labeled("Note", noteInput),
    ]),
    el("div", { className: "form-actions" }, [saveButton, cancelButton, deleteButton])
  );
  return card;
}

// Detail view of one restaurant (CLAUDE.md Section 15.4). `restaurant` is a
// restaurant view (data.js). `ui` = { editingRestaurant, addingVisit,
// editingVisitId }. callbacks: onOpenMaps(url), onShowOnMap(),
// onSetLocation(), onEditRestaurant(),
// onSaveRestaurant(changes), onDeleteRestaurant(), onAddVisit(),
// onSaveNewVisit(fields), onEditVisit(id), onSaveVisit(id, fields),
// onDeleteVisit(id), onCancel() (closes whichever form is open).
export function renderRestaurantDetail(container, restaurant, callbacks, ui, allTags = [], tagColors = new Map()) {
  container.textContent = "";

  container.appendChild(el("h2", { textContent: restaurant.name }));

  if (ui.editingRestaurant) {
    container.appendChild(
      renderRestaurantForm(restaurant, allTags, tagColors, {
        onSave: callbacks.onSaveRestaurant,
        onCancel: callbacks.onCancel,
        onDelete: callbacks.onDeleteRestaurant,
      })
    );
  } else {
    const info = el("div", { className: "restaurant-info" });
    if (restaurant.tags.length) {
      info.appendChild(
        el(
          "div",
          { className: "visit-line" },
          restaurant.tags.map((tag) =>
            el("span", { className: "tag-chip" }, [buildTagDot(tag, tagColors), document.createTextNode(tag)])
          )
        )
      );
    }
    if (restaurant.note) info.appendChild(el("p", { className: "restaurant-note", textContent: restaurant.note }));
    container.appendChild(info);

    // Location row: address (or a plain status) + map actions.
    const located = hasLocation(restaurant);
    const locationRow = el("div", { className: "location-row" }, [
      el("span", {
        className: "hint",
        textContent: located ? `📍 ${restaurant.address || "Location set"}` : "No location yet",
      }),
    ]);
    if (located) {
      const showButton = el("button", { type: "button", textContent: "Show on map" });
      showButton.addEventListener("click", callbacks.onShowOnMap);
      locationRow.appendChild(showButton);
    }
    const setButton = el("button", { type: "button", textContent: located ? "Change location" : "Set location" });
    setButton.addEventListener("click", callbacks.onSetLocation);
    locationRow.appendChild(setButton);
    container.appendChild(locationRow);

    const googleLink = googleMapsLinkFor(restaurant);
    const mapsButton = el("button", { type: "button", textContent: "Open in Google Maps" });
    mapsButton.disabled = !googleLink;
    mapsButton.addEventListener("click", () => callbacks.onOpenMaps(googleLink));
    const editButton = el("button", { type: "button", textContent: "Edit restaurant" });
    editButton.addEventListener("click", callbacks.onEditRestaurant);
    container.appendChild(el("div", { className: "form-actions detail-actions" }, [mapsButton, editButton]));
  }

  if (restaurant.visits.length > 0) {
    const chartContainer = el("div", { className: "chart-container" });
    chartContainer.appendChild(buildHistoryChart(restaurant.visits));
    container.appendChild(chartContainer);
  }

  const visitsHeader = el("div", { className: "visits-header" }, [el("h3", { textContent: "Visits" })]);
  if (!ui.addingVisit) {
    const addButton = el("button", { type: "button", textContent: "Add visit" });
    addButton.addEventListener("click", callbacks.onAddVisit);
    visitsHeader.appendChild(addButton);
  }
  container.appendChild(visitsHeader);

  const list = el("div", { className: "visit-list" });
  if (ui.addingVisit) {
    list.appendChild(renderVisitForm(null, { onSave: callbacks.onSaveNewVisit, onCancel: callbacks.onCancel }));
  }
  if (restaurant.visits.length === 0 && !ui.addingVisit) {
    list.appendChild(el("p", { className: "hint", textContent: "Not visited yet — it's on your wishlist." }));
  }
  for (const visit of restaurant.visits) {
    list.appendChild(
      visit.id === ui.editingVisitId
        ? renderVisitForm(visit, {
            onSave: (fields) => callbacks.onSaveVisit(visit.id, fields),
            onCancel: callbacks.onCancel,
          })
        : renderVisitCard(visit, { onEdit: callbacks.onEditVisit, onDelete: callbacks.onDeleteVisit })
    );
  }
  container.appendChild(list);
}
