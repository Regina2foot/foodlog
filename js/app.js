import { createEmptyState, groupByRestaurant, addRating, updateRating, removeRating, generateId } from "./state.js";
import { sortRestaurants } from "./sort.js";
import { renderRestaurantList, renderListHeader, renderStarPicker, renderPricePicker, setStatus } from "./render.js";
import { getSettings, saveSettings, removeToken, hasCompleteSettings } from "./settings.js";
import { fetchRatings, saveRatings, fetchCurrentUser, GitHubApiError } from "./api.js";
import { renderRestaurantDetail } from "./history.js";
import { openMapsUrl, extractNameFromMapsUrl } from "./maps.js";
import { ratingsToCsv, downloadCsv } from "./csv.js";
import { decodeImportFile, parseGoogleMapsExport, buildRatingsFromImport } from "./googleImport.js";

const state = createEmptyState();
let sortField = "rating";
let sortDir = "desc";
let currentUser = null;
let detailGroupKey = null; // groupKey of the restaurant currently shown in detail view
let editingVisitId = null;
let listView = "visited"; // "visited" | "wishlist"

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
    const { ratings, sha, notFound } = await fetchRatings({ owner, repo, token });
    state.ratings = ratings;
    state.sha = sha;
    refreshList();
    if (detailGroupKey) refreshDetail();
    if (notFound) {
      setStatus(
        els.statusMessage,
        `No ratings.json found at ${owner}/${repo}. Double-check the exact owner/repo spelling in Settings and that your token has access — this is not the same as a confirmed-empty list.`,
        true
      );
    } else {
      setStatus(els.statusMessage, `Loaded ${ratings.length} visit(s).`);
    }
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
  wishlistCheckbox: document.getElementById("field-wishlist"),
  visitedFieldsContainer: document.getElementById("visited-fields"),
  viewVisitedButton: document.getElementById("btn-view-visited"),
  viewWishlistButton: document.getElementById("btn-view-wishlist"),
  sortControls: document.getElementById("sort-controls"),
  restaurantTableHeaderRow: document.getElementById("restaurant-table-header-row"),
  toggleImportButton: document.getElementById("btn-toggle-import"),
  importPanel: document.getElementById("import-panel"),
  importFileInput: document.getElementById("import-file-input"),
  importStatus: document.getElementById("import-status"),
};

function refreshList() {
  const filtered = state.ratings.filter((r) => {
    const status = r.status || "visited";
    return listView === "wishlist" ? status === "wishlist" : status !== "wishlist";
  });
  const restaurants = groupByRestaurant(filtered);
  const sorted =
    listView === "wishlist"
      ? sortRestaurants(restaurants, "name", "asc")
      : sortRestaurants(restaurants, sortField, sortDir);
  renderListHeader(els.restaurantTableHeaderRow, listView);
  renderRestaurantList(els.restaurantListBody, sorted, (key) => showDetail(key), listView);
  els.sortControls.hidden = listView === "wishlist";
}

function findRestaurant(groupKey) {
  return groupByRestaurant(state.ratings).find((r) => r.groupKey === groupKey) || null;
}

