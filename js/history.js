// Restaurant detail view: full visit history, a rating/price-over-time
// chart (hand-rolled SVG, see CLAUDE.md Section 13), and the
// "Open in Google Maps" action. All user-supplied text is set via
// textContent, never innerHTML (see CLAUDE.md Section 4.1).

import { buildStarsDisplay, buildTagDot, formatPrice, formatDate, renderStarPicker, renderPricePicker, renderTagPicker } from "./render.js";
import { isSafeHttpUrl } from "./maps.js";

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
    .filter((v) => (v.status || "visited") !== "wishlist" && v.rating !== null && v.rating !== undefined)
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
// comment and tags underneath (only if there are any).
function renderVisitCard(visit, tagColors, { onEdit, onDelete }) {
  const isWishlist = visit.status === "wishlist";
  const card = el("div", { className: "visit-card" });

  const editButton = el("button", { type: "button", textContent: "Edit" });
  editButton.addEventListener("click", () => onEdit(visit.id));
  const deleteButton = el("button", { type: "button", textContent: "Delete" });
  deleteButton.addEventListener("click", () => {
    if (confirm(`Delete this visit (${formatDate(visit.visited_at) || "no date"})?`)) {
      onDelete(visit.id);
    }
  });

  const top = el("div", { className: "visit-line" }, [
    el("span", { className: "visit-date", textContent: isWishlist ? "Wishlist" : formatDate(visit.visited_at) || "—" }),
    buildStarsDisplay(visit.rating),
    el("span", { className: "visit-price", textContent: isWishlist ? "" : formatPrice(visit.price_level) }),
    el("span", { className: "visit-actions" }, [editButton, deleteButton]),
  ]);
  card.appendChild(top);

  const tags = visit.tags || [];
  if (visit.comment || tags.length) {
    const details = el("div", { className: "visit-line visit-details" });
    if (visit.comment) details.appendChild(el("span", { className: "visit-comment", textContent: visit.comment }));
    for (const tag of tags) {
      details.appendChild(el("span", { className: "tag-chip" }, [buildTagDot(tag, tagColors), document.createTextNode(tag)]));
    }
    card.appendChild(details);
  }
  return card;
}

function labeled(labelText, control) {
  return el("label", { className: "edit-field" }, [document.createTextNode(labelText), control]);
}

function renderVisitEditForm(visit, allTags, tagColors, { onSave, onCancel }) {
  const card = el("div", { className: "visit-card visit-edit" });

  const wishlistLabel = el("label", { className: "checkbox-label" });
  const wishlistCheckbox = el("input", { type: "checkbox", checked: visit.status === "wishlist" });
  wishlistLabel.append(wishlistCheckbox, document.createTextNode("Wishlist (not yet visited)"));

  const ratingPicker = el("span", { className: "star-picker" });
  ratingPicker.dataset.value = String(visit.rating ?? 0);
  const pricePicker = el("span", { className: "price-picker" });
  pricePicker.dataset.value = String(visit.price_level ?? 0);
  renderStarPicker(ratingPicker, () => {});
  renderPricePicker(pricePicker, () => {});

  const commentInput = el("textarea", { rows: 2, value: visit.comment || "", placeholder: "Comment" });
  const dateInput = el("input", { type: "date", value: visit.visited_at || "" });

  let selectedTags = [...(visit.tags || [])];
  const tagsContainer = el("div", { className: "tag-picker" });
  const refreshTags = () => {
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
  };
  refreshTags();

  const visitedFields = el("div", { className: "edit-fields", hidden: visit.status === "wishlist" }, [
    labeled("Rating", ratingPicker),
    labeled("Price", pricePicker),
    labeled("Comment", commentInput),
    labeled("Visit date", dateInput),
  ]);

  wishlistCheckbox.addEventListener("change", () => {
    visitedFields.hidden = wishlistCheckbox.checked;
  });

  const saveButton = el("button", { type: "button", textContent: "Save" });
  saveButton.addEventListener("click", () => {
    const isWishlist = wishlistCheckbox.checked;
    onSave(visit.id, {
      status: isWishlist ? "wishlist" : "visited",
      rating: isWishlist ? null : Number(ratingPicker.dataset.value || 0),
      price_level: isWishlist ? null : Number(pricePicker.dataset.value || 0),
      comment: isWishlist ? "" : commentInput.value.trim(),
      tags: selectedTags,
      visited_at: isWishlist ? null : dateInput.value || visit.visited_at,
    });
  });
  const cancelButton = el("button", { type: "button", textContent: "Cancel" });
  cancelButton.addEventListener("click", onCancel);

  card.append(
    wishlistLabel,
    visitedFields,
    labeled("Tags", tagsContainer),
    el("div", { className: "form-actions" }, [saveButton, cancelButton])
  );
  return card;
}

// callbacks: onOpenMaps(url), onEdit(id), onCancelEdit(), onSaveEdit(id, changes), onDelete(id)
// `allTags` is every tag seen anywhere, passed through to the edit form's tag picker;
// `tagColors` (tag -> colour) colours tag chips and the picker.
export function renderRestaurantDetail(container, restaurant, callbacks, editingVisitId = null, allTags = [], tagColors = new Map()) {
  container.textContent = "";

  container.appendChild(el("h2", { textContent: restaurant.name }));

  const mapsButton = el("button", { type: "button", textContent: "Open in Google Maps" });
  mapsButton.disabled = !isSafeHttpUrl(restaurant.google_maps_url);
  mapsButton.addEventListener("click", () => callbacks.onOpenMaps(restaurant.google_maps_url));
  container.appendChild(mapsButton);

  const chartContainer = el("div", { className: "chart-container" });
  const chart = buildHistoryChart(restaurant.visits);
  if (chart) chartContainer.appendChild(chart);
  else chartContainer.appendChild(el("p", { className: "hint", textContent: "No rated visits yet, so no chart." }));
  container.appendChild(chartContainer);

  container.appendChild(el("h3", { textContent: "Visits" }));
  const list = el("div", { className: "visit-list" });
  for (const visit of restaurant.visits) {
    list.appendChild(
      visit.id === editingVisitId
        ? renderVisitEditForm(visit, allTags, tagColors, { onSave: callbacks.onSaveEdit, onCancel: callbacks.onCancelEdit })
        : renderVisitCard(visit, tagColors, { onEdit: callbacks.onEdit, onDelete: callbacks.onDelete })
    );
  }
  container.appendChild(list);
}
