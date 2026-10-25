import {
  emptyDoc,
  buildRestaurantViews,
  updateRestaurant,
  deleteRestaurants,
  addVisit,
  updateVisit,
  deleteVisit,
  mergeRestaurants,
  markRestaurantsDifferent,
  generateId,
  hasLocation,
  DATA_FILE,
} from "./data.js";
import { sortRestaurants } from "./sort.js";
import { renderRestaurantList, renderListHeader, renderStarPicker, renderTagPicker, renderTagFilter, setStatus } from "./render.js";
import { computeTagColors } from "./tagColors.js";
import { getSettings, saveSettings, removeToken, hasCompleteSettings, parseRepoInput } from "./settings.js";
import { fetchDataDoc, saveDataDoc, fetchCurrentUser, GitHubApiError } from "./api.js";
import { renderRestaurantDetail } from "./history.js";
import { openMapsUrl } from "./maps.js";
import { restaurantsToCsv, downloadCsv } from "./csv.js";
import { decodeImportFile, parseGoogleMapsExport, buildImport, applyImport } from "./googleImport.js";
import { extractPlaceKey, normalizeName, createMatcher, findDuplicateGroups } from "./duplicates.js";
import { renderMap, onMapTap, visibleArea, focusRestaurant, showSearchResults, showCandidate, clearPicking } from "./mapView.js";
import { searchPlaces, lookupPosition } from "./geo.js";

// Bump on every change that gets pushed, so a device still running a
// cached older app.js is easy to spot (shown at the bottom of Settings).
const APP_VERSION = "2026-10-25a";

// Phones have no visible error console; surface anything uncaught in the
// status line instead of failing silently.
function showUnexpectedError(err) {
  const el = document.getElementById("status-message");
  if (el) setStatus(el, `Unexpected error: ${(err && err.message) || err}`, true);
}
window.addEventListener("error", (e) => showUnexpectedError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showUnexpectedError(e.reason));

// The data document (foodlog.json, CLAUDE.md Section 15.1) and its blob sha.
let doc = emptyDoc();
let sha = null;
let views = []; // restaurant views (data.js), rebuilt in refreshList()

// Each list view keeps its own sorting; the options differ because a
// wishlist place has no visit (so no rating or visit date), only the date
// it was added.
const SORT_OPTIONS = {
  visited: [
    ["rating", "Rating"],
    ["name", "Name"],
    ["date", "Date"],
  ],
  wishlist: [
    ["name", "Name"],
    ["added", "Date added"],
  ],
};
const sortState = {
  visited: { field: "rating", dir: "desc" },
  wishlist: { field: "name", dir: "asc" },
};
let currentUser = null;
let listView = "visited"; // "visited" (Rated) | "wishlist"
let tagFilter = ""; // "" = all tags
let tagColors = new Map(); // tag -> colour, recomputed whenever the list is rendered
let formTags = []; // New form's current tag selection
let showDuplicates = false;
let nameSearch = ""; // normalized, "" = no search
const selectedIds = new Set();

// Detail view: which restaurant, and which form (if any) is open.
let detailId = null;
const closedDetailUi = () => ({ editingRestaurant: false, addingVisit: false, editingVisitId: null });
let detailUi = closedDetailUi();

// Map tab "choose a location" mode (CLAUDE.md Section 15.3):
// null = just browsing; { type: "restaurant", id, name } = for an existing
// restaurant; { type: "form" } = for the New form.
let mapPick = null;
// Location for the New form, chosen on the map or found from the typed
// address: { lat, lng, address, osm }.
let formLocation = null;
let formLocationFromAddress = false;
// Restaurant to centre on the next time the map is drawn ("Show on map").
let pendingFocusId = null;

// Applies `mutate` (doc -> doc) and writes the result to the data repo,
// re-fetching the latest document/sha first and retrying once on a 409
// write conflict (see CLAUDE.md Section 9).
async function writeWithConflictRetry(mutate, { message, maxAttempts = 2 } = {}) {
  const { owner, repo, token } = getSettings();
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { doc: latest, sha: latestSha } = await fetchDataDoc({ owner, repo, token });
    const next = mutate(latest);
    try {
      const result = await saveDataDoc({ owner, repo, token, doc: next, sha: latestSha, message });
      doc = next;
      sha = result.sha;
      return next;
    } catch (err) {
      if (err instanceof GitHubApiError && err.status === 409) {
        lastError = err;
        continue; // reload the latest data and reapply the change
      }
      throw err;
    }
  }
  throw lastError;
}

async function loadData() {
  const { owner, repo, token } = getSettings();
  setStatus(els.statusMessage, "Loading…");
  try {
    const result = await fetchDataDoc({ owner, repo, token });
    doc = result.doc;
    sha = result.sha;
    refreshList();
    if (detailId) refreshDetail();
    setStatus(
      els.statusMessage,
      result.isNew
        ? `No data yet — your first save creates ${DATA_FILE} in your data repo.`
        : `Loaded ${doc.restaurants.length} restaurant(s), ${doc.visits.length} visit(s).`
    );
  } catch (err) {
    setStatus(els.statusMessage, describeError(err, "Failed to load"), true);
  }
}

async function resolveCurrentUser() {
  const { token } = getSettings();
  if (!token) {
    currentUser = null;
    return;
  }
  try {
    currentUser = await fetchCurrentUser(token);
  } catch {
    currentUser = null;
  }
}

function describeError(err, prefix) {
  if (err instanceof GitHubApiError && err.status === 401) {
    return `${prefix}: GitHub rejected the token — it may be mistyped, expired or revoked. Paste it again in Settings.`;
  }
  return `${prefix}: ${err.message || "unknown error"}`;
}

