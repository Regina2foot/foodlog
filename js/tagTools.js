// Tag management UI (CLAUDE.md Section 15.4): the "Tags" list in Settings
// (rename or delete a tag on every restaurant) and the "Tags…" panel for
// the ticked restaurants in the list. Only builds DOM and reports choices
// through callbacks; the data changes themselves are pure functions in
// data.js. Tag names are always set via textContent (Section 4.1).

import { buildTagDot, buildNewTagControl } from "./render.js";

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

// tagCounts: Map of tag → number of restaurants carrying it. `renaming` is
// the tag whose row currently shows the rename input (or null).
export function renderTagManager(container, tagCounts, colors, { renaming, onStartRename, onRename, onDelete, onCancel }) {
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
      item.append(
        buildTagDot(tag, colors),
        el("span", { className: "tag-manager-name", textContent: tag }),
        el("span", { className: "hint", textContent: `(${tagCounts.get(tag)})` }),
        button("Rename", () => onStartRename(tag)),
        button("Delete", () => onDelete(tag), "danger-btn")
      );
    }
    list.appendChild(item);
  }
  container.appendChild(list);
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
