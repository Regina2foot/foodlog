// DOM rendering. User-supplied strings (name, comment, tags) are always set
// via textContent, never innerHTML, to prevent XSS (see CLAUDE.md Section 4.1).

const STAR_SYMBOL = "★";

// Always renders all 5 stars: `rating` of them filled (bright yellow), the
// rest empty (gray outline) — so a real 0-star rating is visibly distinct
// from "not rated at all" (rating === null/undefined, e.g. a wishlist entry
// that hasn't been visited yet), which renders as plain text instead.
export function buildStarsDisplay(rating) {
  const container = document.createElement("span");
  container.className = "stars-display";

  if (rating === null || rating === undefined) {
    container.classList.add("stars-display-empty-state");
    container.textContent = "Not yet visited";
    return container;
  }

  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  container.setAttribute("role", "img");
  container.setAttribute("aria-label", `${filled} out of 5 stars`);
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement("span");
    star.className = "star-display-symbol " + (i <= filled ? "filled" : "empty");
    star.textContent = STAR_SYMBOL;
    container.appendChild(star);
  }
  return container;
}

// What each star count means (one overall rating, CLAUDE.md Section 13).
// Matches the Google import's N/10 conversion: ≤5/10 → 0, 6/10 → 1 … 10/10 → 5.
export const RATING_LABELS = [
  "No recommendation (everything between not good and disgusting)",
  "Okay",
  "Good",
  "Very good",
  "Excellent",
  "Flawless",
];

// Builds an interactive 0–5 picker inside `container` and calls onChange(value)
// whenever the user picks a new value. Reads the initial value from
// container.dataset.value. Shows what the current value means underneath.
export function renderStarPicker(container, onChange) {
  container.textContent = "";
  const current = Number(container.dataset.value || 0);
  for (let i = 1; i <= 5; i++) {
    const span = document.createElement("span");
    span.className = "symbol" + (i <= current ? " active" : "");
    span.textContent = STAR_SYMBOL;
    span.setAttribute("role", "radio");
    span.setAttribute("aria-checked", String(i <= current));
    span.addEventListener("click", () => {
      const next = Number(container.dataset.value) === i ? 0 : i;
      container.dataset.value = String(next);
      renderStarPicker(container, onChange);
      onChange(next);
    });
    container.appendChild(span);
  }
  const meaning = document.createElement("span");
  meaning.className = "rating-meaning";
  meaning.textContent = `${current} – ${RATING_LABELS[current] || ""}`;
  container.appendChild(meaning);
}

// Checkbox list of known tags plus a text input to add a brand-new one.
// `allTags` is every tag seen anywhere else; `selectedTags` is this form's
// current selection. A tag just typed into the "new tag" box (not yet
// saved anywhere, so not in `allTags`) is still shown, checked, via the
// allTags/selectedTags union, so it doesn't disappear on re-render.
// onChange(nextSelectedTags) fires on every change.
export function renderTagPicker(container, allTags, selectedTags, onChange, colors = new Map()) {
  container.textContent = "";
  const displayTags = [...new Set([...allTags, ...selectedTags])].sort((a, b) => a.localeCompare(b));

  const list = document.createElement("div");
  list.className = "tag-picker-list";
  for (const tag of displayTags) {
    const label = document.createElement("label");
    label.className = "tag-picker-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedTags.includes(tag);
    checkbox.addEventListener("change", () => {
      const next = checkbox.checked ? [...selectedTags, tag] : selectedTags.filter((t) => t !== tag);
      onChange(next);
    });
    label.append(checkbox, buildTagDot(tag, colors), document.createTextNode(tag));
    list.appendChild(label);
  }
  if (displayTags.length === 0) {
    const empty = document.createElement("span");
    empty.className = "hint";
    empty.textContent = "No tags yet.";
    list.appendChild(empty);
  }
  container.appendChild(list);

  container.appendChild(
    buildNewTagControl((value) => {
      if (!selectedTags.includes(value)) onChange([...selectedTags, value]);
    })
  );
}