const els = {
  statusMessage: document.getElementById("status-message"),
  restaurantListBody: document.getElementById("restaurant-list-body"),
  sortFieldSelect: document.getElementById("sort-field"),
  sortDirButton: document.getElementById("btn-sort-dir"),
  refreshButton: document.getElementById("btn-refresh"),
  exportButton: document.getElementById("btn-export-csv"),
  settingsForm: document.getElementById("settings-form"),
  settingsStatus: document.getElementById("settings-status"),
  dataRepoInput: document.getElementById("setting-data-repo"),
  tokenInput: document.getElementById("setting-token"),
  removeTokenButton: document.getElementById("btn-remove-token"),
  ratingForm: document.getElementById("rating-form"),
  addressInput: document.getElementById("field-address"),
  findAddressButton: document.getElementById("btn-find-address"),
  addressResults: document.getElementById("address-results"),
  locationHint: document.getElementById("field-location-hint"),
  nameInput: document.getElementById("field-name"),
  noteInput: document.getElementById("field-note"),
  ratingPicker: document.getElementById("field-rating"),
  commentInput: document.getElementById("field-comment"),
  tagsPicker: document.getElementById("field-tags"),
  visitedAtInput: document.getElementById("field-visited-at"),
  listPanel: document.getElementById("list-panel"),
  detailPanel: document.getElementById("detail-panel"),
  detailContent: document.getElementById("detail-content"),
  backToListButton: document.getElementById("btn-back-to-list"),
  wishlistCheckbox: document.getElementById("field-wishlist"),
  visitedFieldsContainer: document.getElementById("visited-fields"),
  viewVisitedButton: document.getElementById("btn-view-visited"),
  viewWishlistButton: document.getElementById("btn-view-wishlist"),
  sortControls: document.getElementById("sort-controls"),
  restaurantTableHeaderRow: document.getElementById("restaurant-table-header-row"),
  importFileInput: document.getElementById("import-file-input"),
  importTagInput: document.getElementById("import-tag-input"),
  importStatus: document.getElementById("import-status"),
  deleteSelectedButton: document.getElementById("btn-delete-selected"),
  mergeSelectedButton: document.getElementById("btn-merge-selected"),
  tagFilterContainer: document.getElementById("tag-filter"),
  updateBanner: document.getElementById("update-banner"),
  updateButton: document.getElementById("btn-update-app"),
  viewToggle: document.getElementById("view-toggle"),
  showDuplicatesCheckbox: document.getElementById("show-duplicates"),
  nameSearchInput: document.getElementById("name-search"),
  duplicateWarning: document.getElementById("duplicate-warning"),
  notSameButton: document.getElementById("btn-not-same"),
  importReview: document.getElementById("import-review"),
  mapContainer: document.getElementById("map"),
  mapSummary: document.getElementById("map-summary"),
  mapPanel: document.querySelector('[data-tab-panel="map"]'),
  mapPickBanner: document.getElementById("map-pick-banner"),
  mapPickText: document.getElementById("map-pick-text"),
  mapPickCancel: document.getElementById("btn-map-pick-cancel"),
  mapSearchForm: document.getElementById("map-search-form"),
  mapSearchInput: document.getElementById("map-search-input"),
  mapResults: document.getElementById("map-results"),
  formPickLocation: document.getElementById("btn-form-pick-location"),
  formClearLocation: document.getElementById("btn-form-clear-location"),
};

function matchesNameSearch(restaurant) {
  return !nameSearch || normalizeName(restaurant.name).includes(nameSearch);
}

function refreshList() {
  views = buildRestaurantViews(doc);
  tagColors = computeTagColors(doc.restaurants);
  let sorted;
  let mode;
  const groupStartKeys = new Set();

  if (showDuplicates) {
    const groups = findDuplicateGroups(views).filter((g) => g.some(matchesNameSearch));
    groups.forEach((g) => groupStartKeys.add(g[0].id));
    sorted = groups.flat();
    mode = "duplicates";
  } else {
    // Rated = has at least one visit; Wishlist = no visits (Section 15.1).
    const inView = views.filter((r) => (listView === "wishlist" ? r.isWishlist : !r.isWishlist));
    refreshTagFilter(inView);
    const filtered = inView.filter((r) => matchesNameSearch(r) && (!tagFilter || r.tags.includes(tagFilter)));
    const { field, dir } = sortState[listView];
    sorted = sortRestaurants(filtered, field, dir);
    mode = listView;
  }

  els.viewToggle.hidden = showDuplicates;
  if (showDuplicates) els.tagFilterContainer.hidden = true;

  const allSelected = sorted.length > 0 && sorted.every((r) => selectedIds.has(r.id));
  renderListHeader(els.restaurantTableHeaderRow, mode, (checked) => {
    for (const r of sorted) {
      if (checked) selectedIds.add(r.id);
      else selectedIds.delete(r.id);
    }
    refreshList();
  }, allSelected);

  renderRestaurantList(
    els.restaurantListBody,
    sorted,
    (id) => showDetail(id),
    mode,
    (id, checked) => {
      if (checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateBulkActionButtons();
    },
    selectedIds,
    {
      groupStartKeys,
      tagColors,
      emptyMessage: nameSearch || tagFilter ? "No restaurants match your search or tag filter." : undefined,
    }
  );
  els.sortControls.hidden = showDuplicates;
  syncSortControls();
  updateBulkActionButtons();
  refreshTagPicker();
  refreshMap();
}

// Draws the Map tab, but only while it's visible (Leaflet needs its size).
function refreshMap() {
  if (els.mapPanel.hidden) return;
  const shown = renderMap(els.mapContainer, views, {
    tagColors,
    onOpenRestaurant: (id) => {
      renderTab("list");
      showDetail(id);
    },
  });
  const total = views.length;
  els.mapSummary.textContent =
    total === 0
      ? "No restaurants yet."
      : shown === total
        ? `All ${total} restaurants are on the map.`
        : `${shown} of ${total} restaurants have a location and are shown here. The others don't have one yet.`;
  els.mapPickBanner.hidden = !mapPick;
  els.mapPickText.textContent = !mapPick
    ? ""
    : mapPick.type === "restaurant"
      ? `Choose the location of "${mapPick.name}": search below or tap the map.`
      : "Choose the location for your new restaurant: search below or tap the map.";
  if (pendingFocusId) {
    focusRestaurant(pendingFocusId);
    pendingFocusId = null;
  }
}

// --- Choosing a location on the map ---------------------------------------

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.appendChild(child);
  return node;
}

