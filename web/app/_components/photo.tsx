// Procedural place/food tile. Crafted duotone + grain + category glyph now;
// swap `src` for real Google Places photos at Stage 7.

type CatStyle = { from: string; to: string; glyph: string };

const CATS: Record<string, CatStyle> = {
  restaurant: { from: "#EA4E1B", to: "#7a1f0c", glyph: "🍽" },
  cafe: { from: "#b9612a", to: "#3a2213", glyph: "☕" },
  street_food: { from: "#f0851c", to: "#8a2d0b", glyph: "🥘" },
  bakery: { from: "#d98a3d", to: "#5c3316", glyph: "🥐" },
  sweet_shop: { from: "#e0733a", to: "#5c2714", glyph: "🍮" },
  bar: { from: "#7a3b6b", to: "#241021", glyph: "🍸" },
  monument: { from: "#0E5C55", to: "#0a2a27", glyph: "🏛" },
  attraction: { from: "#2f7d74", to: "#10302c", glyph: "📍" },
  museum: { from: "#4a6b8a", to: "#182634", glyph: "🏺" },
  temple: { from: "#c8892b", to: "#4a2f10", glyph: "🛕" },
  mosque: { from: "#2f7d74", to: "#122e2b", glyph: "🕌" },
  gurudwara: { from: "#c8892b", to: "#4a2f10", glyph: "🛕" },
  park: { from: "#4b7a3a", to: "#1a2e14", glyph: "🌳" },
  viewpoint: { from: "#3a6b8a", to: "#14232e", glyph: "🌄" },
  market: { from: "#9a5a2c", to: "#3a2110", glyph: "🛍" },
  mall: { from: "#6a5a8a", to: "#231d34", glyph: "🛍" },
  hotel: { from: "#556b8a", to: "#1c2634", glyph: "🛎" },
};

const DEFAULT: CatStyle = { from: "#322c22", to: "#17140f", glyph: "✦" };

export function Photo({
  category,
  src,
  className = "",
  ratio = "aspect-[4/3]",
}: {
  category?: string | null;
  src?: string | null;
  className?: string;
  ratio?: string;
}) {
  const c = (category && CATS[category]) || DEFAULT;
  return (
    <div className={`relative ${ratio} overflow-hidden ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div
          className="grain absolute inset-0"
          style={{ background: `radial-gradient(120% 120% at 20% 10%, ${c.from} 0%, ${c.to} 70%)` }}
        >
          <span className="absolute -bottom-4 -right-2 select-none font-display text-[7rem] leading-none opacity-25">
            {c.glyph}
          </span>
        </div>
      )}
    </div>
  );
}