function refreshDetail() {
  const restaurant = findRestaurant(detailGroupKey);
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

function showDetail(groupKey) {
  detailGroupKey = groupKey;
  editingVisitId = null;
  els.listPanel.hidden = true;
  els.formPanel.hidden = true;
  els.detailPanel.hidden = false;
  refreshDetail();
}

function showList() {
  detailGroupKey = null;
  editingVisitId = null;
  els.detailPanel.hidden = true;
  els.listPanel.hidden = false;
  els.formPanel.hidden = false;
}

function initDetailView() {
  els.backToListButton.addEventListener("click", showList);
}

function initViewToggle() {
  function setView(view) {
    listView = view;
    els.viewVisitedButton.classList.toggle("active", view === "visited");
    els.viewVisitedButton.setAttribute("aria-pressed", String(view === "visited"));
    els.viewWishlistButton.classList.toggle("active", view === "wishlist");
    els.viewWishlistButton.setAttribute("aria-pressed", String(view === "wishlist"));
    refreshList();
  }
  els.viewVisitedButton.addEventListener("click", () => setView("visited"));
  els.viewWishlistButton.addEventListener("click", () => setView("wishlist"));
}

function initWishlistToggle() {
  els.wishlistCheckbox.addEventListener("change", () => {
    els.visitedFieldsContainer.hidden = els.wishlistCheckbox.checked;
  });
}

function initImport() {
  els.toggleImportButton.addEventListener("click", () => {
    els.importPanel.hidden = !els.importPanel.hidden;
  });

  els.importFileInput.addEventListener("change", async () => {
    const file = els.importFileInput.files[0];
    if (!file) return;

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

      const existingUrls = new Set(state.ratings.map((r) => r.google_maps_url).filter(Boolean));
      const { toAdd, skippedDuplicates } = buildRatingsFromImport(entries, {
        createdBy: currentUser || "unknown",
        existingUrls,
        generateId,
      });

      if (toAdd.length === 0) {
        setStatus(els.importStatus, `Nothing new to import (${skippedDuplicates} already in your list).`, true);
        return;
      }

      const visitedCount = toAdd.filter((r) => r.status === "visited").length;
      const wishlistCount = toAdd.length - visitedCount;
      const confirmed = confirm(
        `Found ${entries.length} place(s) in the file.\n` +
          `${visitedCount} will be imported as rated visits, ${wishlistCount} as wishlist entries.\n` +
          (skippedDuplicates > 0 ? `${skippedDuplicates} already in your list will be skipped.\n` : "") +
          `\nImport ${toAdd.length} new entr${toAdd.length === 1 ? "y" : "ies"}?`
      );
      if (!confirmed) {
        setStatus(els.importStatus, "Import cancelled.");
        return;
      }

      setStatus(els.importStatus, `Importing ${toAdd.length} entries…`);
      await writeWithConflictRetry((latestRatings) => [...latestRatings, ...toAdd], {
        message: `Import ${toAdd.length} place(s) from Google Maps`,
      });
      refreshList();
      setStatus(els.importStatus, `Imported ${toAdd.length} entries (${visitedCount} rated, ${wishlistCount} wishlist).`);
    } catch (err) {
      setStatus(els.importStatus, describeError(err, "Import failed"), true);
    } finally {
      els.importFileInput.value = "";
    }
  });
}

function initMapsNamePrefill() {
  els.mapsUrlInput.addEventListener("input", () => {
    if (els.nameInput.value.trim() !== "") return; // never overwrite a typed name
    const extracted = extractNameFromMapsUrl(els.mapsUrlInput.value.trim());
    if (extracted) {
      els.nameInput.value = extracted;
    }
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

    const isWishlist = els.wishlistCheckbox.checked;
    const rating = {
      id: generateId(),
      name: els.nameInput.value.trim(),
      google_maps_url: els.mapsUrlInput.value.trim(),
      status: isWishlist ? "wishlist" : "visited",
      rating: isWishlist ? null : Number(els.ratingPicker.dataset.value || 0),
      price_level: isWishlist ? null : Number(els.pricePicker.dataset.value || 0),
      comment: isWishlist ? "" : els.commentInput.value.trim(),
      tags: els.tagsInput.value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      visited_at: isWishlist ? null : els.visitedAtInput.value || new Date().toISOString().slice(0, 10),
      created_by: currentUser || "unknown",
      created_at: new Date().toISOString(),
    };

    setStatus(els.statusMessage, isWishlist ? "Saving to wishlist…" : "Saving rating…");
    try {
      await writeWithConflictRetry((latestRatings) => addRating(latestRatings, rating), {
        message: isWishlist ? `Add ${rating.name || "restaurant"} to wishlist` : `Add rating for ${rating.name || "restaurant"}`,
      });
      refreshList();
      els.ratingForm.reset();
      els.ratingPicker.dataset.value = "0";
      els.pricePicker.dataset.value = "0";
      els.visitedFieldsContainer.hidden = false;
      initPickers();
      setStatus(els.statusMessage, isWishlist ? "Added to wishlist." : "Rating saved.");
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
    if (state.ratings.length === 0) {
      setStatus(els.statusMessage, "No ratings to export yet.", true);
      return;
    }
    downloadCsv(ratingsToCsv(state.ratings));
    setStatus(els.statusMessage, `Exported ${state.ratings.length} visit(s) as CSV.`);
  });
}

async function init() {
  initPickers();
  initSettingsPanel();
  initImport();
  initMapsNamePrefill();
  initWishlistToggle();
  initRatingForm();
  initSortControls();
  initToolbar();
  initDetailView();
  initViewToggle();
  refreshList();
  if (!hasCompleteSettings()) {
    setStatus(els.statusMessage, "Set your data repo and token in Settings to sync ratings.");
    return;
  }
  await resolveCurrentUser();
  await loadRatingsFromRepo();
}

init();
