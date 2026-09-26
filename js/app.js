import { createEmptyState, groupByRestaurant, addRating, generateId } from "./state.js";
import { sortRestaurants } from "./sort.js";
import { renderRestaurantList, renderStarPicker, renderPricePicker, setStatus } from "./render.js";
import { getSettings, saveSettings, removeToken, hasCompleteSettings } from "./settings.js";

const state = createEmptyState();
let sortField = "rating";
let sortDir = "desc";

const els = {
  statusMessage: document.getElementById("status-message"),
  restaurantListBody: document.getElementById("restaurant-list-body"),
  sortFieldSelect: document.getElementById("sort-field"),
  sortDirButton: document.getElementById("btn-sort-dir"),
  refreshButton: document.getElementById("btn-refresh"),
  exportButton: document.getElementById("btn-export-csv"),
  toggleSettingsButton: document.getElementById("btn-toggle-settings"),
  settingsPanel: document.getElementById("settings-panel"),
  settingsForm: document.getElementById("settings-form"),
  settingsStatus: document.getElementById("settings-status"),
  ownerInput: document.getElementById("setting-owner"),
  repoInput: document.getElementById("setting-repo"),
  tokenInput: document.getElementById("setting-token"),
  removeTokenButton: document.getElementById("btn-remove-token"),
  ratingForm: document.getElementById("rating-form"),
  mapsUrlInput: document.getElementById("field-maps-url"),
  nameInput: document.getElementById("field-name"),
  ratingPicker: document.getElementById("field-rating"),
  pricePicker: document.getElementById("field-price"),
  commentInput: document.getElementById("field-comment"),
  tagsInput: document.getElementById("field-tags"),
  visitedAtInput: document.getElementById("field-visited-at"),
};

function refreshList() {
  const restaurants = groupByRestaurant(state.ratings);
  const sorted = sortRestaurants(restaurants, sortField, sortDir);
  renderRestaurantList(els.restaurantListBody, sorted, () => {
    // Detail view is added in a later milestone.
  });
}

function initPickers() {
  renderStarPicker(els.ratingPicker, () => {});
  renderPricePicker(els.pricePicker, () => {});
}

function initSettingsPanel() {
  const current = getSettings();
  els.ownerInput.value = current.owner;
  els.repoInput.value = current.repo;
  updateSettingsStatus();

  els.toggleSettingsButton.addEventListener("click", () => {
    els.settingsPanel.hidden = !els.settingsPanel.hidden;
  });

  els.settingsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveSettings({
      owner: els.ownerInput.value.trim(),
      repo: els.repoInput.value.trim(),
      token: els.tokenInput.value,
    });
    els.tokenInput.value = "";
    updateSettingsStatus();
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
  els.settingsStatus.textContent = parts.join(" ");
}

function initRatingForm() {
  els.ratingForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const rating = {
      id: generateId(),
      name: els.nameInput.value.trim(),
      google_maps_url: els.mapsUrlInput.value.trim(),
      rating: Number(els.ratingPicker.dataset.value || 0),
      price_level: Number(els.pricePicker.dataset.value || 0),
      comment: els.commentInput.value.trim(),
      tags: els.tagsInput.value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      visited_at: els.visitedAtInput.value || new Date().toISOString().slice(0, 10),
      created_by: "unknown", // replaced with the real GitHub username once API sync is wired up
      created_at: new Date().toISOString(),
    };

    state.ratings = addRating(state.ratings, rating);
    refreshList();
    els.ratingForm.reset();
    els.ratingPicker.dataset.value = "0";
    els.pricePicker.dataset.value = "0";
    initPickers();
    setStatus(els.statusMessage, "Rating added locally (not yet saved to the data repo).");
  });
}

function initSortControls() {
  els.sortFieldSelect.addEventListener("change", () => {
    sortField = els.sortFieldSelect.value;
    refreshList();
  });

  els.sortDirButton.addEventListener("click", () => {
    sortDir = sortDir === "desc" ? "asc" : "desc";
    els.sortDirButton.textContent = sortDir === "desc" ? "↓" : "↑";
    els.sortDirButton.dataset.dir = sortDir;
    refreshList();
  });
}

function initToolbar() {
  els.refreshButton.addEventListener("click", () => {
    setStatus(els.statusMessage, "Data repo sync isn't wired up yet.");
  });
  els.exportButton.addEventListener("click", () => {
    setStatus(els.statusMessage, "CSV export isn't wired up yet.");
  });
}

function init() {
  initPickers();
  initSettingsPanel();
  initRatingForm();
  initSortControls();
  initToolbar();
  refreshList();
  if (!hasCompleteSettings()) {
    setStatus(els.statusMessage, "Set your data repo and token in Settings to sync ratings.");
  }
}

init();
