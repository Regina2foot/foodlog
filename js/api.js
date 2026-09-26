// GitHub Contents API access for the private data repo (see CLAUDE.md
// Sections 5, 9, 12). No other external service is ever contacted.

const API_BASE = "https://api.github.com";

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// Redacts the Authorization header before logging/throwing, per CLAUDE.md
// Section 3.2 ("never show it in full" when debugging API calls).
function redactHeaders(headers) {
  const copy = { ...headers };
  if (copy.Authorization) copy.Authorization = "Bearer ***redacted***";
  return copy;
}

class GitHubApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    throw new GitHubApiError(
      `Network error calling GitHub API (${redactHeaders(options.headers)}): ${err.message}`,
      0
    );
  }
  return response;
}

// Returns the GitHub login for the account owning the given token.
export async function fetchCurrentUser(token) {
  const response = await request(`${API_BASE}/user`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw new GitHubApiError(`Failed to fetch GitHub user (status ${response.status})`, response.status);
  }
  const data = await response.json();
  return data.login;
}

// Reads ratings.json from the data repo. Returns { ratings, sha }. A missing
// file (empty repo edge case) resolves to an empty array with sha = null.
export async function fetchRatings({ owner, repo, token }) {
  const response = await request(
    `${API_BASE}/repos/${owner}/${repo}/contents/ratings.json`,
    { headers: authHeaders(token) }
  );

  if (response.status === 404) {
    return { ratings: [], sha: null };
  }
  if (!response.ok) {
    throw new GitHubApiError(`Failed to read ratings.json (status ${response.status})`, response.status);
  }

  const data = await response.json();
  const jsonText = decodeBase64Utf8(data.content);
  const ratings = jsonText.trim() === "" ? [] : JSON.parse(jsonText);
  return { ratings, sha: data.sha };
}

// Writes the full ratings array back to ratings.json using the given base
// sha. Throws GitHubApiError with status 409 on a write conflict so callers
// can reload, reapply, and retry (see CLAUDE.md Section 9).
export async function saveRatings({ owner, repo, token, ratings, sha, message }) {
  const body = {
    message: message || "Update ratings.json",
    content: encodeBase64Utf8(JSON.stringify(ratings, null, 2)),
  };
  if (sha) body.sha = sha;

  const response = await request(
    `${API_BASE}/repos/${owner}/${repo}/contents/ratings.json`,
    {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (response.status === 409) {
    throw new GitHubApiError("Write conflict: ratings.json changed since last read", 409);
  }
  if (!response.ok) {
    throw new GitHubApiError(`Failed to write ratings.json (status ${response.status})`, response.status);
  }

  const data = await response.json();
  return { sha: data.content.sha };
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function decodeBase64Utf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export { GitHubApiError };
