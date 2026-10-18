# Leaflet (vendored)

- Version: **1.9.4** (latest stable as of 2026-10), BSD 2-Clause license (see `LICENSE`)
- Source: the official CDN listed on https://leafletjs.com/download.html
  - `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`
  - `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`
- Verified against the integrity hashes published on that page:
  - `leaflet.js`: `sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=`
  - `leaflet.css`: `sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=`
- Files are unmodified. The marker images Leaflet ships aren't included:
  the app draws its own circle markers.

To check (from the repo root):

```sh
openssl dgst -sha256 -binary vendor/leaflet/leaflet.js | openssl base64 -A
openssl dgst -sha256 -binary vendor/leaflet/leaflet.css | openssl base64 -A
```

Upgrading means replacing both files and repeating this check against the
hashes published for the new version (CLAUDE.md Section 4.1).
