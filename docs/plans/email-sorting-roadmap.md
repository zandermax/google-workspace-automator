# Email sorting roadmap

## Status

- Project is already running as a Google Apps Script Gmail automation system.
- It currently performs automatic filtering and bulk actions for Gmail/Drive tasks.
- The system is a good base for a new daily inbox-sorting workflow.
- The repo needs a tooling refresh before we build out the more advanced categorization flow.

## Phase 1 tracker

- Step 1: complete — created repo plan and review checkpoints
- Step 2: complete — baseline health audit finished and concrete compile issues captured
- Step 3: in progress — toolchain modernization is underway, but the repo is still failing compile checks and needs a compatibility fix
- Step 4: pending — audit Gmail query execution safety
- Step 5: pending — define the safe sorter architecture

## Current understanding

This project currently:

- Searches Gmail with a custom query builder.
- Runs scheduled Apps Script triggers.
- Labels or moves threads after processing.
- Uses Gmail labels as a processing state marker.
- Has existing automation patterns for cleanup and recycling tasks.

The relevant project areas are:

- [README.md](../README.md)
- [package.json](../package.json)
- [src/_t/triggerFactory.ts](../src/_t/triggerFactory.ts)
- [src/Gmail/GmailQuery/index.ts](../src/Gmail/GmailQuery/index.ts)
- [src/Gmail/actions/labelAsProcessed.ts](../src/Gmail/actions/labelAsProcessed.ts)
- [src/_s/Gmail/recycle.ts](../src/_s/Gmail/recycle.ts)

## Goal

Build a daily email sorter that processes around 100 emails per day, classifies them into useful buckets, and routes them into Gmail labels or archive actions using a safe, reviewable automation flow.

## Decisions captured from the current conversation

### Sorting behavior

The desired behavior is:

- Move mail to labels/folders and archive appropriate threads.
- Avoid noisy or destructive actions unless intentionally configured.
- Keep the system safe and reviewable.

### Volume and timing

We will target:

- 100 emails per day
- Scheduled daily processing
- Priority on newly arrived or unhandled inbox mail

### Runtime approach

The preferred approach is:

- Keep Google Apps Script as the runtime foundation.
- Add a helper or agent layer where needed for categorization or orchestration.
- Prefer a lower-cost, low-maintenance configuration rather than a heavy SaaS dependency.
- Keep the system open to an LLM-assisted classification step only if it remains cheap and safe.

## Architectural direction

### Phase 1: stabilize and refresh

Before adding new rules, we should:

- update TypeScript and tooling versions
- modernize the script build and lint setup
- verify the current trigger and Apps Script deployment flow
- clean up outdated patterns and import aliases
- confirm the current Gmail search/paging logic is sound

### Phase 2: define the sorter model

We should separate the system into these layers:

1. Fetch layer
   - Gather a bounded set of new or unprocessed threads.
   - Cap the run by count and time.

2. Rule engine
   - Evaluate each email against a configurable set of rules.
   - Support sender, subject, domain, thread metadata, and label-based matching.

3. Classification layer
   - Assign a category such as personal, finance, alerts, receipts, newsletters, or archive.
   - Allow manual overrides and rule priority.

4. Action executor
   - Apply label(s), move mail, archive, or leave alone.
   - Prevent reprocessing of already handled mail.

5. Logging and review
   - Count per category
   - Summarize runs
   - Record decisions for debugging and human review

### Phase 3: production safety

We should add:

- dry-run mode
- quarantine mode for uncertain decisions
- reprocessing safeguards
- daily summary reports
- explicit limits for total actions per run

## Important technical note

A risk area in the current codebase is the query execution pattern in [src/common/Query/index.ts](../src/common/Query/index.ts). Before expanding the sorting rules, we should audit the paging and query reuse logic to ensure it does not skip, repeat, or reprocess threads unexpectedly.

## Proposed implementation order

1. Refresh the project tooling and build configuration.
2. Audit current Gmail query execution and trigger behavior.
3. Define the standard sorter categories and action rules.
4. Implement the configurable rule engine.
5. Add the bulk action executor.
6. Add logging, summaries, and safety checks.
7. Run the system in dry-run mode for a short period.
8. Move to live daily processing once behavior is trusted.

## Non-goals for the first milestone

- building a full user-facing UI
- creating a broad SaaS product
- adding heavy AI orchestration before the core rules are stable
- over-engineering the system before the first live daily sort is working

## Working rules for this repo

- One active work item at a time.
- No parallel edits on the same subsystem.
- Prefer small, reviewable changes.
- Keep the system operational while adding new sorting behavior.
- Capture decisions and progress in this plan so future agents can re-enter quickly.

## Open questions to resolve next

These are the remaining items we should answer before locking the implementation:

1. Which labels should the sorter use, and what should each label mean?
2. Should any categories be moved to archive immediately, or should some remain in the inbox?
3. Do we want monthly or topic-based custom rules, or only a simple daily routing flow at first?
4. Should the system be fully self-contained in Apps Script, or do we want a small helper process for enrichment or review?
5. How much manual review is acceptable before we trust the automation in production?

## Next action

The first concrete task is to refresh the project tooling and confirm the current Apps Script runtime is still healthy before introducing the new email sorter behavior.
