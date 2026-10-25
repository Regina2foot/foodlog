// Local-only runtime settings: data repo owner/name and personal access token.
// Never hardcoded, never sent anywhere except as part of GitHub API calls the
// user's own token authorizes (see CLAUDE.md Section 3.1).

const KEY_OWNER = "foodlog_owner";
const KEY_REPO = "foodlog_repo";
const KEY_TOKEN = "foodlog_token";

export function getSettings() {
  return {
    owner: localStorage.getItem(KEY_OWNER) || "",
    repo: localStorage.getItem(KEY_REPO) || "",
    token: localStorage.getItem(KEY_TOKEN) || "",
  };
}

export function saveSettings({ owner, repo, token }) {
  if (owner) localStorage.setItem(KEY_OWNER, owner);
  if (repo) localStorage.setItem(KEY_REPO, repo);
  if (token) localStorage.setItem(KEY_TOKEN, token);
}

export function removeToken() {
  localStorage.removeItem(KEY_TOKEN);
}

// Last area typed into "Find locations" (Section 15.3) — only suggested
// next time, never hardcoded.
const KEY_LOCATE_AREA = "foodlog_locate_area";

export function getLocateArea() {
  return localStorage.getItem(KEY_LOCATE_AREA) || "";
}

export function saveLocateArea(area) {
  localStorage.setItem(KEY_LOCATE_AREA, area);
}

const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

// Accepts "owner/repo", a GitHub page link (https://github.com/owner/repo,
// with or without extra path), or a clone URL (…/repo.git or
// git@github.com:owner/repo.git). Returns { owner, repo } or null.
export function parseRepoInput(value) {
  let s = (value || "").trim();
  s = s.replace(/^git@github\.com:/i, "");
  s = s.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
  s = s.replace(/[?#].*$/, "");
  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo) || repo === "." || repo === "..") {
    return null;
  }
  return { owner, repo };
}

export function hasCompleteSettings() {
  const { owner, repo, token } = getSettings();
  return Boolean(owner && repo && token);
}
