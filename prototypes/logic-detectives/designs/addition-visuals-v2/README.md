# Addition visualization concepts

Design exploration only; these pictures do not change the playable game.

All three use the same table and unanswered sum: blue 6 at the left, pink 4
at the top, and a purple question mark where their paths meet. No missing
number is supplied. The repeated values elsewhere are ordinary printed clues.

- **Cross and add:** straight horizontal and vertical paths. Small arrows sit
  between cells so the numbers stay readable. Minimal default play screen.
- **Numbers travel and join:** a storyboard of three animation states. In the
  actual interface the child sees just one movement at a time: the blue starting
  number arrives, the pink adding number joins, then the child enters the sum.
- **Two groups join:** optional concrete view using counters for the two already
  printed numbers. The groups stay distinct and the result remains unanswered.
  A missing header must remain unknown; never render its hidden number of dots.

Blue means starting number, pink means adding number, purple means sum.
Text, position and arrow direction also carry the meaning.

Recommendation: **Cross and add** during ordinary play, with the travel
animation available for onboarding. Offer counters only when a child asks.

PNG pictures are generated deterministically with the Windows drawing API by
`draw-concepts.ps1`; no AI-generated arithmetic or runtime dependencies.
