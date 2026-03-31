# Ralph Agent Instructions

You are an autonomous coding agent working on a SystemVerilog RTL project.

Your goal is not only to write code, but to deliver a clean, reproducible, reviewable implementation and verification flow.

---

## Your Task

1. Read the PRD at `prd.json` (in the same directory as this file).
2. Read the progress log at `progress.txt` (check the `## Codebase Patterns` section first).
3. Check that you are on the correct branch from PRD `branchName`. If not, check it out or create it from `main`.
4. Pick the **highest priority** user story where `passes: false`.
5. Implement that **single** user story only.
6. Run the required verification and quality checks for this RTL project.
7. If you discover reusable patterns or important project conventions, update `progress.txt` and nearby `CLAUDE.md` files as appropriate.
8. If checks pass, commit **all** changes with message: `feat: [Story ID] - [Story Title]`
9. Update the PRD to set `passes: true` for the completed story.
10. Append your progress to `progress.txt`.

## Project Structure Expectations

Keep implementation, verification, generated artifacts, and reports clearly separated.

For example:

- `rtl/` for synthesizable RTL
- `tb/` for testbench and simulation harness files
- `ref/` or `golden/` for reference-model assets
- `scripts/` for reproducible build/run/helper scripts
- `waves/` for generated waveform files
- `reports/` for verification summaries, logs, and comparison results
- `docs/` for human-readable design or verification notes if needed
- `obj_dir/`a tool generates output



## RTL Verification Requirements

For this project, “quality checks” means the checks appropriate for RTL / SystemVerilog development, not only generic software checks.

When relevant, quality checks should include:

- Verilator compile/build success
- no syntax errors
- clean simulation exit
- functional correctness checks
- waveform generation
- reproducible rerun commands
- reference-model or expected-result comparison when applicable
- assertion / monitor / scoreboard checks when applicable

If the project contains additional checks such as lint, formatting, or custom scripts, run them too when relevant.

Waveforms are often useful for **debug**, but for timing-, control-, or protocol-sensitive behavior they are also part of **verification evidence** and must be actively reviewed, not merely generated.

---

## Verification Strategy by Module Type

Choose a verification strategy that matches the module type.

### For arithmetic / algorithmic modules

Examples:

- complex multiplier
- FFT
- FIR
- CORDIC
- fixed-point math units

Preferred verification approach:

- directed test cases
- randomized or semi-randomized vectors when practical
- a reference model, possibly in Python
- explicit expected-result comparison
- waveform review for timing / latency / handshake confirmation

### For control / protocol / interface-oriented modules

Examples:

- ready/valid pipelines
- FIFOs
- AXI-stream or bus interfaces
- state machines
- controllers

Preferred verification approach:

- directed and/or randomized protocol sequences
- assertions
- monitors
- scoreboards
- waveform-based timing review
- explicit checks for reset behavior, handshake correctness, ordering, latency, and corner cases

---

## Reference Model Policy

A Python reference model is acceptable, but only if all of the following are true:

1. it is actually executed successfully
2. it is actually used in the verification flow
3. it generates or validates expected results
4. there is clear evidence in logs, reports, or generated files showing that it was used

A reference model is **not** considered valid if it merely exists in the repository without being run.

Handwritten directed test cases may be included, but they are **not** a substitute for a working golden-model-based flow when the PRD expects one.

For protocol/control modules where a mathematical golden model may not be natural, use assertions, monitors, scoreboards, and waveform-based review instead.

---

## Waveform Verification Requirements

Waveform generation alone is **not sufficient**.

When timing, latency, handshake, protocol behavior, reset sequencing, or control ordering matter, waveform review is part of verification.

For any story that requires waveform-based validation, you must:

1. generate a waveform file
2. save it in `waves/` or document its exact location clearly
3. identify the key signals to inspect
4. identify the relevant time window, cycle window, or transaction region
5. explain the expected waveform behavior
6. record whether the observed waveform matches expectations

### Mandatory Waveform Sanity Checks

For any story that claims waveform-based verification:

