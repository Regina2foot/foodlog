// Restaurant detail view: full visit history, a rating/price-over-time
// chart (hand-rolled SVG, see CLAUDE.md Section 13), and the
// "Open in Google Maps" action. All user-supplied text is set via
// textContent, never innerHTML (see CLAUDE.md Section 4.1).

import { buildStarsDisplay, formatPrice, renderStarPicker, renderPricePicker, renderTagPicker } from "./render.js";
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

// Builds a small two-row SVG: rating (0-5) on top, price level (1-3) below,
// plotted against visit order (oldest to newest, left to right).
export function buildHistoryChart(visits) {
  const chronological = [...visits].sort((a, b) =>
    (a.visited_at || "").localeCompare(b.visited_at || "")
  );

  const width = Math.max(240, chronological.length * 60);
  const rowHeight = 60;
  const height = rowHeight * 2 + 30;
  const padding = 24;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: "100%",
    height,
    role: "img",
    "aria-label": "Rating and price level over time",
  });

  function plotRow(values, max, yOffset, color, label) {
    const step = chronological.length > 1 ? (width - padding * 2) / (chronological.length - 1) : 0;
    const points = values.map((v, i) => {
      const x = padding + i * step;
      const y = yOffset + rowHeight - (Math.max(0, Math.min(max, v)) / max) * (rowHeight - 10) - 5;
      return { x, y };
    });

    const labelEl = svgEl("text", { x: 0, y: yOffset + 12, "font-size": 10, fill: color });
    labelEl.textContent = label;
    svg.appendChild(labelEl);

    if (points.length > 1) {
      const polyline = svgEl("polyline", {
        points: points.map((p) => `${p.x},${p.y}`).join(" "),
        fill: "none",
        stroke: color,
        "stroke-width": 2,
      });
      svg.appendChild(polyline);
    }

    points.forEach((p) => {
      svg.appendChild(svgEl("circle", { cx: p.x, cy: p.y, r: 3, fill: color }));
    });
  }

  plotRow(chronological.map((v) => v.rating ?? 0), 5, 0, "#d4820a", "Rating (0-5)");
  plotRow(chronological.map((v) => v.price_level ?? 0), 3, rowHeight, "#3b7dd8", "Price (1-3)");

  const step = chronological.length > 1 ? (width - padding * 2) / (chronological.length - 1) : 0;
  chronological.forEach((v, i) => {
    const label = svgEl("text", {
      x: padding + i * step,
      y: height - 4,
      "font-size": 9,
      "text-anchor": "middle",
    });
    label.textContent = v.visited_at || "";
    svg.appendChild(label);
  });

  return svg;
}

function renderVisitRow(visit, { onEdit, onDelete }) {
  const row = el("tr");
  const dateCell = el("td", { textContent: visit.visited_at || "" });
  const ratingCell = el("td");
  ratingCell.appendChild(buildStarsDisplay(visit.rating));
  const priceCell = el("td", { textContent: visit.status === "wishlist" ? "" : formatPrice(visit.price_level) });
  const commentCell = el("td", { textContent: visit.comment || "" });
  const tagsCell = el("td", { textContent: (visit.tags || []).join(", ") });

  const editButton = el("button", { type: "button", textContent: "Edit" });
  editButton.addEventListener("click", () => onEdit(visit.id));
  const deleteButton = el("button", { type: "button", textContent: "Delete" });
  deleteButton.addEventListener("click", () => {
    if (confirm(`Delete this visit (${visit.visited_at || "no date"})?`)) {
      onDelete(visit.id);
    }
  });
  const actionsCell = el("td", {}, [editButton, deleteButton]);

  row.append(dateCell, ratingCell, priceCell, commentCell, tagsCell, actionsCell);
  return row;
}

function renderVisitEditForm(visit, allTags, { onSave, onCancel }) {
  const row = el("tr");
  const cell = el("td", { colSpan: 6 });

  const wishlistLabel = el("label", { className: "checkbox-label" });
  const wishlistCheckbox = el("input", { type: "checkbox", checked: visit.status === "wishlist" });
  wishlistLabel.append(wishlistCheckbox, document.createTextNode("Wishlist (not yet visited)"));

  const ratingPicker = el("span", { className: "star-picker" });
  ratingPicker.dataset.value = String(visit.rating ?? 0);
  const pricePicker = el("span", { className: "price-picker" });
  pricePicker.dataset.value = String(visit.price_level ?? 0);
  renderStarPicker(ratingPicker, () => {});
  renderPricePicker(pricePicker, () => {});

  const commentInput = el("input", { type: "text", value: visit.comment || "", placeholder: "Comment" });
  let selectedTags = [...(visit.tags || [])];
  const tagsContainer = el("div", { className: "tag-picker" });
  const refreshTags = () => {
    renderTagPicker(tagsContainer, allTags, selectedTags, (next) => {
      selectedTags = next;
      refreshTags();
    });
  };
  refreshTags();
  const dateInput = el("input", { type: "date", value: visit.visited_at || "" });

  const visitedFields = el("div", { className: "form-actions", hidden: visit.status === "wishlist" }, [
    ratingPicker,
    pricePicker,
    commentInput,
    dateInput,
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

  const buttons = el("div", { className: "form-actions" }, [saveButton, cancelButton]);
  const form = el("div", {}, [wishlistLabel, tagsContainer, visitedFields, buttons]);
  cell.appendChild(form);
  row.appendChild(cell);
  return row;
}

// callbacks: onOpenMaps(url), onEdit(id), onCancelEdit(), onSaveEdit(id, changes), onDelete(id)
// `allTags` is every tag seen anywhere, passed through to the edit form's tag picker.
export function renderRestaurantDetail(container, restaurant, callbacks, editingVisitId = null, allTags = []) {
  container.textContent = "";

  const heading = el("h2", { textContent: restaurant.name });
  container.appendChild(heading);

  const mapsButton = el("button", { type: "button", textContent: "Open in Google Maps" });
  mapsButton.disabled = !isSafeHttpUrl(restaurant.google_maps_url);
  mapsButton.addEventListener("click", () => callbacks.onOpenMaps(restaurant.google_maps_url));
  container.appendChild(mapsButton);

  const chartContainer = el("div", { className: "chart-container" });
  chartContainer.appendChild(buildHistoryChart(restaurant.visits));
  container.appendChild(chartContainer);

  const table = el("table", { className: "visit-history" });
  const thead = el("thead");
  const headRow = el("tr");
  ["Date", "Rating", "Price", "Comment", "Tags", "Actions"].forEach((text) => {
    headRow.appendChild(el("th", { textContent: text }));
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el("tbody");
  for (const visit of restaurant.visits) {
    if (visit.id === editingVisitId) {
      tbody.appendChild(
        renderVisitEditForm(visit, allTags, {
          onSave: callbacks.onSaveEdit,
          onCancel: callbacks.onCancelEdit,
        })
      );
    } else {
      tbody.appendChild(
        renderVisitRow(visit, {
          onEdit: callbacks.onEdit,
          onDelete: callbacks.onDelete,
        })
      );
    }
  }
  table.appendChild(tbody);
  container.appendChild(table);
}
