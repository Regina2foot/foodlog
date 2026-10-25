// Settings → History (CLAUDE.md Section 9.13): the recent saves of the data
// file (each one is a git commit in the data repo), and for any of them a
// look at the state *before* it — to bring back restaurants deleted since,
// or, as a last resort, to restore that whole state. A restore is itself a
// new save, so it can be undone the same way. Text via textContent only.

import { missingRestaurants } from "./data.js";

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

const formatWhen = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "";

// deps: fetchHistory(page) → [{ sha, parentSha, date, message, author }];
// fetchVersion(sha) → doc or null; getDoc() → current doc;
// restoreSelected(olderDoc, ids) → Promise; restoreAll(olderDoc, label) →
// Promise; describeError(err, prefix).
export function createRestorePanel(container, deps) {
  let entries = [];
  let page = 0;
  let hasMore = true;
  const list = el("ul", { className: "history-list" });
  const footer = el("div", { className: "form-actions" });
  const message = el("p", { className: "hint" });

  async function loadMore() {
    message.textContent = "Loading…";
    try {
      const next = await deps.fetchHistory(page + 1);
      page += 1;
      hasMore = next.length === 30;
      entries = entries.concat(next);
      message.textContent = entries.length ? "" : "No saves yet.";
      renderList();
    } catch (err) {
      message.textContent = deps.describeError(err, "Couldn't load the history");
    }
  }

  function renderList() {
    list.textContent = "";
    for (const entry of entries) {
      const details = el("div", { className: "history-details" });
      const item = el("li", { className: "history-item" }, [
        el("div", { className: "history-line" }, [
          el("span", { className: "history-when", textContent: formatWhen(entry.date) }),
          el("span", { className: "history-message", textContent: entry.message }),
        ]),
      ]);
      const open = button("Before this save…", () => showBefore(entry, details, open), "small-btn");
      item.append(open, details);
      list.appendChild(item);
    }
    footer.textContent = "";
    if (hasMore && entries.length) footer.appendChild(button("Show older saves", loadMore));
  }

  async function showBefore(entry, details, openButton) {
    openButton.hidden = true;
    details.textContent = "Loading that version…";
    let older;
    try {
      older = entry.parentSha ? await deps.fetchVersion(entry.parentSha) : null;
    } catch (err) {
      details.textContent = deps.describeError(err, "Couldn't load that version");
      openButton.hidden = false;
      return;
    }
    details.textContent = "";
    if (!older) {
      details.appendChild(el("p", { className: "hint", textContent: "Nothing before this save — it created the file." }));
      return;
    }
    const label = `before "${entry.message}" (${formatWhen(entry.date)})`;
    const missing = missingRestaurants(deps.getDoc(), older);
    details.appendChild(
      el("p", {
        className: "hint",
        textContent: `Then: ${older.restaurants.length} restaurant(s), ${older.visits.length} visit(s). ` +
          (missing.length
            ? `${missing.length} of those restaurants are gone now — tick the ones to bring back (with their visits). Nothing else changes.`
            : "No restaurant from then is missing now."),
      })
    );

    if (missing.length) {
      const boxes = [];
      const choices = el("div", { className: "history-missing" });
      for (const { restaurant, visitCount, merged } of missing) {
        const box = el("input", { type: "checkbox" });
        boxes.push([box, restaurant.id]);
        const note = merged ? " — merged into another restaurant since" : visitCount ? ` — ${visitCount} visit(s)` : " — wishlist";
        choices.appendChild(
          el("label", { className: "checkbox-label" }, [box, document.createTextNode(`${restaurant.name || "(no name)"}${note}`)])
        );
      }
      details.appendChild(choices);
      details.appendChild(
        el("div", { className: "form-actions" }, [
          button("Bring back ticked", async () => {
            const ids = boxes.filter(([box]) => box.checked).map(([, id]) => id);
            if (ids.length === 0) return;
            await deps.restoreSelected(older, ids);
            showBefore(entry, details, openButton);
          }),
        ])
      );
    }

    details.appendChild(
      el("div", { className: "form-actions" }, [
        button(
          "Restore everything to this state",
          async () => {
            if (
              !confirm(
                `Replace ALL current data with the state ${label}? Every change made since then is undone. (This is saved as a new version, so it can be undone here too.)`
              )
            ) {
              return;
            }
            await deps.restoreAll(older, label);
            entries = [];
            page = 0;
            hasMore = true;
            await loadMore();
          },
          "danger-btn"
        ),
      ])
    );
  }

  container.append(button("Show recent saves", function () {
    this.hidden = true;
    loadMore();
  }), message, list, footer);
}
