# -*- coding: utf-8 -*-
"""Generate extended question banks: Money/Measurement, Remainder, Two-Step Compare, Elapsed Time, Fraction."""
from __future__ import annotations

from gen_banks import fmt_q

PT_MM = "Money / Measurement Conversion"
PT_RI = "Remainder Interpretation"
PT_TC = "Two-Step Compare"
PT_ET = "Elapsed Time"
PT_FS = "Fraction of a Set"

# Underfilled legacy types (need ≥ 50 overall across all banks)
PT_JOIN = "Join"
PT_UNKNOWN = "Unknown"
PT_COMPARE = "Compare"
PT_SHARING = "Sharing"
PT_CHANGE_UNKNOWN = "Change Unknown"


def gen_money_measurement() -> list[str]:
    rows: list[str] = []
    n = 0

    def push(
        text: str,
        answer: int,
        band: int,
        sl: str,
        visual: str,
        hint: str,
        explain: str,
        hkw: list[str],
    ):
        nonlocal n
        n += 1
        rows.append(
            fmt_q(
                f"mm{n:03d}",
                text=text,
                answer=answer,
                band=band,
                problem_type=PT_MM,
                visual=visual,
                hint_keywords=hkw,
                hint=hint,
                explain=explain,
                session_level=sl,
            )
        )

    easy_specs = [
        (
            "You have 3 nickels. How many cents do you have?",
            15,
            "3×5¢",
            "A nickel is worth 5 cents.",
            "💰 3 × 5 = **15** cents.",
            ["cents", "nickels"],
        ),
        (
            "You have 4 dimes. How many cents do you have?",
            40,
            "4×10¢",
            "A dime is worth 10 cents.",
            "💰 4 × 10 = **40** cents.",
            ["cents", "dimes"],
        ),
        (
            "You have 6 pennies. How many cents do you have?",
            6,
            "6¢",
            "Each penny is worth 1 cent.",
            "💰 6 × 1 = **6** cents.",
            ["pennies", "cents"],
        ),
        (
            "You have 2 quarters. How many cents do you have?",
            50,
            "2×25¢",
            "A quarter is worth 25 cents.",
            "💰 2 × 25 = **50** cents.",
            ["quarters", "cents"],
        ),
        (
            "You have 1 dime and 3 pennies. How many cents do you have?",
            13,
            "10+3¢",
            "Add the dime and the pennies.",
            "💰 10 + 3 = **13** cents.",
            ["cents", "add"],
        ),
        (
            "You have 1 nickel and 4 pennies. How many cents do you have?",
            9,
            "5+4¢",
            "Add the nickel and the pennies.",
            "💰 5 + 4 = **9** cents.",
            ["cents", "nickel"],
        ),
        (
            "You have 2 nickels and 1 dime. How many cents do you have?",
            20,
            "10+10¢",
            "Two nickels make 10 cents, plus one dime is 10 more.",
            "💰 10 + 10 = **20** cents.",
            ["cents", "coins"],
        ),
        (
            "A ribbon is 2 feet long. How many inches long is it? (12 inches = 1 foot.)",
            24,
            "2×12in",
            "Multiply feet by 12 to get inches.",
            "📏 2 × 12 = **24** inches.",
            ["feet", "inches"],
        ),
        (
            "A fence piece is 3 feet long. How many inches is that? (12 inches = 1 foot.)",
            36,
            "3×12in",
            "Each foot is 12 inches.",
            "📏 3 × 12 = **36** inches.",
            ["feet", "inches"],
        ),
        (
            "You have 1 quarter and 2 nickels. How many cents do you have?",
            35,
            "25+10¢",
            "Add the quarter and the nickels.",
            "💰 25 + 10 = **35** cents.",
            ["quarters", "nickels"],
        ),
    ]
    for txt, ans, vis, hint, expl, hkw in easy_specs:
        push(txt, ans, 1, "easy", vis, hint, expl, hkw)

    med_data: list[tuple[str, int, str, str, str, list[str]]] = [
        (
            "A pencil costs 35 cents. You pay with 50 cents. How many cents is your change?",
            15,
            "50−35¢",
            "Subtract the price from what you paid.",
            "💰 50 − 35 = **15** cents change.",
            ["change", "subtract"],
        ),
        (
            "A sticker costs 60 cents. You pay with 1 dollar (100 cents). How many cents is your change?",
            40,
            "100−60¢",
            "Think of a dollar as 100 cents, then subtract.",
            "💰 100 − 60 = **40** cents change.",
            ["change", "cents"],
        ),
        (
            "You have 3 quarters and 1 dime. How many cents do you have?",
            85,
            "75+10¢",
            "Add the value of each coin type.",
            "💰 3 × 25 = 75, plus 10 = **85** cents.",
            ["quarters", "dime"],
        ),
        (
            "You have 2 quarters, 1 nickel, and 3 pennies. How many cents do you have?",
            58,
            "coins",
            "Add quarters, then the nickel, then the pennies.",
            "💰 50 + 5 + 3 = **58** cents.",
            ["cents", "add"],
        ),
        (
            "A notebook costs 80 cents. You pay with 1 dollar. How many cents is your change?",
            20,
            "100−80¢",
            "Use 100 cents for one dollar.",
            "💰 100 − 80 = **20** cents change.",
            ["change", "dollar"],
        ),
        (
            "You have 4 nickels and 3 dimes. How many cents do you have?",
            50,
            "20+30¢",
            "Multiply nickels by 5 and dimes by 10.",
            "💰 4 × 5 = 20, 3 × 10 = 30, total **50** cents.",
            ["nickels", "dimes"],
        ),
        (
            "You have 1 quarter, 2 dimes, and 4 pennies. How many cents do you have?",
            69,
            "coins",
            "Add each coin group.",
            "💰 25 + 20 + 4 = **69** cents.",
            ["cents", "add"],
        ),
        (
            "An eraser costs 45 cents. You pay with 2 quarters (50 cents). How many cents is your change?",
            5,
            "50−45¢",
            "Subtract the cost from 50 cents.",
            "💰 50 − 45 = **5** cents change.",
            ["change", "quarters"],
        ),
        (
            "You have 5 dimes and 5 nickels. How many cents do you have?",
            75,
            "50+25¢",
            "Five dimes are 50 cents; five nickels are 25 cents.",
            "💰 50 + 25 = **75** cents.",
            ["dimes", "nickels"],
        ),
        (
            "A marker costs 55 cents. You pay with 3 quarters. How many cents is your change?",
            20,
            "75−55¢",
            "Three quarters are 75 cents.",
            "💰 75 − 55 = **20** cents change.",
            ["change", "cents"],
        ),
        (
            "A rope is 4 feet long. How many inches is it? (12 inches = 1 foot.)",
            48,
            "4×12in",
            "Multiply the number of feet by 12.",
            "📏 4 × 12 = **48** inches.",
            ["feet", "inches"],
        ),
        (
            "A table is 5 feet long. How many inches is that? (12 inches = 1 foot.)",
            60,
            "5×12in",
            "Each foot is 12 inches.",
            "📏 5 × 12 = **60** inches.",
            ["measurement", "inches"],
        ),
        (
            "A garden strip is 2 yards long. How many feet is it? (3 feet = 1 yard.)",
            6,
            "2×3ft",
            "Multiply yards by 3 to get feet.",
            "📏 2 × 3 = **6** feet.",
            ["yards", "feet"],
        ),
        (
            "A playground border is 4 yards long. How many feet is that? (3 feet = 1 yard.)",
            12,
            "4×3ft",
            "Three feet make one yard.",
            "📏 4 × 3 = **12** feet.",
            ["yards", "feet"],
        ),
        (
            "Art class lasts 2 hours. How many minutes is that? (60 minutes = 1 hour.)",
            120,
            "2×60min",
            "Multiply hours by 60.",
            "⏱️ 2 × 60 = **120** minutes.",
            ["hours", "minutes"],
        ),
        (
            "A movie at school lasts 1 hour and 30 minutes. How many minutes is that in all? (60 minutes = 1 hour.)",
            90,
            "60+30min",
            "One hour is 60 minutes, then add the extra minutes.",
            "⏱️ 60 + 30 = **90** minutes.",
            ["minutes", "hours"],
        ),
        (
            "You have 6 nickels and 2 quarters. How many cents do you have?",
            80,
            "30+50¢",
            "Six nickels are 30 cents; two quarters are 50 cents.",
            "💰 30 + 50 = **80** cents.",
            ["cents", "coins"],
        ),
        (
            "A snack bar item costs 95 cents. You pay with 1 dollar. How many cents is your change?",
            5,
            "100−95¢",
            "One dollar is 100 cents.",
            "💰 100 − 95 = **5** cents change.",
            ["change", "cents"],
        ),
        (
            "You have 8 dimes. How many cents do you have?",
            80,
            "8×10¢",
            "Each dime is 10 cents.",
            "💰 8 × 10 = **80** cents.",
            ["dimes", "cents"],
        ),
        (
            "A poster board is 6 feet tall. How many inches tall is it? (12 inches = 1 foot.)",
            72,
            "6×12in",
            "Multiply feet by 12.",
            "📏 6 × 12 = **72** inches.",
            ["feet", "inches"],
        ),
    ]
    for txt, ans, vis, hint, expl, hkw in med_data:
        push(txt, ans, 1, "medium", vis, hint, expl, hkw)

    hard_data: list[tuple[str, int, str, str, str, list[str]]] = [
        (
            "You have 7 quarters. How many cents do you have?",
            175,
            "7×25¢",
            "Multiply the number of quarters by 25.",
            "💰 7 × 25 = **175** cents.",
            ["quarters", "cents"],
        ),
        (
            "You have 2 dollars in quarters only (8 quarters). You spend 75 cents. How many cents do you have left?",
            125,
            "200−75¢",
            "Two dollars is 200 cents.",
            "💰 200 − 75 = **125** cents left.",
            ["cents", "subtract"],
        ),
        (
            "A toy costs 1 dollar and 25 cents (125 cents). You pay with 2 dollars (200 cents). How many cents is your change?",
            75,
            "200−125¢",
            "Work in cents: 200 − 125.",
            "💰 200 − 125 = **75** cents change.",
            ["change", "dollars"],
        ),
        (
            "You have 3 quarters, 4 dimes, and 5 nickels. How many cents do you have?",
            170,
            "coins",
            "Add 75 + 40 + 25.",
            "💰 75 + 40 + 25 = **170** cents.",
            ["cents", "add"],
        ),
        (
            "You mix 2 pints of juice. How many cups of juice is that? (2 cups = 1 pint.)",
            4,
            "2×2c",
            "Each pint is 2 cups.",
            "🥤 2 × 2 = **4** cups.",
            ["pints", "cups"],
        ),
        (
            "You have 3 pints of water for a science demo. How many cups is that? (2 cups = 1 pint.)",
            6,
            "3×2c",
            "Multiply pints by 2.",
            "🥤 3 × 2 = **6** cups.",
            ["cups", "pints"],
        ),
        (
            "A ribbon is 7 feet long. How many inches is it? (12 inches = 1 foot.)",
            84,
            "7×12in",
            "Multiply 7 by 12.",
            "📏 7 × 12 = **84** inches.",
            ["feet", "inches"],
        ),
        (
            "A kickball field line is 10 yards long. How many feet is it? (3 feet = 1 yard.)",
            30,
            "10×3ft",
            "Multiply yards by 3.",
            "📏 10 × 3 = **30** feet.",
            ["yards", "feet"],
        ),
        (
            "Practice lasts 3 hours. How many minutes is that? (60 minutes = 1 hour.)",
            180,
            "3×60min",
            "Multiply by 60.",
            "⏱️ 3 × 60 = **180** minutes.",
            ["hours", "minutes"],
        ),
        (
            "You have 1 quarter, 3 dimes, 2 nickels, and 6 pennies. How many cents do you have?",
            81,
            "coins",
            "Add 25 + 30 + 10 + 6.",
            "💰 25 + 30 + 10 + 6 = **81** cents.",
            ["cents", "coins"],
        ),
        (
            "A game costs 2 dollars (200 cents). You pay with 3 dollars (300 cents). How many cents is your change?",
            100,
            "300−200¢",
            "Subtract in cents.",
            "💰 300 − 200 = **100** cents change (one dollar).",
            ["change", "cents"],
        ),
        (
            "You have 9 dimes and 4 nickels. How many cents do you have?",
            110,
            "90+20¢",
            "Nine dimes are 90 cents; four nickels are 20 cents.",
            "💰 90 + 20 = **110** cents.",
            ["dimes", "nickels"],
        ),
        (
            "A book costs 3 dollars and 50 cents (350 cents). You pay with 4 dollars (400 cents). How many cents is your change?",
            50,
            "400−350¢",
            "400 − 350 in cents.",
            "💰 400 − 350 = **50** cents change.",
            ["change", "dollars"],
        ),
        (
            "You have 5 quarters and 7 pennies. How many cents do you have?",
            132,
            "125+7¢",
            "Five quarters are 125 cents.",
            "💰 125 + 7 = **132** cents.",
            ["quarters", "cents"],
        ),
        (
            "A shelf is 8 feet wide. How many inches wide is it? (12 inches = 1 foot.)",
            96,
            "8×12in",
            "8 × 12 inches.",
            "📏 8 × 12 = **96** inches.",
            ["feet", "inches"],
        ),
        (
            "How many minutes are in 1 hour and 15 minutes? (60 minutes = 1 hour.)",
            75,
            "60+15min",
            "One hour is 60 minutes, then add 15.",
            "⏱️ 60 + 15 = **75** minutes.",
            ["minutes", "hours"],
        ),
        (
            "You have 10 nickels. How many cents do you have?",
            50,
            "10×5¢",
            "Ten nickels: 10 × 5.",
            "💰 10 × 5 = **50** cents.",
            ["nickels", "cents"],
        ),
        (
            "You have 4 quarters and 5 dimes. How many cents do you have?",
            150,
            "100+50¢",
            "Four quarters are 100 cents; five dimes are 50 cents.",
            "💰 100 + 50 = **150** cents.",
            ["coins", "cents"],
        ),
        (
            "A jump rope is 9 feet long. How many inches is it? (12 inches = 1 foot.)",
            108,
            "9×12in",
            "Multiply 9 by 12.",
            "📏 9 × 12 = **108** inches.",
            ["feet", "inches"],
        ),
        (
            "A delivery crate is 6 yards long. How many feet is it? (3 feet = 1 yard.)",
            18,
            "6×3ft",
            "Six yards × 3 feet per yard.",
            "📏 6 × 3 = **18** feet.",
            ["yards", "feet"],
        ),
    ]
    for txt, ans, vis, hint, expl, hkw in hard_data:
        push(txt, ans, 2, "hard", vis, hint, expl, hkw)

    assert len(rows) == 50, f"money expected 50 got {len(rows)}"
    return rows