// Popup content for a searched or tapped place, with the action that fits
// the current mode. Text is set via textContent only.
function fillCandidateContent(box, place) {
  box.textContent = "";
  box.className = "map-popup";
  box.appendChild(el("strong", { textContent: place.name || "Unnamed spot" }));
  if (place.address) box.appendChild(el("span", { className: "hint", textContent: place.address }));
  const action = el("button", { type: "button" });
  if (mapPick?.type === "restaurant") {
    action.textContent = `Use as location of "${mapPick.name}"`;
    const id = mapPick.id;
    action.addEventListener("click", () => applyLocationToRestaurant(id, place));
  } else {
    action.textContent = mapPick?.type === "form" ? "Use this location" : "Add as new restaurant";
    action.addEventListener("click", () => applyLocationToForm(place));
  }
  box.appendChild(action);
}

function choosePlace(place) {
  const box = el("div");
  fillCandidateContent(box, place);
  showCandidate(place.lat, place.lng, box);
}

async function handleMapTap(lat, lng) {
  const box = el("div", { className: "map-popup" }, [el("span", { className: "hint", textContent: "Looking up this spot…" })]);
  const handle = showCandidate(lat, lng, box);
  let place = null;
  try {
    place = await lookupPosition(lat, lng);
  } catch (err) {
    setStatus(els.statusMessage, describeError(err, "Lookup failed"), true);
  }
  fillCandidateContent(box, place || { lat, lng, name: "", address: "", osm: null });
  handle.update();
}

function renderMapResults(places) {
  els.mapResults.textContent = "";
  els.mapResults.hidden = places.length === 0;
  for (const place of places) {
    const button = el("button", { type: "button", className: "map-result" }, [
      el("strong", { textContent: place.name || "(no name)" }),
      el("span", { className: "hint", textContent: place.address }),
    ]);
    button.addEventListener("click", () => choosePlace(place));
    els.mapResults.appendChild(el("li", {}, [button]));
  }
}

async function runMapSearch() {
  const query = els.mapSearchInput.value.trim();
  if (!query) return;
  els.mapSearchInput.blur();
  setStatus(els.statusMessage, "Searching…");
  try {
    const places = await searchPlaces(query, visibleArea());
    renderMapResults(places);
    showSearchResults(places, choosePlace);
    setStatus(
      els.statusMessage,
      places.length
        ? `${places.length} result(s) — pick one in the list or on the map.`
        : "Nothing found. Try adding the city to the search, or move the map there first."
    );
  } catch (err) {
    setStatus(els.statusMessage, describeError(err, "Search failed"), true);
  }
}

function endMapPick() {
  mapPick = null;
  clearPicking();
  els.mapResults.hidden = true;
  els.mapResults.textContent = "";
}

function locationFields(place) {
  return { lat: place.lat, lng: place.lng, address: place.address || "", osm: place.osm || null };
}

async function applyLocationToRestaurant(id, place) {
  try {
    await writeWithConflictRetry((d) => updateRestaurant(d, id, locationFields(place)), { message: "Set restaurant location" });
    endMapPick();
    refreshList();
    renderTab("list");
    showDetail(id);
    setStatus(els.statusMessage, "Location saved.");
  } catch (err) {
    setStatus(els.statusMessage, describeError(err, "Failed to save location"), true);
  }
}

function applyLocationToForm(place) {
  setFormLocation(locationFields(place), false);
  if (!els.nameInput.value.trim() && place.name) els.nameInput.value = place.name;
  if (!els.addressInput.value.trim() && place.address) els.addressInput.value = place.address;
  endMapPick();
  showTab("new");
}

// fromAddress: the location was looked up from the typed address, so
// editing the address afterwards makes it stale (and clears it).
function setFormLocation(location, fromAddress) {
  formLocation = location;
  formLocationFromAddress = Boolean(location && fromAddress);
  els.addressResults.hidden = true;
  els.addressResults.textContent = "";
  updateFormLocationHint();
}

function updateFormLocationHint() {
  els.locationHint.textContent = formLocation
    ? `📍 ${formLocation.address || "Location chosen on the map"}`
    : "No location yet.";
  els.formClearLocation.hidden = !formLocation;
}

// An address search finds the address, not necessarily the restaurant
// itself, so no OSM reference is kept (two places in one building must not
// look like the same place to duplicate detection).
function useFoundAddress(place) {
  setFormLocation({ ...locationFields(place), osm: null }, true);
  setStatus(els.statusMessage, "Address found — check the location under the address field.");
}

