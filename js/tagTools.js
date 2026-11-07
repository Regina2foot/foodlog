// Tag management UI (CLAUDE.md Section 9.9): the "Tags" list in Settings
// (rename or delete a tag on every restaurant) and the "Tags…" panel for
// the ticked restaurants in the list. Only builds DOM and reports choices
// through callbacks; the data changes themselves are pure functions in
// data.js. Tag names are always set via textContent (Section 4.1).

import { buildTagDot, buildNewTagControl } from "./render.js";
import { PALETTE } from "./tagColors.js";

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.appendChild(child);
  return node;
}

function button(text, onClick, className = "") {
  const b = el("button", { type: "button", textContent: text, className });
  b.addEventListener("click", onClick);
  return b;
}

const byName = (a, b) => a.localeCompare(b);

// The colour swatches under a tag in Settings (PALETTE, plus "Automatic").
// Swatches another tag already uses are marked, so two tags don't end up
// looking alike by accident (choosing one anyway is allowed).
function buildSwatches(tag, colors, { onPickColor, onCancel }) {
  const current = (colors.get(tag) || "").toLowerCase();
  const usedBy = new Map();
  for (const [other, color] of colors) if (other !== tag) usedBy.set(color.toLowerCase(), other);
  const row = el("div", { className: "tag-swatches" });
  for (const color of PALETTE) {
    const other = usedBy.get(color);
    const swatch = button("", () => onPickColor(tag, color), "tag-swatch");
    swatch.style.background = color;
    if (color === current) swatch.classList.add("is-current");
    if (other) swatch.classList.add("is-used");
    swatch.setAttribute("aria-label", other ? `${color} (used by ${other})` : color);
    swatch.title = other ? `Used by ${other}` : "";
    row.appendChild(swatch);
  }
  return el("div", { className: "tag-swatch-panel" }, [
    row,
    el("p", { className: "hint", textContent: "Tap a colour. A dot inside = already used by another tag." }),
    el("div", { className: "form-actions" }, [button("Automatic", () => onPickColor(tag, null)), button("Cancel", onCancel)]),
  ]);
}

// tagCounts: Map of tag → number of restaurants carrying it. `renaming` is
// the tag whose row currently shows the rename input, `colouring` the one
// whose colour swatches are open (or null). Tapping a tag's dot opens them.
export function renderTagManager(container, tagCounts, colors, { renaming, colouring, onStartRename, onRename, onDelete, onCancel, onStartColor, onPickColor }) {
  container.textContent = "";
  const tags = [...tagCounts.keys()].sort(byName);
  if (tags.length === 0) {
    container.appendChild(el("p", { className: "hint", textContent: "No tags yet." }));
    return;
  }
  const list = el("ul", { className: "tag-manager" });
  for (const tag of tags) {
    const item = el("li", { className: "tag-manager-item" });
    if (tag === renaming) {
      const input = el("input", { type: "text", value: tag, autocomplete: "off" });
      input.setAttribute("aria-label", `New name for ${tag}`);
      const save = () => onRename(tag, input.value.trim());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        } else if (e.key === "Escape") {
          onCancel();
        }
      });
      item.append(buildTagDot(tag, colors), input, button("Save", save), button("Cancel", onCancel));
      requestAnimationFrame(() => input.focus());
    } else {
      const dotButton = button("", () => onStartColor(tag === colouring ? null : tag), "tag-color-btn");
      dotButton.appendChild(buildTagDot(tag, colors));
      dotButton.setAttribute("aria-label", `Change the colour of ${tag}`);
      item.append(
        dotButton,
        el("span", { className: "tag-manager-name", textContent: tag }),
        el("span", { className: "hint", textContent: `(${tagCounts.get(tag)})` }),
        button("Rename", () => onStartRename(tag)),
        button("Delete", () => onDelete(tag), "danger-btn")
      );
    }
    if (tag === colouring && tag !== renaming) item.appendChild(buildSwatches(tag, colors, { onPickColor, onCancel }));
    list.appendChild(item);
  }
  container.appendChild(list);
  container.appendChild(el("p", { className: "hint", textContent: "Tap a tag's dot to change its colour." }));
}

// Tag editor for several restaurants at once. Each tag's checkbox shows
// whether all (checked), some (dash) or none of them have it. Tapping
// cycles all → none → back to "some" (only if it started that way, i.e.
// "leave as it is") → all. A new tag can be typed in and starts as "all".
// onApply({ add, remove }) gets only the tags that actually changed.
export function renderBulkTagEditor(container, allTags, selected, colors, { onApply, onCancel }) {
  container.textContent = "";
  const total = selected.length;
  const counts = new Map(allTags.map((tag) => [tag, selected.filter((r) => (r.tags || []).includes(tag)).length]));
  const stateOf = (n) => (n === 0 ? "none" : n === total ? "all" : "some");
  const initial = new Map([...counts].map(([tag, n]) => [tag, stateOf(n)]));
  const state = new Map(initial);
  const showers = new Map();

  container.appendChild(el("strong", { textContent: `Tags for ${total} selected restaurant(s)` }));
  container.appendChild(
    el("p", { className: "hint", textContent: "✓ = all of them have it, – = some do. Tap a tag to change it for all." })
  );

  const list = el("div", { className: "tag-picker-list" });
  function addRow(tag) {
    const checkbox = el("input", { type: "checkbox" });
    const note = el("span", { className: "hint" });
    const show = () => {
      const s = state.get(tag);
      checkbox.checked = s === "all";
      checkbox.indeterminate = s === "some";
      note.textContent = s === "some" ? ` (${counts.get(tag)} of ${total})` : "";
    };
    checkbox.addEventListener("change", () => {
      const s = state.get(tag);
      state.set(tag, s === "all" ? "none" : s === "none" && initial.get(tag) === "some" ? "some" : "all");
      show();
    });
    show();
    showers.set(tag, show);
    list.appendChild(
      el("label", { className: "tag-picker-item" }, [checkbox, buildTagDot(tag, colors), document.createTextNode(tag), note])
    );
  }
  [...allTags].sort(byName).forEach(addRow);
  container.appendChild(list);

  const addNew = (tag) => {
    if (!state.has(tag)) {
      counts.set(tag, 0);
      initial.set(tag, "none");
      state.set(tag, "all");
      addRow(tag);
    } else {
      state.set(tag, "all");
      showers.get(tag)();
    }
  };
  container.appendChild(buildNewTagControl(addNew));

  const apply = () => {
    const add = [...state].filter(([tag, s]) => s === "all" && initial.get(tag) !== "all").map(([tag]) => tag);
    const remove = [...state].filter(([tag, s]) => s === "none" && initial.get(tag) !== "none").map(([tag]) => tag);
    onApply({ add, remove });
  };
  container.appendChild(el("div", { className: "form-actions" }, [button("Apply", apply), button("Cancel", onCancel)]));
}