def gen_remainder_interpretation() -> list[str]:
    rows: list[str] = []

    round_up_cases = [
        (17, 6),
        (25, 6),
        (31, 8),
        (40, 7),
        (50, 9),
        (28, 5),
        (45, 10),
        (33, 4),
        (55, 12),
        (19, 4),
        (60, 8),
        (23, 5),
        (37, 6),
        (44, 9),
        (29, 7),
        (52, 10),
        (34, 8),
        (41, 6),
        (47, 9),
        (58, 7),
    ]
    stories_up = [
        (
            "{n} students need rides to the museum. Each van holds {g} students. How many vans are needed so every student gets a seat?",
            "Divide students by van size. If there is a remainder, you need one more van.",
        ),
        (
            "{n} campers need picnic tables. Each table seats {g} campers. How many tables are needed so every camper has a seat?",
            "Use division; round up so no one is left without a seat.",
        ),
        (
            "{n} muffins are packed into boxes that hold {g} muffins each. How many boxes are needed to pack all the muffins?",
            "If division has a remainder, you still need an extra box for the leftovers.",
        ),
        (
            "{n} juice cups are set on trays. Each tray holds {g} cups. How many trays are needed to hold every cup?",
            "Think: full trays plus one more if there are leftover cups.",
        ),
        (
            "{n} books are shipped in cartons of {g} books. How many cartons are needed to ship all the books?",
            "Remainder means you need another carton for the extra books.",
        ),
    ]
    for i, (n, g) in enumerate(round_up_cases):
        tpl, hint_base = stories_up[i % len(stories_up)]
        txt = tpl.format(n=n, g=g)
        q, r = n // g, n % g
        ans = q if r == 0 else q + 1
        if r == 0:
            expl = f"🚌 {n} ÷ {g} = {q} with no remainder, so **{ans}** vans (or groups) are enough."
        else:
            expl = f"🚌 {n} ÷ {g} = {q} remainder {r}, so you need **{ans}** so everyone (or everything) is covered."
        rows.append(
            fmt_q(
                f"ri{i+1:03d}",
                text=txt,
                answer=ans,
                band=2 if i < 12 else 3,
                problem_type=PT_RI,
                visual=f"{n}÷{g}→ceil",
                hint_keywords=["remainder", "each", "needed"],
                hint=hint_base,
                explain=expl,
                session_level="hard",
                minimal_visual=i % 3 == 0,
            )
        )

    leftover_cases = [
        (35, 8),
        (47, 10),
        (52, 9),
        (40, 6),
        (29, 7),
        (61, 12),
        (38, 5),
        (44, 8),
        (53, 9),
        (27, 6),
        (49, 11),
        (56, 9),
        (33, 10),
        (41, 7),
        (46, 8),
    ]
    left_stories = [
        "You have {n} cookies. You pack full boxes of {g} cookies. How many cookies are left over after filling full boxes only?",
        "There are {n} stickers. Sheets hold {g} stickers each for full sheets. How many stickers are left after making full sheets only?",
        "{n} crayons are bundled in groups of {g} for full bundles. How many crayons are not in a full bundle?",
        "{n} beads fill bags of {g} beads for full bags. How many beads are left over after full bags?",
        "{n} pencils go in boxes of {g} for full boxes. How many pencils are left out of full boxes?",
    ]
    for j, (n, g) in enumerate(leftover_cases):
        txt = left_stories[j % len(left_stories)].format(n=n, g=g)
        ans = n % g
        expl = f"📦 {n} ÷ {g} = {n//g} remainder **{ans}**, so **{ans}** are left over."
        rows.append(
            fmt_q(
                f"ri{len(round_up_cases)+j+1:03d}",
                text=txt,
                answer=ans,
                band=2,
                problem_type=PT_RI,
                visual=f"{n}mod{g}",
                hint_keywords=["left over", "remainder", "full"],
                hint="Divide and find the remainder. That is how many are left over.",
                explain=expl,
                session_level="hard",
            )
        )

    full_cases = [
        (48, 6),
        (45, 9),
        (56, 8),
        (36, 4),
        (54, 6),
        (63, 7),
        (50, 10),
        (42, 7),
        (72, 9),
        (60, 12),
        (49, 7),
        (55, 11),
        (64, 8),
        (30, 5),
        (81, 9),
    ]
    full_stories = [
        "{n} students try out for basketball. Each team needs exactly {g} players for a full team. How many full teams can be made?",
        "{n} chairs are grouped in sets of {g} for reading circles. How many full groups of {g} chairs can you make?",
        "{n} paint jars fit on trays of {g} jars each. How many full trays can you make?",
        "{n} soccer cones are placed in bags of {g} cones. How many full bags can you make?",
        "{n} library books fit on carts with {g} books per shelf layer. How many full layers can you stack?",
    ]
    for k, (n, g) in enumerate(full_cases):
        txt = full_stories[k % len(full_stories)].format(n=n, g=g)
        ans = n // g
        r = n % g
        expl = f"🏀 {n} ÷ {g} = {ans} remainder {r}. Only full groups count, so **{ans}** full teams (or groups)."
        rows.append(
            fmt_q(
                f"ri{len(round_up_cases)+len(leftover_cases)+k+1:03d}",
                text=txt,
                answer=ans,
                band=3 if k >= 8 else 2,
                problem_type=PT_RI,
                visual=f"{n}÷{g}floor",
                hint_keywords=["full", "teams", "groups"],
                hint="Divide and use the whole-number part. Ignore the remainder for full groups.",
                explain=expl,
                session_level="hard",
                minimal_visual=True,
            )
        )

    assert len(rows) == 50, f"remainder expected 50 got {len(rows)}"
    return rows