async function findAddress() {
  const query = els.addressInput.value.trim();
  if (!query) return;
  els.addressInput.blur();
  setStatus(els.statusMessage, "Looking up the address…");
  try {
    const places = await searchPlaces(query, visibleArea());
    if (places.length === 1) {
      useFoundAddress(places[0]);
      return;
    }
    els.addressResults.textContent = "";
    els.addressResults.hidden = places.length === 0;
    for (const place of places) {
      const button = el("button", { type: "button", className: "map-result" }, [
        el("strong", { textContent: place.name || "(no name)" }),
        el("span", { className: "hint", textContent: place.address }),
      ]);
      button.addEventListener("click", () => useFoundAddress(place));
      els.addressResults.appendChild(el("li", {}, [button]));
    }
    setStatus(
      els.statusMessage,
      places.length
        ? `${places.length} matches — pick the right one under the address field.`
        : 'Address not found. Try a shorter version (street, number, city), or use "Set location on map".'
    );
  } catch (err) {
    setStatus(els.statusMessage, describeError(err, "Address lookup failed"), true);
  }
}

function initAddressLookup() {
  els.findAddressButton.addEventListener("click", findAddress);
  // Enter in the address field looks it up instead of submitting the form.
  els.addressInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      findAddress();
    }
  });
  els.addressInput.addEventListener("input", () => {
    if (formLocationFromAddress) setFormLocation(null, false);
  });
}

function initMapPicking() {
  onMapTap(handleMapTap);
  els.mapSearchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    runMapSearch();
  });
  els.mapPickCancel.addEventListener("click", () => {
    const pick = mapPick;
    endMapPick();
    if (pick?.type === "restaurant") {
      renderTab("list");
      showDetail(pick.id);
    } else {
      showTab("new");
    }
  });
  els.formPickLocation.addEventListener("click", () => {
    mapPick = { type: "form" };
    els.mapSearchInput.value = els.nameInput.value.trim();
    showTab("map");
  });
  els.formClearLocation.addEventListener("click", () => setFormLocation(null, false));
}

function allKnownTags() {
  return [...new Set(doc.restaurants.flatMap((r) => r.tags || []))].sort((a, b) => a.localeCompare(b));
}

// Re-renders the New form's tag picker, preserving the current in-progress
// selection (formTags) while refreshing which tags are available.
function refreshTagPicker() {
  renderTagPicker(
    els.tagsPicker,
    allKnownTags(),
    formTags,
    (next) => {
      formTags = next;
      refreshTagPicker();
    },
    tagColors
  );
}

// Tag chips for the current view (Rated or Wishlist): only tags that occur
// there. A selected tag that no longer occurs resets the filter to "all".
function refreshTagFilter(restaurantsInView) {
  const tags = [...new Set(restaurantsInView.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));
  if (tagFilter && !tags.includes(tagFilter)) tagFilter = "";
  els.tagFilterContainer.hidden = tags.length === 0;
  renderTagFilter(els.tagFilterContainer, tags, tagColors, tagFilter, (tag) => {
    tagFilter = tag;
    selectedIds.clear();
    refreshList();
  });
}

function updateBulkActionButtons() {
  const count = selectedIds.size;
  els.deleteSelectedButton.hidden = count === 0;
  els.deleteSelectedButton.textContent = `Delete selected (${count})`;
  els.mergeSelectedButton.hidden = count < 2;
  els.mergeSelectedButton.textContent = `Merge selected (${count})`;
  els.notSameButton.hidden = !showDuplicates || count < 2;
  els.notSameButton.textContent = `Not the same (${count})`;
}

// Runs a detail-view change, then closes any open form and re-renders.
async function saveDetailChange(mutate, message, doneText) {
  try {
    await writeWithConflictRetry(mutate, { message });
    detailUi = closedDetailUi();
    refreshList();
    refreshDetail();
    setStatus(els.statusMessage, doneText);
  } catch (err) {
    setStatus(els.statusMessage, describeError(err, "Failed to save"), true);
  }
}

function refreshDetail() {
  const restaurant = buildRestaurantViews(doc).find((r) => r.id === detailId);
  if (!restaurant) {
    goToList();
    return;
  }
  const id = restaurant.id;
  const open = (changes) => {
    detailUi = { ...closedDetailUi(), ...changes };
    refreshDetail();
  };
  renderRestaurantDetail(
    els.detailContent,
    restaurant,
    {
      onOpenMaps: (url) => {
        try {
          openMapsUrl(url);
        } catch (err) {
          setStatus(els.statusMessage, err.message, true);
        }
      },
      onCancel: () => open({}),
      onEditRestaurant: () => open({ editingRestaurant: true }),
      onShowOnMap: () => {
        pendingFocusId = id;
        showTab("map");
      },
      onSetLocation: () => {
        mapPick = { type: "restaurant", id, name: restaurant.name };
        els.mapSearchInput.value = restaurant.name;
        if (hasLocation(restaurant)) pendingFocusId = id;
        showTab("map");
      },
      onSaveRestaurant: (changes) =>
        saveDetailChange((d) => updateRestaurant(d, id, changes), "Edit restaurant", "Restaurant updated."),
      onDeleteRestaurant: async () => {
        try {
          await writeWithConflictRetry((d) => deleteRestaurants(d, [id]), { message: "Delete restaurant" });
          refreshList();
          goToList();
          setStatus(els.statusMessage, "Restaurant deleted.");
        } catch (err) {
          setStatus(els.statusMessage, describeError(err, "Failed to delete"), true);
        }
      },
      onAddVisit: () => open({ addingVisit: true }),
      onSaveNewVisit: (fields) =>
        saveDetailChange(
          (d) => addVisit(d, { id: generateId(), restaurant_id: id, ...fields, ...stamp() }),
          "Add visit",
          "Visit added."
        ),
      onEditVisit: (visitId) => open({ editingVisitId: visitId }),
      onSaveVisit: (visitId, fields) => saveDetailChange((d) => updateVisit(d, visitId, fields), "Edit visit", "Visit updated."),
      onDeleteVisit: (visitId) => saveDetailChange((d) => deleteVisit(d, visitId), "Delete visit", "Visit deleted."),
    },
    detailUi,
    allKnownTags(),
    tagColors
  );
}

