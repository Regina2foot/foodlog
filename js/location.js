// The device's current position (CLAUDE.md Section 9.5): requested only
// when the user taps something that needs it (the map's ◎ button, or
// sorting the list by distance) — never automatically. Kept in memory for
// this app session only: never stored (no localStorage) and never sent
// anywhere; it's only used to draw the dot and compute distances.

let last = null;

// The most recent position ({ lat, lng, accuracy, at }), or null.
export function lastPosition() {
  return last;
}

const MESSAGES = {
  1: "Location permission was denied — allow it for this site in the browser's settings",
  2: "Your location isn't available right now",
  3: "Getting your location took too long",
};

// Asks the browser for the current position (it shows its own permission
// prompt the first time). Resolves with { lat, lng, accuracy, at }.
export function requestPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser can't share its location"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        last = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() };
        resolve(last);
      },
      (err) => reject(new Error(MESSAGES[err.code] || "Your location isn't available right now")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}
