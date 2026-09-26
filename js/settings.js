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

export function hasCompleteSettings() {
  const { owner, repo, token } = getSettings();
  return Boolean(owner && repo && token);
}
