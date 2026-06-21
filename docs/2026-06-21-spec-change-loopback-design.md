# Spec-Change Loopback — Design

> devloop. Operationalises SDD's "change the spec → regenerate the affected code" (framework
> §5.1) for an *existing* devloop-managed feature, preserving both invariants (spec-review §5.1,
> test↔code independence §11 #3) and keeping `main` green at every merge.

## Leitidee

Tests are the change-propagation layer. A spec change flows: edit `spec.md` → `spec-to-tests`
amends the affected REQ-tagged tests → the now-failing tests select the affected code →
`implement` updates the code to green. No separate spec→code traceability is needed; the
REQ-tag (test) layer is the selector. The pipeline is **identical** to the greenfield chain —
the driver state machine is unchanged; the stations become *amend-aware*.

## Flow

`specify` (load + edit spec) → `spec-to-tests` (amend affected tests) → Spec-PR on
`devloop/spec/<slug>` → spec-review stop → merge → `implement` on `devloop/<slug>` → gates →
critic → merge. Two human gates as before (spec-PR review §5.1; impl-PR merge §9).

## The three REQ cases (spec-to-tests, on the Spec-PR)

- **Added REQ** → new test, `.skip`'d (greenfield behaviour).
- **Changed REQ** → modify the existing test (new assertion) **and re-skip it**. Otherwise the
  still-active test fails against `main`'s old code → red main. Re-skipping keeps `main` green
  until `implement` updates the code.
- **Removed REQ** → remove the test (else the trace gate flags the orphan REQ reference).

`implement` (on the Impl-PR): un-skips the added + changed tests, writes/updates code, removes
dead code for removed REQs. As always it may change `*.test.*` **only** by removing `.skip`.

## verify-unskip becomes PR-type-aware (branch convention)

The seam (`implement` may only un-skip) must hold on the **Impl-PR** but NOT constrain the
**Spec-PR**, where `spec-to-tests` legitimately authors/modifies/removes/re-skips tests.
Distinguish by branch prefix (the driver controls it):

- `devloop/spec/<slug>` → Spec-PR → `verify-unskip` **does not run** (a no-op pass). The
  green-main property is enforced by vitest/trace/mutation; independence by station separation
  (author = spec-to-tests ≠ implement) + the human spec-review.
- `devloop/<slug>` (and anything else) → Impl-PR → `verify-unskip` enforces unskip-only.

Why skip the Spec-PR rather than a permissive "spec mode": a mixed test file (one changed REQ +
several unchanged active tests) defeats an "all-skipped" rule, and vitest already reds an
illegitimately-active changed/new test. `verify-unskip`'s sole job is the implement seam.

## Delta scoping — surgical, deterministic

`reqDelta(oldSpec, newSpec)` → `{added, changed, removed}` REQ-ids (extracts `REQ-<CTX>-<nr>`
plus each criterion's text; compares). `spec-to-tests` touches exactly these REQs, not the whole
feature. Pure + TDD'd; exposed via a `req-delta` CLI the station calls.

## Components

- **Core (TDD):** `reqDelta`; `verify-unskip` branch-type gate (`isSpecBranch`).
- **CLI:** `req-delta`; `verify-unskip` takes the PR head branch.
- **Prompts:** `specify` (amend existing spec), `spec-to-tests` (3 cases + re-skip, scoped by
  reqDelta), `implement` (remove dead code). `loop` skill (Spec-PR on `devloop/spec/<slug>`).
- **Template:** pass `github.event.pull_request.head.ref` to `verify-unskip`.
- **Driver state machine:** unchanged.

## Security argument

- Spec-review (§5.1): the changed spec is human-reviewed on the Spec-PR before any code — same
  gate as greenfield. The reviewer sees the spec delta AND the amended tests together.
- Test↔code independence (§11 #3): tests are authored/amended by `spec-to-tests` on the Spec-PR;
  `implement` may still only un-skip on the Impl-PR (verify-unskip). A changed assertion can
  never originate from `implement`.
- Green main: every merge is green — changed/added tests ride in skipped on the Spec-PR; the
  Impl-PR un-skips them only once the code satisfies them.