def gen_two_step_compare() -> list[str]:
    rows: list[str] = []

    def emit(
        idx: int,
        base: int,
        d1: int,
        d2: int,
        mode: str,
        item: str,
        n1: str,
        n2: str,
        n3: str,
        sl: str,
        band: int,
    ):
        second = base + d1
        if mode == "sub":
            third = second - d2
        else:
            third = second + d2
        fewer_or_more = "fewer" if mode == "sub" else "more"
        txt = (
            f"{n1} has {base} {item}. {n2} has {d1} more {item} than {n1}. "
            f"{n3} has {d2} {fewer_or_more} {item} than {n2}. "
            f"How many {item} does {n3} have?"
        )
        if mode == "add":
            expl = f"🔁 {n2} has {base} + {d1} = **{second}**. {n3} has {second} + {d2} = **{third}**."
        else:
            expl = f"🔁 {n2} has {base} + {d1} = **{second}**. {n3} has {second} − {d2} = **{third}**."
        rows.append(
            fmt_q(
                f"tc{idx:03d}",
                text=txt,
                answer=third,
                band=band,
                problem_type=PT_TC,
                visual=f"{base}+{d1}±{d2}",
                hint_keywords=["more", "fewer", "step"],
                hint="Find the middle amount first, then compare to get the last person’s amount.",
                explain=expl,
                session_level=sl,
            )
        )

    med_specs = [
        (18, 7, 5, "sub", "stickers", "Mia", "Leo", "Ana"),
        (24, 6, 4, "sub", "points", "Sam", "Rosa", "Chen"),
        (15, 8, 3, "sub", "crayons", "Jada", "Noah", "Lily"),
        (20, 5, 6, "add", "books", "Ben", "Amy", "Omar"),
        (30, 9, 7, "sub", "seeds", "Eva", "Ian", "Kate"),
        (22, 4, 5, "sub", "badges", "Max", "Zoe", "Luke"),
        (16, 10, 4, "sub", "tickets", "Ruby", "Jay", "Sofia"),
        (28, 5, 9, "add", "rocks", "Tara", "Will", "Nina"),
        (19, 6, 3, "sub", "cards", "Alex", "Drew", "Maya"),
        (25, 7, 8, "sub", "marbles", "Finn", "Hope", "Gabe"),
        (21, 9, 5, "sub", "stickers", "Luca", "Ella", "Theo"),
        (17, 8, 4, "sub", "coins", "Nora", "Kai", "Jules"),
        (26, 6, 7, "add", "buttons", "Milo", "Ivy", "Reid"),
        (14, 11, 3, "sub", "shells", "Pia", "Marc", "June"),
        (32, 5, 6, "sub", "points", "Wren", "Dean", "Blair"),
        (23, 7, 4, "sub", "beads", "Cole", "Meg", "Vera"),
        (27, 8, 5, "sub", "pencils", "Axel", "Quinn", "Jade"),
        (20, 6, 5, "add", "tokens", "Sky", "Remy", "Tess"),
        (29, 4, 8, "sub", "stickers", "Lane", "Bree", "Kurt"),
        (18, 9, 6, "sub", "cards", "Neil", "Sage", "Dana"),
        (24, 5, 4, "sub", "seeds", "Clay", "Beth", "Adam"),
        (31, 6, 7, "sub", "rocks", "Faye", "Gus", "Lena"),
        (16, 7, 5, "sub", "badges", "Hugo", "Iris", "Jake"),
        (22, 8, 3, "sub", "books", "Kara", "Levi", "Mina"),
        (25, 9, 4, "sub", "crayons", "Nate", "Opal", "Pete"),
    ]
    hard_specs = [
        (40, 12, 8, "sub", "points", "Team A", "Team B", "Team C"),
        (50, 15, 10, "sub", "votes", "Room 1", "Room 2", "Room 3"),
        (36, 11, 9, "sub", "goals", "Lions", "Tigers", "Bears"),
        (45, 14, 12, "add", "stickers", "Rina", "Milo", "Sara"),
        (55, 13, 11, "sub", "cans", "Class 4", "Class 5", "Class 6"),
        (42, 16, 7, "sub", "books", "Lane", "Mira", "Jett"),
        (48, 10, 14, "add", "tokens", "Gray", "Nova", "Kipp"),
        (38, 17, 9, "sub", "cards", "Dell", "Echo", "Ford"),
        (44, 12, 6, "sub", "badges", "Gwen", "Holt", "Iris"),
        (52, 11, 13, "add", "rocks", "Joss", "Kyle", "Lynn"),
        (33, 15, 8, "sub", "seeds", "Moss", "Nell", "Orin"),
        (46, 9, 12, "add", "points", "Penn", "Quin", "Ruth"),
        (41, 18, 10, "sub", "tickets", "Scot", "Tess", "Uma"),
        (49, 14, 11, "sub", "beads", "Vann", "Walt", "Xena"),
        (37, 13, 7, "sub", "marbles", "York", "Zara", "Ace"),
        (43, 16, 9, "sub", "crayons", "Bev", "Cal", "Dee"),
        (51, 12, 10, "sub", "buttons", "Elm", "Fay", "Gil"),
        (39, 11, 8, "sub", "pencils", "Hal", "Ike", "Joy"),
        (47, 15, 9, "sub", "shells", "Kim", "Lou", "May"),
        (54, 13, 12, "add", "stickers", "Ned", "Oli", "Pam"),
        (35, 14, 6, "sub", "cards", "Ray", "Sid", "Tia"),
        (45, 11, 10, "sub", "books", "Ulf", "Val", "Wes"),
        (48, 17, 8, "sub", "goals", "Xio", "Yul", "Zed"),
        (42, 10, 11, "add", "votes", "Amy", "Ben", "Cid"),
        (50, 16, 9, "sub", "points", "Dan", "Eve", "Fox"),
    ]

    idx = 1
    for base, d1, d2, mode, item, n1, n2, n3 in med_specs:
        emit(idx, base, d1, d2, mode, item, n1, n2, n3, "medium", 2)
        idx += 1
    for base, d1, d2, mode, item, n1, n2, n3 in hard_specs:
        emit(idx, base, d1, d2, mode, item, n1, n2, n3, "hard", 3)
        idx += 1

    assert len(rows) == 50, f"two-step compare expected 50 got {len(rows)}"
    return rows


