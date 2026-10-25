# Foodlog

A small web app to rate restaurants (0–5 stars, comment) and keep a
wishlist of places to try, with a map (OpenStreetMap) and links to Google
Maps. Runs entirely in the browser — no server, no build step, no
framework.

## How it works

- This repo (public) contains only the app code, served for free via
  GitHub Pages.
- Ratings are stored as JSON in a **separate, private** data repo, read and
  written at runtime through the GitHub Contents API.
- Each person uses their own GitHub Personal Access Token, stored only in
  their own browser's `localStorage`.
- The only other services the app talks to: **OpenStreetMap** for the map
  images, and **Nominatim** (OpenStreetMap's place search) for searches
  and "what's here?" lookups — only the search text or tapped position is
  sent, never ratings, comments, tags or your token. No analytics, no
  tracking.

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

- **List**: one row per restaurant with its latest rating, in **Rated**
  and **Wishlist** (places you haven't been to yet). Sort, filter by tag,
  search by name, or show possible duplicates. Tick rows to delete or
  merge them, or to add/remove tags on all of them at once (**Tags…**).
- Tap a row for the **restaurant page**: all visits, a rating-over-time
  chart, location, two Google Maps buttons (by address, and by the link
  saved from an import — to compare them), and **Edit restaurant**
  (name, tags, note, archive, delete).
- **Map**: your restaurants as dots in their tag colours (solid = rated,
  ring = wishlist); filter by stars and tags. Search a place or paste an
  address (e.g. from Google Maps), or tap the map, to add one.
  **Find locations…** looks up restaurants that have no location yet
  (e.g. after an import) by name in an area you name, like "Berlin" — it
  only places them automatically when the match is unambiguous.
- **New**: name, location ("Set location on map"), tags, note, then a
  rating (the meaning of each star is shown) or "haven't been yet". If it
  looks like a restaurant you already have, the app offers to add the
  visit there instead.
- **Settings**: data repo and token; **Archive** (show closed
  restaurants as a third list); **Tags** (rename or delete a tag
  everywhere); **History** (every save is a version — bring back deleted
  restaurants, or restore a whole older state).
- **Import/Export**: import a Google Maps list (Google Takeout CSV); below
  it, **Download CSV** of everything, one row per visit.
- **↻** reloads the data and checks for a new app version.

## Local development

No build step needed. From the project folder:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

## Project structure

Plain HTML/CSS/JavaScript, split into ES modules under `js/`:

- `api.js` – GitHub API access (read/write, history)
- `data.js` – the data document (restaurants + visits) and all changes to it
- `render.js` – list rendering, stars, tag pickers and chips
- `sort.js` – list sorting and the map filter
- `csv.js` – CSV export
- `maps.js` – Google Maps link handling and validation
- `history.js` – the restaurant page (visits, rating chart, edit forms)
- `settings.js` – local (localStorage) runtime settings
- `googleImport.js` – Google Takeout CSV import
- `duplicates.js` – duplicate detection (same Google place / similar name)
- `tagColors.js` – one distinct colour per tag (computed, not stored)
- `tagTools.js` – renaming/deleting tags and the bulk tag panel
- `mapView.js` – the Map tab (Leaflet + OpenStreetMap tiles)
- `geo.js` – place search / lookup of a tapped spot (Nominatim)
- `locate.js`, `locateView.js` – "Find locations" for restaurants without one
- `restoreView.js` – Settings → History (bring back deleted restaurants)
- `app.js` – wires the modules together, event handling, entry point

See `CLAUDE.md` for the full project context, data model, and the
principles this app is built to follow (privacy, security, extensibility).
