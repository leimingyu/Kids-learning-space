# Bundled fonts

Self-hosted so the app is fully offline / self-contained (no `fonts.googleapis.com`).

| File | Family | Subset | Source |
|---|---|---|---|
| `fredoka-latin.woff2` | Fredoka (variable, wght 300–700) | latin | Google Fonts |
| `nunito-latin.woff2`  | Nunito (variable, wght 200–1000) | latin | Google Fonts |

Both fonts are licensed under the **SIL Open Font License, Version 1.1** — see
`OFL-Fredoka.txt` and `OFL-Nunito.txt`. The OFL permits bundling and
redistribution with the software; the license text must travel with the fonts,
which is why those files live here.

The `@font-face` declarations are in `../styles/fonts.css`. To refresh a font,
re-download the latin woff2 from Google Fonts' css2 API (request the same weight
range) and replace the file — no code change needed.
