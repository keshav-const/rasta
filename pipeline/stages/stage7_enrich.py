"""Stage 7: Enrichment (Google Places API).

For each canonical POI, look it up on Google Places and store location, rating,
hours, phone, website, photos, and business status in the POI's google_* columns
(the verification layer) — NEVER overwriting AI-extracted claims (spec rule 1).

Field-level checks (e.g. price_level) are recorded in verification_data with a
conflict flag when Google disagrees with what creators said (spec rule 4).

Uses the Places API (New) v1 `places:searchText`, which returns every field we
need in a single request via a field mask (cheaper than legacy Text Search +
Place Details). Gracefully no-ops when GOOGLE_PLACES_API_KEY is unset, so the
rest of the pipeline runs without it.

Spec: pipeline-spec.md > STAGE 7.
"""
from __future__ import annotations

import time
from typing import Any

import requests

from .. import config, db
from ..normalize import normalize, similarity

_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

# Only ask Google for the fields we store — the field mask is what you're billed on.
_FIELD_MASK = ",".join(
    "places." + f
    for f in (
        "id", "displayName", "formattedAddress", "location", "rating",
        "userRatingCount", "priceLevel", "regularOpeningHours",
        "nationalPhoneNumber", "websiteUri", "photos", "types", "businessStatus",
    )
)

# Google's priceLevel enum -> our POI price_level vocabulary.
_PRICE_MAP = {
    "PRICE_LEVEL_FREE": "budget",
    "PRICE_LEVEL_INEXPENSIVE": "budget",
    "PRICE_LEVEL_MODERATE": "moderate",
    "PRICE_LEVEL_EXPENSIVE": "expensive",
    "PRICE_LEVEL_VERY_EXPENSIVE": "luxury",
}

# Name-similarity below this = we found *something*, but not confidently the same
# place: store the Google data but don't upgrade verification_status.
VERIFY_MIN_SIM = 0.60

_TIMEOUT = 20
_MAX_RETRIES = 3


def enrich_configured() -> bool:
    return config.places_configured()


def _build_query(poi: dict[str, Any]) -> str:
    parts = [poi["name"]]
    if poi.get("area_name"):
        parts.append(poi["area_name"])
    if poi.get("destination_name"):
        parts.append(poi["destination_name"])
    return ", ".join(p for p in parts if p)


def search_place(query: str) -> dict[str, Any] | None:
    """Return the top Places match for a text query, or None. Retries on 429/5xx."""
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.google_places_api_key(),
        "X-Goog-FieldMask": _FIELD_MASK,
    }
    body = {
        "textQuery": query,
        "regionCode": "IN",
        "languageCode": "en",
        "maxResultCount": 1,
    }
    for attempt in range(1, _MAX_RETRIES + 1):
        resp = requests.post(_SEARCH_URL, headers=headers, json=body, timeout=_TIMEOUT)
        if resp.status_code == 200:
            places = resp.json().get("places") or []
            return places[0] if places else None
        if resp.status_code in (429, 500, 502, 503, 504) and attempt < _MAX_RETRIES:
            time.sleep(2 ** attempt)
            continue
        raise RuntimeError(f"Places searchText {resp.status_code}: {resp.text[:300]}")
    return None


def _to_google_fields(place: dict[str, Any]) -> dict[str, Any]:
    """Map a Places API result onto our google_* column payload."""
    photos = [p["name"] for p in (place.get("photos") or []) if p.get("name")]
    return {
        "google_place_id": place.get("id"),
        "google_rating": place.get("rating"),
        "google_total_ratings": place.get("userRatingCount"),
        "google_opening_hours": place.get("regularOpeningHours") or {},
        "google_phone": place.get("nationalPhoneNumber"),
        "google_website": place.get("websiteUri"),
        "google_photos": photos,
        "google_business_status": place.get("businessStatus"),
    }


def _record_price_conflict(conn, poi: dict[str, Any], place: dict[str, Any]) -> None:
    """Compare AI price_level to Google's; log both to verification_data if they differ."""
    ai_price = poi.get("price_level")
    g_price = _PRICE_MAP.get(place.get("priceLevel") or "")
    if not ai_price and not g_price:
        return
    conflict = bool(ai_price and g_price and ai_price != g_price)
    db.upsert_verification_data(conn, {
        "entity_id": poi["id"],
        "field_name": "price_level",
        "ai_value": ai_price,
        "verified_value": g_price,
        "verification_source": "google_places",
        "conflict_exists": conflict,
        "conflict_note": (
            f"Creators say {ai_price}, Google says {g_price}" if conflict else None
        ),
    })


def enrich_poi(conn, poi: dict[str, Any]) -> str:
    """Enrich one POI. Returns an outcome label ('verified' | 'stored' | 'not_found')."""
    place = search_place(_build_query(poi))
    if not place:
        return "not_found"

    google_name = (place.get("displayName") or {}).get("text") or ""
    sim = similarity(poi["normalized_name"] or "", normalize(google_name))
    verified = sim >= VERIFY_MIN_SIM

    fields = _to_google_fields(place)
    fields["verification_status"] = "google_verified" if verified else "ai_extracted"
    db.update_poi_google_enrichment(conn, poi["id"], fields)
    _record_price_conflict(conn, poi, place)
    return "verified" if verified else "stored"
