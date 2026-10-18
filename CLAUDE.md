# Foodlog – Project Context

This file describes the goal, architecture, and tasks for this project.
Claude Code should use this file as a starting point and ask when something
is unclear rather than guess.

**Language: English.** This project uses English as its standard language
throughout — code, comments, commit messages, the app's user-facing
text/UI, and communication with Claude Code should all be in English.

## 1. Goal

**Foodlog** is a small web app to rate restaurants (0–5 stars, comment),
sortable by rating, with a map (OpenStreetMap) and optional Google Maps
links. Currently just for me; later up to
about 10 friends should be able to add their own ratings and see
everyone's ratings. Runs entirely in the browser with no installation. I
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
- Changes to the data schema (`foodlog.json` structure, Section 15.1)
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
milestone from Section 14 (or any self-contained, working intermediate
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
    reverse lookup. Sends the typed search text, or a restaurant's name
    plus the configured search area, or a tapped map position. Never
    sends ratings, comments, tags or the token. Must follow the Nominatim
    usage policy: at most 1 request per second, no automatic searching
    while typing, results not re-requested unnecessarily
- The app's own site (GitHub Pages, same origin) is also contacted, e.g.
  for the update check (Section 9) — not an external service
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
  browser (see Section 9), stored only locally. Hardcoding it would
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
- If the optional backup script (Section 11) is later implemented via
  GitHub Actions: only use official/verified actions with a pinned
  version number or commit hash, no unverified third-party actions

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
infrastructure.

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
  - `data.js` — the data document (restaurants + visits, Section 15.1)
    and all changes to it, as pure functions (replaced `state.js`)
  - `render.js` — rendering the list/UI updates
  - `sort.js` — sorting and filtering logic
  - `csv.js` — CSV export
  - `maps.js` — Google Maps link handling and validation
  - `history.js` — grouping visits per restaurant, rendering the
    restaurant detail view and the rating/price-over-time chart (plain
    SVG, no charting library)
  - `duplicates.js` — place-ID extraction and name matching for duplicate
    detection (added later, Section 9)
  - `tagColors.js` — distinct per-tag colours (added later, Section 9)
  - `mapView.js` — the Map tab (Leaflet + OSM tiles, Section 15.3);
    not to be confused with `maps.js` (Google link handling)
  - `geo.js` — place search / "what's here?" lookups via Nominatim
    (Section 15.3), rate-limited and cached
  - `googleImport.js`, `settings.js` — Google Takeout import parsing;
    local settings storage + data-repo input parsing (added later)
  - `app.js` — wires the modules together, event handling, entry point
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
- [ ] Enable GitHub Pages on the app repo (Settings → Pages → Source: main
      branch, folder: / (root)) — do this once the first commit exists;
      an empty repo has no branch yet to select
- [x] Create the private repo for the data (`foodlog-data`) — owned by the
      account used to actually use the app, not the development-only
      account (see Section 5)
- [x] In the data repo, create a file `ratings.json` with content `[]`
      (no longer needed: the v2 app creates `foodlog.json` itself on the
      first save, Section 15.2)
- [x] Generate a fine-grained PAT: Repository access limited to
      `foodlog-data`, Permissions → Contents: Read and write. Saved
      securely (not in this repo, not shared with Claude Code)
- [ ] (Later, Phase 2) Invite friends as collaborators on the data repo;
      each person generates their own token the same way
- [x] **Transfer the existing Google Maps list**: superseded — this is now
      a permanent in-app feature ("Import from Google Maps" button), not a
      one-off script. See Section 11.3.

**Note for Claude Code**: this checklist is for me to work through
directly on github.com — you don't do any of it, and you don't need the
final results reported back to you either (the actual repo names, my
GitHub username, or the token). You only need to know that these things
exist and how the app should use them at runtime (Sections 3, 8, 9).

## 8. Data model

> **Being replaced** by the restaurants + visits model in Section 15
> (redesign in progress). This section describes the current/legacy
> `ratings.json` format, which the v2 app no longer reads (no migration,
> Section 15.2).

File `ratings.json` in the data repo, a JSON array of objects. Each
object represents **one visit/rating**, not one restaurant — the same
restaurant can be rated again later (e.g. because quality or price
changed), which simply adds another object with the same
`google_maps_url`. Entries are grouped into "the same restaurant" by an
exact match on `google_maps_url`, or by `restaurant_id` when set (see
below) — see Section 9 for how the list and detail view use this.

```json
[
  {
    "id": "a1b2c3",
    "name": "Trattoria Milano",
    "google_maps_url": "https://maps.app.goo.gl/xyz123",
    "status": "visited",
    "rating": 4,
    "price_level": 2,
    "comment": "Great pasta, loud on weekends",
    "tags": ["Italian", "Date night"],
    "visited_at": "2026-09-20",
    "created_by": "github-username",
    "created_at": "2026-09-20T18:32:00Z"
  }
]
```

- `status`: `"visited"` | `"wishlist"`. Missing/absent on older entries
  defaults to `"visited"` (Section 6's "robust to missing fields" rule).
  A wishlist entry hasn't actually been visited yet: `rating`,
  `price_level`, and `visited_at` are `null`, `comment` is `""`
- `rating`: whole number 0–5 (no half stars) when `status` is
  `"visited"`, otherwise `null`. Deliberately **a single overall rating**
  that sums up everything (food, service, atmosphere, etc.) — no separate
  sub-ratings like "would visit again". A real 0-star rating (`0`, not
  `null`) is a known, visited, poorly-rated place — the UI always shows
  all 5 stars (filled up to the rating, rest as gray outlines) so this
  reads differently from a wishlist entry's `null`, which shows as plain
  "Not yet visited" text instead of a star row
- `price_level`: whole number 1–3, displayed as 1–3 € symbols (€ / €€ / €€€)
- `google_maps_url`: **optional** — a restaurant can be logged without
  one. Stored exactly as pasted in (no parsing, no extracting
  coordinates — short links can't be reliably resolved client-side
  anyway). Used as the grouping key for repeat visits when present
- `restaurant_id`: optional, usually absent. Set by the "Merge selected"
  action (select 2+ restaurant rows you know are the same place) —
  overrides `google_maps_url` for grouping purposes without rewriting it,
  so each visit's own URL stays exactly as it was. Lets link-less or
  differently-linked entries that are actually the same restaurant be
  grouped together manually
- `not_same_as`: optional, usually absent. A list of other entries' `id`s
  that the user has said belong to a *different* restaurant (via "Not the
  same", "Save separately", or "Different" in the import review). Two
  restaurants are never suggested as duplicates if any entry of one lists
  any entry of the other. Entry ids never change (not even on merge), so
  this survives merges; deleting the entry that carries the note can make
  the pair come up again
- `tags`: optional, empty array if not set. Free-form, multiple per
  entry. Also doubles as a lightweight "category" mechanism — e.g.
  bulk-tagging an entire Google Maps import as "Gregors recommendations"
  (Section 11.3) rather than a separate dedicated category field. Set via
  a checkbox-list picker (existing tags + an "add new tag" box), not a
  free-text field, both on the New rating form and when editing a visit
- `created_by`: determined automatically from the token's GitHub account
  (API call `GET /user` with the entered token)

## 9. Core features – Phase 1 (just me)

> Describes the app as built before the Section 15 redesign. Features keep
> working after it, but their data handling moves to the new model —
> Section 15 lists what changes.

- **Layout**: the phone is the main use case. Separate tabs (one screen at
  a time): **List** (start tab) · **New** (new rating) · **Settings** ·
  **Import** · **Export**, plus a ↻ refresh icon in the header (inline
  SVG, no icon library). A status line under the tab bar is visible on
  every tab. Everything must fit a ~360px-wide screen without sideways
  scrolling: the list shows select, name, rating, price, tags (coloured
  dots, max 3 + "+N"), date, and the comment column only on wider screens
  (CSS media query at 640px). The table uses fixed widths for the small
  columns so the name gets the rest and isn't squeezed. The same layout
  works on a laptop (page capped at 900px wide). Don't block zooming to
  "fix" overflow — make content fit instead
- **Phone back button**: the list is the "home" history entry; opening a
  restaurant or another tab adds exactly one entry (further navigation
  replaces it), so back returns to the list, and back from the list
  leaves the app. In-app "back to list" actions use `history.back()` so
  history stays in step
- **Tag colours** (`js/tagColors.js`): computed, not stored — tags are
  numbered by first appearance and spread around the colour wheel by the
  golden angle (plus a 3-step lightness cycle), so no two tags share a
  colour and it's identical on every device. Deleting every early entry
  of a tag can renumber tags and shift colours. Used for the list's tag
  dots, the tag filter chips (which double as the legend), tag chips in
  the detail view, and the tag picker
- **"New rating" form**: paste a Google Maps link, enter a name, star
  rating via click widget (0–5), price level (1–3 €), comment, optional
  tags + visit date. Works both for a brand-new restaurant and for adding
  another visit to a restaurant that's already rated (same
  `google_maps_url` → grouped as the same restaurant, see Section 8)
- **List/overview**: one row per restaurant (grouped by `google_maps_url`
  or `restaurant_id`), showing that restaurant's **most recent** visit
  (rating, price level, comment). Sortable by stars, name, date — sorting
  uses each restaurant's latest visit. A Rated/Wishlist toggle switches
  the view (`status`, Section 8); Wishlist rows show tags/date-added
  columns instead. Both views can be filtered down to one tag at a time
  via a row of tag chips (only tags occurring in that view). A whole
  restaurant (not each entry) is classified: it's in Rated once any of its
  visits is rated, and only in Wishlist while all its entries are
  wishlist entries — so a wishlist entry merged with or attached to a
  rated visit doesn't linger in the Wishlist tab
- **Name search**: a search box above the list filters by restaurant name
  (any visit's name), ignoring case and accents; works in Rated, Wishlist
  and the duplicates view
- **Duplicate detection** (`js/duplicates.js`, pure functions). Two
  strengths of match:
  - *same place*: identical Maps link, or the same Google place ID
    embedded in two different long links (`!1s0x…:0x…`, `ftid=`, or
    `?cid=` — all normalized to the CID). Reliable
  - *similar name*: compares the important words, ignoring
    case/accents/punctuation/apostrophes and generic words (Restaurant,
    Café, Bar, Pizzeria, Trattoria, …): every important word of the
    shorter name must appear in the other, in any order, with a small
    typo tolerated in longer words (1 edit from 5 letters, 2 from 8);
    fewer than 4 important letters never matches. Catches e.g. "Suigyo
    Izakaya" vs. "Suigyo Izakaya - Japanisches Restaurant …", "Restaurant
    Toscana" vs. "Toscana", "Trattoria Milano" vs. "Milano Trattoria".
    Only a hint. Not used when both sides have place IDs that differ
    (e.g. two branches of a chain)
  - Pairs the user marked as different (`not_same_as`, Section 8) are
    never suggested again
  - Short share links (`maps.app.goo.gl/…`) carry no place ID and can't
    be resolved without contacting Google (Section 3.1), so they can only
    match by name
  - **On create**: if the new entry matches an existing restaurant, the
    form shows a warning with: add it as another visit to that restaurant
    (links them via a shared `restaurant_id`, same mechanism as Merge),
    save it separately (remembered as different), or cancel
  - **"Show possible duplicates"** switch: the list shows only suspected
    duplicates (across both Rated and Wishlist), grouped next to each
    other; clean up with the existing checkboxes + Merge/Delete selected,
    or **"Not the same"** (2+ ticked rows) to remember them as different
- **Bulk select**: a checkbox per row plus "select all visible", in both
  the Rated and Wishlist views
  - **Delete selected**: removes every checked restaurant *and all of its
    visits* in one batch write (one confirmation, one commit) — not just
    the single visit shown in the list row. Deleting one specific visit
    instead of the whole restaurant is still done from the detail view
  - **Merge selected**: for 2+ checked rows you know are the same
    restaurant — tags every one of their visits with a shared
    `restaurant_id` (Section 8) in one batch write, without touching any
    visit's own `google_maps_url`
- **Restaurant detail view**, opened by clicking a row (inside the List
  tab), showing:
  - the full visit history for that restaurant (all past ratings,
    comments, dates), one two-line card per visit (date, stars, price,
    Edit/Delete; then comment and tags)
  - a simple chart of rating (and price level) over time across visits,
    with labelled axes (0–5★, €–€€€, visit dates); only rated visits are
    plotted
  - an explicit **"Open in Google Maps"** button/link (with the URL
    scheme check from Section 4.1) — disabled when the restaurant has no
    Maps link
  - edit and delete actions for individual visits — same write-conflict
    handling as when creating (see below). Editing can flip `status`
    between visited/wishlist either way, converting a wishlist entry once
    you've actually been
- **"Refresh" button**: reloads the data from the repo (no automatic
  real-time sync wanted, a manual reload is enough). It — and app start —
  also fetches `js/app.js` from the app's own site (same origin, no other
  service, bypassing cache) and compares its `APP_VERSION`; if the live
  one differs, an "A new version is available — Update now" banner
  appears. Update re-downloads every same-origin file the page loaded
  (taken from the Resource Timing API, so no file list to maintain) and
  reloads. This relies on the exact line `const APP_VERSION = "…";` in
  `app.js`
- **CSV export button**: converts the currently loaded data into a CSV
  file client-side and starts the download (no server needed) — each
  visit exports as its own row
- **Settings input**: fields to enter (and remove) both the data repo and
  your own PAT; a note in the UI that both are only stored locally.
  Neither is ever hardcoded into the app's source code (see Section 3.1).
  The data repo is a single field accepting `owner/repo`, a GitHub page
  link, or a clone URL (`parseRepoInput` in `settings.js`); unparseable
  input is rejected with an error instead of being saved. Internally it's
  still stored as separate owner/repo values. Inputs are trimmed (incl.
  the token). A 401 from GitHub shows a "token rejected — paste it again"
  message rather than a bare status code
- **Write-conflict handling**: before every write (create, edit, delete),
  fetch the file's current `sha` again; on a 409 conflict (someone else
  has written in the meantime), automatically reload, reapply your own
  change, and retry

## 10. Phase 2 – multiple users (later, once Phase 1 is running)

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

- Show who submitted a rating (`created_by`)
- **Show an average rating** when several people have rated the same
  restaurant — based on each person's most recent visit, not every
  historical visit, so a restaurant one person has rated many times isn't
  overweighted
- Possibly a filter: "only my ratings" / "all"
- Otherwise no structural changes needed — the architecture is designed
  for this from the start

## 11. Later milestones & optional additions (not an MVP blocker)

### 11.1 Later milestones

- [x] **Wishlist**: a "visited" vs. "on the list, not tried yet" status —
      for restaurant recommendations that haven't been rated yet. Built as
      a `status` field on each entry (`"visited"` | `"wishlist"`,
      defaulting to `"visited"` when missing); a toggle on the New rating
      form; a Rated/Wishlist view switch on the list; editing a visit can
      flip status either way to convert a wishlist entry once you've been
- [ ] **Map view** of all rated restaurants, e.g. using OpenStreetMap
      (instead of Google Maps, to avoid needing Google API billing)

### 11.2 Smaller optional additions

- Additional automated backup: a small **Python script** that, e.g.,
  weekly via a GitHub Action, saves `foodlog.json` as an extra CSV
  snapshot in the repo (defense in depth, in addition to the Git history)
- [x] Filter by tag — built for both Rated and Wishlist views (tag chips)
- [x] Search by name — built (Section 9), all views
- [x] Decided: no separate category field — tags double as categories
      (e.g. bulk-tagging a Google Maps import as "Gregors
      recommendations", Section 11.3), see Section 8

### 11.3 Google Maps import/export

- [x] **Import**: a permanent in-app "Import from Google Maps" feature
      (`js/googleImport.js`), superseding the one-off-script plan from
      Section 7. Takes a Google Takeout "Saved" export CSV (one file per
      Maps list), parsed entirely client-side (no external service).
      Handles the delimiter/header-language variation seen across account
      locales (e.g. German `Titel/Notiz/URL/Tags/Kommentar` vs. English
      headers) and a non-UTF-8 file encoding observed in a real export
      (falls back to Mac OS Roman when UTF-8 decoding fails). A place's
      Note field is parsed for a leading `N/10` rating, converted to 0–5
      stars as 0–5/10 → 0 stars, then 6/10 → 1 star up to 10/10 → 5 stars
      (not a halving scale) — if found, it imports as a rated visit;
      otherwise as a wishlist entry. Either way the note's original text
      (including the "N/10") is kept as-is in the comment field, never
      rewritten. The export has no real visit date, so a rated entry's
      `visited_at` is set to the import date instead (a wishlist entry's
      stays null — it hasn't been visited). Places already in the data as
      the *same place* (identical link or same Google place ID, Section 9)
      are skipped; places that only have a *similar name* to an existing
      restaurant go through a review step before anything is saved: one
      question each, "Same as …" or "Different", all must be answered.
      "Same": the existing restaurant's entries without a Maps link get
      the imported link (so later imports recognise it exactly), they get
      the import's tag, and only if the imported place carries its own
      rating is it added as another visit (linked via `restaurant_id`).
      "Different": imported as a new restaurant, remembered via
      `not_same_as`. The import panel has an optional
      "tag these imports with" field (e.g. "Gregors recommendations" for
      a friend's list) applied to every entry from that file — this is
      the category mechanism from Section 8, not a separate feature.
      Auto-filled from the chosen CSV's filename (minus `.csv`) when left
      empty, so e.g. picking "Gregors recommendations.csv" needs no manual
      typing — still editable before the import is confirmed. One
      confirmation + one batch write per import.
- **Export to a real, shareable Google Maps list is not possible**: Google
  has no public API to create or populate a Maps "List" — list creation
  only exists through the Maps app/website UI. Confirmed via research
  2026-10; only unofficial third-party scrapers claim anything in this
  space, and even those can only read existing shared lists, not create
  new ones — using one would also mean sending restaurant data to an
  unverified third party, which conflicts with Section 3.1. A KML-based
  workaround (import into Google My Maps) isn't available either, since
  that needs coordinates/addresses per place and Section 8 deliberately
  never resolves/geocodes the Maps link. The closest fallback, if wanted
  later, is a nicely formatted plain-text/CSV export for manually sharing
  recommendations — not attempted yet, not asked for.

## 12. Technical guidelines

- Plain HTML/CSS/JavaScript, no framework, no build tool
- Access to rating data exclusively via the GitHub Contents API:
  - Read: `GET /repos/{owner}/{data-repo}/contents/foodlog.json`
  - Write: `PUT /repos/{owner}/{data-repo}/contents/foodlog.json`
    (content base64-encoded, with the current `sha`)
  - `{owner}` and `{data-repo}` come from the runtime settings (Section
    9), never hardcoded in the source (Section 3.1)
- Local testing e.g. with `python3 -m http.server` in the project folder
- See Section 6 (Extensibility & code structure) for how the JS files are
  split up

## 13. Assumptions made (adjust here directly if needed)

- Stars are whole numbers (0–5), no half stars, and deliberately a single
  overall rating with no sub-dimensions
- Price level is a whole number 1–3 (shown as €/€€/€€€)
- No framework, plain vanilla JS, split into ES modules (Section 6)
- A single JSON array as the "database", no separate file per entry
- Repeat visits to the same restaurant are grouped by an exact match on
  `google_maps_url` (or a shared `restaurant_id`); if the same place gets
  pasted with a different link, it shows up as a separate restaurant
  until merged — duplicate detection (Section 9) flags these but never
  merges automatically
- The rating/price history chart is a hand-rolled SVG, not an external
  charting library, to avoid adding a new dependency (Section 4.1) — can
  revisit if that turns out to be too limiting
- Importing existing Google Maps data is a permanent in-app feature (CSV
  from Google Takeout, see Section 11.3), not a one-off script — revised
  from the original plan in Section 7
- Repo names are confirmed: `foodlog` (app, public) and `foodlog-data`
  (data, private) — both already exist
- The app has a `manifest.json` and icons so it can be added to a phone's
  home screen (standalone display, no browser chrome). Deliberately no
  service worker (the app needs live network access to function anyway,
  so offline support isn't worth the complexity) — known trade-off: an
  already-installed home-screen icon can keep running a stale cached
  `app.js` after an update and not pick up the new version on its own.
  If a home-screen install seems to be misbehaving after a deploy, that's
  the first thing to suspect — remove and re-add the icon rather than
  assuming new code is broken

## 14. Workflow for Claude Code

After each completed step: commit, then ask before pushing (see Section 2.3).
Before every push that changes app code, bump `APP_VERSION` in `js/app.js`
(shown at the bottom of Settings) — it's how we tell whether a device is
still running a cached older `app.js`.

1. Whenever something is unclear, Section 2.1 applies: ask first, don't
   guess — this covers things like unclear repo names, GitHub username,
   token handling, but also any design or structural decision that isn't
   clearly defined here.
2. Build the basic structure: the module split from Section 6, with token
   input, the form (including price level), the grouped list (latest
   visit per restaurant), sorting.
3. GitHub API integration (read + write + edit/delete, including conflict
   handling per Section 9), following the privacy and security principles
   from Sections 3 and 4.
4. Restaurant detail view: visit history, rating/price-over-time chart,
   and the "Open in Google Maps" button (including the URL scheme check
   from Section 4.1).
5. CSV export.
6. Add a short README with setup notes for future friends.
7. Only after that: tackle later milestones/optional items from Section
   11, if desired.

## 15. Redesign v2: restaurants + visits, and a map (decided 2026-10, in progress)

**Why.** A restaurant's identity was its Google Maps link, which caused
most of the complexity (grouping by exact link, `restaurant_id` for
merges, place-ID tricks, short links that can't be compared) and gives no
coordinates for a map. Google's exports don't contain coordinates either
(Takeout list CSVs have only title/note/URL/tags/comment, and their URLs
carry a place ID but no lat/lng). Decided: separate restaurants from
visits, give restaurants a location, keep the Google link as an optional
extra (people are used to it).

### 15.1 Data model — `foodlog.json` in the data repo

```json
{
  "version": 2,
  "restaurants": [
    {
      "id": "r1a2b3c4",
      "name": "Trattoria Milano",
      "lat": 52.5123, "lng": 13.4567,
      "address": "Musterstraße 1, Berlin",
      "google_maps_url": "https://maps.app.goo.gl/xyz123",
      "osm": "node/123456789",
      "tags": ["Italian", "Date night"],
      "note": "Recommended by a friend",
      "not_same_as": ["r9z8y7x6"],
      "created_by": "github-username",
      "created_at": "2026-09-20T18:32:00Z"
    }
  ],
  "visits": [
    {
      "id": "a1b2c3d4",
      "restaurant_id": "r1a2b3c4",
      "rating": 4,
      "price_level": 2,
      "comment": "Great pasta, loud on weekends",
      "visited_at": "2026-09-20",
      "created_by": "github-username",
      "created_at": "2026-09-20T18:32:00Z"
    }
  ]
}
```

- Restaurant fields: only `id` and `name` are required. `lat`/`lng`
  (numbers) are null/absent until the place is located. `address` and
  `osm` (OpenStreetMap reference, e.g. `node/123`) come from a Nominatim
  search result. `google_maps_url` is optional, stored exactly as pasted.
  `tags` describe the restaurant (cuisine, occasion, source list such as
  "Gregors recommendations"). `note` is free text about the restaurant
  itself (e.g. who recommended it), as opposed to a visit's comment.
  `not_same_as` lists restaurant ids the user said are different places
- Visit fields: `rating` 0–5 (whole number, required on a visit),
  `price_level` 1–3 or null, `comment`, `visited_at` (YYYY-MM-DD)
- **Wishlist = a restaurant with no visits.** No `status` field anymore.
  Rated = has at least one visit
- **Merge** = move all visits of the other restaurant(s) onto one, union
  the tags, join the notes, fill empty fields (location, link, address)
  from the others, then delete the others. No `restaurant_id` override
- Section 6's "robust to missing fields" rule still applies to every field
- The app reads/writes `foodlog.json` only. The old `ratings.json` is
  never modified or deleted by the app

### 15.2 No migration — fresh start

The app isn't in daily use yet and the real source of the data is still
the user's Google Maps lists, so there is **no conversion** of the old
`ratings.json`. The new version starts with an empty `foodlog.json`
(created on the first save) and the restaurants come back by re-importing
the Google lists (Section 11.3 import, adapted to the new model). The old
`ratings.json` is simply ignored — never read, changed or deleted by the
app. Consequence: the import is the main way data gets in, so it has to
stay quick and reliable.

### 15.3 Locations and the map

- **Map tab** (between List and New): Leaflet + OpenStreetMap tiles, one
  circle marker per located restaurant (rated: filled orange; wishlist:
  white with blue outline), tap → popup (name, stars, tag dots, Open) →
  opens the restaurant in the List tab. Zooms to fit all markers the
  first time; after that the view stays where the user left it. A line
  above the map says how many restaurants have a location. Not built yet:
  filters on the map (Rated/Wishlist, tags, search)
- **Search bar on the Map tab** (Nominatim, `geo.js`): results appear as
  a list under the bar and as grey markers. Searches are **biased toward
  the area currently visible on the map** but not limited to it, so
  places anywhere in the world can be found (pan there, or put the city
  into the search text). No fixed search-area setting. Searching only on
  submit (never while typing), ≤1 request per second, identical requests
  answered from memory
- **Tapping the map** (not a marker) runs a reverse lookup of that spot.
  Only if the nearest object is a venue (OSM category
  amenity/shop/tourism/leisure) are its name, `osm` reference and exact
  coordinates used; otherwise only its address is shown, with the tapped
  coordinates and no name (a street or building name would be a wrong
  restaurant name). Picking a result or tapping shows a red candidate
  marker with a popup whose button depends on the mode below
- **Setting a location** on a restaurant:
  - automatically from a pasted Google link if it contains coordinates
    (`!3d…!4d…` preferred, else `@lat,lng`) — offline, no service
    involved; applied when saving the New form
  - detail view → "Set location" / "Change location" switches to the Map
    tab in *pick mode* (banner "Choose the location of …" with Cancel);
    search or tap, then "Use as location of …" saves lat/lng (and
    address/`osm` when known) and returns to the restaurant. "Show on
    map" centres the map on its marker
- **Adding from the map**: outside pick mode the popup button is "Add as
  new restaurant" → the New tab opens pre-filled with name (if known)
  and the location. The New form also has "Set location on map" (pick
  mode for the form: "Use this location") and a way to clear it
- Leaving the Map tab ends pick mode; the phone back button behaves as
  for any other tab (Section 9)
- **"Locate restaurants without a location"** helper (mainly right after
  an import, since Google exports carry no coordinates): asks **where
  these places are** (free text, e.g. "Berlin" or "Tokyo", per run; the
  last value is suggested, stored in `localStorage`, never hardcoded),
  then works through them one by one at ≤1 Nominatim request per second
  (policy). A confident match (exactly one result in that area whose
  name matches) is accepted automatically; everything else goes to a
  review list (pick a result / tap on the map / skip). Saves in batches,
  not one commit per place. Can be stopped and resumed
- Duplicate detection gains a location signal: similar name *and* within
  ~60 m is a strong match; same `osm` reference = same place
- "Open in Google Maps": uses `google_maps_url` if present, otherwise a
  Google Maps search link built from name + coordinates — opened like any
  link, no Google service is called by the app itself

### 15.4 What changes in existing features

- List: Rated/Wishlist by visit count; rows show the latest visit's
  rating/price/date; tags and tag colours come from the restaurant
- Sorting is per view: Rated by rating / name / date (latest visit);
  Wishlist by name / date added (`created_at`), default name A→Z
- New form: creates a restaurant; rating/price/comment/date fields create
  its first visit unless "Haven't been yet" is ticked. Adding another
  visit to an existing restaurant happens in its detail view ("Add
  visit"), or via "Add as another visit" in the duplicate warning
- Detail view: restaurant header (name, address, tags, note, Google link,
  location with "Show on map" / "Set location", Edit restaurant), then the
  visits (cards, chart) with Add visit / Edit / Delete
- Import (Takeout CSV): creates restaurants (+ a visit when the note has
  an `N/10` rating, comment kept verbatim as before); a place's note
  becomes the restaurant `note` when there's no rating; the import tag
  goes onto the restaurants. Same-place skipping and the similar-name
  review keep working, now per restaurant
- CSV export: one row per visit with the restaurant's fields, plus one
  row per wishlist restaurant with empty visit columns
- Bulk select / Delete / Merge / Not the same: per restaurant

### 15.5 Milestones (commit after each, ask before each push)

1. [x] Spec (this section) + privacy/security updates in Sections 3.1/4.1
2. [x] New data layer (`foodlog.json`, no migration) + all existing
       features ported to it, incl. the Google import
3. [x] Map tab showing located restaurants (Leaflet 1.9.4 vendored in
       `vendor/leaflet/`, checksums verified — see its README)
4. [x] Setting locations (link coordinates, Nominatim search, tap on
       map) + adding new restaurants from the map
5. [ ] "Locate restaurants without a location" helper
6. [ ] Fold the final state back into Sections 8/9/11/13 and retire the
       "legacy" notes

