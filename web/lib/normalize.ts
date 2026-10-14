// Minimal mirror of pipeline/normalize.py for admin-side POI creation.

const SUFFIXES = new Set([
  "restaurant", "restro", "hotel", "cafe", "kitchen", "dhaba", "sweets", "bakery", "eatery",
]);

export function normalize(name: string): string {
  if (!name) return "";
  let s = name.toLowerCase().trim();
  s = s.replace(/^the\s+/, "");
  s = s.replace(/'s\b/g, "s");
  s = s.replace(/[^\w\s]/g, " ");
  s = s.replace(/\bwaali\b/g, "wali").replace(/\bvali\b/g, "wali").replace(/\bchauk\b/g, "chowk");
  s = s.replace(/\s+/g, " ").trim();
  const tokens = s.split(" ");
  if (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ").trim();
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