def gen_elapsed_time() -> list[str]:
    rows: list[str] = []

    same_h = [
        (9, 10, 40, 30),
        (10, 15, 45, 30),
        (11, 5, 35, 30),
        (8, 20, 50, 30),
        (2, 25, 55, 30),
        (3, 10, 40, 30),
        (4, 5, 35, 30),
        (1, 30, 50, 20),
        (5, 0, 25, 25),
        (6, 40, 55, 15),
        (7, 10, 25, 15),
        (12, 5, 20, 15),
        (9, 0, 15, 15),
        (10, 30, 40, 10),
        (11, 45, 55, 10),
        (8, 10, 25, 15),
        (3, 40, 55, 15),
        (4, 15, 35, 20),
        (2, 10, 30, 20),
        (1, 45, 55, 10),
        (6, 5, 40, 35),
        (7, 20, 50, 30),
        (8, 35, 50, 15),
        (9, 25, 40, 15),
        (10, 5, 20, 15),
    ]
    ctx = [
        ("Recess runs from {h}:{m1:02d} to {h}:{m2:02d}. How many minutes long is recess?", "Subtract the start minute from the end minute."),
        ("Reading time is from {h}:{m1:02d} to {h}:{m2:02d}. How many minutes is reading time?", "Both times share the same hour. Subtract minutes."),
        ("A bus ride starts at {h}:{m1:02d} and ends at {h}:{m2:02d}. How many minutes was the ride?", "Find the difference in minutes."),
        ("Art class starts at {h}:{m1:02d} and ends at {h}:{m2:02d}. How many minutes is art class?", "Same hour: end minutes minus start minutes."),
        ("Practice begins at {h}:{m1:02d} and stops at {h}:{m2:02d}. How many minutes did practice last?", "Count minutes from start to end."),
    ]
    for i, (h, m1, m2, diff) in enumerate(same_h):
        tpl, ht = ctx[i % len(ctx)]
        txt = tpl.format(h=h, m1=m1, m2=m2)
        expl = f"⏰ From {h}:{m1:02d} to {h}:{m2:02d} is **{diff}** minutes ({m2} − {m1} = {diff})."
        rows.append(
            fmt_q(
                f"et{i+1:03d}",
                text=txt,
                answer=diff,
                band=1,
                problem_type=PT_ET,
                visual=f"{m2}−{m1}min",
                hint_keywords=["minutes", "time"],
                hint=ht,
                explain=expl,
                session_level="medium",
            )
        )

    dur_specs = [
        (10, 20, 25, 45),
        (9, 15, 20, 35),
        (11, 10, 15, 25),
        (2, 30, 20, 50),
        (3, 5, 25, 30),
        (4, 40, 10, 50),
        (1, 50, 5, 55),
        (5, 25, 10, 35),
        (8, 0, 30, 30),
        (7, 35, 10, 45),
        (6, 15, 20, 35),
        (9, 40, 5, 45),
        (10, 10, 35, 45),
        (3, 20, 15, 35),
        (4, 25, 20, 45),
    ]
    dur_ctx = [
        "Recess starts at {h}:{m0:02d} and lasts {d} minutes. What minute does recess end? (Use the same hour {h}.)",
        "A club meeting starts at {h}:{m0:02d} and lasts {d} minutes. What is the ending minute? (Stay in hour {h}.)",
        "Library time starts at {h}:{m0:02d} and lasts {d} minutes. What minute does it end? (Same hour {h}.)",
        "A science demo starts at {h}:{m0:02d} and runs {d} minutes. What minute does it end? (Same hour {h}.)",
        "Music practice starts at {h}:{m0:02d} and lasts {d} minutes. What minute does it end? (Same hour {h}.)",
    ]
    for j, (h, m0, d, end_m) in enumerate(dur_specs):
        txt = dur_ctx[j % len(dur_ctx)].format(h=h, m0=m0, d=d)
        expl = f"⏰ {m0} + {d} = **{end_m}**, so it ends at {h}:{end_m:02d}. The answer is the ending minute: **{end_m}**."
        rows.append(
            fmt_q(
                f"et{len(same_h)+j+1:03d}",
                text=txt,
                answer=end_m,
                band=1,
                problem_type=PT_ET,
                visual=f"{m0}+{d}min",
                hint_keywords=["minutes", "add"],
                hint="Add the duration to the starting minute when you stay in the same hour.",
                explain=expl,
                session_level="medium",
            )
        )

    cross = [
        ("Music starts at 1:45 and ends at 2:15. How many minutes long is music?", 30, "1:45→2:15", "From 1:45 to 2:00 is 15 minutes. From 2:00 to 2:15 is 15 more. 15 + 15 = **30**."),
        ("A show starts at 2:50 and ends at 3:20. How many minutes long is the show?", 30, "2:50→3:20", "From 2:50 to 3:00 is 10 minutes. From 3:00 to 3:20 is 20 more. 10 + 20 = **30**."),
        ("Study hall runs from 3:40 to 4:10. How many minutes is study hall?", 30, "3:40→4:10", "From 3:40 to 4:00 is 20 minutes. From 4:00 to 4:10 is 10 more. 20 + 10 = **30**."),
        ("Swim practice is from 4:25 to 5:05. How many minutes is practice?", 40, "4:25→5:05", "From 4:25 to 5:00 is 35 minutes. From 5:00 to 5:05 is 5 more. 35 + 5 = **40**."),
        ("A bus trip starts at 5:10 and ends at 5:55. How many minutes is the trip?", 45, "5:10→5:55", "55 − 10 = **45** minutes on the same hour."),
        ("Lunch help time is from 11:50 to 12:20. How many minutes is it?", 30, "11:50→12:20", "From 11:50 to 12:00 is 10 minutes. From 12:00 to 12:20 is 20 more. 10 + 20 = **30**."),
        ("A podcast in class runs from 10:40 to 11:05. How many minutes is it?", 25, "10:40→11:05", "From 10:40 to 11:00 is 20 minutes. From 11:00 to 11:05 is 5 more. 20 + 5 = **25**."),
        ("Morning work is from 8:55 to 9:20. How many minutes is morning work?", 25, "8:55→9:20", "From 8:55 to 9:00 is 5 minutes. From 9:00 to 9:20 is 20 more. 5 + 20 = **25**."),
        ("Recess extension is from 12:35 to 1:05. How many minutes is the extra recess?", 30, "12:35→1:05", "From 12:35 to 1:00 is 25 minutes. From 1:00 to 1:05 is 5 more. 25 + 5 = **30**."),
        ("A club cleanup lasts from 3:55 to 4:25. How many minutes is cleanup?", 30, "3:55→4:25", "From 3:55 to 4:00 is 5 minutes. From 4:00 to 4:25 is 25 more. 5 + 25 = **30**."),
    ]
    for k, (txt, ans, vis, expl_long) in enumerate(cross):
        rows.append(
            fmt_q(
                f"et{len(same_h)+len(dur_specs)+k+1:03d}",
                text=txt,
                answer=ans,
                band=2,
                problem_type=PT_ET,
                visual=vis,
                hint_keywords=["minutes", "elapsed"],
                hint="Break the time into chunks to the next hour, then add the rest.",
                explain=f"⏰ {expl_long}",
                session_level="medium",
            )
        )

    assert len(rows) == 50, f"elapsed expected 50 got {len(rows)}"
    return rows


