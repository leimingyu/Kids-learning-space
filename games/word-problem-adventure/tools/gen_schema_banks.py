# -*- coding: utf-8 -*-
"""Generate the two missing CGI schema banks and patch them into index.html.

Adds (append-only — never touches the shipped legacy banks, which were
hand-corrected after gen_banks.py last ran and MUST NOT be regenerated):

- QUESTIONS_INVERSE_COMPARE  (problemType "Inverse Compare", 50, medium)
    Referent-unknown / inverse-language compare: the keyword points at the
    WRONG operation ("Ben has 5 more than Ana" → find Ana by SUBTRACTING).
    The canonical CGI hard case; hints call out the trap explicitly.
- QUESTIONS_EQUAL_GROUPS     (problemType "Equal Groups", 50, hard)
    Pure single-step equal-groups multiplication — the missing rung before
    hard's multi-step items, and it makes the (previously unreachable)
    "Equal-Groups Expert" badge earnable.
- QUESTIONS_COMPARE_TOPUP    (problemType "Compare", 1, medium)
    One classic difference-unknown item to lift Compare from 49 to the
    validator's required 50.

Idempotent: re-running replaces the three blocks in place.
Run:  python3 games/word-problem-adventure/tools/gen_schema_banks.py
Then: python3 games/word-problem-adventure/tools/validate_banks.py
"""
from __future__ import annotations

from pathlib import Path

from gen_banks import fmt_q

ROOT = Path(__file__).resolve().parent
HTML = ROOT.parent / "index.html"

PT_IC = "Inverse Compare"
PT_EG = "Equal Groups"
PT_CP = "Compare"


# ── Inverse Compare ─────────────────────────────────────────────────────────
# (name_known, name_unknown, item, emoji, diff, known_amount, trap)
# trap "more":  known has diff MORE  than unknown → unknown = known - diff
# trap "fewer": known has diff FEWER than unknown → unknown = known + diff
IC_SPECS = [
    # band 1 — numbers within 20
    ("Ben",   "Ana",   "shells",    "🐚", 5,  17, "more"),
    ("Mia",   "Leo",   "stickers",  "⭐", 3,  12, "more"),
    ("Omar",  "Zoe",   "marbles",   "🔵", 4,  15, "more"),
    ("Priya", "Sam",   "crayons",   "🖍️", 6,  14, "more"),
    ("Jada",  "Finn",  "buttons",   "🔘", 2,  11, "more"),
    ("Mateo", "Ivy",   "acorns",    "🌰", 7,  19, "more"),
    ("Kona",  "Max",   "leaves",    "🍁", 3,  10, "more"),
    ("Ruby",  "Eli",   "stamps",    "📬", 5,  13, "more"),
    ("Noor",  "Cole",  "pebbles",   "🪨", 4,  18, "more"),
    ("Lily",  "Rex",   "feathers",  "🪶", 6,  16, "more"),
    ("Ana",   "Ben",   "beads",     "📿", 4,   9, "fewer"),
    ("Leo",   "Mia",   "blocks",    "🧱", 5,  12, "fewer"),
    ("Zoe",   "Omar",  "cards",     "🃏", 3,  14, "fewer"),
    ("Sam",   "Priya", "seeds",     "🌱", 6,  11, "fewer"),
    ("Finn",  "Jada",  "berries",   "🫐", 2,  13, "fewer"),
    ("Ivy",   "Mateo", "pinecones", "🌲", 4,  10, "fewer"),
    ("Max",   "Kona",  "coins",     "🪙", 5,  15, "fewer"),
    ("Eli",   "Ruby",  "gems",      "💎", 3,   8, "fewer"),
    ("Cole",  "Noor",  "ribbons",   "🎀", 6,  12, "fewer"),
    ("Rex",   "Lily",  "pins",      "📌", 4,  14, "fewer"),
    # band 2 — numbers within 60
    ("Ben",   "Zoe",   "trading cards", "🃏", 12, 38, "more"),
    ("Mia",   "Sam",   "stickers",      "⭐", 15, 47, "more"),
    ("Omar",  "Ana",   "marbles",       "🔵", 13, 41, "more"),
    ("Priya", "Rex",   "beads",         "📿", 18, 52, "more"),
    ("Jada",  "Leo",   "shells",        "🐚", 11, 36, "more"),
    ("Mateo", "Ruby",  "stamps",        "📬", 14, 45, "more"),
    ("Kona",  "Eli",   "buttons",       "🔘", 16, 50, "more"),
    ("Noor",  "Finn",  "acorns",        "🌰", 12, 33, "more"),
    ("Lily",  "Max",   "pebbles",       "🪨", 17, 49, "more"),
    ("Ana",   "Cole",  "crayons",       "🖍️", 13, 29, "fewer"),
    ("Leo",   "Priya", "coins",         "🪙", 15, 34, "fewer"),
    ("Zoe",   "Mateo", "gems",          "💎", 12, 27, "fewer"),
    ("Sam",   "Kona",  "leaves",        "🍁", 16, 38, "fewer"),
    ("Finn",  "Noor",  "seeds",         "🌱", 11, 42, "fewer"),
    ("Ivy",   "Ben",   "feathers",      "🪶", 14, 31, "fewer"),
    ("Max",   "Jada",  "blocks",        "🧱", 13, 44, "fewer"),
    ("Ruby",  "Omar",  "berries",       "🫐", 18, 39, "fewer"),
    ("Eli",   "Lily",  "ribbons",       "🎀", 15, 26, "fewer"),
    # band 3 — numbers within 100
    ("Ben",   "Ruby",  "baseball cards", "⚾", 24, 81, "more"),
    ("Mia",   "Eli",   "stickers",       "⭐", 27, 90, "more"),
    ("Omar",  "Lily",  "marbles",        "🔵", 23, 75, "more"),
    ("Priya", "Max",   "stamps",         "📬", 26, 88, "more"),
    ("Jada",  "Cole",  "beads",          "📿", 22, 67, "more"),
    ("Mateo", "Noor",  "shells",         "🐚", 25, 79, "more"),
    ("Kona",  "Ivy",   "buttons",        "🔘", 28, 93, "fewer"),
    ("Zoe",   "Ben",   "coins",          "🪙", 24, 58, "fewer"),
    ("Sam",   "Mia",   "trading cards",  "🃏", 23, 65, "fewer"),
    ("Finn",  "Omar",  "pebbles",        "🪨", 27, 61, "fewer"),
    ("Ruby",  "Priya", "gems",           "💎", 22, 70, "fewer"),
    ("Cole",  "Jada",  "acorns",         "🌰", 26, 57, "fewer"),
]


