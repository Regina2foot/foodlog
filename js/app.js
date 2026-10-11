import { createEmptyState, groupByRestaurant, addRating, updateRating, removeRating, removeRestaurantGroups, mergeRestaurantGroups, markRestaurantsDifferent, generateId } from "./state.js";
import { sortRestaurants } from "./sort.js";
import { renderRestaurantList, renderListHeader, renderStarPicker, renderPricePicker, renderTagPicker, setStatus } from "./render.js";
import { getSettings, saveSettings, removeToken, hasCompleteSettings, parseRepoInput } from "./settings.js";
import { fetchRatings, saveRatings, fetchCurrentUser, GitHubApiError } from "./api.js";
import { renderRestaurantDetail } from "./history.js";
import { openMapsUrl, extractNameFromMapsUrl } from "./maps.js";
import { ratingsToCsv, downloadCsv } from "./csv.js";
import { decodeImportFile, parseGoogleMapsExport, buildRatingsFromImport, applyImport } from "./googleImport.js";
import { extractPlaceKey, normalizeName, createMatcher, findDuplicateGroups } from "./duplicates.js";

// Bump on every change that gets pushed, so a device still running a
// cached older app.js is easy to spot (shown at the bottom of Settings).
const APP_VERSION = "2026-10-11b";

// Phones have no visible error console; surface anything uncaught in the
// status line instead of failing silently.
function showUnexpectedError(err) {
  const el = document.getElementById("status-message");
  if (el) setStatus(el, `Unexpected error: ${(err && err.message) || err}`, true);
}
window.addEventListener("error", (e) => showUnexpectedError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showUnexpectedError(e.reason));

const state = createEmptyState();
let sortField = "rating";
let sortDir = "desc";
let currentUser = null;
let detailGroupKey = null; // groupKey of the restaurant currently shown in detail view
let editingVisitId = null;
let listView = "visited"; // "visited" | "wishlist"
let wishlistTagFilter = ""; // "" = all tags
let formTags = []; // New rating form's current tag selection
let showDuplicates = false;
let nameSearch = ""; // normalized, "" = no search
const selectedGroupKeys = new Set();

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
  if (err instanceof GitHubApiError && err.status === 401) {
    return `${prefix}: GitHub rejected the token — it may be mistyped, expired or revoked. Paste it again in Settings.`;
  }
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
  dataRepoInput: document.getElementById("setting-data-repo"),
  tokenInput: document.getElementById("setting-token"),
  removeTokenButton: document.getElementById("btn-remove-token"),
  ratingForm: document.getElementById("rating-form"),
  mapsUrlInput: document.getElementById("field-maps-url"),
  nameInput: document.getElementById("field-name"),
  ratingPicker: document.getElementById("field-rating"),
  pricePicker: document.getElementById("field-price"),
  commentInput: document.getElementById("field-comment"),
  tagsPicker: document.getElementById("field-tags"),
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
  importTagInput: document.getElementById("import-tag-input"),
  importStatus: document.getElementById("import-status"),
  deleteSelectedButton: document.getElementById("btn-delete-selected"),
  mergeSelectedButton: document.getElementById("btn-merge-selected"),
  wishlistTagFilterContainer: document.getElementById("wishlist-tag-filter-container"),
  wishlistTagFilterSelect: document.getElementById("wishlist-tag-filter"),
  viewToggle: document.getElementById("view-toggle"),
  showDuplicatesCheckbox: document.getElementById("show-duplicates"),
  nameSearchInput: document.getElementById("name-search"),
  duplicateWarning: document.getElementById("duplicate-warning"),
  notSameButton: document.getElementById("btn-not-same"),
  importReview: document.getElementById("import-review"),
};

function hasVisitedVisit(restaurant) {
  return restaurant.visits.some((v) => (v.status || "visited") !== "wishlist");
}

function matchesNameSearch(restaurant) {
  return !nameSearch || restaurant.visits.some((v) => normalizeName(v.name).includes(nameSearch));
}

