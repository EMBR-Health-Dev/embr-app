export function categoryLabel(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

export function severityLabel(severity: string): string {
  return severity[0] + severity.slice(1).toLowerCase();
}