def gen_fraction_of_set() -> list[str]:
    rows: list[str] = []

    def one(qid: str, text: str, ans: int, band: int, sl: str, vis: str, hint: str, expl: str):
        rows.append(
            fmt_q(
                qid,
                text=text,
                answer=ans,
                band=band,
                problem_type=PT_FS,
                visual=vis,
                hint_keywords=["fraction", "equal groups", "divide"],
                hint=hint,
                explain=expl,
                session_level=sl,
            )
        )

    # (item, story clause, question tail)
    med_items = [
        ("muffins", "have sprinkles", "How many muffins have sprinkles?"),
        ("crayons", "are broken", "How many crayons are broken?"),
        ("stickers", "are shiny", "How many stickers are shiny?"),
        ("books", "are graphic novels", "How many books are graphic novels?"),
        ("players", "chose soccer", "How many players chose soccer?"),
        ("paint jars", "are blue", "How many paint jars are blue?"),
        ("lunch trays", "have fruit", "How many lunch trays have fruit?"),
        ("bus seats", "are saved", "How many bus seats are saved?"),
        ("note cards", "have drawings", "How many note cards have drawings?"),
        ("seed packets", "are for sunflowers", "How many seed packets are for sunflowers?"),
    ]
    med_specs: list[tuple[int, int, str]] = [
        (12, 2, "half"),
        (16, 2, "half"),
        (10, 2, "half"),
        (18, 2, "half"),
        (14, 2, "half"),
        (15, 3, "third"),
        (18, 3, "third"),
        (21, 3, "third"),
        (12, 3, "third"),
        (24, 3, "third"),
        (20, 4, "fourth"),
        (16, 4, "fourth"),
        (24, 4, "fourth"),
        (12, 4, "fourth"),
        (28, 4, "fourth"),
        (8, 2, "half"),
        (20, 2, "half"),
        (9, 3, "third"),
        (27, 3, "third"),
        (32, 4, "fourth"),
        (6, 2, "half"),
        (30, 3, "third"),
        (36, 4, "fourth"),
        (22, 2, "half"),
        (33, 3, "third"),
    ]
    for idx, (tot, den, label) in enumerate(med_specs, start=1):
        item, desc, qtail = med_items[(idx - 1) % len(med_items)]
        if label == "half":
            phrase = f"Half of the {item}"
            phr2 = "Half means 2 equal groups."
        elif label == "third":
            phrase = f"One third of the {item}"
            phr2 = "One third means 3 equal groups."
        else:
            phrase = f"One fourth of the {item}"
            phr2 = "One fourth means 4 equal groups."
        ans = tot // den
        txt = f"{phrase} {desc}. There are {tot} {item} in all. {qtail}"
        expl = f"🍕 {phr2} {tot} ÷ {den} = **{ans}**."
        one(f"fs{idx:03d}", txt, ans, 2, "medium", f"{tot}÷{den}", f"Divide the total by {den}.", expl)

    hard_specs: list[tuple[int, int, str]] = [
        (26, 2, "half"),
        (28, 2, "half"),
        (30, 2, "half"),
        (32, 2, "half"),
        (34, 2, "half"),
        (24, 3, "third"),
        (27, 3, "third"),
        (30, 3, "third"),
        (36, 3, "third"),
        (39, 3, "third"),
        (24, 4, "fourth"),
        (28, 4, "fourth"),
        (32, 4, "fourth"),
        (36, 4, "fourth"),
        (40, 4, "fourth"),
        (38, 2, "half"),
        (40, 2, "half"),
        (42, 3, "third"),
        (45, 3, "third"),
        (44, 4, "fourth"),
        (48, 4, "fourth"),
        (50, 2, "half"),
        (48, 3, "third"),
        (52, 4, "fourth"),
        (54, 2, "half"),
    ]
    hard_items = [
        ("team jerseys", "are red", "How many team jerseys are red?"),
        ("art tiles", "are green", "How many art tiles are green?"),
        ("snack bags", "have crackers", "How many snack bags have crackers?"),
        ("field cones", "are orange", "How many field cones are orange?"),
        ("library bookmarks", "are laminated", "How many library bookmarks are laminated?"),
        ("choir folders", "are new", "How many choir folders are new?"),
        ("recess balls", "are soccer balls", "How many recess balls are soccer balls?"),
        ("science slides", "are labeled", "How many science slides are labeled?"),
    ]
    for j, (tot, den, label) in enumerate(hard_specs, start=26):
        item, desc, qtail = hard_items[(j - 26) % len(hard_items)]
        if label == "half":
            phrase = f"Half of the {item}"
            phr2 = "Half means 2 equal groups."
        elif label == "third":
            phrase = f"One third of the {item}"
            phr2 = "One third means 3 equal groups."
        else:
            phrase = f"One fourth of the {item}"
            phr2 = "One fourth means 4 equal groups."
        ans = tot // den
        txt = f"{phrase} {desc}. There are {tot} {item} in all. {qtail}"
        expl = f"🍕 {phr2} {tot} ÷ {den} = **{ans}**."
        one(f"fs{j:03d}", txt, ans, 3, "hard", f"{tot}÷{den}", f"Divide the total by {den}.", expl)

    assert len(rows) == 50, f"fraction expected 50 got {len(rows)}"
    return rows


