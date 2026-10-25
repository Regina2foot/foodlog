// "Find locations" panel on the Map tab (CLAUDE.md Section 15.3): asks
// where the places are, works through the restaurants without a location
// (locate.js), saves confident matches in batches and lists the rest for
// the user to decide. Text is set via textContent only (Section 4.1).

import { locateAll } from "./locate.js";
import { findArea } from "./geo.js";
import { hasLocation } from "./data.js";
import { formatDate } from "./render.js";

// Confident matches are written in batches of this size (one commit each),
// plus whatever is left when the run ends or is stopped.
const BATCH_SIZE = 20;
const MAX_CANDIDATES_SHOWN = 5;

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

const byName = (a, b) => a.name.localeCompare(b.name);

// deps: getRestaurants() → restaurant views; getLastArea() / saveArea(text);
// isPicking() → true while the map is in pick mode (panel hidden then);
// saveLocations([{ id, place }]) → Promise (writes + refreshes the app);
// chooseOnMap(restaurant, candidates); openRestaurant(id);
// markNotOnOsm(id) → Promise (saves today's date as not_on_osm_at);
// setStatus(text, isError); describeError(err, fallback).
export function createLocatePanel(container, deps) {
  const state = {
    phase: "idle", // idle | setup | running | done
    areaName: "",
    review: [], // [{ restaurant, candidates }]
    stats: { located: 0, review: 0, notFound: 0 },
    progress: null, // { index, total, name }
    stopRequested: false,
    endMessage: "",
    skipped: new Set(),
    skippedFor: "", // area text the skips apply to
  };
  let pending = [];
  let saving = Promise.resolve();
  // The review list is only rebuilt when it changes, so the once-a-second
  // progress updates never swap out a button while it's being tapped.
  let renderedReviewKey = null;

  const head = el("div", { className: "locate-head" });
  const reviewList = el("ul", { className: "locate-review" });
  container.append(head, reviewList);

  const unlocated = () => deps.getRestaurants().filter((r) => !hasLocation(r));

  // Saves are chained so they never overlap.
  function save(updates) {
    saving = saving
      .then(() => deps.saveLocations(updates))
      .catch((err) => deps.setStatus(deps.describeError(err, "Failed to save locations"), true));
    return saving;
  }

  function flush() {
    if (pending.length === 0) return saving;
    const batch = pending;
    pending = [];
    return save(batch);
  }

  function renderIdle() {
    const count = unlocated().length;
    if (count === 0) return;
    head.appendChild(button(`Find locations for ${count} restaurant(s)…`, () => {
      state.phase = "setup";
      render();
    }));
  }

  function renderSetup() {
    const list = unlocated();
    head.appendChild(el("strong", { textContent: "Find locations" }));
    const areaInput = el("input", {
      type: "text",
      value: deps.getLastArea(),
      placeholder: 'e.g. "Berlin" or "Tokyo"',
      autocomplete: "off",
    });
    const tagCounts = new Map();
    for (const r of list) for (const tag of r.tags || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    const select = el("select");
    select.appendChild(el("option", { value: "", textContent: `All without a location (${list.length})` }));
    for (const tag of [...tagCounts.keys()].sort((a, b) => a.localeCompare(b))) {
      select.appendChild(el("option", { value: tag, textContent: `Tagged "${tag}" (${tagCounts.get(tag)})` }));
    }
    const message = el("p", { className: "hint" });
    const start = button("Start", () => startRun(areaInput.value.trim(), select.value, message));
    areaInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        start.click();
      }
    });
    head.append(
      el("label", { className: "locate-field" }, [document.createTextNode("Where are these places?"), areaInput]),
      el("label", { className: "locate-field" }, [document.createTextNode("Which restaurants?"), select]),
      el("p", {
        className: "hint",
        textContent:
          "Each restaurant is searched by name in that area — about 1–2 seconds each (OpenStreetMap allows one search per second). Clear matches are saved automatically; for the rest you choose. You can stop any time.",
      }),
      message,
      el("div", { className: "form-actions" }, [
        start,
        button("Cancel", () => {
          state.phase = state.review.length ? "done" : "idle";
          render();
        }),
      ])
    );
  }

  function renderProgress() {
    const { located, review, notFound } = state.stats;
    head.appendChild(el("strong", { textContent: `Finding locations in ${state.areaName}` }));
    if (state.phase === "running" && state.progress) {
      const { index, total, name } = state.progress;
      head.appendChild(el("p", { className: "hint", textContent: `Checking ${index + 1} of ${total}: ${name}` }));
    }
    if (state.phase === "done" && state.endMessage) {
      head.appendChild(el("p", { className: "hint", textContent: state.endMessage }));
    }
    head.appendChild(
      el("p", { className: "hint", textContent: `Located: ${located} · to choose: ${review} · not found: ${notFound}` })
    );
    if (state.phase === "running") {
      head.appendChild(
        el("div", { className: "form-actions" }, [
          button(state.stopRequested ? "Stopping…" : "Stop", () => {
            state.stopRequested = true;
            render();
          }),
        ])
      );
    } else {
      const actions = [
        button("Run again", () => {
          state.phase = "setup";
          render();
        }),
        button("Close", () => {
          state.phase = "idle";
          state.review = [];
          render();
        }),
      ];
      head.appendChild(el("div", { className: "form-actions" }, actions));
      if (state.review.length) {
        head.appendChild(
          el("p", {
            className: "hint",
            textContent: "Below: restaurants where you choose. Close drops this list (they stay without a location).",
          })
        );
      }
    }
  }

  function resolve(item) {
    state.review = state.review.filter((x) => x !== item);
  }

  function renderReview() {
    const hidden = state.review.length === 0 || state.phase === "setup";
    const key = `${hidden}|${state.areaName}|${state.review.map((x) => x.restaurant.id).join(",")}`;
    if (key === renderedReviewKey) return;
    renderedReviewKey = key;
    reviewList.textContent = "";
    reviewList.hidden = hidden;
    for (const item of state.review) {
      const { restaurant, candidates } = item;
      const li = el("li", { className: "locate-item" });
      li.appendChild(el("strong", { textContent: restaurant.name }));
      // Marked earlier as missing from OpenStreetMap; still searched each
      // run, since it may have been added since.
      if (restaurant.not_on_osm_at) {
        li.appendChild(
          el("span", { className: "locate-flag", textContent: ` Not on OSM last time (${formatDate(restaurant.not_on_osm_at)})` })
        );
      }
      li.appendChild(
        el("span", {
          className: "hint",
          textContent: candidates.length
            ? ` — ${candidates.length} possible match(es):`
            : ` — not found in ${state.areaName}.`,
        })
      );
      const choices = el("div", { className: "locate-choices" });
      for (const place of candidates.slice(0, MAX_CANDIDATES_SHOWN)) {
        const choice = el("button", { type: "button", className: "map-result" }, [
          el("strong", { textContent: place.name || "(no name)" }),
          el("span", { className: "hint", textContent: place.address }),
        ]);
        choice.addEventListener("click", () => {
          resolve(item);
          render();
          save([{ id: restaurant.id, place }]);
        });
        choices.appendChild(choice);
      }
      li.appendChild(choices);
      li.appendChild(
        el("div", { className: "form-actions locate-actions" }, [
          button("Choose on map", () => deps.chooseOnMap(restaurant, candidates), "small-btn"),
          // e.g. to delete or archive a place that can't be found anymore.
          button("Open entry", () => deps.openRestaurant(restaurant.id), "small-btn"),
          button(
            "Not on OSM",
            () => {
              state.skipped.add(restaurant.id);
              resolve(item);
              render();
              saving = saving
                .then(() => deps.markNotOnOsm(restaurant.id))
                .catch((err) => deps.setStatus(deps.describeError(err, "Failed to save"), true));
            },
            "small-btn"
          ),
          button(
            "Skip",
            () => {
              state.skipped.add(restaurant.id);
              resolve(item);
              render();
            },
            "small-btn"
          ),
        ])
      );
      reviewList.appendChild(li);
    }
  }

  async function startRun(areaText, tag, message) {
    if (!areaText) {
      message.textContent = 'Enter a city or region first, e.g. "Berlin".';
      return;
    }
    message.textContent = `Looking up "${areaText}"…`;
    let area;
    try {
      area = await findArea(areaText);
    } catch (err) {
      message.textContent = deps.describeError(err, "Search failed");
      return;
    }
    if (!area) {
      message.textContent = `Couldn't find "${areaText}". Try a city name, e.g. "Berlin".`;
      return;
    }
    deps.saveArea(areaText);
    if (state.skippedFor !== areaText) {
      state.skipped.clear();
      state.skippedFor = areaText;
    }
    const inReview = new Set(state.review.map((x) => x.restaurant.id));
    const todo = unlocated()
      .filter((r) => (!tag || (r.tags || []).includes(tag)) && !inReview.has(r.id) && !state.skipped.has(r.id))
      .sort(byName);
    if (todo.length === 0) {
      message.textContent = "Nothing left to look up (skipped ones are only retried with another area).";
      return;
    }

    Object.assign(state, {
      phase: "running",
      areaName: area.name,
      stats: { located: 0, review: 0, notFound: 0 },
      progress: null,
      stopRequested: false,
      endMessage: "",
    });
    render();

    const { done, error } = await locateAll(todo, { viewbox: area.viewbox, areaText }, {
      shouldStop: () => state.stopRequested,
      onProgress: (index, restaurant) => {
        state.progress = { index, total: todo.length, name: restaurant.name };
        render();
      },
      onResult: (restaurant, { match, candidates }) => {
        if (match) {
          state.stats.located++;
          pending.push({ id: restaurant.id, place: match });
          if (pending.length >= BATCH_SIZE) flush();
        } else {
          state.stats[candidates.length ? "review" : "notFound"]++;
          state.review.push({ restaurant, candidates });
        }
        render();
      },
    });
    await flush();
    state.phase = "done";
    state.endMessage = error
      ? `${deps.describeError(error, "Stopped, the search failed")}. Run again later to continue.`
      : done
        ? "Finished."
        : "Stopped. Run again to continue with the rest.";
    render();
  }

  function render() {
    // Drop review items that got a location some other way (or were deleted).
    const current = new Map(deps.getRestaurants().map((r) => [r.id, r]));
    state.review = state.review.filter((x) => current.has(x.restaurant.id) && !hasLocation(current.get(x.restaurant.id)));

    head.textContent = "";
    if (state.phase === "idle") renderIdle();
    else if (state.phase === "setup") renderSetup();
    else renderProgress();
    renderReview();
    container.hidden = deps.isPicking() || head.childElementCount === 0;
  }

  return {
    // Called whenever the data or the map mode changes. Leaves the setup
    // form alone so typed text isn't lost.
    refresh() {
      if (state.phase === "setup") {
        container.hidden = deps.isPicking();
        return;
      }
      render();
    },
  };
}
