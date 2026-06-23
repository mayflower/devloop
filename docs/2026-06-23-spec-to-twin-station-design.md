# spec-to-twin Station — Design

> devloop. Adds an **optional** sibling to `spec-to-tests` that produces a *digital twin* — a
> spec-independent behavioural oracle (framework Säule 4). Where `spec-to-tests` proves *fidelity
> to the spec*, the twin proves *agreement of two independent derivations of the behaviour*.
> Closes the gap the chain itself admits: the loop verifies fidelity-to-spec, not whether the
> spec is right. Preserves both invariants (spec-review §5.1, test↔code independence §11 #3).

## Leitidee

`spec-to-tests` writes hand-picked, REQ-tagged example tests whose *expected values are authored*
from one reading of the spec. A buggy spec, or a misread, is encoded identically by the test
author and the implementer — different agents, **same root**. The twin removes that shared root:
a deliberately-trivial **reference model** computes the expected behaviour independently, and a
**model-based** harness (fast-check `commands` + `modelRun`) runs thousands of generated command
sequences against model *and* real system, comparing observable outcomes after each step. The
expected value is *computed, not written*; the input space is *generated, not enumerated*.

Same principle as the existing `spec-to-tests`↔`implement` split (independence / separation of
powers) — **one level up**: not "who authors the tests" but "where the notion of correct comes
from."

> **Generalisable is the mechanism, never the oracle.** A model that fits every project is a
> generic spec — i.e. no independent oracle. The reference model, invariants and adapter stay
> project-local and in the protected set; only the runner is reusable (→ `@devloop/twin`, later,
> by rule-of-three — not extracted from a single use).

## Where it sits

Sibling of `spec-to-tests`, on the **Spec-PR**, before any code. Isolated subagent, fresh
context. Critically, it runs **independent of `spec-to-tests`**: it sees the reviewed `spec.md`
(and the contract), **not** the generated tests — otherwise it anchors on that station's reading
and the decorrelation shrinks.

`specify` → { `spec-to-tests` ∥ `spec-to-twin` (if enabled) } → Spec-PR on `devloop/spec/<slug>`
→ **spec-review stop (human adjudicates intent here)** → merge → `implement` on `devloop/<slug>`
→ gates (incl. `twin`) → `critic` → **impl-merge stop** → merge.

Two human gates, unchanged. **The driver state machine (`src/core/loop.ts`) is unchanged** —
`spec-to-twin` is one more station the driver spawns *conditionally*; `nextLoopDecision` does not
change. (Same minimal-impact stance as the spec-change-loopback design.)

## What it produces

All under a protected twin path (e.g. `<area>/twin/`, added to `CODEOWNERS`), all `.skip`'d in
the Spec-PR — the real system does not exist yet, so the twin cannot run until `implement`:

1. **Reference model** — the deliberately-trivial, eyeball-correct re-derivation of the domain
   behaviour (the oracle). Trusted *because* trivial, not because verified.
2. **Invariants** — domain truths as properties (e.g. "sum identity", "never negative",
   "append-only"), each **REQ-tagged** for the trace-gate.
3. **Adapter** — `setup` / `reset` / `execute` against the **specified** interface/contract. If
   `implement` deviates from the contract, the adapter fails to wire → a divergence signal.
4. **Harness wiring** — fast-check `commands` + `modelRun`, generating args **including boundary
   values** (≤0, non-integer, …) so rejection-parity is checked too.

`implement` may **only remove `.skip`** — never alter the model, invariants or assertions. This
is the same `verify-unskip` seam as `spec-to-tests`: the producer cannot reach the oracle.

## The distinguishing mandate (vs. spec-to-tests)

`spec-to-tests`: *"map exactly the REQ-IDs, invent nothing."*
`spec-to-twin`: the **opposite** — *"derive model + invariants from the **domain truths**, **not**
by transcribing the EARS criteria"* (anti-re-anchor). Still cross-reference REQ-IDs on the
invariants for the trace-gate, but the derivation must be independent. This reversed instruction
is exactly why it is a **separate station** and not a flag on `spec-to-tests`: one mandate is
"reproduce the spec faithfully," the other is "re-derive correctness independently." Merging them
muddies both.

## EARS routing — the twin as a new gate-sort

Extends the `spec-to-tests` routing table:

| EARS type | Gate sort |
|---|---|
| When / If / While / Where | Vitest (+ fast-check for invariants) |
| **Invariant / property over op-sequences** | **twin: reference-model `modelRun`** |
| Performance | bench / load |
| Architektur | ArchUnitTS |
| Contract | AsyncAPI / PACT |

A criterion like REQ-SPD-11 ("over any sequence of valid ops, the balance is never negative and
equals the signed sum") routes to the twin, not to a single example test.

## Optionality — core stays schlank

The loop spawns `spec-to-twin` **only if the target repo opts in** — a flag in its `.devloop/`
config (e.g. `twin: { enabled: true, area: "services/wallet-service" }`). Default off: repos that
don't want it see no new station, no new gate, no extra agent. The `twin` CI job is required
**only when enabled**. This honours the "twin as a *pluggable* capability, core stays schlank"
decision.

## Gate & protected set

- New CI job `twin` (when enabled), threshold **zero divergence** (any divergence = red), scope
  grows with the domain — same discipline as the mutation ratchet ("a cage is maintained, not
  finished").
- Oracle path under `CODEOWNERS` as its **own** entry, so a feature-PR touching the oracle is a
  *visible alarm* ("agent changes a gate instead of code"), not a buried diff line. The
  drift-watcher (`check-codeowners`) keeps this fail-closed, as it already does for tier paths.
- Twin tests carry REQ-tags (trace-gate, like every other test).

## Amend-mode (spec change)

Mirrors `spec-to-tests`: on a spec change, take the deterministic delta
(`dist/cli/req-delta.js <old> <new>` → {added, changed, removed}) and touch **only** affected
invariants. Because invariants are REQ-tagged, the same selector works: *added* → new invariant,
`.skip`'d; *changed* → amend the same-REQ invariant and re-`.skip`; *removed* → delete (else an
orphan REQ-ref reddens the trace-gate). Runs on the Spec-PR, where authoring/re-skip is allowed.

## The generic seam (build toward it, don't extract yet)

Author Obol v1 (and this station's output) with a clean seam so later extraction to
`@devloop/twin` is mechanical:

- `Model` — state + named commands (`precondition` / `apply → expectedOutcome` / `genArgs`).
- `System` adapter — `setup` / `reset` / `execute → actualOutcome` / `teardown`.
- `Oracle` — `compare(expected, actual)` with a project matcher (this is also the **brownfield
  equivalence relation**: the normalisation of timestamps/ids/ordering).
- `Runner` — wires fast-check + Testcontainers, shrinks, reports, emits the gate result.

The same runner carries the **brownfield** twin: there a *recording source* replaces `Model` as
the oracle; `System` / `Oracle` / `Runner` are unchanged. (Brownfield record/replay itself stays
out of devloop — target-repo work — per the brownfield-scope decision; only the runner is shared.)

## Open / to decide during build

- [ ] Exact `.devloop` config shape for `twin` (flag + area + optional matcher overrides).
- [ ] Default matcher (deep-equal on normalised observables) vs. required per-project matcher.
- [ ] Does the adapter live in the protected twin path (oracle-side) or beside the service
      (implement-side)? Leaning oracle-side, authored against the contract.
- [ ] First real consumer is Obol (Phase 1 spec). Second consumer (rule-of-three trigger for
      `@devloop/twin` extraction): a brettspielfreunde service or the brownfield bsk repo.
```