def gen_join_extra() -> list[str]:
    """Add 15 Join stories (to bring Join from 35 → 50)."""
    rows: list[str] = []
    specs = [
        ("7 birds sat on a fence. {b} more birds landed. How many birds are on the fence now?", 7, 5, "🐦7+5", 1),
        ("9 kids were on the playground. {b} more kids joined the game. How many kids are playing now?", 9, 6, "🛝9+6", 1),
        ("12 stickers were on a poster. {b} more stickers were added. How many stickers are on the poster now?", 12, 7, "⭐12+7", 2),
        ("15 books were on the cart. {b} more books were stacked on. How many books are on the cart now?", 15, 8, "📚15+8", 2),
        ("18 crayons were in a box. {b} more crayons were put in. How many crayons are in the box now?", 18, 9, "🖍️18+9", 2),
        ("20 apples were in a basket. {b} more apples were added. How many apples are in the basket now?", 20, 6, "🍎20+6", 2),
        ("14 balls were in the gym bin. {b} more balls rolled in. How many balls are in the bin now?", 14, 5, "⚽14+5", 1),
        ("16 toy cars were on the rug. {b} more cars were brought over. How many cars are there now?", 16, 7, "🚗16+7", 2),
        ("22 shells were in a bucket. {b} more shells were found. How many shells are in the bucket now?", 22, 8, "🐚22+8", 2),
        ("25 points were on the scoreboard. The team scored {b} more points. How many points are on the board now?", 25, 9, "🏀25+9", 2),
        ("30 minutes were on the timer. The teacher added {b} more minutes. How many minutes are on the timer now?", 30, 15, "⏲️30+15", 3),
        ("28 kids were in the cafeteria. {b} more kids arrived. How many kids are in the cafeteria now?", 28, 11, "🍽️28+11", 3),
        ("32 beads were in a jar. {b} more beads were poured in. How many beads are in the jar now?", 32, 14, "📿32+14", 3),
        ("35 toy blocks were on the table. {b} more blocks were added. How many blocks are on the table now?", 35, 12, "🧱35+12", 3),
        ("27 fish were in a tank. {b} more fish were moved in. How many fish are in the tank now?", 27, 9, "🐟27+9", 3),
    ]
    for i, (tpl, a, b, vis, band) in enumerate(specs, start=1):
        txt = tpl.format(b=b)
        ans = a + b
        rows.append(
            fmt_q(
                f"jn{i:03d}",
                text=txt,
                answer=ans,
                band=band,
                problem_type=PT_JOIN,
                visual=vis,
                hint_keywords=["more", "now", "in all"],
                hint="Start with the first amount, then add the amount that joined or was added.",
                explain=f"➕ {a} + {b} = **{ans}**.",
                session_level="easy" if band == 1 else "medium",
            )
        )
    assert len(rows) == 15
    return rows


def gen_unknown_extra() -> list[str]:
    """Add 19 Unknown stories (31 → 50)."""
    rows: list[str] = []
    specs = [
        ("Some stickers were in a box. Mia added 12 stickers. Now there are 35 stickers. How many stickers were in the box at first?", 35, 12, "35−12", 2),
        ("There were some marbles. Leo found 15 more marbles. Now he has 48 marbles. How many marbles did he have at first?", 48, 15, "48−15", 2),
        ("A jar had some coins. After adding 25 cents, the jar has 90 cents. How many cents were in the jar before?", 90, 25, "90−25", 2),
        ("Some pencils were in a cup. 18 pencils were taken out. Now 27 pencils are left. How many pencils were in the cup at the start?", 27, 18, "27+18", 2),
        ("There were some books on a shelf. 14 books were borrowed. Now 19 books are left. How many books were on the shelf at first?", 19, 14, "19+14", 2),
        ("A score was unknown. After earning 17 points, the score is 50. What was the score before?", 50, 17, "50−17", 2),
        ("Some cookies were on a plate. 9 cookies were eaten. Now 16 cookies are left. How many cookies were on the plate at first?", 16, 9, "16+9", 2),
        ("A number plus 14 equals 39. What is the number?", 39, 14, "39−14", 3),
        ("A number minus 18 equals 26. What is the number?", 26, 18, "26+18", 3),
        ("A mystery number times 6 equals 72. What is the number?", 72, 6, "72÷6", 3),
        ("A mystery number divided by 5 equals 9. What is the number?", 9, 5, "9×5", 3),
        ("Some kids were on a bus. 23 kids got on. Now there are 61 kids on the bus. How many kids were on the bus before?", 61, 23, "61−23", 3),
        ("There were some markers. The teacher bought 3 packs of 8 markers. Now there are 59 markers. How many markers were there before?", 59, 24, "59−24", 3),
        ("Some juice was in a cooler. After pouring out 12 cups, 18 cups remained. How many cups were in the cooler at first?", 18, 12, "18+12", 3),
        ("A ribbon was some length. After cutting off 16 inches, 34 inches remained. How long was the ribbon at the start?", 34, 16, "34+16", 3),
        ("A number story: I think of a number, add 28, and get 71. What is my number?", 71, 28, "71−28", 3),
        ("A number story: I think of a number, subtract 19, and get 44. What is my number?", 44, 19, "44+19", 3),
        ("A mystery number times 8 equals 96. What is the number?", 96, 8, "96÷8", 3),
        ("A mystery number divided by 4 equals 13. What is the number?", 13, 4, "13×4", 3),
    ]
    for i, (txt, big, small, vis, band) in enumerate(specs, start=1):
        # Determine answer based on the story form
        if "plus" in txt and "equals" in txt:
            ans = big - small
            expl = f"🔍 Undo addition: {big} − {small} = **{ans}**."
        elif "minus" in txt and "equals" in txt:
            ans = big + small
            expl = f"🔍 Undo subtraction: {big} + {small} = **{ans}**."
        elif "times" in txt and "equals" in txt:
            ans = big // small
            expl = f"🔍 Undo multiplication: {big} ÷ {small} = **{ans}**."
        elif "divided by" in txt and "equals" in txt:
            ans = big * small
            expl = f"🔍 Undo division: {big} × {small} = **{ans}**."
        elif "were taken out" in txt or "were borrowed" in txt or "were eaten" in txt or "pouring out" in txt or "cutting off" in txt:
            ans = big + small
            expl = f"🔍 Work backward: {big} + {small} = **{ans}** at the start."
        else:
            ans = big - small
            expl = f"🔍 Work backward: {big} − {small} = **{ans}** before."
        rows.append(
            fmt_q(
                f"uk{i:03d}",
                text=txt,
                answer=ans,
                band=band,
                problem_type=PT_UNKNOWN,
                visual=vis,
                hint_keywords=["before", "at first", "mystery"],
                hint="Work backward to find the missing starting number.",
                explain=expl,
                session_level="medium" if band == 2 else "hard",
                minimal_visual=True,
            )
        )
    assert len(rows) == 19
    return rows


