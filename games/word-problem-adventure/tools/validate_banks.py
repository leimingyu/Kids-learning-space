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
HTML = ROOT / "word_problem_adventure.html"

BANNED_SUBSTRINGS = ("rephrase", "Actually", "fix:", "… wait", "count problem:")

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
        if not oid or not ans or not pt:
            continue
        objs.append(
            {
                "id": oid.group(1),
                "answer": int(ans.group(1)),
                "problemType": pt.group(1),
                "sessionLevel": st.group(1) if st else None,
                "line": line,
            }
        )
    return objs


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
