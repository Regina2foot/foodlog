# Foodlog

A small web app to rate restaurants (0–5 stars, comment, price level),
sortable by rating, with Google Maps links. Runs entirely in the browser —
no server, no build step, no framework.

## How it works

- This repo (public) contains only the app code, served for free via
  GitHub Pages.
- Ratings are stored as JSON in a **separate, private** data repo, read and
  written at runtime through the GitHub Contents API.
- Each person uses their own GitHub Personal Access Token, stored only in
  their own browser's `localStorage`. Nothing is ever sent anywhere except
  to the GitHub API for the data repo you configure.

## One-time setup (per person)

1. Get access to the private data repo that holds `ratings.json` (ask
   whoever owns it to invite you as a collaborator, or as an organization
   member — see the project's `CLAUDE.md` Section 10 for why this
   distinction matters).
2. On GitHub, create a **fine-grained personal access token**:
   - Repository access: only the data repo
   - Permissions: **Contents: Read and write**
3. Open the app (the GitHub Pages URL for this repo) and click **Settings**.
   Enter:
   - the data repo's owner (GitHub username or org)
   - the data repo's name
   - your personal access token
4. Click **Save settings**. The app will load the existing ratings.

Your token is stored only in your browser and never leaves it except in
API calls to `api.github.com` for the data repo you entered. Use **Remove
token** in Settings to clear it (e.g. on a shared computer).

## Using the app

- **New rating**: paste a Google Maps link, fill in the form, and submit.
  Pasting the same Google Maps link again adds another visit to the same
  restaurant instead of creating a duplicate entry.
- **List**: one row per restaurant, showing its most recent visit.
  Sortable by rating, name, or date.
- Click a row to open the **restaurant detail view**: full visit history,
  a rating/price-over-time chart, and an "Open in Google Maps" button.
  Edit or delete individual visits from there.
- **Refresh**: reloads the latest data from the data repo.
- **Export CSV**: downloads the currently loaded data as a CSV file, one
  row per visit.

## Local development

No build step needed. From the project folder:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

## Project structure

Plain HTML/CSS/JavaScript, split into ES modules under `js/`:

- `api.js` – GitHub Contents API access (read/write, conflict handling)
- `state.js` – holding and updating the current list of ratings
- `render.js` – rendering the list/UI updates
- `sort.js` – sorting logic
- `csv.js` – CSV export
- `maps.js` – Google Maps link handling and validation
- `history.js` – restaurant detail view, visit history, rating/price chart
- `settings.js` – local (localStorage) runtime settings
- `app.js` – wires the modules together, event handling, entry point

See `CLAUDE.md` for the full project context, data model, and the
principles this app is built to follow (privacy, security, extensibility).