def gen_inverse_compare() -> list[str]:
    rows: list[str] = []
    for i, (known, unknown, item, emoji, diff, amount, trap) in enumerate(IC_SPECS, 1):
        band = 1 if i <= 20 else 2 if i <= 38 else 3
        if trap == "more":
            answer = amount - diff
            assert answer > 0, f"iv{i:03d}: bad spec"
            text = (
                f"{known} has {diff} more {item} than {unknown}. "
                f"{known} has {amount} {item}. "
                f"How many {item} does {unknown} have?"
            )
            hint = (
                f"Careful — “more than” is about {known}! {known} has more, "
                f"so {unknown} must have FEWER. Take away {diff} from {amount}."
            )
            explain = (
                f"{emoji} {known} has {diff} more, so {unknown} has fewer: "
                f"{amount} − {diff} = **{answer}**."
            )
            visual = f"{emoji}{amount}−{diff}"
            hkw = ["more", "than"]
        else:
            answer = amount + diff
            text = (
                f"{known} has {diff} fewer {item} than {unknown}. "
                f"{known} has {amount} {item}. "
                f"How many {item} does {unknown} have?"
            )
            hint = (
                f"Careful — “fewer than” is about {known}! {known} has fewer, "
                f"so {unknown} must have MORE. Add {diff} to {amount}."
            )
            explain = (
                f"{emoji} {known} has {diff} fewer, so {unknown} has more: "
                f"{amount} + {diff} = **{answer}**."
            )
            visual = f"{emoji}{amount}+{diff}"
            hkw = ["fewer", "than"]
        rows.append(
            fmt_q(
                f"iv{i:03d}",
                text=text,
                answer=answer,
                band=band,
                problem_type=PT_IC,
                visual=visual,
                hint_keywords=hkw,
                hint=hint,
                explain=explain,
                session_level="medium",
            )
        )
    return rows


