# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/androyesfernandez/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/androyesfernandez/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0. `solve.js` exports `run(input)`, which returns csv-reader's exact reading of a case's `{text, header}` — `{columns, rows, errors}` — with every broken-row quirk kept: the dropped BOM, stray CRs dropped outside quotes, quote junk appended after a closing quote, an unterminated quote re-read as a literal character, CRLF and lone CRs inside quotes read as LF, and short rows padded / long rows cut to the first record's width with their errors in the order met. Where csv-reader builds each field a character at a time, this reader scans with `indexOf` jumps and slices fields out of the text whole: a field with no CR in it is a single slice, the next CR's position is cached so CR checks cost nothing amortised, and only the rare quoted segment holding a CR is rebuilt piece by piece. Dependency-free ES module; `main.ts` is the Node 22 driver that answers every case in `/input/cases.json` into `/output/answers.json`.

## Run it

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=ktpzxevq&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
