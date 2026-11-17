// Consumer-site data layer — this site DOGFOODS the public Khoj API (the Go service),
// not the database directly. Every page here fetches through these helpers, so the live
// site exercises the same endpoints a customer would. Server-only (used in RSC/Server
// Components); responses are cached ~60s so browse stays cheap.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://khoj-ibli.onrender.com";

export type Stats = { places: number; cities: number; sources: number; claims: number };

export type City = {
  slug: string;
  name: string;
  type: "city" | "region";
  country: string;
  lat: number | null;
  lng: number | null;
  places: number;
};

export type Trust = {
  sources: number;
  platforms: number;
  latest_source: string | null;
  score: number;
};
export type Freshness = { latest_source: string | null; age_days: number | null; score: number; label: string } | null;

export type Place = {
  slug: string;
  name: string;
  entity_type: string;
  category: string | null;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  sources: number;
  score: number;
  trust: Trust;
  freshness: Freshness;
  distance_km?: number;
};

export type Claim = { field?: string; value?: string; evidence?: string; confidence?: number };
export type Evidence = {
  source: {
    platform: string; // youtube | wikipedia | blog | podcast
    title: string | null;
    url: string | null;
    creator: string | null;
    upload_date: string | null;
  };
  stance: string;
  strength: number | null;
  confidence: number | null;
  claims: Claim[];
};
export type PlaceDetail = Place & { evidence: Evidence[] };

type Envelope<T> = { data: T; meta?: Record<string, unknown> };

async function api<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const r = await fetch(`${API_BASE}${path}`, { next: { revalidate } });
    if (!r.ok) return null;
    const j = (await r.json()) as Envelope<T>;
    return j.data;
  } catch {
    return null;
  }
}

/** Full envelope when the caller needs meta (e.g. total count for pagination). */
async function apiEnvelope<T>(path: string, revalidate = 60): Promise<Envelope<T> | null> {
  try {
    const r = await fetch(`${API_BASE}${path}`, { next: { revalidate } });
    if (!r.ok) return null;
    return (await r.json()) as Envelope<T>;
  } catch {
    return null;
  }
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const getStats = () => api<Stats>("/v1/stats", 60);

export function listCities(
  opts: { type?: "city" | "region"; q?: string; min_places?: number; limit?: number; offset?: number } = {},
) {
  return api<City[]>(`/v1/cities${qs({ ...opts })}`, 300);
}

export type PlaceQuery = {
  city?: string;
  type?: string;
  category?: string;
  q?: string;
  min_sources?: number;
  min_platforms?: number;
  sort?: "trust" | "freshness";
  near?: string;
  radius_km?: number;
  limit?: number;
  offset?: number;
};

export function listPlaces(opts: PlaceQuery = {}) {
  return api<Place[]>(`/v1/places${qs({ ...opts })}`, 60);
}

export function listPlacesWithMeta(opts: PlaceQuery = {}) {
  return apiEnvelope<Place[]>(`/v1/places${qs({ ...opts })}`, 60);
}

export const getPlace = (slug: string) => api<PlaceDetail>(`/v1/places/${encodeURIComponent(slug)}`, 60);

export const searchPlaces = (q: string, limit = 24) => listPlaces({ q, limit });

export { API_BASE };