// A small "+ New tag" button; only tapping it shows a text box (with an
// Add button) to type the tag. onAdd(tag) gets the trimmed text. Enter
// adds; Escape, or leaving the box empty, folds it back to the button.
export function buildNewTagControl(onAdd) {
  const row = document.createElement("div");
  row.className = "tag-picker-add";
  const open = document.createElement("button");
  open.type = "button";
  open.className = "small-btn";
  open.textContent = "+ New tag";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Tag name";
  input.autocomplete = "off";
  const add = document.createElement("button");
  add.type = "button";
  add.className = "small-btn";
  add.textContent = "Add";

  const setOpen = (isOpen) => {
    open.hidden = isOpen;
    input.hidden = !isOpen;
    add.hidden = !isOpen;
    if (isOpen) input.focus();
    else input.value = "";
  };
  const submit = () => {
    const value = input.value.trim();
    if (value) onAdd(value);
    setOpen(false);
  };
  open.addEventListener("click", () => setOpen(true));
  add.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  });
  // Tapping "Add" also blurs the box first, so only fold up when empty.
  input.addEventListener("blur", () => {
    if (!input.value.trim()) setTimeout(() => setOpen(false), 150);
  });
  row.append(open, input, add);
  setOpen(false);
  return row;
}

// Short, locale-formatted date (e.g. "10.10.26" on a German phone).
// Accepts "YYYY-MM-DD" or a full ISO timestamp; anything else is shown as-is.
export function formatDate(value) {
  if (!value) return "";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(value);
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// First column is the select checkbox. `className` lets CSS hide columns
// on narrow screens (the comment only shows where there's room).
const VISITED_COLUMNS = [
  { label: "", className: "col-select" },
  { label: "Name", className: "col-name" },
  { label: "Rating", className: "col-rating" },
  { label: "Tags", className: "col-tags" },
  { label: "Last edit", className: "col-date" },
  { label: "Comment", className: "col-comment" },
];
const WISHLIST_COLUMNS = [
  { label: "", className: "col-select" },
  { label: "Name", className: "col-name" },
  { label: "Tags", className: "col-tags" },
  { label: "Added", className: "col-date" },
];

function cell(className, content) {
  const td = document.createElement("td");
  td.className = className;
  if (content instanceof Node) td.appendChild(content);
  else td.textContent = content ?? "";
  return td;
}

// Rewrites the table header row for the current list view mode. The first
// column is a "select all visible rows" checkbox; `allSelected` reflects
// whether every currently-visible row is already selected.
export function renderListHeader(headerRow, mode = "visited", onToggleSelectAll, allSelected = false) {
  headerRow.textContent = "";
  const columns = mode === "wishlist" ? WISHLIST_COLUMNS : VISITED_COLUMNS;
  columns.forEach(({ label, className }, idx) => {
    const th = document.createElement("th");
    th.className = className;
    if (idx === 0) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = allSelected;
      checkbox.setAttribute("aria-label", "Select all visible rows");
      checkbox.addEventListener("change", () => onToggleSelectAll(checkbox.checked));
      th.appendChild(checkbox);
    } else {
      th.textContent = label;
    }
    headerRow.appendChild(th);
  });
}