def gen_compare_extra() -> list[str]:
    """Add 21 Compare stories (29 → 50)."""
    rows: list[str] = []
    specs = [
        ("Ana has 32 stickers. Leo has 18 stickers. How many more stickers does Ana have than Leo?", 32, 18, "32−18", 1),
        ("One rope is 45 inches long. Another rope is 29 inches long. How many inches longer is the first rope?", 45, 29, "45−29", 1),
        ("The blue team scored 38 points. The red team scored 27 points. How many more points did blue score?", 38, 27, "38−27", 1),
        ("A plant is 54 cm tall. Another plant is 36 cm tall. How many centimeters taller is the first plant?", 54, 36, "54−36", 1),
        ("Maya read 41 pages. Owen read 25 pages. How many more pages did Maya read?", 41, 25, "41−25", 1),
        ("A bus traveled 62 miles. A car traveled 47 miles. How many more miles did the bus travel?", 62, 47, "62−47", 2),
        ("Team A has 56 points. Team B has 39 points. How many more points does Team A have?", 56, 39, "56−39", 2),
        ("A shelf has 70 books. Another shelf has 55 books. How many more books are on the first shelf?", 70, 55, "70−55", 2),
        ("One snake is 63 inches long. Another snake is 48 inches long. How many inches longer is the longer snake?", 63, 48, "63−48", 2),
        ("A jar holds 80 beads. Another jar holds 62 beads. How many fewer beads are in the second jar?", 80, 62, "80−62", 2),
        ("The home team scored 74 points. The visitors scored 58 points. How many more points did the home team score?", 74, 58, "74−58", 2),
        ("A runner ran 95 meters. Another runner ran 76 meters. How many more meters did the first runner run?", 95, 76, "95−76", 3),
        ("A movie is 110 minutes long. Another movie is 85 minutes long. How many minutes longer is the first movie?", 110, 85, "110−85", 3),
        ("A class collected 128 cans. Another class collected 97 cans. How many more cans did the first class collect?", 128, 97, "128−97", 3),
        ("A new tree is 140 cm tall. An older tree is 96 cm tall. How many centimeters taller is the new tree?", 140, 96, "140−96", 3),
        ("One aquarium has 75 fish. Another has 48 fish. How many more fish are in the first aquarium?", 75, 48, "75−48", 3),
        ("A jump rope is 84 inches long. Another is 63 inches long. How many inches longer is the first rope?", 84, 63, "84−63", 3),
        ("Room 3 raised $92. Room 4 raised $68. How many more dollars did Room 3 raise?", 92, 68, "92−68", 3),
        ("A baker made 64 muffins. Another baker made 49 muffins. How many more muffins did the first baker make?", 64, 49, "64−49", 3),
        ("A tank has 88 liters of water. Another has 57 liters. How many fewer liters are in the second tank?", 88, 57, "88−57", 3),
        ("A hiker walked 36 minutes. Another walked 22 minutes. How many more minutes did the first hiker walk?", 36, 22, "36−22", 2),
    ]
    for i, (txt, big, small, vis, band) in enumerate(specs, start=1):
        ans = big - small
        rows.append(
            fmt_q(
                f"cp{i:03d}",
                text=txt,
                answer=ans,
                band=band,
                problem_type=PT_COMPARE,
                visual=vis,
                hint_keywords=["how many more", "how many fewer", "longer", "taller"],
                hint="Subtract the smaller number from the larger number to compare.",
                explain=f"📏 {big} − {small} = **{ans}**.",
                session_level="medium" if band <= 2 else "hard",
            )
        )
    assert len(rows) == 21
    return rows


def gen_sharing_extra() -> list[str]:
    """Add 35 Sharing stories (15 → 50). Exact division only (no remainder interpretation)."""
    rows: list[str] = []
    specs = [
        ("48 crayons are shared equally among 6 tables. How many crayons does each table get?", 48, 6),
        ("63 stickers are shared equally among 9 kids. How many stickers does each kid get?", 63, 9),
        ("56 markers are split equally into 7 cups. How many markers are in each cup?", 56, 7),
        ("72 beads are shared equally among 8 bracelets. How many beads are in each bracelet?", 72, 8),
        ("60 pencils are shared equally among 5 boxes. How many pencils are in each box?", 60, 5),
        ("81 blocks are split equally into 9 bags. How many blocks are in each bag?", 81, 9),
        ("84 erasers are shared equally among 7 groups. How many erasers are in each group?", 84, 7),
        ("90 cards are shared equally among 10 kids. How many cards does each kid get?", 90, 10),
        ("96 tokens are split equally among 8 game tables. How many tokens are at each table?", 96, 8),
        ("75 apples are packed equally into 5 baskets. How many apples are in each basket?", 75, 5),
        ("64 marbles are shared equally among 8 friends. How many marbles does each friend get?", 64, 8),
        ("88 inches of ribbon is cut into 11 equal pieces. How many inches long is each piece?", 88, 11),
        ("108 stickers are split equally among 12 students. How many stickers does each student get?", 108, 12),
        ("132 beads are shared equally among 11 necklaces. How many beads are on each necklace?", 132, 11),
        ("120 minutes are split equally into 6 parts. How many minutes is each part?", 120, 6),
        ("144 pages are split equally into 12 chapters. How many pages are in each chapter?", 144, 12),
        ("70 cookies are shared equally among 10 plates. How many cookies are on each plate?", 70, 10),
        ("54 books are shared equally among 6 shelves. How many books are on each shelf?", 54, 6),
        ("99 balloons are shared equally among 9 classes. How many balloons does each class get?", 99, 9),
        ("110 buttons are shared equally among 10 jars. How many buttons are in each jar?", 110, 10),
        ("42 toy cars are shared equally among 7 bins. How many cars are in each bin?", 42, 7),
        ("36 sandwiches are shared equally among 9 tables. How many sandwiches are on each table?", 36, 9),
        ("100 feet of rope is cut into 10 equal pieces. How many feet is each piece?", 100, 10),
        ("156 inches of border is cut into 12-inch pieces. How many pieces are made?", 156, 12),
        ("66 pencils are shared equally among 6 cups. How many pencils are in each cup?", 66, 6),
        ("77 stickers are shared equally among 7 friends. How many stickers does each friend get?", 77, 7),
        ("91 cookies are shared equally among 7 boxes. How many cookies are in each box?", 91, 7),
        ("114 crayons are split equally into 6 trays. How many crayons are in each tray?", 114, 6),
        ("135 points are split equally among 9 teams. How many points does each team get?", 135, 9),
        ("168 blocks are shared equally among 14 groups. How many blocks are in each group?", 168, 14),
        ("180 minutes are shared equally among 12 sessions. How many minutes is each session?", 180, 12),
        ("210 stickers are split equally into 14 packs. How many stickers are in each pack?", 210, 14),
        ("240 beads are shared equally among 15 bracelets. How many beads are in each bracelet?", 240, 15),
        ("264 pages are split equally into 12 booklets. How many pages are in each booklet?", 264, 12),
        ("300 cards are shared equally among 20 players. How many cards does each player get?", 300, 20),
    ]
    # Use first 35 specs (avoid being too long)
    specs = specs[:35]
    for i, (txt, total, groups) in enumerate(specs, start=1):
        ans = total // groups
        rows.append(
            fmt_q(
                f"sh{i:03d}",
                text=txt,
                answer=ans,
                band=2 if i <= 12 else 3,
                problem_type=PT_SHARING,
                visual=f"{total}÷{groups}",
                hint_keywords=["shared equally", "each", "split equally"],
                hint="Divide the total into equal groups to find how many are in each group.",
                explain=f"➗ {total} ÷ {groups} = **{ans}**.",
                session_level="hard",
                minimal_visual=True,
            )
        )
    assert len(rows) == 35
    return rows


