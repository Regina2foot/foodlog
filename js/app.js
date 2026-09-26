import { createEmptyState, groupByRestaurant, addRating, updateRating, removeRating, generateId } from "./state.js";
import { sortRestaurants } from "./sort.js";
import { renderRestaurantList, renderStarPicker, renderPricePicker, setStatus } from "./render.js";
import { getSettings, saveSettings, removeToken, hasCompleteSettings } from "./settings.js";
import { fetchRatings, saveRatings, fetchCurrentUser, GitHubApiError } from "./api.js";
import { renderRestaurantDetail } from "./history.js";
import { openMapsUrl } from "./maps.js";

const state = createEmptyState();
let sortField = "rating";
let sortDir = "desc";
let currentUser = null;
let detailUrl = null; // google_maps_url of the restaurant currently shown in detail view
let editingVisitId = null;

// Applies `mutate` (ratings[] -> ratings[]) and writes the result to the data
// repo, re-fetching the latest ratings/sha first and retrying once on a 409
// write conflict (see CLAUDE.md Section 9).
async function writeWithConflictRetry(mutate, { message, maxAttempts = 2 } = {}) {
  const { owner, repo, token } = getSettings();
  let attempt = 0;
  let lastError;

  while (attempt < maxAttempts) {
    attempt += 1;
    const { ratings: latestRatings, sha } = await fetchRatings({ owner, repo, token });
    const nextRatings = mutate(latestRatings);
    try {
      const result = await saveRatings({ owner, repo, token, ratings: nextRatings, sha, message });
      state.ratings = nextRatings;
      state.sha = result.sha;
      return nextRatings;
    } catch (err) {
      if (err instanceof GitHubApiError && err.status === 409) {
        lastError = err;
        continue; // reload latest state and reapply the mutation
      }
      throw err;
    }
  }
  throw lastError;
}

async function loadRatingsFromRepo() {
  const { owner, repo, token } = getSettings();
  setStatus(els.statusMessage, "Loading ratings…");
  try {
    const { ratings, sha } = await fetchRatings({ owner, repo, token });
    state.ratings = ratings;
    state.sha = sha;
    refreshList();
    if (detailUrl) refreshDetail();
    setStatus(els.statusMessage, `Loaded ${ratings.length} visit(s).`);
  } catch (err) {
    setStatus(els.statusMessage, describeError(err, "Failed to load ratings"), true);
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
  if (err instanceof GitHubApiError) {
    return `${prefix}: ${err.message}`;
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
  listPanel: document.getElementById("list-panel"),
  formPanel: document.getElementById("form-panel"),
  detailPanel: document.getElementById("detail-panel"),
  detailContent: document.getElementById("detail-content"),
  backToListButton: document.getElementById("btn-back-to-list"),
};

function refreshList() {
  const restaurants = groupByRestaurant(state.ratings);
  const sorted = sortRestaurants(restaurants, sortField, sortDir);
  renderRestaurantList(els.restaurantListBody, sorted, (url) => showDetail(url));
}

function findRestaurant(url) {
  return groupByRestaurant(state.ratings).find((r) => r.google_maps_url === url) || null;
}

function refreshDetail() {
  const restaurant = findRestaurant(detailUrl);
  if (!restaurant) {
    showList();
    return;
  }
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
      onEdit: (id) => {
        editingVisitId = id;
        refreshDetail();
      },
      onCancelEdit: () => {
        editingVisitId = null;
        refreshDetail();
      },
      onSaveEdit: async (id, changes) => {
        try {
          await writeWithConflictRetry((latestRatings) => updateRating(latestRatings, id, changes), {
            message: "Edit rating",
          });
          editingVisitId = null;
          refreshDetail();
          refreshList();
          setStatus(els.statusMessage, "Visit updated.");
        } catch (err) {
          setStatus(els.statusMessage, describeError(err, "Failed to save edit"), true);
        }
      },
      onDelete: async (id) => {
        try {
          await writeWithConflictRetry((latestRatings) => removeRating(latestRatings, id), {
            message: "Delete rating",
          });
          refreshDetail();
          refreshList();
          setStatus(els.statusMessage, "Visit deleted.");
        } catch (err) {
          setStatus(els.statusMessage, describeError(err, "Failed to delete visit"), true);
        }
      },
    },
    editingVisitId
  );
}

function showDetail(url) {
  detailUrl = url;
  editingVisitId = null;
  els.listPanel.hidden = true;
  els.formPanel.hidden = true;
  els.detailPanel.hidden = false;
  refreshDetail();
}

function showList() {
  detailUrl = null;
  editingVisitId = null;
  els.detailPanel.hidden = true;
  els.listPanel.hidden = false;
  els.formPanel.hidden = false;
}

function initDetailView() {
  els.backToListButton.addEventListener("click", showList);
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

  els.settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    saveSettings({
      owner: els.ownerInput.value.trim(),
      repo: els.repoInput.value.trim(),
      token: els.tokenInput.value,
    });
    els.tokenInput.value = "";
    updateSettingsStatus();
    await resolveCurrentUser();
    if (hasCompleteSettings()) {
      await loadRatingsFromRepo();
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
  els.settingsStatus.textContent = parts.join(" ");
}

function initRatingForm() {
  els.ratingForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!hasCompleteSettings()) {
      setStatus(els.statusMessage, "Set your data repo and token in Settings before adding a rating.", true);
      return;
    }

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
      created_by: currentUser || "unknown",
      created_at: new Date().toISOString(),
    };

    setStatus(els.statusMessage, "Saving rating…");
    try {
      await writeWithConflictRetry((latestRatings) => addRating(latestRatings, rating), {
        message: `Add rating for ${rating.name || "restaurant"}`,
      });
      refreshList();
      els.ratingForm.reset();
      els.ratingPicker.dataset.value = "0";
      els.pricePicker.dataset.value = "0";
      initPickers();
      setStatus(els.statusMessage, "Rating saved.");
    } catch (err) {
      setStatus(els.statusMessage, describeError(err, "Failed to save rating"), true);
    }
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
    if (!hasCompleteSettings()) {
      setStatus(els.statusMessage, "Set your data repo and token in Settings first.", true);
      return;
    }
    loadRatingsFromRepo();
  });
  els.exportButton.addEventListener("click", () => {
    setStatus(els.statusMessage, "CSV export isn't wired up yet.");
  });
}

async function init() {
  initPickers();
  initSettingsPanel();
  initRatingForm();
  initSortControls();
  initToolbar();
  initDetailView();
  refreshList();
  if (!hasCompleteSettings()) {
    setStatus(els.statusMessage, "Set your data repo and token in Settings to sync ratings.");
    return;
  }
  await resolveCurrentUser();
  await loadRatingsFromRepo();
}

init();
