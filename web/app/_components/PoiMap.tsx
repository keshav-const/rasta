"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

// Keyless map for a POI, powered by the lat/lng the geocoding pipeline produced and the
// API now returns. Vanilla Leaflet + OpenStreetMap tiles (no token, no account). Leaflet
// is imported dynamically inside the effect so nothing touches `window` during SSR.

export default function PoiMap({
  lat,
  lng,
  name,
  zoom = 13,
}: {
  lat: number;
  lng: number;
  name: string;
  zoom?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !ref.current || ref.current.dataset.init) return;
      ref.current.dataset.init = "1";

      map = L.map(ref.current, {
        center: [lat, lng],
        zoom,
        scrollWheelZoom: false, // don't hijack page scroll
        attributionControl: true,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // custom pin (avoids Leaflet's bundler-broken default marker images)
      const icon = L.divIcon({
        className: "",
        html:
          '<div style="width:18px;height:18px;border-radius:9999px;background:#ea4e1b;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      L.marker([lat, lng], { icon, title: name }).addTo(map);
    })();

    return () => {
      cancelled = true;
      if (map) map.remove();
      if (ref.current) delete ref.current.dataset.init;
    };
  }, [lat, lng, name, zoom]);

  return (
    <div
      ref={ref}
      className="h-64 w-full overflow-hidden rounded-2xl border border-line bg-paper-soft"
      aria-label={`Map showing ${name}`}
    />
  );
}