function stamp() {
  return { created_by: currentUser || "unknown", created_at: new Date().toISOString() };
}

// Phone back button: the list is the "home" history entry. Opening a
// restaurant or another tab adds exactly one entry on top (further
// navigation replaces it), so back always returns to the list, and back
// from the list leaves the app as usual. In-app "go to list" actions use
// history.back() too, so the history never gets out of step.
function isOnSubView() {
  return Boolean(history.state && history.state.foodlogSubView);
}

function enterSubView() {
  if (isOnSubView()) history.replaceState({ foodlogSubView: true }, "");
  else history.pushState({ foodlogSubView: true }, "");
}

function goToList() {
  if (isOnSubView()) history.back(); // popstate renders the list
  else renderTab("list");
}

// The detail view lives inside the List tab, replacing the list itself.
function showDetail(id) {
  detailId = id;
  detailUi = closedDetailUi();
  els.listPanel.hidden = true;
  els.detailPanel.hidden = false;
  refreshDetail();
  enterSubView();
  window.scrollTo(0, 0);
}

function showList() {
  detailId = null;
  detailUi = closedDetailUi();
  els.detailPanel.hidden = true;
  els.listPanel.hidden = false;
}

function initDetailView() {
  els.backToListButton.addEventListener("click", goToList);
}

// Tabs are separate screens: only one panel is visible at a time. Showing
// "list" always returns to the list itself, even from an open detail view.
function renderTab(name) {
  for (const tab of document.querySelectorAll(".tab-bar .tab")) {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  for (const panel of document.querySelectorAll("[data-tab-panel]")) {
    panel.hidden = panel.dataset.tabPanel !== name;
  }
  if (name === "list") showList();
  // Leaving the map ends any "choose a location" mode.
  if (name !== "map" && mapPick) endMapPick();
  window.scrollTo(0, 0);
  if (name === "map") refreshMap();
}

function showTab(name) {
  if (name === "list") {
    goToList();
    return;
  }
  renderTab(name);
  enterSubView();
}

function initTabs() {
  // A reload while on a sub view would otherwise leave a stale marker.
  if (isOnSubView()) history.replaceState(null, "");
  window.addEventListener("popstate", () => renderTab("list"));
  for (const tab of document.querySelectorAll(".tab-bar .tab")) {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
  }
}

function initViewToggle() {
  function setView(view) {
    listView = view;
    selectedIds.clear();
    els.viewVisitedButton.classList.toggle("active", view === "visited");
    els.viewVisitedButton.setAttribute("aria-pressed", String(view === "visited"));
    els.viewWishlistButton.classList.toggle("active", view === "wishlist");
    els.viewWishlistButton.setAttribute("aria-pressed", String(view === "wishlist"));
    refreshList();
  }
  els.viewVisitedButton.addEventListener("click", () => setView("visited"));
  els.viewWishlistButton.addEventListener("click", () => setView("wishlist"));
}

// Selection is cleared whenever the visible set changes, so bulk actions
// never touch rows that are currently hidden by search or the duplicates view.
function initListFilters() {
  els.showDuplicatesCheckbox.addEventListener("change", () => {
    showDuplicates = els.showDuplicatesCheckbox.checked;
    selectedIds.clear();
    refreshList();
  });
  els.nameSearchInput.addEventListener("input", () => {
    nameSearch = normalizeName(els.nameSearchInput.value);
    selectedIds.clear();
    refreshList();
  });
  // The list already filters while typing; Enter/Search just closes the
  // on-screen keyboard, which otherwise hides the results on a phone.
  els.nameSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      els.nameSearchInput.blur();
    }
  });
}

// Shared by the three bulk actions: confirm, write once, clear selection.
function initBulkAction(button, { minCount, confirmText, mutate, message, doneText }) {
  button.addEventListener("click", async () => {
    const ids = [...selectedIds];
    if (ids.length < minCount) return;
    if (!confirm(confirmText(ids.length))) return;
    setStatus(els.statusMessage, "Saving…");
    try {
      await writeWithConflictRetry((d) => mutate(d, ids), { message: message(ids.length) });
      selectedIds.clear();
      refreshList();
      setStatus(els.statusMessage, doneText(ids.length));
    } catch (err) {
      setStatus(els.statusMessage, describeError(err, "Failed to save"), true);
    }
  });
}

function initBulkActions() {
  initBulkAction(els.deleteSelectedButton, {
    minCount: 1,
    confirmText: (n) => `Delete ${n} restaurant(s) and all their visits? This cannot be undone.`,
    mutate: deleteRestaurants,
    message: (n) => `Delete ${n} restaurant(s)`,
    doneText: (n) => `Deleted ${n} restaurant(s).`,
  });
  initBulkAction(els.mergeSelectedButton, {
    minCount: 2,
    confirmText: (n) => `Merge ${n} selected restaurants into one? Their visits, tags and notes are combined. This cannot be undone.`,
    mutate: mergeRestaurants,
    message: (n) => `Merge ${n} restaurants`,
    doneText: (n) => `Merged ${n} restaurants into one.`,
  });
  initBulkAction(els.notSameButton, {
    minCount: 2,
    confirmText: (n) => `Mark the ${n} selected restaurants as different from each other? They won't be suggested as duplicates of each other again.`,
    mutate: markRestaurantsDifferent,
    message: (n) => `Mark ${n} restaurants as not duplicates`,
    doneText: (n) => `Marked ${n} restaurants as different.`,
  });
}