def gen_change_unknown_extra() -> list[str]:
    """Add 37 Change Unknown stories (13 → 50). Missing add-on or missing take-away amount."""
    rows: list[str] = []
    specs = [
        ("Liam had 18 cards. After he got some more cards, he had 27 cards. How many cards did he get?", 18, 27, "27−18"),
        ("Mia had 25 stickers. After she gave some away, she had 16 stickers left. How many stickers did she give away?", 25, 16, "25−16"),
        ("There were 14 apples in a basket. After some apples were added, there were 23 apples. How many apples were added?", 14, 23, "23−14"),
        ("A jar had 40 beads. After some beads were taken out, 31 beads were left. How many beads were taken out?", 40, 31, "40−31"),
        ("Noah had 12 points. After scoring some more points, he had 29 points. How many points did he score?", 12, 29, "29−12"),
        ("A shelf had 35 books. After some books were borrowed, 28 books remained. How many books were borrowed?", 35, 28, "35−28"),
        ("There were 20 crayons. After some crayons were put in the box, there were 34 crayons. How many crayons were added?", 20, 34, "34−20"),
        ("A tank had 55 fish. After some fish were moved, 47 fish stayed. How many fish were moved?", 55, 47, "55−47"),
        ("A kid had 30 cents. After spending some cents, 18 cents were left. How many cents were spent?", 30, 18, "30−18"),
        ("There were 16 cookies. After some cookies were eaten, 9 cookies were left. How many cookies were eaten?", 16, 9, "16−9"),
        ("A class had 22 students. After some students arrived late, there were 28 students. How many students arrived late?", 22, 28, "28−22"),
        ("Zoe had 41 pages left to read. After reading some pages, she had 26 pages left. How many pages did she read?", 41, 26, "41−26"),
        ("A box had 50 marbles. After some marbles were given away, 33 marbles remained. How many marbles were given away?", 50, 33, "50−33"),
        ("A timer showed 15 minutes. After adding some minutes, it showed 40 minutes. How many minutes were added?", 15, 40, "40−15"),
        ("There were 60 stickers. After some stickers were used, 44 stickers were left. How many stickers were used?", 60, 44, "60−44"),
        ("A team had 24 points. After scoring some points, the team had 39 points. How many points did they score?", 24, 39, "39−24"),
        ("A bakery had 48 muffins. After selling some muffins, 29 muffins were left. How many muffins were sold?", 48, 29, "48−29"),
        ("There were 33 pencils. After buying some more pencils, there were 50 pencils. How many pencils were bought?", 33, 50, "50−33"),
        ("A kid had 70 cents. After spending some cents, 55 cents were left. How many cents were spent?", 70, 55, "70−55"),
        ("A drawer had 26 markers. After some markers were taken out, 18 markers were left. How many markers were taken out?", 26, 18, "26−18"),
        ("There were 19 birds. After some birds flew in, there were 31 birds. How many birds flew in?", 19, 31, "31−19"),
        ("A game started with 10 tokens. After finding some more tokens, there were 27 tokens. How many tokens were found?", 10, 27, "27−10"),
        ("A bucket had 44 shells. After giving some away, 36 shells remained. How many shells were given away?", 44, 36, "44−36"),
        ("There were 38 balloons. After some balloons popped, 21 balloons were left. How many balloons popped?", 38, 21, "38−21"),
        ("A kid had 52 marbles. After losing some marbles, 45 marbles were left. How many marbles were lost?", 52, 45, "52−45"),
        ("A shelf had 90 books. After moving some books away, 76 books stayed. How many books were moved away?", 90, 76, "90−76"),
        ("There were 28 apples. After giving some apples to friends, 19 apples were left. How many apples were given away?", 28, 19, "28−19"),
        ("A class had 30 art papers. After using some papers, 17 papers were left. How many papers were used?", 30, 17, "30−17"),
        ("A student had 16 stickers. After getting some more stickers, the student had 44 stickers. How many stickers did the student get?", 16, 44, "44−16"),
        ("A coach had 66 cones. After setting out some cones, 81 cones were on the field. How many cones were set out?", 66, 81, "81−66"),
        ("A jar had 28 coins. After adding some coins, it had 50 coins. How many coins were added?", 28, 50, "50−28"),
        ("There were 47 cups. After some cups were washed, 32 cups were still dirty. How many cups were washed?", 47, 32, "47−32"),
        ("A kid had 40 points. After losing some points, the kid had 28 points. How many points were lost?", 40, 28, "40−28"),
        ("There were 72 crayons. After sharing some crayons, 60 crayons were left. How many crayons were shared?", 72, 60, "72−60"),
        ("A zoo had 48 tickets left. After selling some tickets, 35 tickets were left. How many tickets were sold?", 48, 35, "48−35"),
        ("There were 24 minutes left. After adding some minutes, there were 50 minutes left. How many minutes were added?", 24, 50, "50−24"),
        ("A box had 64 crayons. After giving some away, 52 crayons were left. How many crayons were given away?", 64, 52, "64−52"),
    ]
    specs = specs[:37]
    for i, (txt, start, end, vis) in enumerate(specs, start=1):
        # If end > start => added amount, else removed amount
        if end >= start:
            ans = end - start
            expl = f"🧩 {end} − {start} = **{ans}** added."
        else:
            ans = start - end
            expl = f"🧩 {start} − {end} = **{ans}** taken away."
        rows.append(
            fmt_q(
                f"cu{i:03d}",
                text=txt,
                answer=ans,
                band=2,
                problem_type=PT_CHANGE_UNKNOWN,
                visual=vis,
                hint_keywords=["how many", "after", "before"],
                hint="Use subtraction to find the missing change.",
                explain=expl,
                session_level="medium",
            )
        )
    assert len(rows) == 37
    return rows


def gen_all_extended() -> dict[str, list[str]]:
    return {
        "QUESTIONS_MONEY_MEASUREMENT": gen_money_measurement(),
        "QUESTIONS_REMAINDER_INTERPRETATION": gen_remainder_interpretation(),
        "QUESTIONS_TWO_STEP_COMPARE": gen_two_step_compare(),
        "QUESTIONS_ELAPSED_TIME": gen_elapsed_time(),
        "QUESTIONS_FRACTION_OF_SET": gen_fraction_of_set(),
        "QUESTIONS_JOIN_EXTRA": gen_join_extra(),
        "QUESTIONS_UNKNOWN_EXTRA": gen_unknown_extra(),
        "QUESTIONS_COMPARE_EXTRA": gen_compare_extra(),
        "QUESTIONS_SHARING_EXTRA": gen_sharing_extra(),
        "QUESTIONS_CHANGE_UNKNOWN_EXTRA": gen_change_unknown_extra(),
    }
