"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

// A slow cross-fading, ken-burns hero backdrop — gives the hero a subtle "video" feel
// without a video file. Uses the warm, bright monuments (not the flat India Gate).
// Wide, bright, warm panoramas from across India (new ones sourced from Wikimedia Commons).
// Ordered for variety; qutub.jpg is intentionally excluded (portrait → crops badly).
const IMAGES = [
  { src: "/hero/taj-mahal.jpg", alt: "Taj Mahal, Agra" },
  { src: "/hero/hampi.jpg", alt: "Hampi, Karnataka" },
  { src: "/hero/golden-temple.jpg", alt: "Golden Temple, Amritsar" },
  { src: "/hero/humayun.jpg", alt: "Humayun's Tomb, Delhi" },
  { src: "/hero/mysore-palace.jpg", alt: "Mysore Palace, Karnataka" },
  { src: "/hero/jama-masjid.jpg", alt: "Jama Masjid, Delhi" },
];

export default function HeroBackdrop() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % IMAGES.length), 6500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="absolute inset-0 bg-ink">
      {IMAGES.map((img, idx) => (
        <Image
          key={img.src}
          src={img.src}
          alt={img.alt}
          fill
          priority={idx === 0}
          sizes="100vw"
          className={`kenburns object-cover transition-opacity duration-[1600ms] ease-in-out ${
            idx === i ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
    </div>
  );
}
