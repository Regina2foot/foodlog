# Foodlog – Project Context

This file describes the goal, architecture, and tasks for this project.
Claude Code should use this file as a starting point and ask when something
is unclear rather than guess.

**Language: English.** This project uses English as its standard language
throughout — code, comments, commit messages, the app's user-facing
text/UI, and communication with Claude Code should all be in English.

## 1. Goal

**Foodlog** is a small web app to rate restaurants (0–5 stars, comment)
and keep a wishlist of places to try, sortable and filterable, with a map
(OpenStreetMap) and links to Google Maps. Currently just for me (in real
use since 2026-10-25); later up to about 10 friends should be able to add
their own ratings and see everyone's ratings (Section 10). Runs entirely in the browser with no installation. I
want to try the app out myself first and then gradually add more features
— the app should therefore be built from the start so that's easy to do
(see Section 6).

## 2. Important working principles for Claude Code

**These points apply to the whole project and outweigh convenience or
speed:**

### 2.1 Ask rather than decide on your own

For anything with more than one sensible approach, or that isn't clearly
spelled out in this file, please **ask first instead of assuming**. This
applies especially to:

- Architecture or structural changes compared to what's defined here
- Choosing a new library, framework, or external service (even something
  that seems small, e.g. an icon library or a CDN script)
- Anything related to privacy, security, tokens, or access rights (see
  Sections 3 and 4)
- UI/UX decisions where there are several plausible options
- Changes to the data schema (`foodlog.json` structure, Section 8)
- Anything that could overwrite or delete existing data
- Larger restructuring of existing core logic (see Section 6)

Better one extra clarifying question than a silent assumption that's hard
to undo later.

### 2.2 Privacy and security take priority

Privacy and security matter a lot to me — both in the finished app and
already during development with Claude Code. Details in Sections 3 and 4.
When in doubt: choose the more cautious option and ask if unclear.

### 2.3 Version control: commit after each milestone

Development should be traceable via Git/GitHub. So: after finishing each
milestone or improvement (or any self-contained, working intermediate
step), make a commit with a meaningful message. Don't commit in the middle
of a half-finished state. The commit message rules from Section 3.2 (no
personal/real data in the message) still apply.

**Always ask for explicit permission before every push, with no
exceptions** — commits can stay local until then. This applies every
single time, not just the first push or when something seems risky.

### 2.4 Manual testing

When a change would benefit from being tried out in a real browser (any
UI change, or anything where automated checks can't confirm the feature
actually works) — stop and ask me to test it manually, rather than just
asserting it works. Say what to check and interrupt for my confirmation
before considering the step done.

## 3. Privacy principles

### 3.1 In the app

- No analytics, tracking, or advertising scripts of any kind
- No communication with external services other than the ones listed
  here (no Sentry, no error-tracking service, no third-party CDNs that
  could collect usage data). Allowed, each approved explicitly (2026-10):
  - **GitHub API** — reading/writing the data file (Section 5)
  - **OpenStreetMap tiles** (`tile.openstreetmap.org`) — map images for
    the Map tab. OSM sees the viewer's IP address and which map area is
    being viewed. Must follow the OSM tile usage policy (attribution
    shown, no bulk downloading/prefetching)
  - **Nominatim** (`nominatim.openstreetmap.org`) — place search and
    reverse lookup. Sends the typed search text (incl. pasted addresses),
    or a restaurant's name searched inside the area typed into Find
    locations, or a tapped map position. Never sends ratings, comments,
    tags or the token. Must follow the Nominatim
    usage policy: at most 1 request per second, no automatic searching
    while typing, results not re-requested unnecessarily
- The app's own site (GitHub Pages, same origin) is also contacted, e.g.
  for the update check (Section 9.14) — not an external service
- The personal GitHub token is stored only locally in the browser
  (`localStorage`), never transmitted anywhere else, and never displayed
  in plain text anywhere (except in its own input field while typing it)
