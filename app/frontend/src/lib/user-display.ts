// Frontend helper note: centralizes user display behavior so components and tests share one implementation.

const HONORIFICS = new Set([
  "dr",
  "dr.",
  "prof",
  "prof.",
  "mr",
  "mr.",
  "mrs",
  "mrs.",
  "ms",
  "ms.",
]);

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  const meaningfulParts = parts.filter(
    (part) => !HONORIFICS.has(part.toLowerCase()),
  );
  const source = meaningfulParts.length > 0 ? meaningfulParts : parts;

  if (source.length === 1) {
    return source[0]!.slice(0, 2).toUpperCase();
  }

  return `${source[0]![0] ?? ""}${source.at(-1)?.[0] ?? ""}`.toUpperCase();
}
