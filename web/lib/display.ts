// Shared, UI-only formatting helpers for the consumer site. Keeps the type labels and
// platform badges identical across the home page, city pages, POI pages and search.
import type { Place } from "./khoj";

export const pretty = (s: string | null | undefined) =>
  (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const TYPE_LABELS: Record<string, string> = {
  festival: "Festival",
  cuisine: "Cuisine",
  dish: "Dish",
  sport: "Sport",
  craft: "Craft",
  performing_art: "Performing art",
  art_form: "Art form",
  cultural: "Culture",
  activity: "Activity",
};

export function typeLabel(entity_type: string, category: string | null): string {
  if (entity_type === "poi") return pretty(category) || "Place";
  return TYPE_LABELS[entity_type] ?? pretty(entity_type);
}

export const placeTypeLabel = (p: Pick<Place, "entity_type" | "category">) =>
  typeLabel(p.entity_type, p.category);

export const PLATFORM: Record<string, { label: string; glyph: string }> = {
  youtube: { label: "YouTube", glyph: "▶" },
  wikipedia: { label: "Wikipedia", glyph: "W" },
  blog: { label: "Blog", glyph: "✎" },
  podcast: { label: "Podcast", glyph: "🎙" },
};
export const platformMeta = (p: string) => PLATFORM[p] ?? { label: pretty(p), glyph: "•" };

// The cultural "themes" surfaced in browse UIs (type= filters on the API).
export const THEMES: { key: string; label: string }[] = [
  { key: "cultural", label: "Arts & culture" },
  { key: "festival", label: "Festivals" },
  { key: "cuisine", label: "Cuisines" },
  { key: "dish", label: "Dishes" },
  { key: "craft", label: "Crafts" },
  { key: "sport", label: "Sports" },
];
