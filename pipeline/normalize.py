"""Name normalization + fuzzy matching helpers for entity resolution (Stage 6).

Spec: pipeline-spec.md > STAGE 6 > Name Normalization Rules.
"""
from __future__ import annotations

import re

# Trailing category words to strip (only when >1 token remains).
_SUFFIXES = {
    "restaurant", "restro", "hotel", "cafe", "kitchen", "dhaba",
    "sweets", "bakery", "eatery",
}

# Delhi-specific spelling equivalences -> canonical form.
_SUBSTITUTIONS = [
    (r"\bwaali\b", "wali"),
    (r"\bvali\b", "wali"),
    (r"\bchauk\b", "chowk"),
    (r"\bkababian\b", "kababian"),
]

# Destination name variants -> canonical destination slug (India-wide).
DESTINATION_ALIASES = {
    # --- NCR ---
    "delhi": "delhi", "new delhi": "delhi", "central delhi": "delhi", "old delhi": "delhi",
    "south delhi": "delhi", "north delhi": "delhi", "east delhi": "delhi", "west delhi": "delhi",
    "delhi ncr": "delhi", "ncr": "delhi",
    "gurgaon": "gurgaon", "gurugram": "gurgaon",
    # --- Rajasthan ---
    "jaipur": "jaipur", "udaipur": "udaipur", "jodhpur": "jodhpur", "jaisalmer": "jaisalmer",
    "pushkar": "pushkar", "ajmer": "ajmer", "bhilwara": "bhilwara", "bikaner": "bikaner",
    "mount abu": "mount-abu",
    # --- North / Hills ---
    "agra": "agra", "varanasi": "varanasi", "banaras": "varanasi", "kashi": "varanasi",
    "lucknow": "lucknow", "amritsar": "amritsar", "chandigarh": "chandigarh",
    "mussoorie": "mussoorie", "mussorie": "mussoorie", "rishikesh": "rishikesh",
    "haridwar": "haridwar", "dehradun": "dehradun", "nainital": "nainital",
    "shimla": "shimla", "manali": "manali", "dharamshala": "dharamshala", "mcleodganj": "dharamshala",
    "srinagar": "srinagar", "leh": "leh", "ladakh": "leh",
    # --- West ---
    "mumbai": "mumbai", "bombay": "mumbai", "pune": "pune", "goa": "goa",
    "ahmedabad": "ahmedabad", "surat": "surat",
    # --- South ---
    "bangalore": "bangalore", "bengaluru": "bangalore", "mysore": "mysore", "mysuru": "mysore",
    "chennai": "chennai", "madras": "chennai", "hyderabad": "hyderabad",
    "kochi": "kochi", "cochin": "kochi", "munnar": "munnar", "pondicherry": "pondicherry",
    "puducherry": "pondicherry", "ooty": "ooty", "madurai": "madurai",
    # --- East ---
    "kolkata": "kolkata", "calcutta": "kolkata",
    "darjeeling": "darjeeling", "west bengal": "darjeeling", "siliguri": "darjeeling",
    # --- Northeast (region-level hubs; NE travel is region-based) ---
    "sikkim": "sikkim", "gangtok": "sikkim", "lachung": "sikkim", "lachen": "sikkim",
    "yumthang": "sikkim", "yumthang valley": "sikkim", "gurudongmar": "sikkim",
    "gurudongmar lake": "sikkim", "north sikkim": "sikkim", "pelling": "sikkim",
    "meghalaya": "meghalaya", "shillong": "meghalaya", "cherrapunji": "meghalaya",
    "sohra": "meghalaya", "dawki": "meghalaya", "mawlynnong": "meghalaya",
    "assam": "guwahati", "guwahati": "guwahati", "kamakhya": "guwahati",
}


def normalize(name: str) -> str:
    """Normalize an entity name for matching. E.g. "Karim's Restaurant" -> "karims"."""
    if not name:
        return ""
    s = name.lower().strip()
    s = re.sub(r"^the\s+", "", s)                 # leading "the"
    s = s.replace("'s", "s")                       # Karim's -> Karims
    s = re.sub(r"[^\w\s]", " ", s)                # drop punctuation
    for pat, repl in _SUBSTITUTIONS:
        s = re.sub(pat, repl, s)
    s = re.sub(r"\s+", " ", s).strip()
    tokens = s.split()
    if len(tokens) > 1 and tokens[-1] in _SUFFIXES:
        tokens = tokens[:-1]
    return " ".join(tokens).strip()


def canonical_destination(name: str) -> str | None:
    """Map an extraction destination name to a seeded destination slug, or None."""
    if not name:
        return None
    return DESTINATION_ALIASES.get(name.strip().lower())


def slugify(name: str) -> str:
    """URL-safe slug from a name."""
    s = re.sub(r"[^\w\s-]", "", name.lower()).strip()
    s = re.sub(r"[\s_]+", "-", s)
    return re.sub(r"-+", "-", s).strip("-")


def levenshtein(a: str, b: str) -> int:
    """Edit distance between two strings (small-input DP)."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(
                prev[j] + 1,        # deletion
                cur[j - 1] + 1,     # insertion
                prev[j - 1] + (ca != cb),  # substitution
            ))
        prev = cur
    return prev[-1]


def similarity(a: str, b: str) -> float:
    """Normalized similarity 0-1 from edit distance (1.0 = identical)."""
    if not a and not b:
        return 1.0
    m = max(len(a), len(b))
    return 1.0 - levenshtein(a, b) / m if m else 0.0
