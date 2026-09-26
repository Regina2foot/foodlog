// CSV export. Each visit exports as its own row (see CLAUDE.md Section 9).
// Pure conversion function plus a small DOM helper to trigger the download.

const COLUMNS = [
  "name",
  "google_maps_url",
  "rating",
  "price_level",
  "comment",
  "tags",
  "visited_at",
  "created_by",
  "created_at",
];

function escapeCsvField(value) {
  const str = value === undefined || value === null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function ratingsToCsv(ratings) {
  const header = COLUMNS.join(",");
  const rows = ratings.map((visit) =>
    COLUMNS.map((col) => {
      const value = col === "tags" ? (visit.tags || []).join("; ") : visit[col];
      return escapeCsvField(value);
    }).join(",")
  );
  return [header, ...rows].join("\n");
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