# ── Equal Groups ────────────────────────────────────────────────────────────
# (frame, groups, per, emoji) — frames rotate so items don't share one shape.
EG_SPECS = [
    # band 1 — small facts (factors ≤ 6)
    ("There are {g} baskets. Each basket holds {n} apples. How many apples are there in all?", 4, 6, "🍎"),
    ("The bakery fills {g} boxes. Each box has {n} muffins. How many muffins are there in all?", 3, 5, "🧁"),
    ("The garden has {g} rows of {n} carrots. How many carrots are in the garden?", 5, 4, "🥕"),
    ("{g} friends each bring {n} balloons. How many balloons do they bring in all?", 6, 3, "🎈"),
    ("A shelf has {g} stacks of {n} books. How many books are on the shelf?", 4, 5, "📚"),
    ("There are {g} ponds. Each pond has {n} ducks. How many ducks are there in all?", 3, 6, "🦆"),
    ("The art room has {g} jars with {n} brushes in each jar. How many brushes are there?", 5, 5, "🖌️"),
    ("{g} wagons each carry {n} pumpkins. How many pumpkins are there in all?", 2, 6, "🎃"),
    ("A sticker sheet has {g} rows of {n} stars. How many stars are on the sheet?", 6, 4, "⭐"),
    ("There are {g} nests. Each nest has {n} eggs. How many eggs are there in all?", 4, 3, "🥚"),
    ("The parking lot has {g} rows of {n} cars. How many cars are in the lot?", 5, 6, "🚗"),
    ("{g} lunch bags each hold {n} crackers. How many crackers are there in all?", 6, 5, "🍘"),
    ("A quilt has {g} rows of {n} patches. How many patches are on the quilt?", 3, 4, "🟪"),
    ("There are {g} fish tanks. Each tank has {n} fish. How many fish are there in all?", 6, 6, "🐟"),
    ("The team packs {g} bags with {n} balls in each bag. How many balls are there?", 4, 4, "⚽"),
    ("{g} tables each have {n} chairs. How many chairs are there in all?", 5, 3, "🪑"),
    ("A bug jar has {g} sticks with {n} ladybugs on each stick. How many ladybugs are there?", 3, 3, "🐞"),
    ("There are {g} vases. Each vase holds {n} tulips. How many tulips are there in all?", 2, 5, "🌷"),
    ("The class makes {g} rows of {n} paper boats. How many boats do they make?", 6, 2, "⛵"),
    ("{g} pizza boxes each have {n} slices. How many slices are there in all?", 4, 2, "🍕"),
    # band 2 — products to ~72
    ("There are {g} cartons. Each carton holds {n} eggs. How many eggs are there in all?", 5, 12, "🥚"),
    ("The library cart has {g} shelves with {n} books on each shelf. How many books are on the cart?", 7, 8, "📚"),
    ("{g} teams each have {n} players. How many players are there in all?", 8, 6, "🏀"),
    ("A garden bed has {g} rows of {n} lettuce plants. How many plants are in the bed?", 7, 9, "🥬"),
    ("There are {g} packs with {n} juice boxes in each pack. How many juice boxes are there?", 8, 8, "🧃"),
    ("The school bus has {g} rows of {n} seats. How many seats are on the bus?", 9, 4, "🚌"),
    ("{g} boxes each hold {n} crayons. How many crayons are there in all?", 6, 10, "🖍️"),
    ("A choir stands in {g} rows of {n} singers. How many singers are in the choir?", 6, 9, "🎤"),
    ("There are {g} trays. Each tray has {n} cookies. How many cookies are there in all?", 7, 7, "🍪"),
    ("The store shelf has {g} rows of {n} soup cans. How many cans are on the shelf?", 8, 7, "🥫"),
    ("{g} spiders each have {n} legs. How many legs are there in all?", 9, 8, "🕷️"),
    ("A photo album has {g} pages with {n} photos on each page. How many photos are in the album?", 8, 9, "📷"),
    ("There are {g} bags with {n} oranges in each bag. How many oranges are there in all?", 6, 8, "🍊"),
    ("The band marches in {g} rows of {n} players. How many players march?", 9, 6, "🥁"),
    ("{g} sheets each have {n} stamps. How many stamps are there in all?", 9, 7, "📬"),
    ("A checkerboard section has {g} rows of {n} squares. How many squares is that?", 8, 5, "⬛"),
    ("There are {g} bunches with {n} bananas in each bunch. How many bananas are there?", 7, 6, "🍌"),
    ("The theater has {g} rows of {n} seats. How many seats are in the theater?", 9, 9, "🎭"),
    # band 3 — one factor 11–12
    ("There are {g} boxes. Each box holds {n} donuts. How many donuts are there in all?", 4, 12, "🍩"),
    ("A sticker book has {g} pages with {n} stickers on each page. How many stickers are there?", 6, 11, "⭐"),
    ("{g} egg cartons each hold {n} eggs. How many eggs are there in all?", 7, 12, "🥚"),
    ("The orchard has {g} rows of {n} apple trees. How many trees are in the orchard?", 8, 11, "🌳"),
    ("There are {g} packs with {n} pencils in each pack. How many pencils are there in all?", 9, 12, "✏️"),
    ("A calendar page shows {g} weeks of {n} days. How many days is that?", 5, 7, "📅"),
    ("{g} vans each carry {n} passengers. How many passengers ride in all?", 6, 12, "🚐"),
    ("The bead kit has {g} tubes with {n} beads in each tube. How many beads are in the kit?", 11, 9, "📿"),
    ("There are {g} sheets of {n} bottle caps. How many caps are there in all?", 12, 8, "🔵"),
    ("A brick wall has {g} rows of {n} bricks. How many bricks are in the wall?", 11, 11, "🧱"),
    ("{g} trays each hold {n} seedlings. How many seedlings are there in all?", 12, 6, "🌱"),
    ("The stadium section has {g} rows with {n} fans in each row. How many fans sit there?", 12, 12, "🎉"),
]