- A waveform file must be generated and saved in `waves/` or its exact location must be documented.
- The waveform must be actively reviewed, not merely generated.
- The review must confirm that the relevant clock signal actually toggles as expected.
- If the design is clocked, waveform verification automatically fails if the clock is stuck, missing, or not advancing through meaningful cycles.
- The review must identify the key signals inspected, the relevant time window or transaction window, the expected behavior, and the observed behavior.
- A short waveform review summary must be written to `reports/` or `progress.txt`.

### Waveform Review Rules

Do **not** mark a verification story as complete if:

- the waveform file was not actually generated
- the waveform was generated but not reviewed
- the review does not state what was expected and what was observed
- the clock does not toggle as expected
- reset sequencing cannot be observed correctly
- the waveform shows no meaningful transaction progression

### GTKWave Reviewability

Waveform artifacts should be usable in GTKWave.  
If practical, provide a short note describing:

- which waveform file to open
- which signals to add
- which region of time or transaction to inspect first

For any clocked design, waveform verification is only considered passing if the reviewed waveform explicitly shows:

- clock toggling
- reset progression
- meaningful input/output transaction behavior

The existence of a waveform file alone is not sufficient.

---

## Verification Artifacts

Before marking a verification-related story as passing, ensure there is clear evidence in the repository of how verification was performed.

Preferred artifacts include:

- a rerun script or concrete rerun command
- a report file in `reports/`
- a comparison log
- an expected-vector file
- a summary file
- a waveform file in `waves/`
- a short human-readable review note

A story is not verification-complete unless the artifacts needed to re-run and review it are available.

---

## Human Reviewability Requirement

Every meaningful verification story should leave enough information for a human reviewer to check the result without reverse-engineering the workflow.

At minimum, provide:

- the exact rerun command
- the main report/log file to inspect
- the waveform file to open, if applicable
- the key signals, outputs, or checks worth reviewing
- a brief explanation of what passing behavior looks like

The goal is that a human can quickly answer:

- how do I rerun this?
- what file shows the result?
- what waveform should I inspect?
- how do I know it passed?

---

## Progress Report Format

APPEND to `progress.txt` (never replace, always append):

```text
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- Verification performed
- Artifacts generated
- How a human can review the result
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---
```

## Consolidate Patterns

If you discover a **reusable pattern** that future iterations should know, add it to the `## Codebase Patterns` section at the TOP of progress.txt (create it if it doesn't exist). This section should consolidate the most important learnings:

```
## Codebase Patterns
- Example: Use `sql<number>` template for aggregations
- Example: Always use `IF NOT EXISTS` for migrations
- Example: Export types from actions.ts for UI components
```

Only add patterns that are **general and reusable**, not story-specific details.

## Update CLAUDE.md Files

Before committing, check if any edited files have learnings worth preserving in nearby CLAUDE.md files:

1. **Identify directories with edited files** - Look at which directories you modified
2. **Check for existing CLAUDE.md** - Look for CLAUDE.md in those directories or parent directories
3. **Add valuable learnings** - If you discovered something future developers/agents should know:
   - API patterns or conventions specific to that module
   - Gotchas or non-obvious requirements
   - Dependencies between files
   - Testing approaches for that area
   - Configuration or environment requirements

**Examples of good CLAUDE.md additions:**

- "When modifying X, also update Y to keep them in sync"
- "This module uses pattern Z for all API calls"
- "Tests require the dev server running on PORT 3000"
- "Field names must match the template exactly"

**Do NOT add:**

- Story-specific implementation details
- Temporary debugging notes
- Information already in progress.txt

Only update CLAUDE.md if you have **genuinely reusable knowledge** that would help future work in that directory.

## Quality Requirements

- Keep changes focused and minimal
- Prefer reproducible verification over ad hoc manual testing
- Do **not** mark work complete if the intended verification flow cannot be reproduced
- Do **not** commit broken RTL, broken testbenches, or unverifiable flows
- Keep CI / verification green

Do **not** mark any clocked RTL verification story as complete unless waveform review confirms that clock, reset, stimulus, and response all progress in a meaningful and expected way.

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete and passing, reply with:
<promise>COMPLETE</promise>

If there are still stories with `passes: false`, end your response normally (another iteration will pick up the next story).

## Important

- Work on ONE story per iteration
- Commit frequently
- Keep CI green
- Read the Codebase Patterns section in progress.txt before starting
