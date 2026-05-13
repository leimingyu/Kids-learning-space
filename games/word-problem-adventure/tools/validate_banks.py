#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate word_problem_adventure.html question banks."""
from __future__ import annotations

import json
import re
import subprocess
import tempfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Game was renamed from word_problem_adventure.html to index.html during the hub migration.
HTML = ROOT.parent / "index.html"

BANNED_SUBSTRINGS = ("rephrase", "Actually", "fix:", "… wait", "count problem:")

# Vocabulary that previous review found confusing for 8–10-year-old US kids.
# Reintroducing any of these should fail validation.
BANNED_VOCAB = (
    "fossil prints",      # mismatched noun in "How many cards" template
    "spirit votes",       # uncommon school term
    "rhythm sticks",      # uncommon instrument name; prefer "drumsticks"
    "tide pool tray",     # uncommon setting; prefer "tray at the aquarium"
)

# True umbrella nouns. When the asked-noun is one of these, the two source
# nouns don't need to match it (e.g. "drumsticks + bells → instruments").
# Specific nouns like "cards" or "bagels" are NOT in here on purpose: those
# must literally appear in both source groups.
GENERIC_ASKER_NOUNS = {
    "items", "things", "pieces", "parts", "objects",
    "creatures", "animals", "bugs",
    "instruments",
    "snacks", "treats", "foods", "drinks", "veggies",
    "supplies", "equipment",
    "decorations",
    "plants", "flowers", "fruits", "vegetables",
    "toys", "tools",
    "people",
}

EXPECTED_LEGACY_COUNTS = {"easy": 100, "medium": 100, "hard": 100}
REQUIRED_TYPES = {
    "Part–Part–Whole",
    "Multi-step",
    "Separate",
    "Money / Measurement Conversion",
    "Remainder Interpretation",
    "Two-Step Compare",
    "Elapsed Time",
    "Fraction of a Set",
    "Join",
    "Unknown",
    "Compare",
    "Sharing",
    "Change Unknown",
}
LEGACY_PREFIXES = {
    "easy": re.compile(r"^e\d{3}$"),
    "medium": re.compile(r"^m\d{3}$"),
    "hard": re.compile(r"^h\d{3}$"),
}


def extract_script(html: str) -> str:
    m = re.search(r"<script>\s*(\(function \(\) \{.*?\}\)\(\);\s*)</script>", html, re.DOTALL)
    if not m:
        raise SystemExit("Could not extract main script")
    return m.group(1)


def parse_question_objects(script: str) -> list[dict]:
    """Parse { id: ... } objects from const arrays (best-effort)."""
    objs = []
    for m in re.finditer(
        r"\{\s*id:\s*\"([^\"]+)\"[^}]*answer:\s*(\d+)[^}]*\}",
        script,
        re.DOTALL,
    ):
        # Too greedy - need better parse. Split by '    { id:'
        pass
    # Line-based: each question is one line starting with spaces and { id:
    for line in script.splitlines():
        line = line.strip()
        if not line.startswith('{ id: "'):
            continue
        if "problemType:" not in line:
            continue
        oid = re.search(r'id:\s*"([^"]+)"', line)
        ans = re.search(r"answer:\s*(\d+)", line)
        pt = re.search(r'problemType:\s*"([^"]*)"', line)
        st = re.search(r'sessionLevel:\s*"([^"]*)"', line)
        tx = re.search(r'text:\s*"((?:[^"\\]|\\.)*?)"', line)
        if not oid or not ans or not pt:
            continue
        objs.append(
            {
                "id": oid.group(1),
                "answer": int(ans.group(1)),
                "problemType": pt.group(1),
                "sessionLevel": st.group(1) if st else None,
                "text": tx.group(1) if tx else "",
                "line": line,
            }
        )
    return objs


# Conservative shape: "N <group_a> and M <group_b>. ... How many <asker>"
# where both groups are 1-2 words and the asker is 1-3 words. This matches the
# museum-cart template family but skips multi-step questions whose groups are
# verb phrases or prepositional clauses (too parser-fragile to judge).
SIMPLE_TWO_GROUP_RE = re.compile(
    r"\b(\d+)\s+([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*)?)\s+and\s+"
    r"(\d+)\s+([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*)?)\s*\."
)
SIMPLE_ASKER_RE = re.compile(
    r"\bHow many\s+([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){0,2}?)"
    r"\s+(?:are|is|do|does|did|was|were|have|has)\b",
    re.IGNORECASE,
)

# Words that often follow "How many ..." as modifiers, not as the head noun.
# When the parsed head matches one of these, we skip — the real head is earlier
# in the asker and our regex didn't isolate it cleanly.
NON_HEAD_WORDS = {
    "more", "fewer", "longer", "taller", "shorter", "older", "younger",
    "heavier", "lighter", "warmer", "cooler", "altogether", "total", "in",
}


def _words(phrase: str) -> list[str]:
    return [w.lower() for w in re.findall(r"[A-Za-z][A-Za-z-]*", phrase)]


def _singularize(w: str) -> str:
    """Crude plural-to-singular for matching ('cards' ↔ 'card')."""
    if len(w) > 3 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 2 and w.endswith("es") and not w.endswith("ses"):
        return w[:-2]
    if len(w) > 2 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


def _word_match(a: str, b: str) -> bool:
    return _singularize(a) == _singularize(b)