def gen_equal_groups() -> list[str]:
    rows: list[str] = []
    for i, (frame, g, n, emoji) in enumerate(EG_SPECS, 1):
        band = 1 if i <= 20 else 2 if i <= 38 else 3
        answer = g * n
        text = frame.format(g=g, n=n)
        hint = f"Count equal groups: {g} groups with {n} in each. Multiply {g} × {n}."
        explain = f"{emoji} {g} equal groups of {n}: {g} × {n} = **{answer}**."
        visual = f"{emoji}{g}×{n}"
        rows.append(
            fmt_q(
                f"eg{i:03d}",
                text=text,
                answer=answer,
                band=band,
                problem_type=PT_EG,
                visual=visual,
                hint_keywords=["each", "in all"],
                hint=hint,
                explain=explain,
                session_level="hard",
            )
        )
    return rows


def gen_compare_topup() -> list[str]:
    # Lifts Compare from 49 → the validator's required 50.
    return [
        fmt_q(
            "cp022",
            text="Maya read 24 pages. Liam read 18 pages. How many more pages did Maya read than Liam?",
            answer=6,
            band=1,
            problem_type=PT_CP,
            visual="📖24−18",
            hint_keywords=["How many more"],
            hint="Compare the two numbers: take the smaller away from the bigger.",
            explain="📖 24 − 18 = **6** more pages.",
            session_level="medium",
        )
    ]


BANK_NAMES = [
    ("QUESTIONS_INVERSE_COMPARE", gen_inverse_compare),
    ("QUESTIONS_EQUAL_GROUPS", gen_equal_groups),
    ("QUESTIONS_COMPARE_TOPUP", gen_compare_topup),
]

ARRAY_MARKER = "\n\n  var EXTRA_QUESTION_BANKS = ["
FIRST_CONST = "\n\n  const QUESTIONS_INVERSE_COMPARE = ["


def patch_html() -> None:
    text = HTML.read_text(encoding="utf-8")
    if ARRAY_MARKER not in text:
        raise SystemExit("patch_html: EXTRA_QUESTION_BANKS marker not found")

    # Idempotency: drop previously-generated blocks (ours sit directly
    # before the EXTRA_QUESTION_BANKS array).
    if FIRST_CONST in text:
        s = text.index(FIRST_CONST)
        e = text.index(ARRAY_MARKER)
        if s > e:
            raise SystemExit("patch_html: unexpected block order — refusing to patch")
        text = text[:s] + text[e:]

    chunks = []
    total = 0
    for name, gen in BANK_NAMES:
        lines = gen()
        total += len(lines)
        chunks.append(f"  const {name} = [\n" + ",\n".join(lines) + "\n  ];")
    text = text.replace(ARRAY_MARKER, "\n\n" + "\n\n".join(chunks) + ARRAY_MARKER, 1)

    # Register the banks in EXTRA_QUESTION_BANKS (append before the closing ]).
    tail = "QUESTIONS_CHANGE_UNKNOWN_EXTRA\n  ];"
    new_tail = (
        "QUESTIONS_CHANGE_UNKNOWN_EXTRA,\n"
        "    QUESTIONS_INVERSE_COMPARE,\n"
        "    QUESTIONS_EQUAL_GROUPS,\n"
        "    QUESTIONS_COMPARE_TOPUP\n  ];"
    )
    if new_tail not in text:
        if tail not in text:
            raise SystemExit("patch_html: EXTRA_QUESTION_BANKS tail not found")
        text = text.replace(tail, new_tail, 1)

    HTML.write_text(text, encoding="utf-8")
    print(f"Patched {HTML} with {total} questions across {len(BANK_NAMES)} new banks")


if __name__ == "__main__":
    patch_html()