// Renders the grouped restaurant list into `tbody`. `onRowClick` receives the
// restaurant's id so the caller can open the detail view. `restaurants` are
// restaurant views (data.js buildRestaurantViews).
// `mode` ("visited" | "wishlist" | "duplicates") selects which columns to show.
// `onToggleSelect(id, checked)` fires from each row's checkbox;
// `selectedKeys` (a Set of restaurant ids) sets each checkbox's initial state.
// Options: `groupStartKeys` marks rows that start a new duplicate group
// (drawn with a separator); `emptyMessage` overrides the empty-list text.
export function renderRestaurantList(
  tbody,
  restaurants,
  onRowClick,
  mode = "visited",
  onToggleSelect,
  selectedKeys,
  { groupStartKeys = new Set(), emptyMessage, tagColors = new Map() } = {}
) {
  tbody.textContent = "";

  if (restaurants.length === 0) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = mode === "wishlist" ? WISHLIST_COLUMNS.length : VISITED_COLUMNS.length;
    td.textContent =
      emptyMessage ||
      (mode === "wishlist" ? "Wishlist is empty." : mode === "duplicates" ? "No possible duplicates found." : "No ratings yet.");
    row.appendChild(td);
    tbody.appendChild(row);
    return;
  }

  for (const restaurant of restaurants) {
    const row = document.createElement("tr");
    row.tabIndex = 0;
    if (groupStartKeys.has(restaurant.id)) row.classList.add("dup-group-start");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedKeys.has(restaurant.id);
    checkbox.setAttribute("aria-label", `Select ${restaurant.name}`);
    checkbox.addEventListener("click", (e) => e.stopPropagation());
    checkbox.addEventListener("change", () => onToggleSelect(restaurant.id, checkbox.checked));
    row.append(cell("col-select", checkbox), cell("col-name", restaurant.name));

    const latest = restaurant.latest;
    const tags = restaurant.tags || [];
    if (mode === "wishlist") {
      row.append(
        cell("col-tags", buildTagDots(tags, tagColors)),
        cell("col-date", formatDate(restaurant.created_at))
      );
    } else {
      row.append(
        cell("col-rating", buildStarsDisplay(latest ? latest.rating : null)),
        cell("col-tags", buildTagDots(tags, tagColors)),
        cell("col-date", formatDate(latest?.visited_at)),
        cell("col-comment", latest?.comment || restaurant.note || "")
      );
    }

    row.addEventListener("click", () => onRowClick(restaurant.id));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onRowClick(restaurant.id);
      }
    });
    tbody.appendChild(row);
  }
}

export function buildTagDot(tag, colors) {
  const dot = document.createElement("span");
  dot.className = "tag-dot";
  dot.style.background = colors.get(tag) || "currentColor";
  return dot;
}

const MAX_TAG_DOTS = 3;

// Small coloured circles (max 3, then "+N"); tag names go in the
// accessible label / tooltip since the dots themselves carry no text.
export function buildTagDots(tags, colors) {
  const wrap = document.createElement("span");
  wrap.className = "tag-dots";
  if (tags.length === 0) return wrap;
  wrap.title = tags.join(", ");
  wrap.setAttribute("aria-label", `Tags: ${tags.join(", ")}`);
  for (const tag of tags.slice(0, MAX_TAG_DOTS)) wrap.appendChild(buildTagDot(tag, colors));
  if (tags.length > MAX_TAG_DOTS) {
    const more = document.createElement("span");
    more.className = "tag-dots-more";
    more.textContent = `+${tags.length - MAX_TAG_DOTS}`;
    wrap.appendChild(more);
  }
  return wrap;
}

// Tag filter as a row of tappable chips ("All" + one per tag). Doubles as
// the colour legend for the dots in the list. onSelect("") = all tags.
export function renderTagFilter(container, tags, colors, selected, onSelect) {
  container.textContent = "";
  const chip = (label, value, tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip" + (value === selected ? " active" : "");
    button.setAttribute("aria-pressed", String(value === selected));
    if (tag) button.appendChild(buildTagDot(tag, colors));
    button.appendChild(document.createTextNode(label));
    button.addEventListener("click", () => onSelect(value === selected ? "" : value));
    return button;
  };
  container.appendChild(chip("All tags", "", null));
  for (const tag of tags) container.appendChild(chip(tag, tag, tag));
}

export function setStatus(el, message, isError = false) {
  el.textContent = message;
  el.style.color = isError ? "#c0392b" : "";
}
