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

# Destination name variants -> canonical destination slug (NCR scope).
DESTINATION_ALIASES = {
    "delhi": "delhi",
    "new delhi": "delhi",
    "central delhi": "delhi",
    "old delhi": "delhi",
    "south delhi": "delhi",
    "north delhi": "delhi",
    "delhi ncr": "delhi",
    "ncr": "delhi",
    "gurgaon": "gurgaon",
    "gurugram": "gurgaon",
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
