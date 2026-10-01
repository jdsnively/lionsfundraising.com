# Payout golden-file suite

Property: **lionsfundraising.com**. Nothing here is deployed. The workflow
publishes `./public_html/` only, so this folder ships to GitHub and stops there.

## Why it exists

ADR-005 is the payout authority and requires that no change to the formula ship
without a golden-file regression suite. The formula currently exists in four
copies across `public_html/payouts/index.html` and
`public_html/treasurer/index.html`, and ADR-005 records five open findings
against it, at least one of which underpays real volunteers.

## What it does that a copy of the formula would not

`extract.mjs` reads the shipped pages and pulls the formula out of them at run
time. It never holds a copy. A copy would keep passing while the pages drifted,
which is the failure mode ADR-005 finding M-4 describes.

Every lookup refuses unless it matches exactly once, and every extracted
function is compiled before it is used. A partial match aborts the run rather
than producing a plausible wrong answer.

## Running it

    node _tools/payout/run.mjs report   print every case, change nothing
    node _tools/payout/run.mjs pin      rewrite golden/ from current behavior
    node _tools/payout/run.mjs check    behavior against the goldens, exit 1 on drift
    node _tools/payout/run.mjs pages    the payouts copy against the treasurer copy
    node _tools/payout/run.mjs adr      behavior against ADR-005, exit 1 on divergence

`check` and `adr` answer different questions and are separate on purpose.

- `check` asks whether the formula still does what it did. It is the regression
  gate.
- `adr` asks whether the formula does what ADR-005 says it should. It is the
  specification gate. It was red from 2026-09-02 until the shirt split was
  corrected on 2026-09-16, and it has been green and a CI gate since.

Do not run `pin` to make `check` pass. `pin` records a deliberate, reviewed
change in behavior. If `check` goes red and you did not intend to change the
formula, the change is the bug.

## The check-received chain

    node _tools/payout/checks.mjs       the Sodexo check code on both pages

Same discipline: the functions are sliced out of both shipped pages, including
the `CHECKS_FROM` date, and the last assertion requires the two copies to be
byte identical. Each event stands alone (M-31, 2026-09-27), so the headline case
replays the real 2026-05-22 remittance on this season's dates and requires both
halves: the two events it paid in full read paid, and the club still reads
$1,417.13 short.

What none of this can see is permission. The Firestore rules decide whether the
treasurer may save at all, and `_tools/rules/rules-test.mjs` tests that, signed
in as her, in the emulator (M-30).

## The cases

`cases.mjs` holds constructed inputs. None of it is club data or roster data.
Worker names are placeholders picked so that `lookupWorker`'s substring matching
cannot cross-match one worker onto another.

`ADR005_EXPECTATIONS` states what ADR-005 requires, quoted from its worked
example table. It is the specification, not a pin of behavior.
