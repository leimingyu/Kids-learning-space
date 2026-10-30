# Grade 2–5 Word Problem Adventure

## Outcome and acceptance gates

Create 400 original English word problems: exactly 100 for each of grades 2,
3, 4, and 5. Each grade has 20 five-question quests, grouped into ten sequential
kingdoms with ten stories each. The grade path is the
default experience; earlier adventures and saved data remain accessible.

1. **Curriculum and writing.** Use RSM's public emphasis on relationships,
   patterns, unknowns, and reasoning, with age-appropriate arithmetic.
   Write original stories, hints, and worked reasoning. Gate: 100 unique
   stories per grade; review every story for a single unambiguous answer,
   natural grammar, spelling, familiar vocabulary, and grade fit.
2. **Content validation.** Keep authored source alongside generated offline
   JavaScript. Gate: stable unique IDs, exact counts, independent arithmetic
   checks, complete hints and explanations, grade-specific coverage, no
   duplicated stories, and no runtime network requirement.
3. **Child-friendly play.** Grade chooser, short quests, one story at a time,
   visible answer units, gentle retries, hints, worked solutions, a two-second
   celebration before automatic Next, Stay & read, and Home. Gate: keyboard
   and narrow-screen browser walkthroughs.
   Next quest continues unfinished stories; large reward status and ten level
   progress bars make the next kingdom and earned progress visible.
4. **Motivation.** Record unique independently solved stories and award
   persistent grade-specific milestone badges at 5, 10, 25, 50, 75, and 100.
   Gate: repeats, revealed answers, and helped attempts cannot inflate
   mastery or rewards; practice can earn a first independent solve.
5. **Persistence and remediation.** Use additive fields in the existing
   registered main and wrongs stores, profile gating, exact-question practice,
   resume, and full-game reset. Gate: new profiles start empty, other profiles
   remain unchanged, legacy data survives, backup/export/import round-trips.
6. **Release record.** Document shipped features, curriculum scope, commands,
   verification evidence, and practical limitations. Gate: audit every
   requirement above against source, tests, and rendered gameplay.

## Grade progression

| Grade | Arithmetic and reading boundaries | Reasoning |
|---|---|---|
| 2 | Short concrete sentences; addition/subtraction mostly within 100; small equal groups; halves; simple clocks and lengths | Missing parts, inverse comparisons, patterns, order, balancing, two-step stories |
| 3 | Whole-number operations, equal groups, simple unit fractions, time, perimeter, and area | Work backward, compare groups, interpret remainders, organize possibilities |
| 4 | Larger whole numbers, factors, fractions with related denominators, measurement | Multi-step plans, sum/difference, constraints, divisibility, systematic counting |
| 5 | Fractions, decimals, volume, unit conversions, and whole-number relationships | Reverse operations, fraction relationships, rates in simple contexts, spatial reasoning, logical constraints |

Grade placement is an authored enrichment sequence, not a claim of RSM
certification or a complete school syllabus. Challenge comes from reasoning,
not needlessly difficult reading. Terms such as perimeter and volume are
defined in the story or its hint.

## Primary curriculum references (consulted 2026-09-29)

- https://www.mathschool.com/canada-fall-enrollment — grade 2/3 entry courses:
  strategic calculation, multi-step stories, logic, equations, and fractions.
- https://www.mathschool.com/spring-enrollment-ca-north-tri-valley — grade 3:
  operation structure, factors/multiples, fractions, quantitative relationships.
- https://www.mathschool.com/summer-enrollment-il — elementary reasoning,
  connections, mental calculation, operations, and fractions.

## Implementation status

All six implementation steps are complete. Content, game behavior, storage,
rewards, and the feature record passed their acceptance checks. See
[GRADE_ADVENTURE_RELEASE.md](GRADE_ADVENTURE_RELEASE.md) for the requirement-by-
requirement completion audit, commands, browser evidence, and test limitations.