function initWishlistToggle() {
  els.wishlistCheckbox.addEventListener("change", () => {
    els.visitedFieldsContainer.hidden = els.wishlistCheckbox.checked;
  });
}

// Which tab a matched restaurant lives in, so a match isn't confusing.
function listNameOf(restaurant) {
  return restaurant.isWishlist ? "Wishlist" : "Rated";
}

const REASON_TEXT = { place: "same place", nearby: "similar name, same spot", name: "similar name" };
const MAX_SHOWN_MATCHES = 3;

async function runImport(plan) {
  const newCount = plan.filter((p) => p.decision !== "same").length;
  const sameCount = plan.length - newCount;
  setStatus(els.importStatus, "Importing…");
  try {
    await writeWithConflictRetry((d) => applyImport(d, plan), {
      message: `Import ${plan.length} place(s) from Google Maps`,
    });
    hideImportReview();
    els.importTagInput.value = "";
    refreshList();
    setStatus(
      els.importStatus,
      `Imported ${newCount} new restaurant(s)` +
        (sameCount > 0 ? `; ${sameCount} matched to restaurants you already had.` : ".")
    );
  } catch (err) {
    setStatus(els.importStatus, describeError(err, "Import failed"), true);
  }
}

function hideImportReview() {
  els.importReview.hidden = true;
  els.importReview.textContent = "";
}

// One question per imported place with a similar-name match: "same as
// <existing>" (one option per candidate) or "different". Nothing is saved
// until every question is answered and Import is clicked.
function showImportReview(items, summary) {
  const box = els.importReview;
  box.textContent = "";
  const reviewed = items.filter((i) => i.matches.length > 0);

  const intro = document.createElement("p");
  intro.textContent = `${summary} ${reviewed.length} have a similar name to a restaurant already in your list — is each the same restaurant?`;
  box.appendChild(intro);

  const answers = new Map(); // item -> candidate index, or "different"
  const progress = document.createElement("p");
  progress.className = "hint";
  const importButton = document.createElement("button");
  importButton.type = "button";
  const updateProgress = () => {
    progress.textContent = `${answers.size} of ${reviewed.length} answered.`;
    importButton.disabled = answers.size < reviewed.length;
    importButton.textContent = `Import ${items.length} place(s)`;
  };

  reviewed.forEach((item, index) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "review-item";
    const legend = document.createElement("legend");
    legend.textContent = `"${item.restaurant.name}" from the file`;
    fieldset.appendChild(legend);

    const addOption = (labelText, value) => {
      const label = document.createElement("label");
      label.className = "checkbox-label";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `import-review-${index}`;
      radio.addEventListener("change", () => {
        answers.set(item, value);
        updateProgress();
      });
      label.append(radio, document.createTextNode(labelText));
      fieldset.appendChild(label);
    };
    item.matches
      .slice(0, MAX_SHOWN_MATCHES)
      .forEach((m, i) => addOption(`Same as "${m.restaurant.name}" (in ${listNameOf(m.restaurant)})`, i));
    addOption("Different restaurant", "different");
    box.appendChild(fieldset);
  });

  importButton.addEventListener("click", () => {
    const plan = items.map(({ restaurant, visit, matches }) => {
      if (matches.length === 0) return { restaurant, visit, decision: "add" };
      const answer = answers.get(items.find((i) => i.restaurant === restaurant));
      const shown = matches.slice(0, MAX_SHOWN_MATCHES);
      if (answer === "different") {
        return { restaurant, visit, decision: "add", differentFrom: shown.map((m) => m.restaurant.id) };
      }
      return { restaurant, visit, decision: "same", sameAs: shown[answer].restaurant.id };
    });
    runImport(plan);
  });

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel import";
  cancelButton.addEventListener("click", () => {
    hideImportReview();
    setStatus(els.importStatus, "Import cancelled.");
  });

  const actions = document.createElement("div");
  actions.className = "form-actions";
  actions.append(importButton, cancelButton);
  box.append(progress, actions);
  updateProgress();
  box.hidden = false;
}

