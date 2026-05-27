# -*- coding: utf-8 -*-
"""Generate QUESTIONS_EASY / MEDIUM / HARD (~100 each) and patch word_problem_adventure.html."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HTML = ROOT / "word_problem_adventure.html"


def je(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def fmt_q(
    qid: str,
    text: str,
    answer: int,
    band: int,
    problem_type: str,
    visual: str,
    hint_keywords: list[str],
    hint: str,
    explain: str,
    minimal_visual: bool = False,
    session_level: str | None = None,
) -> str:
    mv = ", minimalVisual: true" if minimal_visual else ""
    vis = je(visual) if visual else ""
    sl = f', sessionLevel: "{session_level}"' if session_level else ""
    return (
        f'    {{ id: "{qid}", text: "{je(text)}", answer: {answer}, band: {band}{sl}, '
        f'problemType: "{problem_type}", visual: "{vis}", '
        f"hintKeywords: {json.dumps(hint_keywords)}, "
        f'hint: "{je(hint)}", explain: "{je(explain)}"{mv} }}'
    )


def gen_easy() -> list[str]:
    rows: list[str] = []
    n = 0

    def add(qid, **kw):
        nonlocal n
        rows.append(fmt_q(qid, **kw))
        n += 1

    # Band 1 — Join / PPV, sums mostly ≤ 14
    join_b1 = [
        ("The sandbox has {a} red shovels and {b} green shovels. How many shovels are there?", "PPW"),
        ("{a} ducklings rested on the bank. {b} more slid into the pond. How many ducklings are in the water now?", "Join"),
        ("A music cart has {a} rhythm sticks and {b} bells. How many instruments are on the cart?", "PPW"),
        ("{a} kids waited in line. {b} more kids joined the line. How many kids are in line now?", "Join"),
        ("The craft bin has {a} pompoms and {b} pipe cleaners. How many craft pieces are in the bin?", "PPW"),
        ("{a} ants carried crumbs. {b} more ants came to help. How many ants are there now?", "Join"),
        ("Room 3 hung {a} paper snowflakes and {b} paper stars. How many decorations are on the wall?", "PPW"),
        ("{a} riders were on the merry-go-round. {b} more riders climbed on. How many riders are on it now?", "Join"),
        ("A lunch tray has {a} carrot sticks and {b} celery sticks. How many veggie sticks are on the tray?", "PPW"),
        ("{a} puppies napped in the basket. {b} puppies waddled in. How many puppies are in the basket now?", "Join"),
        ("The science tray shows {a} magnets and {a2} paper clips. How many items are on the tray?", "PPW"),
        ("{a} boats floated in the tub. The teacher added {b} more boats. How many boats float now?", "Join"),
        ("A story corner has {a} big pillows and {b} small pillows. How many pillows are there?", "PPW"),
        ("{a} runners stretched. {b} more runners jogged over. How many runners are there in all?", "Join"),
        ("The paint cart holds {a} blue brushes and {b} yellow brushes. How many brushes are on the cart?", "PPW"),
        ("{a} tadpoles swam near the rock. {b} tadpoles darted out from under the rock. How many tadpoles are there?", "Join"),
        ("A snack plate has {a} cheese cubes and {b} apple slices. How many snack pieces are on the plate?", "PPW"),
        ("{a} kites dipped low. {b} kites swooped up high. How many kites are flying?", "Join"),
        ("The Lego bin has {a} wheels and {b} windows. How many special pieces are in the bin?", "PPW"),
        ("{a} friends waved from the bus window. {b} friends waved from the sidewalk. How many friends waved in all?", "Join"),
        ("A garden patch has {a} sunflowers and {b} daisies. How many flowers are in the patch?", "PPW"),
        ("{a} frogs croaked by the log. {b} frogs hopped onto the log. How many frogs are by the log?", "Join"),
        ("The dress-up rack has {a} capes and {b} crowns. How many dress-up items are on the rack?", "PPW"),
        ("{a} dancers spun in a circle. {b} dancers joined the circle. How many dancers are in the circle now?", "Join"),
        ("A picnic blanket shows {a} sandwiches and {b} oranges. How many food items are on the blanket?", "PPW"),
        ("{a} minnows darted left. {b} minnows darted right. How many minnows are in the school?", "Join"),
        ("The puppet stage has {a} hand puppets and {b} finger puppets. How many puppets are ready?", "PPW"),
        ("{a} hikers rested at the sign. {b} hikers caught up from the trail. How many hikers are at the sign now?", "Join"),
        ("A bead tray has {a} round beads and {b} square beads. How many beads are on the tray?", "PPW"),
        ("{a} chicks peeped in the coop. {b} chicks peeked from the hay. How many chicks are there?", "Join"),
        ("The marble run has {a} long tubes and {b} short tubes. How many tubes are in the set?", "PPW"),
        ("{a} singers hummed the tune. {b} singers joined the harmony. How many singers are there in all?", "Join"),
        ("A tide pool tray has {a} hermit crabs and {b} snails. How many small creatures are on the tray?", "PPW"),
        ("{a} scooters waited at the curb. {b} scooters rolled up. How many scooters are at the curb now?", "Join"),
    ]
    pairs_b1 = [(4, 5), (5, 4), (3, 7), (7, 3), (6, 4), (4, 6), (5, 5), (2, 8), (8, 2), (5, 3), (3, 6), (6, 3), (4, 4), (5, 6), (6, 5), (7, 4), (4, 7), (3, 5), (5, 7), (7, 5), (6, 6), (5, 8), (8, 5), (4, 8), (8, 4), (6, 7), (7, 6), (3, 8), (8, 3), (5, 9), (9, 5), (6, 8), (8, 6), (7, 7), (4, 9)]
    for i, (tpl, pt) in enumerate(join_b1):
        a, b = pairs_b1[i % len(pairs_b1)]
        txt = tpl.format(a=a, b=b, a2=(a + 1) % 9 + 2)
        ans = a + b
        if "now" in txt.lower() or "joined" in txt.lower() or "added" in txt.lower() or "rolled" in txt.lower() or "caught" in txt.lower() or "waddled" in txt.lower() or "darted" in txt.lower() or "hopped" in txt.lower() or "peeped" in txt.lower() or "swooped" in txt.lower():
            actual_pt = "Join"
        else:
            actual_pt = "Part–Part–Whole"
        if pt == "Join":
            actual_pt = "Join"
        if pt == "PPW":
            actual_pt = "Part–Part–Whole"
        emoji = ["🛝", "🦆", "🎵", "👧", "✂️", "🐜", "❄️", "🎠", "🥕", "🐶", "🧲", "⛵", "📚", "🏃", "🖌️", "🐸", "🧀", "🪁", "🧱", "🚌", "🌻", "🐸", "🎭", "💃", "🥪", "🐟", "🎪", "🥾", "📿", "🐣", "🔮", "🎤", "🦀", "🛴"][i % 34]
        add(
            f"e{n+1:03d}",
            text=txt,
            answer=ans,
            band=1,
            problem_type=actual_pt,
            visual=f"{emoji}{a}+{b}",
            hint_keywords=["how many", "more", "in all", "now", "together"][i % 5 : i % 5 + 2] if i % 5 < 4 else ["how many", "altogether"],
            hint="Add the two parts of the story to find the total.",
            explain=f"{emoji} {a} + {b} = **{ans}**.",
        )

    # Band 2 — slightly larger sums to ~18–19
    pairs_b2 = [(9, 8), (8, 9), (10, 7), (7, 10), (11, 6), (6, 11), (12, 5), (5, 12), (10, 8), (8, 10), (9, 9), (11, 7), (7, 11), (12, 6), (6, 12), (13, 5), (5, 13), (10, 9), (9, 10), (11, 8), (8, 11), (12, 7), (7, 12), (13, 6), (6, 13), (14, 4), (4, 14), (10, 6), (6, 10), (9, 7), (7, 9), (11, 5), (5, 11), (12, 4), (4, 12)]
    for i, (a, b) in enumerate(pairs_b2):
        if i % 2 == 0:
            txt = f"The museum cart has {a} fossil prints and {b} shell cards. How many cards are on the cart?"
            pt = "Part–Part–Whole"
        else:
            txt = f"{a} students sat in the front row. {b} students sat in the back row. How many students sat in those two rows?"
            pt = "Part–Part–Whole"
        if i % 3 == 0:
            txt = f"A baker set out {a} plain bagels and {b} raisin bagels. How many bagels are on the tray?"
            pt = "Part–Part–Whole"
        if i % 3 == 1:
            txt = f"The relay team passed the baton {a} times in practice, then {b} times in the demo. How many passes in all?"
            pt = "Join"
        ans = a + b
        add(
            f"e{n+1:03d}",
            text=txt,
            answer=ans,
            band=2,
            problem_type=pt,
            visual=f"🏛️{a}+{b}",
            hint_keywords=["how many", "in all", "rows"],
            hint="Combine both groups from the story.",
            explain=f"🏛️ {a} + {b} = **{ans}**.",
        )

    # Band 3 — up to 20, include Separate
    sep_specs = [(18, 9), (19, 8), (20, 7), (17, 9), (16, 8), (20, 11), (19, 10), (18, 7), (15, 6), (14, 5)]
    for i, (tot, sub) in enumerate(sep_specs):
        stories = [
            f"Liam had {tot} trading cards. He traded away {sub} cards at the swap. How many cards does Liam have now?",
            f"There were {tot} paper boats in the tub. {sub} boats soaked through and sank. How many boats are still floating?",
            f"A ribbon was {tot} inches long. {sub} inches were cut off for a bow. How many inches of ribbon are left?",
            f"The class planted {tot} bulbs. {sub} bulbs have not sprouted yet. How many bulbs have sprouted?",
            f"Zara’s jar had {tot} buttons. She glued {sub} buttons onto a collage. How many buttons are left in the jar?",
            f"{tot} balloons lined the hallway. {sub} were taken to another wing. How many balloons stayed in the hallway?",
            f"A pitcher held {tot} cups of juice. The team poured out {sub} cups for tasting. How many cups are left in the pitcher?",
            f"There were {tot} stickers on a sheet. {sub} stickers were used for name tags. How many stickers are still on the sheet?",
            f"Omar stacked {tot} cups. {sub} cups fell when the table bumped. How many cups are still in the stack?",
            f"The pond model had {tot} plastic reeds. {tot - sub + 2} is wrong—fix: {tot} reeds, {sub} removed for cleaning. How many reeds are left in the model?",
        ]
        txt = stories[i]
        if i == 9:
            sub = 7
            txt = f"The pond model had {tot} plastic reeds. Workers removed {sub} reeds for cleaning. How many reeds are left in the model?"
        ans = tot - sub
        add(
            f"e{n+1:03d}",
            text=txt,
            answer=ans,
            band=3,
            problem_type="Separate",
            visual=f"📦{tot}−{sub}",
            hint_keywords=["left", "still", "now"],
            hint="Start with the bigger number and subtract what was taken away.",
            explain=f"📦 {tot} − {sub} = **{ans}**.",
        )

    join_b3 = [(12, 8), (13, 7), (14, 6), (11, 9), (10, 10), (15, 5), (16, 4), (13, 6), (14, 5), (12, 7)]
    for i, (a, b) in enumerate(join_b3):
        txt = f"The nature walk group spotted {a} robins early and {b} robins later. How many robins did they spot in all?"
        if i % 2 == 1:
            txt = f"A supply closet has {a} rolls of tape and {b} packs of sticky notes. How many items are on the shelf?"
        ans = a + b
        add(
            f"e{n+1:03d}",
            text=txt,
            answer=ans,
            band=3,
            problem_type="Join" if "spot" in txt else "Part–Part–Whole",
            visual=f"🐦{a}+{b}",
            hint_keywords=["in all", "how many"],
            hint="Add both parts to get the whole amount.",
            explain=f"🐦 {a} + {b} = **{ans}**.",
        )

    # Pad easy to 100
    pad_pairs = [(7, 6), (6, 7), (8, 5), (5, 8), (9, 4), (4, 9), (10, 3), (3, 10)]
    while len(rows) < 100:
        a, b = pad_pairs[len(rows) % len(pad_pairs)]
        bi = 1 if len(rows) < 40 else 2 if len(rows) < 70 else 3
        add(
            f"e{len(rows)+1:03d}",
            text=f"A game table has {a} red tokens and {b} blue tokens. How many tokens are on the table?",
            answer=a + b,
            band=bi,
            problem_type="Part–Part–Whole",
            visual=f"🎲{a}+{b}",
            hint_keywords=["how many"],
            hint="Red group + blue group = total tokens.",
            explain=f"🎲 {a} + {b} = **{a+b}**.",
        )

    return rows[:100]


def gen_medium() -> list[str]:
    rows: list[str] = []

    def add(qid, **kw):
        rows.append(fmt_q(qid, **kw))

    # Band 1 Separate / Compare — regrouping subtraction
    specs = [
        (42, 18, "Separate", "🍊", "oranges", "used", "juice"),
        (35, 17, "Separate", "🧃", "pouches", "sold", "snack bar"),
        (51, 24, "Separate", "📘", "workbooks", "checked out", "library"),
        (48, 19, "Separate", "🎨", "paint cups", "dumped", "cleanup"),
        (39, 15, "Separate", "🧦", "socks", "paired up", "laundry"),
        (44, 16, "Compare", "📐", "cm", "taller", None),
        (36, 28, "Compare", "🏀", "points", "more", None),
        (50, 23, "Separate", "🪑", "chairs", "stacked", "closet"),
        (47, 29, "Separate", "🎟️", "tickets", "scanned", "gate"),
        (41, 14, "Separate", "🧩", "puzzle pieces", "placed", "frame"),
        (33, 16, "Compare", "🌿", "cm", "taller", None),
        (45, 18, "Separate", "🥤", "cups", "filled", "cooler"),
        (52, 25, "Separate", "🖇️", "clips", "used", "bulletin"),
        (38, 19, "Compare", "⚖️", "kg", "heavier", None),
        (46, 27, "Separate", "🧱", "blocks", "put away", "bin"),
        (49, 21, "Separate", "🎵", "song sheets", "handed out", "chorus"),
        (43, 17, "Separate", "🍪", "cookies", "packed", "lunch"),
        (40, 22, "Compare", "📊", "votes", "more", None),
        (54, 26, "Separate", "🧵", "yarn balls", "knitted", "club"),
        (37, 15, "Separate", "🔭", "viewers", "signed up", "night sky"),
        (31, 14, "Compare", "🐢", "years", "older", None),
        (48, 31, "Compare", "🐠", "fish", "more", None),
        (55, 28, "Separate", "🚌", "permission slips", "returned", "office"),
        (42, 25, "Compare", "📏", "inches", "longer", None),
        (50, 33, "Separate", "🎒", "backpack hooks", "cleared", "closet"),
        (44, 19, "Separate", "🥁", "drumsticks", "borrowed", "band room"),
        (53, 24, "Separate", "🧪", "beakers", "washed", "lab"),
        (46, 29, "Compare", "🏊", "laps", "fewer", None),
        (41, 18, "Separate", "📝", "quiz papers", "graded", "pile"),
        (49, 32, "Compare", "🎯", "points", "more", None),
        (47, 21, "Separate", "🧴", "glue bottles", "opened", "cart"),
        (52, 35, "Compare", "🐕", "treats", "more", None),
        (39, 22, "Separate", "🎪", "balloons", "popped", "setup"),
        (45, 27, "Separate", "📷", "photos", "printed", "club"),
    ]
    for i, spec in enumerate(specs):
        big, small, pt, em, noun, verb, ctx = spec
        ans = big - small
        if pt == "Separate":
            txt = f"There were {big} {noun} ready for the {ctx}. After {small} were {verb}, how many {noun} are left?"
            hint = f"Start with {big}, then subtract the {small} that were {verb}."
            expl = f"{em} {big} − {small} = **{ans}** left."
            hkw = ["left", verb.split()[0]]
        else:
            if "taller" in spec[5]:
                txt = f"Plant A is {big} cm tall. Plant B is {small} cm tall. How many centimeters taller is Plant A?"
            elif "longer" in spec[5]:
                txt = f"One jump rope is {big} inches long. Another is {small} inches long. How much longer is the first rope?"
            elif "heavier" in spec[5]:
                txt = f"Bag X weighs {big} kg. Bag Y weighs {small} kg. How many kilograms heavier is Bag X?"
            elif "older" in spec[5]:
                txt = f"Aunt Kim is {big} years old. Cousin Jay is {small} years old. How many years older is Aunt Kim?"
            elif "fewer" in spec[5]:
                txt = f"Last meet, Izzy swam {big} laps. This meet she swam {small} fewer laps. How many laps this meet?"
                ans = big - small
            elif "more" in spec[5] and "points" in spec[4]:
                txt = f"The home team scored {big} points. The visitors scored {small} points. How many more points did the home team score?"
            elif "votes" in spec[4]:
                txt = f"The blue team earned {big} spirit votes. The gold team earned {small} votes. How many more votes did blue get?"
            elif "fish" in spec[4]:
                txt = f"The big aquarium has {big} fish. The small aquarium has {small} fish. How many more fish are in the big tank?"
            elif "treats" in spec[4]:
                txt = f"Kona’s bag has {big} dog treats. Nico’s bag has {small} treats. How many more treats does Kona have?"
            else:
                txt = f"One shelf has {big} books. Another has {small} books. How many more books are on the first shelf?"
            hint = "Subtract the smaller amount from the larger amount to compare."
            expl = f"{em} {big} − {small} = **{ans}**."
            hkw = ["more", "how many", "fewer", "longer", "taller", "older", "heavier"][i % 7 : i % 7 + 1]
            hkw = ["how many more", "difference"] if "more" in txt else ["how many", "fewer"]
        add(
            f"m{i+1:03d}",
            text=txt,
            answer=ans,
            band=1,
            problem_type=pt,
            visual=f"{em}{big}−{small}",
            hint_keywords=hkw if isinstance(hkw, list) else ["left"],
            hint=hint,
            explain=expl,
        )

    # Band 2 — change unknown, join floor, separate parts
    ch = [
        ("Some shells were in a bucket. A friend added 19 shells. Now there are 46 shells. How many were in the bucket at first?", 27, "?+19=46"),
        ("A piggy bank had some coins. After adding 14 coins, there are 51 coins. How many coins were there before?", 37, "?+14=51"),
        ("There were some minutes on the timer. The teacher added 22 minutes. Now it shows 40 minutes. How many minutes were on the timer at first?", 18, "?+22=40"),
        ("Some water was in a jug. Another 16 cups were poured in. Now there are 44 cups. How many cups were there at the start?", 28, "?+16=44"),
        ("A score started unknown. After earning 25 points, the board shows 48 points. What was the score before?", 23, "?+25=48"),
        ("Mia spent $13 on a snack. Then she had $26 left. How much did she have before buying the snack?", 39, "?−13=26"),
        ("A crate had some oranges. The cook used 21 for juice. 15 oranges are left. How many oranges were in the crate at first?", 36, "?−21=15"),
        ("Some kids were on the bus. 17 got off at the museum. 24 stayed on. How many kids were on the bus before the stop?", 41, "?−17=24"),
        ("A ribbon was some length. 18 inches were cut off. 22 inches remain. How long was the ribbon before the cut?", 40, "?−18=22"),
        ("There were some stickers. After giving away 12, 31 stickers remained. How many stickers were there at the start?", 43, "?−12=31"),
        ("An elevator was on an unknown floor. It went up 11 floors and stopped on floor 29. What floor did it start on?", 18, "?+11=29"),
        ("48 athletes signed up. 19 chose soccer and the rest chose track. How many chose track?", 29, "48−19"),
        ("There are 55 beads on a string. 28 are red and the rest are blue. How many blue beads are there?", 27, "55−28"),
        ("A box holds 50 tiles. 23 are triangles and the rest are squares. How many square tiles are there?", 27, "50−23"),
        ("The club raised $62 on Saturday and $18 on Sunday. How much did they raise on the two days together?", 80, "62+18"),
        ("Room 10 recycled 34 cans. Room 11 recycled 27 cans. How many cans did both rooms recycle together?", 61, "34+27"),
        ("One snake is 38 inches long. Another is 24 inches long. How many inches longer is the longer snake?", 14, "38−24"),
        ("A movie runs from 4:10 to 4:55. How many minutes long is it?", 45, "minutes"),
        ("A baker had 52 muffins. She sold 26 before noon. How many muffins were left after noon?", 26, "52−26"),
        ("Yellow team has 33 points. Green has 19. How many more points does yellow have?", 14, "33−19"),
        ("There are 47 chairs. 18 are still in stacks. How many are set out for the assembly?", 29, "47−18"),
        ("A farmer had 45 pumpkins. She sold 17 at the stand. How many pumpkins does she still have?", 28, "45−17"),
        ("Two ropes are 29 dm and 15 dm. How many decimeters longer is the longer rope?", 14, "29−15"),
        ("The vote was 36 for pizza and 21 for tacos. How many more votes did pizza get?", 15, "36−21"),
        ("A parking deck has 54 spots. 16 are reserved. How many spots are open for visitors?", 38, "54−16"),
        ("A class read 28 pages Monday and 24 Tuesday. How many pages on both days?", 52, "28+24"),
        ("There were 43 pencils. 16 were sharpened and given out. How many pencils are still in the box?", 27, "43−16"),
        ("One poster used 31 stickers. Another used 19. How many stickers did both posters use?", 50, "31+19"),
        ("A tank had 40 fish. 14 were moved to a new tank. How many fish stayed?", 26, "40−14"),
        ("Teams scored 27 and 35 goals. How many more goals did the higher team score?", 8, "35−27"),
        ("A shelf had 38 games. The library lent out 19. How many games are still on the shelf?", 19, "38−19"),
        ("Two classes brought 32 and 29 cans. How many cans altogether?", 61, "32+29"),
        ("There are 51 students. 22 wear glasses. How many do not wear glasses?", 29, "51−22"),
    ]
    for i, (txt, ans, vis) in enumerate(ch):
        pt = "Change Unknown" if "at first" in txt or "before" in txt or "start" in txt.lower() or "Some" in txt[:5] or "unknown" in txt.lower() or "spent" in txt and "before" in txt else ("Join" if "together" in txt or "both days" in txt or "altogether" in txt or "both rooms" in txt or "both posters" in txt else "Separate" if "rest" in txt or "still" in txt or "stayed" in txt or "left" in txt and "How many" in txt else "Compare" if "longer" in txt or "more" in txt and "points" in txt or "more votes" in txt or "more goals" in txt or "minutes long" in txt else "Separate")
        if "elevator" in txt:
            pt = "Join"
        if "minutes long" in txt:
            pt = "Compare"
        if "both days" in txt or "both rooms" in txt or "both posters" in txt or "altogether" in txt or "How many pages" in txt:
            pt = "Multi-step" if False else "Part–Part–Whole"
        if "Monday" in txt:
            pt = "Part–Part–Whole"
        if "together" in txt:
            pt = "Part–Part–Whole"
        add(
            f"m{len(rows)+1:03d}",
            text=txt,
            answer=ans,
            band=2,
            problem_type=pt,
            visual=vis,
            hint_keywords=["before", "at first", "rest", "left", "more", "together"][i % 6 : i % 6 + 2],
            hint="Read what changed: addition or subtraction connects the numbers.",
            explain=f"✨ The answer is **{ans}**.",
        )

    # Band 3 multi-step / compare chain light
    ms = [
        ("The team ordered 38 water bottles. They drank 11 before the game and 14 after. How many bottles are left?", 13, "38−11−14"),
        ("A shop had 45 hats. 16 sold in the morning and 12 in the afternoon. How many hats are still in the shop?", 17, "45−16−12"),
        ("There were 41 kids at camp. 13 went hiking and 9 went canoeing. The rest stayed at the lodge. How many stayed? (No overlap.)", 19, "41−13−9"),
        ("Librarians shelved 36 new books: 15 before lunch and 14 after. How many are not shelved yet?", 7, "36−15−14"),
        ("Parker had some cards. He gave 17 away and now has 28. How many did he start with?", 45, "?−17=28"),
        ("There are 56 students on the bus. 19 sit in front and the rest in back. How many sit in back?", 37, "56−19"),
        ("Rope A is 44 cm. Rope B is 18 cm shorter than A. How long is Rope B?", 26, "44−18"),
        ("Class C collected 29 bottles. Class D collected 11 more than Class C. How many did Class D collect?", 40, "29+11"),
        ("A farmer picked 48 squash. She sold 21 at market and kept the rest. How many did she keep?", 27, "48−21"),
        ("There were 39 guests. 14 went to the patio and 12 to the kitchen. How many stayed in the dining room? (No overlap.)", 13, "39−14−12"),
        ("Ken ran 24 minutes Tuesday and 18 Wednesday. How many minutes on both days?", 42, "24+18"),
        ("A cart had 33 glue sticks. 9 were shared in art and 8 in science. How many glue sticks are left?", 16, "33−9−8"),
        ("Some money was saved. Then $20 was added and the total became $71. How much was saved before the $20?", 51, "?+20=71"),
        ("There are 54 chairs. 22 need repairs. How many chairs are ready to use?", 32, "54−22"),
        ("Team A scored 31 and 24 in two quarters. Team B scored 40 total. How many more points did Team A score?", 15, "(31+24)−40"),
        ("A baker made 40 rolls. She sold 15 at breakfast and 11 at lunch. How many rolls are left?", 14, "40−15−11"),
        ("Two snakes measure 33 inches and 19 inches. How much longer is the longer snake?", 14, "33−19"),
        ("A number story: I think of a number, add 16, and get 52. What is my number?", 36, "?+16=52"),
        ("There were 47 apples. 18 were used for pie and 14 for sauce. How many apples are left?", 15, "47−18−14"),
        ("Jada’s skipping rope is 41 dm long. Mateo’s is 14 dm shorter. How long is Mateo’s rope?", 27, "41−14"),
        ("The school ordered 52 notebooks. 19 went to grade 3 and 21 to grade 4. How many notebooks are left?", 12, "52−19−21"),
        ("A parking lot has 60 spaces. 23 are taken. How many spaces are free?", 37, "60−23"),
        ("One jar has 28 fireflies drawn on it. Another has 35. How many more on the second jar?", 7, "35−28"),
        ("There were some marbles. After adding 24, there are 61 marbles. How many at the start?", 37, "?+24=61"),
        ("A club had 43 members. 15 graduated. How many members stayed?", 28, "43−15"),
        ("Two friends folded 26 and 19 paper cranes. How many cranes together?", 45, "26+19"),
        ("A rope 50 meters long had 17 m cut off, then another 12 m. How many meters are left?", 21, "50−17−12"),
        ("There are 58 kids. 24 play tag and 19 play catch. How many do something else? (No overlap.)", 15, "58−24−19"),
        ("Ana had some stickers. She used 19 and has 22 left. How many did she start with?", 41, "?−19=22"),
        ("The vote was 40 to 28. How many more votes did the winner get?", 12, "40−28"),
        ("A store had 37 balloons. 14 floated away in the wind. How many are left?", 23, "37−14"),
        ("Marcus read 31 pages and then 17 more. How many pages in all?", 48, "31+17"),
        ("There were 46 fish. 20 were gold and the rest were silver. How many silver fish?", 26, "46−20"),
    ]
    for i, (txt, ans, vis) in enumerate(ms):
        pt = "Multi-step" if "and" in txt and ("left" in txt or "still" in txt or "not shelved" in txt or "lodge" in txt or "dining" in txt or "left?" in txt and txt.count(".") > 1) else "Change Unknown" if "Some" in txt or "some" in txt[:10] or "think of a number" in txt else "Compare" if "shorter" in txt or "more than Class" in txt or "more points" in txt or "longer snake" in txt or "more on the second" in txt or "winner" in txt else "Separate"
        if "together" in txt or "in all" in txt:
            pt = "Part–Part–Whole"
        if "Team A scored" in txt:
            pt = "Compare"
        if "ordered" in txt and "left" in txt:
            pt = "Multi-step"
        if "Rope" in txt and "shorter" in txt:
            pt = "Compare"
        if "Class D" in txt:
            pt = "Compare"
        add(
            f"m{len(rows)+1:03d}",
            text=txt,
            answer=ans,
            band=3,
            problem_type=pt,
            visual=vis,
            hint_keywords=["left", "rest", "start", "more", "both"],
            hint="Work step by step: do one change, then the next.",
            explain=f"🧮 The answer is **{ans}**.",
        )

    while len(rows) < 100:
        i = len(rows)
        add(
            f"m{i+1:03d}",
            text=f"A bin has {40 + i} blocks. {15 + (i % 5)} blocks are red and the rest are blue. How many blue blocks?",
            answer=(40 + i) - (15 + (i % 5)),
            band=2,
            problem_type="Separate",
            visual=f"🧱{40+i}−{15+i%5}",
            hint_keywords=["rest", "blue"],
            hint="Total blocks minus red blocks.",
            explain=f"🧱 **{(40+i)-(15+i%5)}** blue blocks.",
        )

    return rows[:100]


def gen_hard() -> list[str]:
    rows: list[str] = []

    def add(qid, **kw):
        rows.append(fmt_q(qid, **kw))

    # Band 1
    b1 = [
        ("5 crates hold 7 juice boxes each. The coach sets aside 11 boxes for staff. How many boxes are left for players?", 24, "Multi-step", "5×7−11", False),
        ("There were some apples. The store added 4 bags of 8 apples. Now there are 59 apples. How many were there before?", 27, "Unknown", "?+32=59", True),
        ("Tia saves $6 a week for 6 weeks, then spends $15 on supplies. How many dollars does she have left?", 21, "Multi-step", "6×6−15", False),
        ("63 erasers are shared equally among 9 tables. How many erasers per table?", 7, "Sharing", "63÷9", False),
        ("A bus has 8 rows with 6 seats each, but 5 seats are empty. How many passengers are seated?", 43, "Multi-step", "8×6−5", False),
        ("The larger of two numbers is 52. Their difference is 14. What is the smaller number?", 38, "Compare", "52−14", True),
        ("8 squads have 7 runners each. 9 runners are hurt and sit out. How many runners compete?", 47, "Multi-step", "8×7−9", False),
        ("Donuts are packed 9 per box. There are 49 donuts and only full boxes count. How many donuts are left over?", 4, "Sharing", "49 mod 9", True),
        ("Priya buys 3 packs of 14 cards. She gives her brother one full pack and 6 cards from another. How many cards does she keep?", 22, "Multi-step", "3×14−14−6", False),
        ("A mystery number times 7 equals 56. What is the number?", 8, "Unknown", "?×7=56", True),
        ("4 teams receive 11 cones each, then 6 cones are collected for storage. How many cones stay on the field?", 38, "Multi-step", "4×11−6", False),
        ("Some books sat on a cart. Staff added 5 stacks of 6 books. Now there are 71 books. How many were on the cart first?", 41, "Unknown", "?+30=71", True),
        ("72 markers are split equally into boxes of 8. How many boxes?", 9, "Sharing", "72÷8", False),
        ("A number is 23 less than 61. What is the number?", 38, "Unknown", "61−23", True),
        ("6 wagons carry 9 hay bales each. 13 bales are unloaded early. How many bales are still on the wagons?", 41, "Multi-step", "6×9−13", False),
        ("Rico thinks of a number, divides it by 4, and gets 11. What was the number?", 44, "Unknown", "?÷4=11", True),
        ("There are 5 jars with 10 cookies each. 17 cookies are wrapped for gifts. How many cookies are left unwrapped?", 33, "Multi-step", "5×10−17", False),
        ("54 students form equal rows of 9. How many rows?", 6, "Sharing", "54÷9", False),
        ("A farm packs 41 eggs in cartons of 12 (full cartons only). How many eggs are left out of cartons?", 5, "Sharing", "41 mod 12", True),
        ("Mystery number plus 19 equals 67. What is the number?", 48, "Unknown", "?+19=67", True),
        ("7 shelves hold 8 trophies each. 9 trophies are polished elsewhere. How many trophies are on the shelves?", 47, "Multi-step", "7×8−9", False),
        ("88 inches of wire is cut into 8 equal pieces. How many pieces?", 11, "Sharing", "88÷8", False),
        ("Each of 6 tables gets 5 paint cups. 8 cups are refilled from a jug. How many cups are on tables in all?", 30, "Multi-step", "6×5", False),
        ("Start unknown. Add 27 and the result is 74. What was the start?", 47, "Unknown", "?+27=74", True),
        ("9 bags have 6 apples each. 14 apples are used for a demo. How many apples are left?", 40, "Multi-step", "9×6−14", False),
        ("65 ÷ mystery divisor equals 5. What is the divisor?", 13, "Unknown", "65÷?=5", True),
        ("4 boxes of 11 markers arrive. 15 markers are opened for a project. How many markers are still sealed in boxes?", 29, "Multi-step", "4×11−15", False),
        ("There were some coins in a jar. After adding 20 cents in nickels, the jar has 95 cents. How many cents were in the jar before?", 75, "Unknown", "?+20=95", True),
        ("3 packs of 16 juice pouches. 12 pouches are chilled separately. How many pouches are still in packs?", 36, "Multi-step", "3×16−12", False),
        ("A number multiplied by 9 equals 81. What is the number?", 9, "Unknown", "?×9=81", True),
        ("10 rows of 4 plants. 7 plants need replanting. How many look healthy in the rows?", 33, "Multi-step", "10×4−7", False),
        ("77 stickers are divided equally among 7 friends. How many each?", 11, "Sharing", "77÷7", False),
        ("Some tiles were in a box. 6 packs of 9 tiles were added. Now there are 92 tiles. How many were in the box before?", 38, "Unknown", "?+54=92", True),
        ("8 classes borrow 5 microscopes each. 6 microscopes stay in the lab. How many are out with classes?", 34, "Multi-step", "8×5−6", False),
    ]
    for i, (txt, ans, pt, vis, mv) in enumerate(b1):
        add(
            f"h{i+1:03d}",
            text=txt,
            answer=ans,
            band=1,
            problem_type=pt,
            visual=vis,
            hint_keywords=["each", "before", "left", "equally", "mystery", "difference"],
            hint="Decide: multiply, divide, add, or subtract to match the story.",
            explain=f"💡 The answer is **{ans}**.",
            minimal_visual=mv,
        )

    # Band 2
    b2 = [
        ("6 rows of 12 chairs. 21 chairs are folded. How many chairs are open?", 51, "Multi-step", "6×12−21", True),
        ("7 groups of 9 students tour the museum. 15 students wait outside. How many students are inside?", 48, "Multi-step", "7×9−15", True),
        ("Team Gold scores 26 and 29 in two periods. Team Blue scores 44 total. How many more points does Gold have?", 11, "Compare", "(26+29)−44", True),
        ("95 eggs go into cartons of 12 (full only). How many eggs are outside full cartons?", 11, "Sharing", "95 mod 12", True),
        ("Luis had some money. He earned $18 and $24 babysitting. Now he has $75. How much did he start with?", 33, "Unknown", "?+42=75", True),
        ("Tickets: adults $11, kids $6. A family buys 2 adult and 4 kid tickets. How many dollars total?", 46, "Multi-step", "2×11+4×6", False),
        ("Ribbon 80 inches is cut into 10 equal strips. Each bow needs 2 strips. How many bows?", 5, "Multi-step", "10÷2", True),
        ("4 tanks have 14 fish each and 2 tanks have 9 fish each. How many fish in all?", 74, "Multi-step", "4×14+2×9", False),
        ("A farmer has 58 carrots. Bundles hold 7 each. How many carrots are not in a full bundle?", 2, "Sharing", "58 mod 7", True),
        ("Mystery number minus 28 equals 36. What is the number?", 64, "Unknown", "?−28=36", True),
        ("5 shelves of 11 books. 19 books are checked out from those shelves. How many books remain?", 36, "Multi-step", "5×11−19", True),
        ("There were some marbles. After giving away 3 bags of 12, 40 marbles remain. How many marbles at the start?", 76, "Unknown", "?−36=40", True),
        ("A theater section is 9 by 11 seats. 20 seats are blocked. How many seats are open?", 79, "Multi-step", "9×11−20", True),
        ("2 mystery numbers add to 100. One is 37. What is the other?", 63, "Unknown", "100−37", True),
        ("Each of 8 cages has 6 rabbits. 11 rabbits go to the vet. How many stay?", 37, "Multi-step", "8×6−11", True),
        ("A number story: divide 96 by a number and get 8. What is the divisor?", 12, "Unknown", "96÷?=8", True),
        ("6 packs of 9 granola bars minus 14 bars sold from an open pack — start with 6×9=54, sell 14: how many left?", 40, "Multi-step", "54−14", True),
        ("Red scores 33, blue scores 41. How many more for blue?", 8, "Compare", "41−33", True),
        ("Some pencils in a tub. Teachers add 7 boxes of 8 pencils. Now there are 111 pencils. How many before?", 55, "Unknown", "?+56=111", True),
        ("12 teams of 8 athletes. 19 athletes are substitutes on the bench. How many are on the field?", 77, "Multi-step", "12×8−19", True),
        ("A rope is 63 feet cut into 9-foot sections. How many sections?", 7, "Sharing", "63÷9", True),
        ("4 trays of 15 muffins. 22 muffins are sold. How many remain?", 38, "Multi-step", "4×15−22", False),
        ("Triple a number is 39. What is the number?", 13, "Unknown", "3×?=39", True),
        ("8 buses each carry 11 kids on a trip. 14 seats are empty across the buses. How many kids are on the buses?", 74, "Multi-step", "8×11−14", True),
        ("There were some coins. After adding 35 cents, the total is 90 cents. How many cents before?", 55, "Unknown", "?+35=90", True),
        ("The art room has 5 boxes of 12 crayons each. The teacher hands out 18 crayons for a project. How many crayons are left?", 42, "Multi-step", "60−18", True),
        ("Two-step compare: One building is 55 feet tall. Another is 18 feet shorter. How tall is the shorter building?", 37, "Compare", "55−18", True),
        ("72 legs on spiders (8 legs each). How many spiders?", 9, "Sharing", "72÷8", True),
        ("A number plus itself plus itself (three equal parts) makes 42. What is the number?", 14, "Unknown", "3×?=42", True),
        ("6 flowerpots have 7 flowers each. 16 flowers wilt and are removed. How many flowers remain?", 26, "Multi-step", "6×7−16", True),
        ("There were some gallons of water. After using 4 buckets of 6 gallons each, 18 gallons remain. How many gallons at the start?", 42, "Unknown", "?−24=18", True),
        ("9 packs of 10 cards. 23 cards are duplicates set aside. How many cards count in the deck?", 67, "Multi-step", "9×10−23", True),
        ("Mystery number times 8 plus 5 equals 61. What is the number? (Hint: undo the +5 first.)", 7, "Unknown", "8×?+5=61", True),
        ("4 rows of 13 desks. 9 desks are moved out. How many desks stay?", 43, "Multi-step", "4×13−9", True),
    ]
    for i, (txt, ans, pt, vis, mv) in enumerate(b2):
        add(
            f"h{len(rows)+1:03d}",
            text=txt,
            answer=ans,
            band=2,
            problem_type=pt,
            visual=vis,
            hint_keywords=["each", "before", "total", "undo"],
            hint="Break the story into smaller math steps.",
            explain=f"🌟 The answer is **{ans}**.",
            minimal_visual=mv,
        )

    # Band 3
    b3 = [
        ("8 tables with 7 seats each. 27 seats are empty. How many students are seated?", 29, "Multi-step", "", True),
        ("School has 7 fifth-grade classes with 23 students each. 41 stay for clubs. How many go home on the bus?", 120, "Multi-step", "", True),
        ("Mira has 48 stickers. Ben has 19 fewer than Mira. Chen has 14 more than Ben. How many does Chen have?", 43, "Multi-step", "", True),
        ("6 cartons of 10 eggs. 19 eggs crack. How many good eggs?", 41, "Multi-step", "", True),
        ("Some books on a shelf. Librarians add 5 shelves of 13 books. Now there are 108 books. How many were there before?", 43, "Unknown", "", True),
        ("14 bowls × 4 cups water each. Pour out 11 cups. How many cups remain?", 45, "Multi-step", "", True),
        ("Game: 12 points per gold token, 6 per silver. You earn 4 gold and 5 silver. Total points?", 78, "Multi-step", "", True),
        ("100 feet of rope in 10-foot pieces. How many pieces?", 10, "Sharing", "", True),
        ("Bake sale: muffins $4 each, cookies $3 each. Sell 9 muffins and 11 cookies, then spend $19 on supplies from earnings. Dollars left?", 50, "Multi-step", "", True),
        ("I think of a number, multiply by 6, subtract 9, get 45. What is the number? (Undo carefully.)", 9, "Unknown", "", True),
        ("5 boxes of 14 pencils donated. School keeps 3 full boxes and 8 loose pencils from a fourth box. How many pencils kept?", 50, "Multi-step", "", True),
        ("There were some oranges. After shipping 6 crates of 9 oranges, 28 oranges remain in the store. How many oranges at the start?", 82, "Unknown", "", True),
        ("A concert hall: section A is 12 by 11 seats, section B is 8 by 9 seats. How many seats in both sections?", 204, "Multi-step", "", True),
        ("84 beads shared equally among 6 bracelets. How many beads per bracelet?", 14, "Sharing", "", True),
        ("Two numbers differ by 17. The bigger is 56. What is the smaller?", 39, "Compare", "", True),
        ("Train has 9 cars with 14 seats each. 31 seats are empty. How many passengers?", 95, "Multi-step", "", True),
        ("Start unknown. Triple it and add 11 to get 50. What was the start?", 13, "Unknown", "", True),
        ("40 cups: 3 groups borrow 7 cups each. How many cups are left?", 19, "Multi-step", "", True),
        ("A pet store has 4 aquariums with 16 fish each and 5 bowls with 3 goldfish each. How many fish in all?", 79, "Multi-step", "", True),
        ("There were some dollars in an envelope. Mom adds 4 five-dollar bills ($20). Now there is $56. How much was in the envelope first?", 36, "Unknown", "", True),
        ("156 inches of border tile in 12-inch pieces. How many whole pieces?", 13, "Sharing", "", True),
        ("Rosa picks 5 baskets of 11 apples. She sells 37 apples at a stand. How many apples does she still have?", 18, "Multi-step", "", True),
        ("A number divided by 7 has quotient 12 and remainder 3. What was the number? (Use 7×12+3.)", 87, "Unknown", "", True),
        ("6 teams of 9 players. 8 players are coaches. How many are players only?", 46, "Multi-step", "", True),
        ("At the zoo, each family pack has 3 adult tickets and 2 child tickets. Eight families each buy one pack. How many tickets is that in all?", 40, "Multi-step", "", True),
        ("Some water in a tank. After draining 35 gallons twice (two days), 18 gallons remain. How much was in the tank before draining? (Total drained 70.)", 88, "Unknown", "", True),
        ("Hardwood planks: 7 stacks of 15 planks. 23 planks are used for repair. How many planks left?", 82, "Multi-step", "", True),
        ("Mystery: half of a number is 17. What is the number?", 34, "Unknown", "", True),
        ("11 rows of 8 chairs. First 3 rows are for guests (full). Other rows have only 5 chairs filled each. How many people seated? (3×8 + 8×5)", 64, "Multi-step", "", True),
        ("125 students, vans hold 12 each. How many vans needed for everyone? (Use remainder.)", 11, "Sharing", "", True),
        ("A shop orders 9 cases of 8 juice bottles and 5 cases of 6 sports drinks. How many drinks in all?", 102, "Multi-step", "", True),
        ("There were some stickers. After using 4 sheets of 15 stickers, 18 remain. How many stickers at the start?", 78, "Unknown", "", True),
        ("Equal split: 96 tokens among 8 game tables equally. How many tokens per table?", 12, "Sharing", "", True),
    ]
    for i, (txt, ans, pt, vis, mv) in enumerate(b3):
        add(
            f"h{len(rows)+1:03d}",
            text=txt,
            answer=ans,
            band=3,
            problem_type=pt,
            visual=vis,
            hint_keywords=["each", "before", "undo", "total"],
            hint="Picture the story: what happens first, second, third?",
            explain=f"🎯 The answer is **{ans}**.",
            minimal_visual=True,
        )

    # Fix a few wrong answers in b3
    # 11 rows problem: 3*8 + 8*5 = 24+40 = 64 OK
    # 125/12 = 10 remainder 5 -> 11 vans OK
    # Zoo 8 families * 5 tickets = 40 OK (3+2=5 per family)

    while len(rows) < 100:
        i = len(rows)
        add(
            f"h{i+1:03d}",
            text=f"A warehouse has {6 + (i % 3)} pallets with {10 + (i % 4)} boxes each. {8 + (i % 5)} boxes are shipped out. How many boxes remain?",
            answer=(6 + i % 3) * (10 + i % 4) - (8 + i % 5),
            band=3,
            problem_type="Multi-step",
            visual="",
            hint_keywords=["each", "left"],
            hint="Multiply for pallets, then subtract shipped boxes.",
            explain=f"📦 **{(6+i%3)*(10+i%4)-(8+i%5)}** boxes remain.",
            minimal_visual=True,
        )

    return rows[:100]


def patch_html():
    from gen_extended_banks import gen_all_extended

    easy_lines = gen_easy()
    med_lines = gen_medium()
    hard_lines = gen_hard()
    easy = ",\n".join(easy_lines)
    med = ",\n".join(med_lines)
    hard = ",\n".join(hard_lines)

    text = HTML.read_text(encoding="utf-8")

    def replace_block(src: str, const_name: str, body: str) -> str:
        start = src.index(f"  const {const_name} = [")
        if const_name == "QUESTIONS_HARD":
            end = src.index("\n\n  function inferProblemType", start)
        else:
            nxt = "QUESTIONS_MEDIUM" if const_name == "QUESTIONS_EASY" else "QUESTIONS_HARD"
            end = src.index(f"  /** @type {{Question[]}} */\n  const {nxt} = [", start)
        return src[:start] + f"  const {const_name} = [\n" + body + "\n  ];\n" + src[end:]

    text = replace_block(text, "QUESTIONS_EASY", easy)
    text = replace_block(text, "QUESTIONS_MEDIUM", med)
    text = replace_block(text, "QUESTIONS_HARD", hard)

    ext = gen_all_extended()
    ext_chunks = []
    for name, lines in ext.items():
        body = ",\n".join(lines)
        ext_chunks.append(f"  const {name} = [\n{body}\n  ];")
    helpers = """
  var EXTRA_QUESTION_BANKS = [
    QUESTIONS_MONEY_MEASUREMENT,
    QUESTIONS_REMAINDER_INTERPRETATION,
    QUESTIONS_TWO_STEP_COMPARE,
    QUESTIONS_ELAPSED_TIME,
    QUESTIONS_FRACTION_OF_SET,
    QUESTIONS_JOIN_EXTRA,
    QUESTIONS_UNKNOWN_EXTRA,
    QUESTIONS_COMPARE_EXTRA,
    QUESTIONS_SHARING_EXTRA,
    QUESTIONS_CHANGE_UNKNOWN_EXTRA
  ];

  function getQuestionsForLevel(level) {
    var base = level === "easy" ? QUESTIONS_EASY : level === "medium" ? QUESTIONS_MEDIUM : QUESTIONS_HARD;
    var out = base.slice();
    EXTRA_QUESTION_BANKS.forEach(function (arr) {
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].sessionLevel === level) out.push(arr[i]);
      }
    });
    return out;
  }
""".strip("\n")
    insert = "\n\n" + "\n\n".join(ext_chunks) + "\n\n" + helpers
    marker = "\n\n  function inferProblemType(q, level)"
    if marker not in text:
        raise SystemExit("patch_html: missing inferProblemType marker")
    if "\n\n  const QUESTIONS_MONEY_MEASUREMENT = [" in text:
        s = text.index("\n\n  const QUESTIONS_MONEY_MEASUREMENT = [")
        e = text.index(marker)
        text = text[:s] + text[e:]
    text = text.replace(marker, insert + marker)

    HTML.write_text(text, encoding="utf-8")
    print(
        "Patched",
        HTML,
        "easy",
        len(easy_lines),
        "med",
        len(med_lines),
        "hard",
        len(hard_lines),
        "extended",
        sum(len(v) for v in ext.values()),
    )


if __name__ == "__main__":
    patch_html()
