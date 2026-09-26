// Google Maps link handling and validation (see CLAUDE.md Section 4.1: only
// http/https URLs may ever be opened, no other scheme).

export function isSafeHttpUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

export function openMapsUrl(value) {
  if (!isSafeHttpUrl(value)) {
    throw new Error("Refusing to open an unsafe or invalid URL");
  }
  window.open(value, "_blank", "noopener,noreferrer");
}
