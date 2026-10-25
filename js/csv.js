// CSV export (CLAUDE.md Section 9.12): one row per visit, carrying its
// restaurant's fields, plus one row per wishlist restaurant with the visit
// columns left empty. Pure conversion plus a small download helper.

const COLUMNS = [
  ["restaurant", (r) => r.name],
  ["address", (r) => r.address],
  ["lat", (r) => r.lat],
  ["lng", (r) => r.lng],
  ["google_maps_url", (r) => r.google_maps_url],
  ["tags", (r) => (r.tags || []).join("; ")],
  ["note", (r) => r.note],
  ["visited_at", (r, v) => v?.visited_at],
  ["rating", (r, v) => v?.rating],
  ["comment", (r, v) => v?.comment],
  ["created_by", (r, v) => (v || r).created_by],
];

function escapeCsvField(value) {
  const str = value === undefined || value === null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// `restaurants` are restaurant views (data.js buildRestaurantViews).
export function restaurantsToCsv(restaurants) {
  const rows = [COLUMNS.map(([name]) => name).join(",")];
  for (const r of restaurants) {
    const visits = r.visits.length ? r.visits : [null];
    for (const v of visits) rows.push(COLUMNS.map(([, get]) => escapeCsvField(get(r, v))).join(","));
  }
  return rows.join("\n");
}

export function downloadCsv(csvText, filename = "foodlog-export.csv") {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