function initImport() {
  els.importFileInput.addEventListener("change", async () => {
    const file = els.importFileInput.files[0];
    if (!file) return;
    hideImportReview();

    if (!els.importTagInput.value.trim()) {
      els.importTagInput.value = file.name.replace(/\.csv$/i, "");
    }

    if (!hasCompleteSettings()) {
      setStatus(els.importStatus, "Set your data repo and token in Settings first.", true);
      els.importFileInput.value = "";
      return;
    }

    setStatus(els.importStatus, "Reading file…");
    try {
      const text = await decodeImportFile(file);
      const { entries, error } = parseGoogleMapsExport(text);
      if (error) {
        setStatus(els.importStatus, error, true);
        return;
      }
      if (entries.length === 0) {
        setStatus(els.importStatus, "No places found in that file.", true);
        return;
      }

      const knownUrls = new Set(doc.restaurants.map((r) => (r.google_maps_url || "").trim()).filter(Boolean));
      const knownPlaceKeys = new Set(doc.restaurants.map((r) => extractPlaceKey(r.google_maps_url)).filter(Boolean));
      const isKnownPlace = (url) => {
        const key = extractPlaceKey(url);
        return knownUrls.has(url.trim()) || (key !== null && knownPlaceKeys.has(key));
      };
      const bulkTag = els.importTagInput.value.trim();
      const { items: built, skippedDuplicates } = buildImport(entries, {
        createdBy: currentUser || "unknown",
        isKnownPlace,
        generateId,
        bulkTag,
      });

      if (built.length === 0) {
        setStatus(els.importStatus, `Nothing new to import (${skippedDuplicates} already in your list).`, true);
        return;
      }

      // Same-place matches were already skipped above; anything still
      // matching is reviewed before saving.
      const matchExisting = createMatcher(buildRestaurantViews(doc));
      const items = built.map((item) => ({ ...item, matches: matchExisting(item.restaurant) }));

      const ratedCount = built.filter((i) => i.visit).length;
      const summary =
        `Found ${entries.length} place(s) in the file: ${ratedCount} rated, ${built.length - ratedCount} wishlist.` +
        (skippedDuplicates > 0 ? ` ${skippedDuplicates} already in your list (same Google Maps place) will be skipped.` : "") +
        (bulkTag ? ` All will be tagged "${bulkTag}".` : "");

      if (items.some((i) => i.matches.length > 0)) {
        showImportReview(items, summary);
        setStatus(els.importStatus, "");
        return;
      }

      if (!confirm(`${summary}\n\nImport ${built.length} new place(s)?`)) {
        setStatus(els.importStatus, "Import cancelled.");
        return;
      }
      await runImport(items.map(({ restaurant, visit }) => ({ restaurant, visit, decision: "add" })));
    } catch (err) {
      setStatus(els.importStatus, describeError(err, "Import failed"), true);
    } finally {
      els.importFileInput.value = "";
    }
  });
}

function initPickers() {
  renderStarPicker(els.ratingPicker, () => {});
}

function initSettingsPanel() {
  document.getElementById("app-version").textContent = `App version: ${APP_VERSION}`;
  const current = getSettings();
  if (current.owner && current.repo) {
    els.dataRepoInput.value = `${current.owner}/${current.repo}`;
  }
  updateSettingsStatus();

  els.settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const repoValue = els.dataRepoInput.value.trim();
    const parsed = repoValue ? parseRepoInput(repoValue) : null;
    if (repoValue && !parsed) {
      setStatus(
        els.settingsStatus,
        "Couldn't read a GitHub repo from the Data repo field. Enter owner/repo, or paste the repo's GitHub link. Nothing was saved.",
        true
      );
      return;
    }
    saveSettings({
      owner: parsed?.owner,
      repo: parsed?.repo,
      // Pasted tokens often carry stray whitespace/newlines, which would end up in the Authorization header.
      token: els.tokenInput.value.trim(),
    });
    if (parsed) {
      els.dataRepoInput.value = `${parsed.owner}/${parsed.repo}`;
    }
    els.tokenInput.value = "";
    updateSettingsStatus();
    await resolveCurrentUser();
    if (hasCompleteSettings()) {
      await loadData();
    }
  });

  els.removeTokenButton.addEventListener("click", () => {
    removeToken();
    els.tokenInput.value = "";
    updateSettingsStatus();
  });
}

function updateSettingsStatus() {
  const { owner, repo, token } = getSettings();
  const parts = [];
  parts.push(owner && repo ? `Data repo: ${owner}/${repo}` : "Data repo not set.");
  parts.push(token ? "Token saved." : "No token saved.");
  setStatus(els.settingsStatus, parts.join(" "));
}

// Read fresh from the form every time it's needed (incl. from the duplicate
// warning's buttons), so edits made while the warning is shown aren't lost.
// Returns { restaurant, visit } — visit is null for "haven't been yet".
function buildFromForm() {
  const restaurant = {
    id: generateId(),
    name: els.nameInput.value.trim(),
    tags: formTags,
    note: els.noteInput.value.trim(),
    ...stamp(),
  };
  if (formLocation) Object.assign(restaurant, formLocation);
  // The address as typed/pasted wins over the looked-up one: it's the
  // version the user knows (e.g. Google's).
  const typedAddress = els.addressInput.value.trim();
  if (typedAddress) restaurant.address = typedAddress;
  if (els.wishlistCheckbox.checked) return { restaurant, visit: null };
  const visit = {
    id: generateId(),
    restaurant_id: restaurant.id,
    rating: Number(els.ratingPicker.dataset.value || 0),
    comment: els.commentInput.value.trim(),
    visited_at: els.visitedAtInput.value || new Date().toISOString().slice(0, 10),
    ...stamp(),
  };
  return { restaurant, visit };
}

function hideDuplicateWarning() {
  els.duplicateWarning.hidden = true;
  els.duplicateWarning.textContent = "";
}

function showDuplicateWarning(matches, hasVisit) {
  const box = els.duplicateWarning;
  box.textContent = "";

  const intro = document.createElement("p");
  intro.textContent =
    matches.length === 1
      ? `This looks like "${matches[0].restaurant.name}", already in your ${listNameOf(matches[0].restaurant)} list (${REASON_TEXT[matches[0].reason]}).`
      : "This looks like a restaurant already in your list:";
  box.appendChild(intro);

  const actions = document.createElement("div");
  actions.className = "form-actions duplicate-actions";
  for (const { restaurant, reason } of matches.slice(0, MAX_SHOWN_MATCHES)) {
    const button = document.createElement("button");
    button.type = "button";
    const where = matches.length === 1 ? "" : ` (in ${listNameOf(restaurant)}, ${REASON_TEXT[reason]})`;
    // With a visit: add it there. Without one: just bring the tags/note/link
    // over to the existing restaurant.
    button.textContent = hasVisit
      ? `Add as another visit to "${restaurant.name}"${where}`
      : `It's "${restaurant.name}" — keep that one${where}`;
    button.addEventListener("click", () => saveFromForm({ decision: "same", sameAs: restaurant.id }));
    actions.appendChild(button);
  }
  const separate = document.createElement("button");
  separate.type = "button";
  separate.textContent = "Save separately";
  // Remembered (not_same_as), so these pairs aren't flagged again later.
  const matchedIds = matches.map((m) => m.restaurant.id);
  separate.addEventListener("click", () => saveFromForm({ decision: "add", differentFrom: matchedIds }));
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", hideDuplicateWarning);
  actions.append(separate, cancel);
  box.appendChild(actions);

  box.hidden = false;
}

