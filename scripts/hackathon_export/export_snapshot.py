#!/usr/bin/env python3
"""Export the Rasta DB to the qloo-hackathon static snapshot (data/evidence-snapshot.json).

Reconstructs the schema the qloo app's lib/evidence.ts consumes: one record per active POI
with destination/area names, all curated fields, a flattened evidence[] (each carrying its
source attribution + a deep link), and a primary creator_video. Source-agnostic (YouTube +
blog). No LLM calls.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, "/Users/admin/Downloads/ts")
sys.path.insert(0, "/Users/admin/Downloads/ts")

from pipeline import db  # noqa: E402

OUT = Path("/Users/admin/Downloads/qloo-hackathon/data/evidence-snapshot.json")


def _claims(raw):
    if raw is None:
        return []
    return raw if isinstance(raw, list) else json.loads(raw)


def _min_ts(claims):
    ts = [c.get("timestamp_seconds") for c in claims if isinstance(c, dict) and c.get("timestamp_seconds") is not None]
    return min(ts) if ts else 0


def _deep_link(url, platform, ts):
    if url and platform == "youtube" and ts:
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}t={ts}"
    return url


def main():
    with db.connect() as c:
        cur = c.cursor()
        cur.execute(
            """
            select p.id, p.name, p.name_local, p.slug, p.normalized_name, p.entity_type,
                   p.poi_category, p.lat, p.lng, d.slug as destination, a.name as area,
                   p.recommendation_score, p.frequency_count, p.specialities, p.tips,
                   p.warnings, p.best_time, p.price_level, p.average_cost_inr, p.crowd_info,
                   p.verification_status
            from points_of_interest p
            join destinations d on d.id = p.destination_id
            left join areas a on a.id = p.area_id
            where p.is_active = true
            order by p.recommendation_score desc nulls last
            """
        )
        pois = [dict(r) for r in cur.fetchall()]

        out = []
        for p in pois:
            cur.execute(
                """
                select ee.stance, ee.recommendation_strength, ee.claims,
                       ee.source_views_at_extraction, ee.source_upload_date,
                       s.url, s.video_id, s.platform, s.creator_name, s.title, s.view_count
                from entity_evidence ee
                join sources s on s.id = ee.source_id
                where ee.entity_id = %s
                order by coalesce(ee.source_views_at_extraction, s.view_count, 0) desc,
                         ee.recommendation_strength desc nulls last
                """,
                (p["id"],),
            )
            evs = []
            for e in (dict(r) for r in cur.fetchall()):
                claims = _claims(e["claims"])
                ts = _min_ts(claims)
                url = e["url"]
                views = e["source_views_at_extraction"] or e["view_count"] or 0
                upload = e["source_upload_date"].isoformat() if e["source_upload_date"] else None
                evs.append({
                    "stance": e["stance"],
                    "strength": float(e["recommendation_strength"]) if e["recommendation_strength"] is not None else None,
                    "claims": claims,
                    "views": views,
                    "upload_date": upload,
                    "source_url": url,
                    "video_id": e["video_id"],
                    "platform": e["platform"],
                    "creator_name": e["creator_name"],
                    "source_title": e["title"],
                    "timestamp_seconds": ts,
                    "deep_link": _deep_link(url, e["platform"], ts),
                })

            creator_video = None
            if evs:
                top = evs[0]
                creator_video = {
                    "url": top["deep_link"],
                    "video_id": top["video_id"],
                    "platform": top["platform"],
                    "creator_name": top["creator_name"],
                    "title": top["source_title"],
                    "views": top["views"],
                    "timestamp_seconds": top["timestamp_seconds"],
                }

            rec = {
                "name": p["name"],
                "name_local": p["name_local"],
                "slug": p["slug"],
                "normalized_name": p["normalized_name"],
                "entity_type": p["entity_type"],
                "poi_category": p["poi_category"],
                "lat": float(p["lat"]) if p["lat"] is not None else None,
                "lng": float(p["lng"]) if p["lng"] is not None else None,
                "destination": p["destination"],
                "area": p["area"],
                "recommendation_score": round(float(p["recommendation_score"]), 4) if p["recommendation_score"] is not None else None,
                "frequency_count": p["frequency_count"],
                "specialities": p["specialities"],
                "tips": p["tips"],
                "warnings": p["warnings"],
                "best_time": p["best_time"],
                "price_level": p["price_level"],
                "average_cost_inr": p["average_cost_inr"],
                "crowd_info": p["crowd_info"],
                "verification_status": p["verification_status"],
                "evidence": evs,
                "creator_video": creator_video,
            }
            out.append(rec)

    payload = {
        "exported_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source": "rasta-pipeline (Supabase) static export",
        "poi_count": len(out),
        "pois": out,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    byc = {}
    for r in out:
        byc[r["destination"]] = byc.get(r["destination"], 0) + 1
    print(f"[export] wrote {len(out)} POIs -> {OUT}")
    print("[export] by destination:", dict(sorted(byc.items(), key=lambda x: -x[1])))


if __name__ == "__main__":
    main()
