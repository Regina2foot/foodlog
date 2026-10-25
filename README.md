# Foodlog

A small web app to rate restaurants (0–5 stars, comment), sortable by
rating, with a map (OpenStreetMap). Runs entirely in the browser —
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

1. Get access to the private data repo (the app stores everything in a
   `foodlog.json` file there and creates it on the first save) (ask
   whoever owns it to invite you as a collaborator, or as an organization
   member — see the project's `CLAUDE.md` Section 10 for why this
   distinction matters).
2. On GitHub, create a **fine-grained personal access token**:
   - Repository access: only the data repo
   - Permissions: **Contents: Read and write**
3. Open the app (the GitHub Pages URL for this repo) and click **Settings**.
   Enter:
   - the data repo, as `owner/repo` — or just paste the repo's GitHub
     link (a clone URL works too)
   - your personal access token
4. Click **Save settings**. The app will load the existing ratings.

Your token is stored only in your browser and never leaves it except in
API calls to `api.github.com` for the data repo you entered. Use **Remove
token** in Settings to clear it (e.g. on a shared computer).

## Using the app

- **New**: enter the name, optionally put it on the map ("Set location on
  map"), then rate it or mark it as "haven't been yet". If it looks like a restaurant you
  already have, the app offers to add the visit there instead.
- **Map**: your restaurants on an OpenStreetMap map; search for a place
  (or paste an address, e.g. from Google Maps) or tap the map to add one.
  Dots show the restaurant's tag colours; filter by rating and tags above
  the map.
  **Find locations…** looks up restaurants that have no location yet
  (e.g. after an import) by name in an area you name, like "Berlin".
- **List**: one row per restaurant, showing its most recent visit.
  Sortable by rating, name, or date. Tick rows to delete or merge them,
  or to add/remove tags on all of them at once (**Tags…**).
- **Settings → Tags**: rename or delete a tag everywhere.
- **Archive**: a closed restaurant can be archived (its page → Edit
  restaurant). It keeps its visits but leaves the lists and the map; tick
  Settings → Archive to see archived ones as a third list.
- Click a row to open the **restaurant detail view**: full visit history,
  a rating-over-time chart, and an "Open in Google Maps" button.
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
- `data.js` – the data document (restaurants + visits) and all changes to it
- `render.js` – rendering the list/UI updates
- `sort.js` – sorting logic
- `csv.js` – CSV export
- `maps.js` – Google Maps link handling and validation
- `history.js` – restaurant detail view, visit history, rating chart
- `settings.js` – local (localStorage) runtime settings
- `googleImport.js` – Google Takeout CSV import
- `duplicates.js` – duplicate detection (same Google place / similar name)
- `tagColors.js` – one distinct colour per tag (computed, not stored)
- `tagTools.js` – renaming/deleting tags and the bulk tag panel
- `mapView.js` – the Map tab (Leaflet + OpenStreetMap tiles)
- `geo.js` – place search / lookup of a tapped spot (Nominatim)
- `locate.js`, `locateView.js` – "Find locations" for restaurants without one
- `app.js` – wires the modules together, event handling, entry point

See `CLAUDE.md` for the full project context, data model, and the
principles this app is built to follow (privacy, security, extensibility).