// Saving from the New form uses the same "apply" logic as the import: add a
// new restaurant (optionally remembered as different from some), or treat
// it as an existing one ("same": fills missing info, adds the visit).
async function saveFromForm({ decision, sameAs, differentFrom }) {
  hideDuplicateWarning();
  const { restaurant, visit } = buildFromForm();
  setStatus(els.statusMessage, "Saving…");
  try {
    await writeWithConflictRetry((d) => applyImport(d, [{ restaurant, visit, decision, sameAs, differentFrom }]), {
      message: visit ? `Add visit to ${restaurant.name || "restaurant"}` : `Add ${restaurant.name || "restaurant"} to wishlist`,
    });
    els.ratingForm.reset();
    els.ratingPicker.dataset.value = "0";
    els.visitedFieldsContainer.hidden = false;
    setFormLocation(null, false);
    formTags = [];
    initPickers();
    refreshList();
    showTab("list");
    setStatus(els.statusMessage, visit ? "Saved." : "Added to wishlist.");
  } catch (err) {
    setStatus(els.statusMessage, describeError(err, "Failed to save"), true);
  }
}

function initRatingForm() {
  els.ratingForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideDuplicateWarning();

    if (!hasCompleteSettings()) {
      setStatus(els.statusMessage, "Set your data repo and token in Settings before saving.", true);
      return;
    }

    const { restaurant, visit } = buildFromForm();
    const matches = createMatcher(buildRestaurantViews(doc))(restaurant);
    if (matches.length > 0) {
      showDuplicateWarning(matches, Boolean(visit));
      return;
    }
    await saveFromForm({ decision: "add" });
  });
}

// Shows the current view's sort options and state in the shared controls.
function syncSortControls() {
  const options = SORT_OPTIONS[listView];
  const { field, dir } = sortState[listView];
  if (els.sortFieldSelect.dataset.view !== listView) {
    els.sortFieldSelect.textContent = "";
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      els.sortFieldSelect.appendChild(option);
    }
    els.sortFieldSelect.dataset.view = listView;
  }
  els.sortFieldSelect.value = field;
  els.sortDirButton.textContent = dir === "desc" ? "↓" : "↑";
  els.sortDirButton.dataset.dir = dir;
}

function initSortControls() {
  els.sortFieldSelect.addEventListener("change", () => {
    sortState[listView].field = els.sortFieldSelect.value;
    refreshList();
  });

  els.sortDirButton.addEventListener("click", () => {
    const state = sortState[listView];
    state.dir = state.dir === "desc" ? "asc" : "desc";
    refreshList();
  });
}

// Asks the app's own site (GitHub Pages, same origin — no other service)
// which APP_VERSION is live, bypassing the browser cache. Silent on
// failure: being offline isn't worth an error message here.
async function checkForAppUpdate() {
  try {
    const response = await fetch("js/app.js", { cache: "no-store" });
    if (!response.ok) return;
    const live = (await response.text()).match(/const APP_VERSION = "([^"]+)"/)?.[1];
    els.updateBanner.hidden = !live || live === APP_VERSION;
  } catch {
    // offline or similar — try again on the next refresh
  }
}

// Re-downloads every same-origin file this page loaded (page, CSS, all JS
// modules) into the browser cache, then reloads, so no stale module is left.
async function updateApp() {
  els.updateButton.disabled = true;
  const urls = new Set([
    location.href.split("#")[0],
    ...performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => url.startsWith(location.origin)),
  ]);
  await Promise.all([...urls].map((url) => fetch(url, { cache: "reload" }).catch(() => {})));
  location.reload();
}

function initToolbar() {
  els.updateButton.addEventListener("click", updateApp);
  els.refreshButton.addEventListener("click", () => {
    checkForAppUpdate();
    if (!hasCompleteSettings()) {
      setStatus(els.statusMessage, "Set your data repo and token in Settings first.", true);
      return;
    }
    loadData();
  });
  els.exportButton.addEventListener("click", () => {
    if (doc.restaurants.length === 0) {
      setStatus(els.statusMessage, "Nothing to export yet.", true);
      return;
    }
    downloadCsv(restaurantsToCsv(buildRestaurantViews(doc)));
    setStatus(els.statusMessage, `Exported ${doc.restaurants.length} restaurant(s), ${doc.visits.length} visit(s) as CSV.`);
  });
}

async function init() {
  initTabs();
  initPickers();
  initSettingsPanel();
  initImport();
  initAddressLookup();
  initMapPicking();
  initWishlistToggle();
  initRatingForm();
  initSortControls();
  initToolbar();
  initDetailView();
  initViewToggle();
  initBulkActions();
  initListFilters();
  refreshList();
  checkForAppUpdate();
  if (!hasCompleteSettings()) {
    setStatus(els.statusMessage, "Set your data repo and token in Settings to sync.");
    return;
  }
  await resolveCurrentUser();
  await loadData();
}

init();