function refreshList() {
  // Group first, then classify whole restaurants: one with any rated visit
  // belongs in Rated; only all-wishlist restaurants stay in Wishlist. (A
  // wishlist entry merged/attached to a rated one must not linger there.)
  const allRestaurants = groupByRestaurant(state.ratings);
  let sorted;
  let mode;
  const groupStartKeys = new Set();

  if (showDuplicates) {
    const groups = findDuplicateGroups(allRestaurants).filter((g) => g.some(matchesNameSearch));
    groups.forEach((g) => groupStartKeys.add(g[0].groupKey));
    sorted = groups.flat();
    mode = "duplicates";
  } else {
    const inView = allRestaurants.filter((r) => (listView === "wishlist" ? !hasVisitedVisit(r) : hasVisitedVisit(r)));
    if (listView === "wishlist") {
      refreshWishlistTagOptions(inView.flatMap((r) => r.visits));
    }
    const filtered = inView.filter(
      (r) =>
        matchesNameSearch(r) &&
        (listView !== "wishlist" || !wishlistTagFilter || r.visits.some((v) => (v.tags || []).includes(wishlistTagFilter)))
    );
    sorted =
      listView === "wishlist"
        ? sortRestaurants(filtered, "name", "asc")
        : sortRestaurants(filtered, sortField, sortDir);
    mode = listView;
  }

  els.viewToggle.hidden = showDuplicates;
  els.wishlistTagFilterContainer.hidden = showDuplicates || listView !== "wishlist";

  const allSelected = sorted.length > 0 && sorted.every((r) => selectedGroupKeys.has(r.groupKey));
  renderListHeader(els.restaurantTableHeaderRow, mode, (checked) => {
    for (const r of sorted) {
      if (checked) selectedGroupKeys.add(r.groupKey);
      else selectedGroupKeys.delete(r.groupKey);
    }
    refreshList();
  }, allSelected);

  renderRestaurantList(
    els.restaurantListBody,
    sorted,
    (key) => showDetail(key),
    mode,
    (groupKey, checked) => {
      if (checked) selectedGroupKeys.add(groupKey);
      else selectedGroupKeys.delete(groupKey);
      updateBulkActionButtons();
    },
    selectedGroupKeys,
    { groupStartKeys, emptyMessage: nameSearch ? "No restaurants match your search." : undefined }
  );
  els.sortControls.hidden = showDuplicates || listView === "wishlist";
  updateBulkActionButtons();
  refreshTagPicker();
}