def audit_text_quality(qs: list[dict]) -> list[str]:
    """Return a list of human-readable error strings; empty list means clean."""
    errors: list[str] = []

    for q in qs:
        text = q["text"]
        if not text:
            continue

        # 1) Banned vocabulary check (cheap, case-insensitive)
        text_lc = text.lower()
        for bad in BANNED_VOCAB:
            if bad in text_lc:
                errors.append(f"{q['id']}: banned vocabulary {bad!r} → {text}")

        # 2) Decimeter / dm units (US grade-school standard is in/ft/cm/m)
        if re.search(r"\bdecimeter|\bdm\b", text):
            errors.append(f"{q['id']}: uses decimeters/dm (not US grade-school standard) → {text}")

        # 3) Two-group asked-noun consistency (museum-cart template family).
        # Only meaningful for simple additive shapes. Compare/Multi-step/Money
        # questions legitimately phrase the asker differently (e.g. "How many
        # more votes...", "How many cents..." with coin groups).
        if q["problemType"] not in {"Part–Part–Whole", "Join"}:
            continue
        hm = SIMPLE_ASKER_RE.search(text)
        if not hm:
            continue
        tg = SIMPLE_TWO_GROUP_RE.search(text[: hm.start()])
        if not tg:
            continue
        group_a, group_b = tg.group(2).strip(), tg.group(4).strip()
        asker = hm.group(1).strip()
        asker_words = _words(asker)
        if not asker_words:
            continue
        head = asker_words[-1]
        # Skip comparison-style asks where the head is a modifier, not a noun.
        if head in NON_HEAD_WORDS:
            continue
        # Umbrella term in the asker = fine regardless of group nouns.
        if any(w in GENERIC_ASKER_NOUNS for w in asker_words):
            continue

        a_words = _words(group_a)
        b_words = _words(group_b)
        in_a = any(_word_match(w, head) for w in a_words)
        in_b = any(_word_match(w, head) for w in b_words)
        if in_a and in_b:
            continue
        # If the head noun appears BEFORE the two-group span (setup mention
        # like "A baker made 40 rolls."), the count is established upstream
        # and the two groups are just adverbial — don't flag.
        # Note: must be before the groups, not before "How many", otherwise the
        # groups themselves can mask a mismatch.
        lead_text = text[: tg.start()]
        if any(_word_match(w, head) for w in _words(lead_text)):
            continue
        if not in_a and not in_b:
            errors.append(
                f"{q['id']}: asks 'How many {asker}' but neither group "
                f"({group_a!r}, {group_b!r}) contains {head!r}, and "
                f"the asker has no umbrella noun. → {text}"
            )
        else:
            bad_side = group_a if not in_a else group_b
            errors.append(
                f"{q['id']}: asks 'How many {asker}' but only one group matches. "
                f"Mismatched group: {bad_side!r}. Rename it or use an umbrella asker. → {text}"
            )

    return errors


def main() -> None:
    html = HTML.read_text(encoding="utf-8")
    for bad in BANNED_SUBSTRINGS:
        if bad in html:
            raise SystemExit(f"Banned substring found: {bad!r}")

    script = extract_script(html)
    # Sanity: selection algorithm should include short-session quotas.
    if "function getBandQuota" not in script or "return { 1: 4, 2: 4, 3: 2 }" not in script:
        raise SystemExit("Missing Quick Play band quota (4/4/2) in selection logic")
    if "return { 1: 7, 2: 8, 3: 5 }" not in script:
        raise SystemExit("Missing Standard Play band quota (7/8/5) in selection logic")
    tmp = Path(tempfile.mkstemp(suffix=".js")[1])
    try:
        tmp.write_text(script, encoding="utf-8")
        r = subprocess.run(["node", "--check", str(tmp)], capture_output=True, text=True)
        if r.returncode != 0:
            raise SystemExit("node --check failed:\n" + (r.stderr or r.stdout))
    finally:
        tmp.unlink(missing_ok=True)

    qs = parse_question_objects(script)
    ids = [q["id"] for q in qs]
    if len(ids) != len(set(ids)):
        dupes = [i for i in ids if ids.count(i) > 1]
        raise SystemExit("Duplicate ids: " + str(set(dupes)))

    text_errors = audit_text_quality(qs)
    if text_errors:
        print(f"\nText-quality audit found {len(text_errors)} issue(s):")
        for e in text_errors:
            print("  -", e)
        raise SystemExit(f"Text-quality audit failed ({len(text_errors)} issues)")

    by_prefix = {"easy": [], "medium": [], "hard": []}
    for q in qs:
        for lev, pref in LEGACY_PREFIXES.items():
            if pref.match(q["id"]):
                by_prefix[lev].append(q)
                break

    for lev, n in EXPECTED_LEGACY_COUNTS.items():
        if len(by_prefix[lev]) != n:
            raise SystemExit(f"Legacy {lev} count expected {n}, got {len(by_prefix[lev])}")

    type_counts = Counter(q["problemType"] for q in qs)
    for pt in sorted(REQUIRED_TYPES):
        if type_counts[pt] < 50:
            raise SystemExit(f"Type {pt!r} needs >= 50 questions, got {type_counts[pt]}")

    for q in qs:
        if q["answer"] < 0:
            raise SystemExit(f"Negative answer: {q['id']}")
        if q["problemType"] == "Fraction of a Set":
            pass  # generator ensures whole-number answers

    # sessionLevel required for non-legacy IDs
    valid_levels = {"easy", "medium", "hard"}
    for q in qs:
        is_legacy = any(pref.match(q["id"]) for pref in LEGACY_PREFIXES.values())
        if not is_legacy:
            if not q["sessionLevel"]:
                raise SystemExit(f"Missing sessionLevel for extended id: {q['id']}")
            if q["sessionLevel"] not in valid_levels:
                raise SystemExit(f"Invalid sessionLevel {q['sessionLevel']!r} for id: {q['id']}")

    print("OK:", len(qs), "total questions")
    print("By problemType (top):", json.dumps(dict(type_counts.most_common(20)), indent=2))


if __name__ == "__main__":
    main()