- The app gets a feature to remove the locally stored token again ("sign
  out"/"remove token")
- No hardcoded sample data with real personal ratings in the public app
  repo — if sample data is needed for testing, only use obviously fake
  placeholders
- The data repo's owner/name must never be hardcoded in the public app
  repo's source code — it's a runtime setting the user enters in the
  browser (see Section 9.13), stored only locally. Hardcoding it would
  publicly reveal which account owns the private data repo, which can
  defeat the point of using separate accounts for the app repo and the
  data repo (see Section 5)

### 3.2 When coding with Claude Code

- The real token value must never appear in code, comments, commit
  messages, log output, or chat responses — not even for testing purposes
- The same applies to the real data-repo owner/name if it comes up during
  development: never write it into code, comments, commit messages, or as
  a pre-filled default in the settings fields (see Section 3.1)
- When debugging API calls: redact/omit the `Authorization` header in any
  output, never show it in full
- Don't commit `.env` files or config files with real credentials; if such
  a file is needed for local testing, it belongs in `.gitignore`
- Before adding any new external library, CDN link, or additional
  service: ask first (see Section 2.1) — especially if it would send data
  to another provider
- Commit messages should not contain real restaurant rating content or
  other personal data, only technical descriptions of the code change

## 4. Security (app & development)

As a general rule: no malware, obfuscated code, or code from an
unclear/unverified source may ever end up in this project. When in doubt,
always ask (Section 2.1), never just accept it.

### 4.1 In the app

- Always render user input (name, comment, tags) safely when displaying
  it (e.g. via `textContent`, not `innerHTML`) to prevent cross-site
  scripting (XSS) — relevant as soon as multiple people contribute entries
- Before opening a stored Google Maps link, check that it's actually an
  `http://` or `https://` URL; reject other schemes (e.g. `javascript:`)
- No `eval()` or similar execution of data as code
- Don't include external scripts/libraries that haven't been explicitly
  agreed on beforehand; if a library is ever needed, only use established,
  official sources with a fixed version number
- **Leaflet** (map library) is approved (2026-10). It's copied into the
  repo (`vendor/leaflet/`) at one pinned version, and the files' checksums
  are verified against the official published ones before committing —
  never loaded from a CDN at runtime. Upgrading means repeating that check
- Tokens get only the minimum necessary permissions (see fine-grained PAT
  in Section 5, scoped to exactly one repo)

### 4.2 When working with Claude Code

- Never run or adopt code, scripts, or install commands from untrusted or
  unverified sources
- Before adding any new dependency: check the name and source carefully
  (look-alike package names/"typosquatting" are a real risk), even though
  this project isn't really expected to use npm packages
- Briefly review changes Claude Code proposes before accepting them,
  especially for network access, file writes, or commands to be run
- If a GitHub Action is ever added (none is planned — the backup Action
  was dropped, Section 11.1): only use official/verified actions with a
  pinned version number or commit hash, no unverified third-party actions

## 5. Architecture (deliberate decision — please don't change without checking first)

**Two separate GitHub repos:**

1. **App repo** (public) — contains only the code (HTML/CSS/JS), hosted
   for free via GitHub Pages. Public because GitHub Pages on the free plan
   only works with public repos. Not a problem, since no personal data
   lives here.
2. **Data repo** (private) — contains only a JSON file with the ratings.
   Private so the ratings aren't publicly visible. Access only for
   invited collaborators (me, and later friends).

**No own server, no build step.** The app is plain HTML/CSS/JavaScript
(vanilla JS, no framework, no npm build), so it works directly from the
repo with no toolchain. Reading/writing ratings happens at runtime in the
browser via the **GitHub REST API (Contents API)** against the private
data repo.

**Auth:** Each person (including me) creates their own **fine-grained
Personal Access Token (PAT)**, scoped to exactly the data repo, with
"Contents: Read and write" permission. The token is stored only locally in
that person's browser (`localStorage`) — it never ends up in the code or
in the repo.

**Backup:** Every change to the data file is a Git commit in the private
data repo → complete, free version history as a backup, with no extra
infrastructure. The app can read it back: Settings → History brings back
deleted restaurants or a whole older version (Section 9.13).

**Repo ownership across accounts:** If you use separate GitHub accounts
for development vs. personal use, the app repo can be owned by a
development-only account (it's public, so keeping your main identity off
its commit history is a reasonable privacy choice). The data repo is
private and therefore has no public exposure either way, so it should be
owned directly by whichever account will actually use the app. This isn't
just a preference: fine-grained personal access tokens currently cannot
access a repository where the token's account is only an invited
collaborator rather than the owner (or an organization member — see
Section 10) — so the account generating the data-repo token must own that
repo directly.

## 6. Extensibility & code structure

I want to try out the app first and then likely add more features. The
code should therefore be structured from the start so that later
extensions are easy, rather than requiring larger rewrites.

- **Several small, clearly separated JS files instead of one large file**
  — via native ES modules (`<script type="module">`, `import`/`export`).
  Works directly in the browser, no build tool needed, so it fits the
  constraint from Section 5. Suggested split:
  - `api.js` — GitHub API access (read/write/conflict handling)
  - `data.js` — the data document (restaurants + visits, Section 8) and
    all changes to it, as pure functions
  - `render.js` — list rendering, stars/star picker (with rating
    meanings), tag pickers and chips, status line
  - `sort.js` — list sorting and the map filter rule
  - `csv.js` — CSV export (Section 9.12)
  - `maps.js` — Google Maps link handling and validation (Section 9.4)
  - `history.js` — the restaurant page: header, Google Maps buttons,
    edit forms, visit cards and the rating-over-time chart (plain SVG,
    no charting library) — not the History in Settings
  - `duplicates.js` — place-ID extraction and name matching for duplicate
    detection (Section 9.8)
  - `tagColors.js` — distinct per-tag colours (Section 9.9)
  - `tagTools.js` — Settings "Tags" list (rename/delete) and the bulk
    "Tags…" panel (Section 9.9); the data changes are in `data.js`
  - `mapView.js` — the Map tab (Leaflet + OSM tiles, Section 9.5); not to
    be confused with `maps.js` (Google link handling)
  - `geo.js` — place search / "what's here?" lookups via Nominatim,
    rate-limited and cached, plus the address fallbacks (Section 9.6)
  - `locate.js`, `locateView.js` — "Find locations": matching logic (no
    DOM) and the Map-tab panel (Section 9.7)
  - `restoreView.js` — Settings → History (Section 9.13)
  - `googleImport.js` — Google Takeout CSV import (Section 9.11)
  - `settings.js` — local settings (`localStorage`) and data-repo input
    parsing (Section 9.13)
  - `app.js` — wires the modules together, event handling, saving with
    conflict retry, navigation, entry point
- **Prefer small, "pure" functions** (input → output, no hidden side
  effects), especially for sorting, validation, and CSV logic. This keeps
  them easy to follow individually even without a test framework, and
  testable later if needed.
- **Data schema robust to new fields**: when reading/rendering, never
  assume a field exists; use sensible defaults (e.g. treat a missing
  `tags` as an empty array). This way, new optional fields can be added
  later without breaking existing entries.
- **Build new features additively wherever possible** (new file/function)
  rather than fundamentally restructuring existing core logic. For larger
  changes to existing core logic: ask first (Section 2.1).

## 7. Manual setup steps (I do these myself on github.com beforehand, not Claude Code)

- [x] Create the public repo for the app code (`foodlog`)
- [x] Enable GitHub Pages on the app repo (Settings → Pages → Source: main
      branch, folder: / (root))
- [x] Create the private repo for the data (`foodlog-data`) — owned by the
      account used to actually use the app, not the development-only
      account (see Section 5)
- [x] In the data repo, create a file `ratings.json` with content `[]`
      (no longer needed: the app creates `foodlog.json` itself on the
      first save, Section 8)
- [x] Generate a fine-grained PAT: Repository access limited to
      `foodlog-data`, Permissions → Contents: Read and write. Saved
      securely (not in this repo, not shared with Claude Code)
- [ ] (Phase 2) Give friends access to the data repo; each person
      generates their own token — how exactly depends on the open
      question in Section 10
- [x] **Transfer the existing Google Maps list**: superseded — this is now
      a permanent in-app feature (Import/Export tab), not a one-off
      script. See Section 9.11.

**Note for Claude Code**: this checklist is for me to work through
directly on github.com — you don't do any of it, and you don't need the
final results reported back to you either (the actual repo names, my
GitHub username, or the token). You only need to know that these things
exist and how the app should use them at runtime (Sections 3, 8, 9).

## 8. Data model

**Why restaurants + visits (redesign v2, 2026-10).** The first version
stored one object per visit in `ratings.json` and identified a restaurant
by its Google Maps link. That caused most of the complexity (grouping by
exact link, a `restaurant_id` override for merges, place-ID tricks, short
links that can't be compared) and gave no coordinates for a map —
Google's exports carry none either. So restaurants and visits are
separate, restaurants have a location, and the Google link is only an
optional extra. There was **no migration**: v2 started with an empty
`foodlog.json` and the data came back by re-importing the Google lists.
The old `ratings.json` may still sit in the data repo; the app never
reads, changes or deletes it.

File `foodlog.json` in the data repo (created by the app on the first
save):

```json
{
  "version": 2,
  "restaurants": [
    {
      "id": "1a2b3c4d",
      "name": "Trattoria Milano",
      "lat": 52.5123, "lng": 13.4567,
      "address": "Musterstraße 1, Berlin",
      "google_maps_url": "https://maps.app.goo.gl/xyz123",
      "osm": "node/123456789",
      "tags": ["Italian", "Date night"],
      "note": "Recommended by a friend",
      "not_same_as": ["9z8y7x6w"],
      "archived_at": null,
      "created_by": "github-username",
      "created_at": "2026-09-20T18:32:00Z"
    }
  ],
  "visits": [
    {
      "id": "a1b2c3d4",
      "restaurant_id": "1a2b3c4d",
      "rating": 4,
      "comment": "Great pasta, loud on weekends",
      "visited_at": "2026-09-20",
      "created_by": "github-username",
      "created_at": "2026-09-20T18:32:00Z"
    }
  ]
}
```

**Restaurant** — only `id` and `name` are required:
- `id`: 8 hex characters (`generateId`, from `crypto.randomUUID`); never
  changes, not even on merge
- `lat`/`lng`: numbers, absent/null until the place is located
- `address`: free text — Nominatim's formatted address when the location
  came from a search or map tap
- `osm`: OpenStreetMap reference like `node/123`, only set when the
  location came from a *venue* (restaurant/café/bar/shop…), never from a
  building or address point (Section 9.6)
- `google_maps_url`: only from the Google import (there's no form field
  for it), stored exactly as it came; must pass the http(s) check before
  being opened (Section 4.1)
- `tags`: free-form, several per restaurant; describe the restaurant
  (cuisine, occasion, the list it came from such as "Gregors
  recommendations"). Tags double as categories — there's deliberately no
  separate category field
- `note`: free text about the restaurant itself (e.g. who recommended it),
  as opposed to a visit's comment
- `not_same_as`: restaurant ids the user said are different places (Not
  the same / Save separately / Different in the import review); such pairs
  are never suggested as duplicates again
- `archived_at`: `YYYY-MM-DD` when archived as closed (Section 9.10);
  null/absent = not archived
- `created_by`: the GitHub login of the token's account (`GET /user`)

**Visit**:
- `restaurant_id`: the restaurant it belongs to
- `rating`: whole number 0–5, required — one overall rating, meanings in
  Section 13. A 0 is a real rating ("no recommendation"), not "unrated"
- `comment`, `visited_at` (`YYYY-MM-DD`), `created_by`, `created_at`

**Derived, never stored**: a restaurant with no visits is on the
**Wishlist**; with at least one it's **Rated**, and its latest visit
(newest `visited_at`, then `created_at`) is what the list and map show
(`buildRestaurantViews` in `data.js`, which also adds `isWishlist`,
`isArchived`, `latest`, `visits` newest first).

**Rules**:
- Every change is a pure function in `data.js` returning a new document
  (so a write conflict can re-apply it to fresh data, Section 9.15)
- Robust to missing/unknown fields (Section 6): `normalizeDoc` tolerates
  odd files; unknown fields are kept untouched. Leftovers from earlier
  versions — `price_level` on visits, a few `not_on_osm_at` on
  restaurants — are simply ignored
- Schema changes are additive only, and now that the app is in real use
  (since 2026-10-25) they need a question first (Section 2.1)
- **Merge** (`mergeRestaurants`): the restaurant with the most visits
  (then the oldest) is kept; the others' visits move onto it; tags are
  united, notes joined, location/address/osm/link filled in where the kept
  one has none; `not_same_as` references to the removed ones are pointed
  at the kept one; then the others are deleted
- **Delete** removes a restaurant together with all its visits

## 9. Features (the app as built)

### 9.1 Layout and navigation

- The phone is the main use case; the same layout works on a laptop (page
  capped at 900px wide). Everything must fit a ~360px-wide screen without
  sideways scrolling; don't block zooming to "fix" overflow — make content
  fit instead
- Header: logo and a ↻ refresh icon (inline SVG, no icon library).
  Tabs, one screen at a time: **List** (start tab) · **Map** · **New** ·
  **Settings** · **Import/Export**. A status line under the tab bar is
  visible on every tab; an update banner appears there when needed (9.14)
- **Phone back button**: the list is the "home" history entry; opening a
  restaurant or another tab adds exactly one entry (further navigation
  replaces it), so back returns to the list, and back from the list leaves
  the app. In-app "back to list" actions use `history.back()` so history
  stays in step
- Installable on a phone's home screen (`manifest.json`, icons; no service
  worker — see Section 13)

### 9.2 List

- View switch **Rated / Wishlist**, plus **Archived** only when enabled in
  Settings (9.10). Rated = has visits, Wishlist = none; archived ones are
  only in their own view
- Columns (fixed widths for the small ones, so the name gets the rest):
  Rated and Archived — select, name, rating (all 5 stars, filled up to
  the rating), tags (coloured dots, max 3 + "+N"), "Last edit" (latest
  visit's date), and on screens ≥640px the latest comment (or the
  restaurant's note). Wishlist — select, name, tags, "Added" (created_at)
- Sorting per view, each remembered while the app is open: Rated by
  rating (default, best first) / name / date; Wishlist by name (default
  A→Z) / date added; Archived by name (default) / rating / date
- **Tag filter**: a row of chips (one tag at a time, only tags in the
  current view); the chips double as the colour legend
- **Name search** above the list: filters by restaurant name while typing,
  ignoring case and accents; Enter just closes the keyboard
- **"Show possible duplicates"** switch: only suspected duplicates, across
  Rated and Wishlist (and Archived), grouped next to each other (9.8)
- **Bulk actions** on ticked rows (checkbox per row + "select all
  visible"; the selection clears whenever the visible set changes):
  **Tags… (n)** (9.9), **Merge selected** (2+, confirmation),
  **Not the same** (2+, only in the duplicates view; remembers them as
  different), **Delete selected** (confirmation; restaurants *and* all
  their visits). Each is one write / one commit
- Tapping a row opens the restaurant page (9.4) inside the List tab

### 9.3 New restaurant (New tab)

- Fields: **Name** (required); location line ("No location yet" /
  "📍 address") with **Set location on map** (map pick mode, search
  pre-filled with the name; paste an address there if needed, 9.6) and
  **Remove location**; **Tags** (checkbox picker of existing tags + a
  small "+ New tag" button that opens a text box); **Note about this
  place**; **"Haven't been yet (add to wishlist)"** — when unticked:
  **Rating** (star picker, the meaning shown underneath, e.g. "3 – Very
  good", Section 13), **Comment on this visit**, **Visit date** (default
  today)
- No Google Maps link field and no address field (both removed 2026-10:
  locations come from the map, Google links only from the import)
- Saving creates the restaurant (+ its first visit unless wishlist). If it
  looks like an existing restaurant (9.8), a warning appears first, saying
  which list the match is in (Rated/Wishlist/Archived) and why (same
  place / similar name, same spot / similar name), with up to 3 matches:
  **Add as another visit to "X"** (or, for a wishlist entry, **It's "X" —
  keep that one**, which brings tags/note over), **Save separately**
  (remembered via `not_same_as`), **Cancel**
- Opening the New form from the map ("Add as new restaurant") pre-fills
  the name (if the spot is a named venue) and the location

### 9.4 Restaurant page

- Opened from a list row or a map popup; "← Back to list" at the top
- Header: name; "Archived (closed) since …" note if archived; tag chips;
  note; location line ("📍 address" / "Location set" / "No location yet")
  with **Show on map** (located and not archived; centres the map on its
  marker and opens its popup, clearing map filters that would hide it) and
  **Set location** / **Change location** (map pick mode, 9.6)
- **Two Google Maps buttons**, so they can be compared
  (`googleMapsLinksFor` in `maps.js`): **Google Maps (address)** — a
  Google Maps search for name + address; without an address it uses the
  coordinates or just the name, and the label says "(position)" /
  "(name)". **Google Maps (saved link)** — only when a safe
  `google_maps_url` is stored (from the import). Both just open a link;
  the app never calls a Google service
- **Edit restaurant**: name, tags, note; **Save** / **Cancel** /
  **Archive (closed)** or **Unarchive (open again)** (no confirmation,
  9.10) / **Delete restaurant** (confirmation; deletes its visits too)
- Rating-over-time chart (hand-rolled SVG: 0–5★ axis, visit dates, only
  when there are visits)
- Visits, newest first, one two-line card each (date, stars, Edit/Delete;
  then the comment). **Add visit** / **Edit** opens a visit form: rating
  (with meaning), comment, visit date. Delete asks first

### 9.5 Map tab

- Leaflet 1.9.4 (vendored, Section 4.1) with OpenStreetMap tiles and
  attribution. Zooms to fit all markers the first time it's shown; after
  that the view stays where the user left it
- Top to bottom: pick-mode banner (9.6), search bar + result list (9.6),
  summary line ("All N restaurants are on the map" / "x of N have a
  location…" / "x of N match the filter…"), the Find locations panel
  (9.7), filters, the map, legend ("Rated · Wishlist · colours = tags ·
  Tap the map to add a place there")
- **Markers** (`mapView.js`): one per located, non-archived restaurant
  that passes the filter — a small **pie in the colours of all its tags**
  (same order as the list's tag dots; grey without tags); rated = solid,
  wishlist = ring with a white middle (`L.divIcon` + CSS
  `conic-gradient`; colours are computed values, never user text). Tap →
  popup: name, stars, tag dots, **Open** (→ restaurant page). Tapping a
  marker never triggers a map-tap lookup
- **Filters** (kept while the app is open; `matchesMapFilter` in
  `sort.js`), two horizontally scrolling chip rows: rating chips **All ·
  5★ · 4★ · 3★ · 2★ · 1★ · 0★ · Wishlist** — any combination, judged by
  the latest visit, "All" = no rating filter; tag chips — several at once
  (a restaurant shows if it has any of them), "All tags" clears. Archived
  restaurants never appear on the map

### 9.6 Places and locations (Nominatim, `geo.js`)

- All Nominatim traffic goes through `geo.js`: requests are serialized and
  spaced ≥1.1 s apart, identical requests are answered from memory (per
  app session), searches only run on submit, never while typing
- **Map search bar**: results as a list under the bar and as grey
  markers, at most 8. **Biased toward the area visible on the map** but
  not limited to it, so places anywhere in the world can be found (pan
  there, or add the city). No fixed search-area setting
- **Pasted addresses** in the search bar (e.g. from Google Maps; Google's
  full share text "name / address / link" works too). For text with a
  number in it, simpler versions are tried in turn when the full text
  finds nothing precise (`searchVariants` / `searchWithFallbacks`):
  1. as pasted, minus link lines, Plus Codes, "〒", line breaks
  2. cleaned: district additions dropped ("12045 Berlin-Bezirk Neukölln"
     → "12045 Berlin"), floor/suite parts dropped, house-number ranges
     cut ("21-24" → "21"; postal codes like "100-8111" untouched),
     Italian province codes dropped ("Roma RM" → "Roma"), a lone house
     number joined to its street ("Piazza del Colosseo, 1")
  3. without a leading name/building part (a first part without digits)
  4. street + postal code, 5. street + city
  Never a city alone (every version keeps a number), so a bad address says
  "not found" instead of landing in the town centre. A result that's only
  a street/area (`highway`, or `place`/`boundary` other than `house`)
  counts as vague: later versions are tried first, and if nothing better
  turns up it's shown with "check the position". Place names (no digits)
  are only searched as typed. Checked live with landmark addresses in
  Berlin, Rome, Amsterdam, Washington and Tokyo. A Plus Code alone can't
  be looked up (would need decoding) — tap the map instead
- Search results keep a name and `osm` reference only if they're a venue
  (OSM category amenity/shop/tourism/leisure): a building or address
  point isn't the restaurant, and two restaurants in one building must not
  look like the same place
- **Tapping the map** (not a marker): reverse lookup of that spot. Only if
  the nearest object is a venue are its name, `osm` and exact coordinates
  used; otherwise only the address, with the tapped coordinates and no
  name (a street name would be a wrong restaurant name)
- Choosing a result or tapping shows a red candidate marker with a popup
  whose button depends on the mode: **Add as new restaurant** (normal) →
  New form pre-filled; **Use this location** (picking for the New form);
  **Use as location of "X"** (picking for a restaurant — saves lat/lng,
  address and osm, then returns to its page, or stays on the map when it
  came from Find locations)
- **Pick mode** shows a banner "Choose the location of …" with Cancel;
  leaving the Map tab ends it
- The Google import takes coordinates from long Google links when present
  (`!3d…!4d…` preferred, else `@lat,lng`) — offline, no service involved

### 9.7 Find locations (`locate.js` logic, `locateView.js` panel)

- For restaurants without a location — mostly right after an import,
  since Google exports carry no coordinates. A button under the map's
  summary line: "Find locations for N restaurant(s)…"; archived ones are
  never included
- Setup asks **where these places are** (free text, e.g. "Berlin",
  "Tokyo"; the last value is suggested, `localStorage`
  `foodlog_locate_area`, never hardcoded) and **which restaurants** (all
  without a location, or one tag, e.g. one imported list). The area is
  looked up once (`findArea`, its bounding box); then each restaurant,
  sorted by name, is searched **only inside that box** (`bounded=1`)
- Searches tried in turn (`searchPlan`): the name as stored; the part
  before " - ", "(", ","; without generic words ("Melt Cafe Creperie" →
  "Melt Creperie"); compound words split at the area's name or a common
  food word ("Berlinburger" → "Berlin burger"); dropping words from the
  end one at a time ("Burgermeister Schlesisches Tor" → … →
  "Burgermeister")
- **Careful by design — never guesses** (a wrong automatic location is
  worse than none):
  - a result only counts if it's a *venue* whose name agrees with the
    full name (`namesAgree`: equal ignoring spaces, or `namesMatch` from
    duplicate detection)
  - exactly one such venue → accepted; several (a chain) → never chosen
    automatically
  - if words were dropped, they're looked up as a place in the area; if
    they are one, only a match *there* counts (within 800 m of a
    station/street/building, or inside a district's bounds), with one
    extra search limited to that spot because a chain can have more
    branches than one search returns. If they aren't a place
    ("Stammhaus"), a match is accepted only if it's the only one in the
    area and the name hasn't already shown up as a chain
  - checked live in Berlin: Melt Cafe Creperie → "MELT Crêperie",
    Berlinburger International → "Berlin Burger International",
    Burgermeister Schlesisches Tor → the branch at the station (of 8+)
- Accepted matches are saved in batches of 20 (one commit each, plus the
  rest at the end or on Stop), never overwriting a location set meanwhile
- Everything else goes to the **review list** ("n possible matches" or
  "not found in …", up to 5 candidates): tap a candidate (saved right
  away), **Choose on map** (pick mode with the candidates as grey markers;
  returns to the Map tab), **Open entry** (its page, e.g. to delete or
  archive a place that can't be found), **Skip**. A restaurant OSM doesn't
  know by name can still be placed via Choose on map by pasting its
  address (a "Not on OSM" mark was tried and dropped, 2026-10)
- Progress "Checking i of n: name", counters, **Stop** any time; **Run
  again** continues with what's left (located ones drop out; skipped ones
  only come back with a different area or after reopening the app; ones
  still in the review list aren't searched twice). A failed search
  (offline, service refusing) stops the run with a message. Unfound
  restaurants take up to ~8 searches, i.e. several seconds each

### 9.8 Duplicate detection (`duplicates.js`, pure functions)

- Three strengths, strongest first:
  - **same place**: identical Google link, the same Google place ID in two
    different long links (`!1s0x…:0x…`, `ftid=`, `?cid=` — all normalized
    to the CID), or the same `osm` reference. Reliable
  - **similar name, same spot**: similar name and within 60 m
  - **similar name**: compares the important words, ignoring case,
    accents, punctuation, apostrophes and generic words (Restaurant, Café,
    Bar, Pizzeria, Trattoria, articles…): every important word of the
    shorter name must appear in the other, in any order, with a small typo
    tolerated in longer words (1 edit from 5 letters, 2 from 8); fewer
    than 4 important letters never match. Only a hint
- Never a match: both have Google place IDs (or both `osm`) that differ;
  more than 300 m apart; pairs marked different (`not_same_as`)
- Short share links (`maps.app.goo.gl/…`) carry no place ID and can't be
  resolved without contacting Google, so they only match by name
- Used on create (9.3), in the import (9.11) and in the "Show possible
  duplicates" list view (9.2). Nothing is ever merged automatically

### 9.9 Tags

- **Colours** (`tagColors.js`): computed, not stored — tags are numbered
  by first appearance (earliest `created_at` of a restaurant carrying
  them, then by name) and spread around the colour wheel by the golden
  angle plus a 3-step lightness cycle, so no two tags share a colour and
  it's the same on every device. Deleting every early restaurant of a tag
  can renumber tags and shift colours. Used for list dots, filter chips,
  map pies, detail chips and the pickers
- **Tag picker** (New form, Edit restaurant): checkboxes of all existing
  tags plus "+ New tag"
- **Bulk "Tags… (n)"** on ticked rows: every tag with a checkbox showing
  whether all (checked), some (dash, "n of m") or none of the ticked
  restaurants have it; tapping cycles all → none → back to "some" (= leave
  as is, only for tags that started that way); "+ New tag" adds one as
  "all". Apply writes only the changed tags in one commit; changing the
  selection closes the panel
- **Settings → Tags**: every tag with colour and restaurant count,
  **Rename** and **Delete**. Renaming to an existing tag merges the two
  (confirmation first). Delete removes the tag everywhere, never the
  restaurants. The list's tag filter, the map's tag filter and the New
  form's selection follow the change. A renamed tag keeps its colour,
  except when it first appeared together with another tag (same
  `created_at`, e.g. one import) — then ties are ordered by name

### 9.10 Archive (closed restaurants)

- Restaurant page → Edit restaurant → **Archive (closed)** sets
  `archived_at` (no confirmation — **Unarchive (open again)** undoes it)
- Archived restaurants keep all their visits but leave Rated/Wishlist, the
  map and Find locations; their page says "Archived (closed) since …"
- Deliberately low-key: only when **Settings → Archive → "Show archived
  (closed) restaurants as a third list"** is ticked (`localStorage`
  `foodlog_show_archived`, off by default) does the List get the
  **Archived** view
- Duplicate detection still includes them (warnings say "in your Archived
  list"), so a closed place isn't re-added by accident

### 9.11 Import from Google Maps (`googleImport.js`)

- Google offers no API for saved lists, so the import takes a Google
  Takeout "Saved" export: one CSV per Maps list, picked in the
  Import/Export tab (step-by-step instructions shown there). Parsed
  entirely in the browser
- Handles both delimiters (";" and ","), German or English headers
  (`Titel/Notiz/URL/Tags/Kommentar` vs. `Title/Note/URL/Tags/Comment`)
  and a non-UTF-8 file (falls back to Mac OS Roman)
- A place's Note is parsed for a leading `N/10` rating → stars: 0–5/10 →
  0, 6/10 → 1 … 10/10 → 5 (not a halving scale). With a rating it becomes
  a restaurant **plus a visit** whose comment is the note kept verbatim
  (incl. "N/10") plus the Comment column; `visited_at` = the import date
  (the export has no visit date). Without a rating it becomes a
  **wishlist** restaurant with the note as its `note`
- The file's Tags column and the optional **"Tag these imports with"**
  field go onto every restaurant (auto-filled from the file name minus
  `.csv`, editable) — the category mechanism, e.g. "Gregors
  recommendations" for a friend's list
- Places already present as the *same place* (identical link or Google
  place ID) are skipped. Places that match an existing restaurant
  otherwise go through a **review** before anything is saved: one question
  each, "Same as …" (per candidate, with its list) or "Different"; all
  must be answered. "Same": the existing restaurant gets the imported link
  (if it had none), missing coordinates, the tags, the note (if it had
  none), and the visit if the place carried a rating. "Different": a new
  restaurant, remembered via `not_same_as`
- One confirmation and one write per import
- Exporting *to* a Google Maps list isn't possible: Google has no public
  API to create or fill a "List" (researched 2026-10; only unofficial
  scrapers exist, which would send data to a third party — Section 3.1)

### 9.12 CSV export

- Import/Export tab → **Download CSV**: everything loaded, built in the
  browser, nothing sent anywhere. One row per visit with the restaurant's
  fields; one row per wishlist restaurant with empty visit columns.
  Columns: restaurant, address, lat, lng, google_maps_url, tags (";"-
  separated), note, visited_at, rating, comment, created_by

### 9.13 Settings, History and restore

- **Data repo** (one field accepting `owner/repo`, a GitHub page link or a
  clone URL — `parseRepoInput`; unparseable input is rejected; stored as
  separate owner/repo values) and **Personal access token**; both trimmed,
  stored only in this browser (`foodlog_owner`, `foodlog_repo`,
  `foodlog_token`), with a note saying so. **Remove token** clears it. A
  401 shows "token rejected — paste it again". A missing data *repo* is an
  error (so a typo never looks like an empty list); a missing *file* is a
  normal fresh start. The app version is shown at the bottom
- **Archive** checkbox (9.10) and **Tags** (9.9)
- **History** (`restoreView.js`): every save is a commit in the data repo.
  "Show recent saves" lists them (date, commit message; 30 per page,
  "Show older saves"; `GET …/commits?path=foodlog.json`). Each has
  **"Before this save…"**, which reads the file at the parent commit
  (`GET …/contents/foodlog.json?ref=<sha>`) and lists restaurants that
  existed then but are gone now (`missingRestaurants`); tick → **Bring
  back ticked** re-adds them with their visits from then
  (`restoreRestaurants`; anything that exists again is left alone; ones
  merged away since are labelled, as they'd come back without the moved
  visits). Nothing else changes. Last resort: **Restore everything to
  this state** (confirmation). Both are new saves, so they can be undone
  the same way. Not covered: bringing back a single deleted visit of a
  restaurant that still exists

### 9.14 Refresh and updates

- ↻ reloads the data from the repo (no automatic sync; a manual reload is
  enough). It — and app start — also fetches `js/app.js` from the app's
  own site (same origin, bypassing the cache) and compares its
  `APP_VERSION`; if the live one differs, a banner "A new version is
  available — Update now" appears. Update re-downloads every same-origin
  file the page loaded (from the Resource Timing API, so there's no file
  list to maintain) and reloads. Relies on the exact line
  `const APP_VERSION = "…";` in `app.js`

### 9.15 Saving and write conflicts

- Every write (`writeWithConflictRetry` in `app.js`): fetch the latest
  file and its `sha`, apply the change (a pure function, Section 8), PUT
  it with that `sha`. On a 409 conflict (someone else wrote in between),
  reload, re-apply and retry once
- Each write is one commit in the data repo with a short message written
  by the app (e.g. "Delete 3 restaurant(s)"); these messages may contain
  restaurant names, which is fine — the data repo is private

## 10. Phase 2 – multiple users (next, after a few days of real use)

**Open question to resolve before inviting anyone (not yet decided):**
fine-grained PATs cannot be used by a mere repository collaborator to
access a repo owned by someone else's personal account — each friend's
token would fail with the setup as originally planned (invite as
collaborator, generate a fine-grained PAT). Two possible fixes:
1. Move `foodlog-data` into a free GitHub Organization, and add each
   person as an organization member (not just a repository collaborator),
   scoped to just this one repo. Keeps the minimal-permission principle
   from Section 4.1, but adds an org to manage.
2. Use classic personal access tokens instead of fine-grained ones for
   data-repo access. No collaborator limitation, but classic tokens grant
   access to everything the account can see, not just this one repo —
   a real trade-off against Section 4.1's minimal-permission principle.

Decide between these before starting Phase 2; ask if unclear which to
pick (Section 2.1).

**Data file size — fix before (or early in) Phase 2.** The app reads
`foodlog.json` through the Contents API, which returns a file's content
only up to **1 MB**. A restaurant takes ~530 bytes, a visit ~270 bytes
(pretty-printed), so the limit is around 1,200 restaurants with as many
visits — quickly reached with ~10 people importing their lists. Planned
fix: when the Contents API returns the `sha` without content, read the
file via the Git Blobs API (`GET /repos/{owner}/{repo}/git/blobs/{sha}`,
up to 100 MB, same token and permission) — for both the current file and
History versions. Writing larger files through the Contents API still
has to be verified when building it. Beyond that, every load and save
transfers the whole file (a few MB is still fine on a phone) and more
people means more write conflicts (handled by the retry, Section 9.15).
Splitting the data into several files would be a larger architecture
change (ask first).

- Show who submitted a rating (`created_by`)
- **Show an average rating** when several people have rated the same
  restaurant — based on each person's most recent visit, not every
  historical visit, so a restaurant one person has rated many times isn't
  overweighted
- Possibly a filter: "only my ratings" / "all"
- Otherwise no structural changes needed — restaurants and visits are
  already shared objects with `created_by`

## 11. Decisions and ideas

### 11.1 Decided against (and why)

- **Automatic backup via a GitHub Action** (a weekly CSV snapshot in the
  data repo) — dropped 2026-10: every save is already a commit (full
  version history), Settings → History can bring back deleted
  restaurants, and a snapshot inside the same repo wouldn't protect
  against losing the repo or account anyway. An off-site copy is the
  occasional **Download CSV** (Section 9.12)
- **Price level** (€–€€€) — removed 2026-10: price is part of the single
  overall rating; anything worth saying goes in the comment
- **Separate category field** — tags double as categories
- **Google Maps link / address fields on the New form** — removed 2026-10;
  locations come from the map (address search, tap), Google links only
  from the import
- **"Not on OSM" mark** in Find locations — tried and dropped 2026-10;
  such places are placed via Choose on map + pasted address
- **Exporting to a Google Maps list** — impossible (Section 9.11)

### 11.2 Ideas, not planned yet

- A JSON backup download (and restoring from such a file) as a complete
  off-site copy — the CSV export can't be imported back
- Decoding Plus Codes ("GC5W+XX Berlin"), so they can be searched
- Bringing back a single deleted visit from History
- A nicely formatted plain-text export for sharing recommendations

## 12. Technical guidelines

- Plain HTML/CSS/JavaScript, no framework, no build tool; ES modules
  (Section 6); Leaflet as the only library (Section 4.1)
- Data access exclusively via the GitHub REST API on the data repo
  (`{owner}`/`{repo}` from the runtime settings, never hardcoded):
  - read: `GET /repos/{owner}/{repo}/contents/foodlog.json` (if 404:
    `GET /repos/{owner}/{repo}` to tell "no file yet" from "no repo")
  - write: `PUT /repos/{owner}/{repo}/contents/foodlog.json` (content
    base64-encoded UTF-8, with the current `sha`)
  - user: `GET /user`; history: `GET …/commits?path=foodlog.json`,
    `GET …/contents/foodlog.json?ref=<sha>`
  - no `X-GitHub-Api-Version` header: GitHub doesn't allow it in CORS
    preflights, so browsers would block the request
- Nominatim only through `geo.js` (rate limit, cache — Section 9.6);
  OSM tiles only through Leaflet's tile layer
- `localStorage` keys: `foodlog_owner`, `foodlog_repo`, `foodlog_token`,
  `foodlog_locate_area`, `foodlog_show_archived`
- Local testing: `python3 -m http.server` in the project folder (ES
  modules don't load from `file://`)
- **How Claude Code checks changes here** (no Node, no browser on this
  machine): JavaScriptCore's shell
  (`/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc`)
  — strip `import`/`export` lines, then `checkSyntax(file)` for every
  module, and run pure functions with small test scripts (`print`; async
  code works). It lacks `URL`/`URLSearchParams`/`fetch`, so tests add
  tiny stand-ins or fake `searchPlaces`. Also check that every
  `getElementById` id exists once in `index.html` and every imported name
  is exported. Visuals: render an HTML mock-up with the real CSS via
  `qlmanage -t`. Live Nominatim checks only with public landmark
  addresses/places, a few requests, ≥1.5 s apart, with a User-Agent.
  Anything in a real browser → ask the user to test (Section 2.4)

## 13. Assumptions and fixed choices (adjust here directly if needed)

- **Meaning of the stars** (shown under the star picker, `RATING_LABELS`
  in `render.js`, decided 2026-10): 0 no recommendation (everything
  between not good and disgusting), 1 okay, 2 good, 3 very good,
  4 excellent, 5 flawless. Lines up with the Google import's N/10
  conversion (≤5 → 0, 6 → 1 … 10 → 5)
- Stars are whole numbers (0–5), no half stars, and deliberately a single
  overall rating with no sub-dimensions; no price level
- The list always shows all 5 stars (filled up to the rating, the rest
  as grey outlines), so a real 0 reads differently from a wishlist place
- One JSON file as the "database" (Section 8), no file per entry
- A restaurant is identified by its `id`; the same place entered twice
  shows up as two restaurants until merged — duplicate detection flags
  this but never merges automatically
- Worldwide use: no fixed home area anywhere; searches use the visible
  map area as a hint, Find locations asks for an area per run
- The rating chart is hand-rolled SVG, not a charting library, to avoid a
  new dependency (Section 4.1)
- Repo names: `foodlog` (app, public) and `foodlog-data` (data, private)
- The app has a `manifest.json` and icons so it can be added to a phone's
  home screen (standalone display, no browser chrome). Deliberately no
  service worker (the app needs live network access anyway, so offline
  support isn't worth the complexity) — known trade-off: an installed
  home-screen icon can keep running a stale cached `app.js` after an
  update. The update banner (Section 9.14) usually handles it; if a
  home-screen install still misbehaves after a deploy, remove and re-add
  the icon before assuming new code is broken
- Phase 1 (just the user) has been in **real use since 2026-10-25**:
  existing data must be protected (Section 2.1)

## 14. Workflow for Claude Code

After each completed step: commit, then ask before pushing (see Section
2.3). Before every push that changes app code, bump `APP_VERSION` in
`js/app.js` (format `YYYY-MM-DD` + a letter, e.g. `2026-10-25l`; shown at
the bottom of Settings) — it's how we tell whether a device is still
running a cached older `app.js`. When a feature changes, update its
description in Sections 8–13 in the same commit, so this file always
describes the app as it is.

1. Whenever something is unclear, Section 2.1 applies: ask first, don't
   guess — this covers things like unclear repo names, GitHub username,
   token handling, but also any design or structural decision that isn't
   clearly defined here.
2. Phase 1 is built (v1 2026-09/10, redesign v2 with restaurants + visits
   and the map 2026-10, see Section 8). Next: improvements from real use,
   then Phase 2 (Section 10).