function allKnownTags() {
  const tags = new Set();
  for (const r of state.ratings) {
    for (const t of r.tags || []) tags.add(t);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

// Re-renders the New rating form's tag picker, preserving the current
// in-progress selection (formTags) while refreshing which tags are
// available to pick from.
function refreshTagPicker() {
  renderTagPicker(els.tagsPicker, allKnownTags(), formTags, (next) => {
    formTags = next;
    refreshTagPicker();
  });
}

// Rebuilds the wishlist tag-filter dropdown from the distinct tags present
// across all wishlist entries (not just the currently filtered ones, so
// every available option stays choosable). Keeps the current selection if
// it's still a valid tag, otherwise resets to "All tags".
function refreshWishlistTagOptions(wishlistEntries) {
  const tags = new Set();
  for (const r of wishlistEntries) {
    for (const t of r.tags || []) tags.add(t);
  }
  const sortedTags = [...tags].sort((a, b) => a.localeCompare(b));

  if (wishlistTagFilter && !tags.has(wishlistTagFilter)) {
    wishlistTagFilter = "";
  }

  els.wishlistTagFilterSelect.textContent = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All tags";
  els.wishlistTagFilterSelect.appendChild(allOption);
  for (const tag of sortedTags) {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    els.wishlistTagFilterSelect.appendChild(option);
  }
  els.wishlistTagFilterSelect.value = wishlistTagFilter;
}

function updateBulkActionButtons() {
  const count = selectedGroupKeys.size;
  els.deleteSelectedButton.hidden = count === 0;
  els.deleteSelectedButton.textContent = `Delete selected (${count})`;
  els.mergeSelectedButton.hidden = count < 2;
  els.mergeSelectedButton.textContent = `Merge selected (${count})`;
  els.notSameButton.hidden = !showDuplicates || count < 2;
  els.notSameButton.textContent = `Not the same (${count})`;
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
    editingVisitId,
    allKnownTags()
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
    selectedGroupKeys.clear();
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
    selectedGroupKeys.clear();
    refreshList();
  });
  els.nameSearchInput.addEventListener("input", () => {
    nameSearch = normalizeName(els.nameSearchInput.value);
    selectedGroupKeys.clear();
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

function initBulkNotSame() {
  els.notSameButton.addEventListener("click", async () => {
    const count = selectedGroupKeys.size;
    if (count < 2) return;
    const confirmed = confirm(
      `Mark the ${count} selected restaurants as different from each other? They won't be suggested as duplicates of each other again.`
    );
    if (!confirmed) return;

    const keys = new Set(selectedGroupKeys);
    setStatus(els.statusMessage, "Saving…");
    try {
      await writeWithConflictRetry((latestRatings) => markRestaurantsDifferent(latestRatings, keys), {
        message: `Mark ${count} restaurants as not duplicates`,
      });
      selectedGroupKeys.clear();
      refreshList();
      setStatus(els.statusMessage, `Marked ${count} restaurants as different.`);
    } catch (err) {
      setStatus(els.statusMessage, describeError(err, "Failed to save"), true);
    }
  });
}

function initBulkDelete() {
  els.deleteSelectedButton.addEventListener("click", async () => {
    const count = selectedGroupKeys.size;
    if (count === 0) return;

    const confirmed = confirm(
      `Delete ${count} restaurant(s) and all their visits? This cannot be undone.`
    );
    if (!confirmed) return;

    setStatus(els.statusMessage, `Deleting ${count} entries…`);
    try {
      await writeWithConflictRetry(
        (latestRatings) => removeRestaurantGroups(latestRatings, selectedGroupKeys),
        { message: `Delete ${count} restaurant(s)` }
      );
      selectedGroupKeys.clear();
      refreshList();
      setStatus(els.statusMessage, `Deleted ${count} entries.`);
    } catch (err) {
      setStatus(els.statusMessage, describeError(err, "Failed to delete selected"), true);
    }
  });
}

function initBulkMerge() {
  els.mergeSelectedButton.addEventListener("click", async () => {
    const count = selectedGroupKeys.size;
    if (count < 2) return;

    const confirmed = confirm(
      `Merge ${count} selected restaurants into one? Their visit histories will be combined. This cannot be undone.`
    );
    if (!confirmed) return;

    const keysToMerge = new Set(selectedGroupKeys);
    const newRestaurantId = generateId();
    setStatus(els.statusMessage, `Merging ${count} restaurants…`);
    try {
      await writeWithConflictRetry(
        (latestRatings) => mergeRestaurantGroups(latestRatings, keysToMerge, newRestaurantId),
        { message: `Merge ${count} restaurants` }
      );
      selectedGroupKeys.clear();
      refreshList();
      setStatus(els.statusMessage, `Merged ${count} restaurants into one.`);
    } catch (err) {
      setStatus(els.statusMessage, describeError(err, "Failed to merge selected"), true);
    }
  });
}

function initWishlistToggle() {
  els.wishlistCheckbox.addEventListener("change", () => {
    els.visitedFieldsContainer.hidden = els.wishlistCheckbox.checked;
  });
}

async function runImport(plan, bulkTag) {
  const newCount = plan.filter((p) => p.decision !== "same").length;
  const sameCount = plan.length - newCount;
  setStatus(els.importStatus, "Importing…");
  try {
    await writeWithConflictRetry((latestRatings) => applyImport(latestRatings, plan, { bulkTag, generateId }), {
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
function showImportReview(items, summary, bulkTag) {
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
    legend.textContent = `"${item.rating.name}" from the file`;
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
    item.matches.slice(0, MAX_SHOWN_MATCHES).forEach((m, i) => addOption(`Same as "${m.restaurant.name}"`, i));
    addOption("Different restaurant", "different");
    box.appendChild(fieldset);
  });

  importButton.addEventListener("click", () => {
    const plan = items.map((item) => {
      if (item.matches.length === 0) return { rating: item.rating, decision: "add" };
      const answer = answers.get(item);
      const shown = item.matches.slice(0, MAX_SHOWN_MATCHES);
      if (answer === "different") {
        return {
          rating: item.rating,
          decision: "add",
          matchIds: shown.flatMap((m) => m.restaurant.visits.map((v) => v.id)),
        };
      }
      return {
        rating: item.rating,
        decision: "same",
        matchIds: shown[answer].restaurant.visits.map((v) => v.id),
      };
    });
    runImport(plan, bulkTag);
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
  els.toggleImportButton.addEventListener("click", () => {
    els.importPanel.hidden = !els.importPanel.hidden;
  });

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

      const knownUrls = new Set(state.ratings.map((r) => (r.google_maps_url || "").trim()).filter(Boolean));
      const knownPlaceKeys = new Set(state.ratings.map((r) => extractPlaceKey(r.google_maps_url)).filter(Boolean));
      const isKnownPlace = (url) => {
        const key = extractPlaceKey(url);
        return knownUrls.has(url.trim()) || (key !== null && knownPlaceKeys.has(key));
      };
      const { toAdd, skippedDuplicates } = buildRatingsFromImport(entries, {
        createdBy: currentUser || "unknown",
        isKnownPlace,
        generateId,
      });

      if (toAdd.length === 0) {
        setStatus(els.importStatus, `Nothing new to import (${skippedDuplicates} already in your list).`, true);
        return;
      }

      const bulkTag = els.importTagInput.value.trim();
      if (bulkTag) {
        for (const r of toAdd) {
          if (!r.tags.includes(bulkTag)) r.tags = [...r.tags, bulkTag];
        }
      }

      // Same-place matches were already skipped above; anything still
      // matching is a similar-name match, which gets reviewed before saving.
      const matchExisting = createMatcher(groupByRestaurant(state.ratings));
      const items = toAdd.map((rating) => ({ rating, matches: matchExisting(rating) }));

      const visitedCount = toAdd.filter((r) => r.status === "visited").length;
      const summary =
        `Found ${entries.length} place(s) in the file: ${visitedCount} rated, ${toAdd.length - visitedCount} wishlist.` +
        (skippedDuplicates > 0 ? ` ${skippedDuplicates} already in your list (same Google Maps place) will be skipped.` : "") +
        (bulkTag ? ` All will be tagged "${bulkTag}".` : "");

      if (items.some((i) => i.matches.length > 0)) {
        showImportReview(items, summary, bulkTag);
        setStatus(els.importStatus, "");
        return;
      }

      if (!confirm(`${summary}\n\nImport ${toAdd.length} new entr${toAdd.length === 1 ? "y" : "ies"}?`)) {
        setStatus(els.importStatus, "Import cancelled.");
        return;
      }
      await runImport(items.map(({ rating }) => ({ rating, decision: "add" })), bulkTag);
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
  document.getElementById("app-version").textContent = `App version: ${APP_VERSION}`;
  const current = getSettings();
  if (current.owner && current.repo) {
    els.dataRepoInput.value = `${current.owner}/${current.repo}`;
  }
  updateSettingsStatus();

  els.toggleSettingsButton.addEventListener("click", () => {
    els.settingsPanel.hidden = !els.settingsPanel.hidden;
  });

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
  setStatus(els.settingsStatus, parts.join(" "));
}

// Read fresh from the form every time it's needed (incl. from the duplicate
// warning's buttons), so edits made while the warning is shown aren't lost.
function buildRatingFromForm() {
  const isWishlist = els.wishlistCheckbox.checked;
  return {
    id: generateId(),
    name: els.nameInput.value.trim(),
    google_maps_url: els.mapsUrlInput.value.trim(),
    status: isWishlist ? "wishlist" : "visited",
    rating: isWishlist ? null : Number(els.ratingPicker.dataset.value || 0),
    price_level: isWishlist ? null : Number(els.pricePicker.dataset.value || 0),
    comment: isWishlist ? "" : els.commentInput.value.trim(),
    tags: formTags,
    visited_at: isWishlist ? null : els.visitedAtInput.value || new Date().toISOString().slice(0, 10),
    created_by: currentUser || "unknown",
    created_at: new Date().toISOString(),
  };
}

function hideDuplicateWarning() {
  els.duplicateWarning.hidden = true;
  els.duplicateWarning.textContent = "";
}

const MAX_SHOWN_MATCHES = 3;

function showDuplicateWarning(matches) {
  const box = els.duplicateWarning;
  box.textContent = "";
  const reasonText = (reason) => (reason === "place" ? "same Google Maps place" : "similar name");

  const intro = document.createElement("p");
  intro.textContent =
    matches.length === 1
      ? `This looks like "${matches[0].restaurant.name}" already in your list (${reasonText(matches[0].reason)}).`
      : "This looks like a restaurant already in your list:";
  box.appendChild(intro);

  const actions = document.createElement("div");
  actions.className = "form-actions duplicate-actions";
  for (const { restaurant, reason } of matches.slice(0, MAX_SHOWN_MATCHES)) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent =
      matches.length === 1
        ? `Add as another visit to "${restaurant.name}"`
        : `Add as visit to "${restaurant.name}" (${reasonText(reason)})`;
    button.addEventListener("click", () => saveNewRating(buildRatingFromForm(), restaurant.groupKey));
    actions.appendChild(button);
  }
  const separate = document.createElement("button");
  separate.type = "button";
  separate.textContent = "Save separately";
  // Remembered (not_same_as), so these pairs aren't flagged again later.
  const matchedIds = matches.flatMap((m) => m.restaurant.visits.map((v) => v.id));
  separate.addEventListener("click", () => saveNewRating({ ...buildRatingFromForm(), not_same_as: matchedIds }, null));
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", hideDuplicateWarning);
  actions.append(separate, cancel);
  box.appendChild(actions);

  box.hidden = false;
}

// `attachToGroupKey`: if set, the new visit joins that existing restaurant —
// both share a restaurant_id (reusing the group's own if it has one), the
// same mechanism as "Merge selected".
async function saveNewRating(rating, attachToGroupKey) {
  hideDuplicateWarning();
  const isWishlist = rating.status === "wishlist";
  setStatus(els.statusMessage, isWishlist ? "Saving to wishlist…" : "Saving rating…");
  try {
    await writeWithConflictRetry(
      (latestRatings) => {
        const existing = attachToGroupKey
          ? groupByRestaurant(latestRatings).find((r) => r.groupKey === attachToGroupKey)
          : null;
        if (!existing) return addRating(latestRatings, rating);
        const restaurantId = existing.visits.find((v) => v.restaurant_id)?.restaurant_id || generateId();
        const linked = mergeRestaurantGroups(latestRatings, new Set([attachToGroupKey]), restaurantId);
        return addRating(linked, { ...rating, restaurant_id: restaurantId });
      },
      {
        message: isWishlist ? `Add ${rating.name || "restaurant"} to wishlist` : `Add rating for ${rating.name || "restaurant"}`,
      }
    );
    els.ratingForm.reset();
    els.ratingPicker.dataset.value = "0";
    els.pricePicker.dataset.value = "0";
    els.visitedFieldsContainer.hidden = false;
    formTags = [];
    initPickers();
    refreshList();
    setStatus(els.statusMessage, isWishlist ? "Added to wishlist." : "Rating saved.");
  } catch (err) {
    setStatus(els.statusMessage, describeError(err, "Failed to save rating"), true);
  }
}

function initRatingForm() {
  els.ratingForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideDuplicateWarning();

    if (!hasCompleteSettings()) {
      setStatus(els.statusMessage, "Set your data repo and token in Settings before adding a rating.", true);
      return;
    }

    const rating = buildRatingFromForm();
    const matches = createMatcher(groupByRestaurant(state.ratings))(rating);
    if (matches.length > 0) {
      showDuplicateWarning(matches);
      return;
    }
    await saveNewRating(rating, null);
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

  els.wishlistTagFilterSelect.addEventListener("change", () => {
    wishlistTagFilter = els.wishlistTagFilterSelect.value;
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
  initBulkDelete();
  initBulkMerge();
  initBulkNotSame();
  initListFilters();
  refreshList();
  if (!hasCompleteSettings()) {
    setStatus(els.statusMessage, "Set your data repo and token in Settings to sync ratings.");
    return;
  }
  await resolveCurrentUser();
  await loadRatingsFromRepo();
}

init();
