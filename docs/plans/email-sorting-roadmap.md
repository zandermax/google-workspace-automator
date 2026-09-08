# AI Email Sorter Implementation Plan

## Plan Metadata

- Status: ready
- Mode: interactive
- Canonical location: docs/plans/email-sorting-roadmap.md
- Last updated: 2026-09-08
- Goal: Implement a daily, self-contained Google Apps Script email triage pipeline using Gemini Flash (via Google AI Studio free tier) that classifies up to 50 emails/day, routes them to structured triage labels or 7-day auto-recycle, and emails a rich daily digest with clickable attachment previews and unsubscribe actions to the account owner.
- Success criteria:
  - Bounded cascade selection fills daily slots: new unread inbox first, then random old inbox, then random archived, capped at `DAILY_LIMIT = 50`.
  - Email extraction pulls clean snippets (<=300 chars), attachment metadata/icons, and unsubscribe headers (`List-Unsubscribe`, `List-Unsubscribe-Post`) without leaking full message bodies or exceeding token limits.
  - Gemini Flash client batches all extracted snippets in a single structured JSON prompt and reliably validates response schemas against predefined triage categories (`triage/personal`, `triage/finance`, `triage/govt`, `triage/receipts`, `triage/newsletters`, `triage/alerts`, `triage/junk`).
  - Action executor applies triage labels and 7-day auto-recycle rules (`Auto-Recycle/7d`) according to time-sensitivity/staleness rules, marks processed threads with `🪄✨ Magic ✨🪄/🧠`, and strictly enforces `DAILY_LIMIT` action caps.
  - Quota and daily digest email delivers storage metrics, categorized breakdown, highlight bullets, clickable attachment links, and actionable unsubscribe links to the user.
  - Safe dry-run mode (`DRY_RUN = true`) and idempotent daily morning trigger (06:00) allow trusted validation before live mutations occur.
  - All unit and mock integration tests pass under `npm test`, and `npm run build` compiles cleanly for clasp deployment.
- Constraints and assumptions:
  - Runtime is 100% Google Apps Script; no external server, database, or paid SaaS services.
  - Gemini API key is securely managed via Apps Script Script Properties (`GEMINI_API_KEY`) and accessed via `UrlFetchApp`.
  - Manifest (`appsscript.json`) permissions are updated to include `https://www.googleapis.com/auth/script.external_request` for `UrlFetchApp`.
  - Existing `Auto-Recycle/*` and `🪄✨ Magic ✨🪄` infrastructure in `src/_s/Gmail/recycle.ts` and `src/Gmail/actions/labelAsProcessed.ts` are reused.
  - Never perform destructive actions directly; permanent cleanup is deferred to the existing 7-day recycle queue so items can be rescued manually.
  - Git actions are strictly limited to read-only inspection (`status`, `diff`, `log`, etc.); the executing agent never stages, commits, branches, or pushes.

## Current State

- Current phase: not started
- Current step: not started
- Next action: Elaborate Phase 1 steps upon user confirmation to begin.
- Blockers: none

## Decisions

- 2026-09-08: Selected Full Gemini Flash AI Pipeline via Google AI Studio API (free tier, 1500 req/day) as the classification engine.
- 2026-09-08: Execution mode is interactive, with checkpoints pausing for user review and viable commit message suggestions.
- 2026-09-08: Canonical plan is maintained in-place at `docs/plans/email-sorting-roadmap.md`.
- 2026-09-08: Baseline prerequisites confirmed complete: toolchain modernization (TypeScript 5.9, ESLint 9, Babel, Node test runner) and mutation-safe pagination/query audit (`2026-09-03-automation-safety-refresh.md`).
- 2026-09-08: Daily limit set to 50 threads per run with greedy priority cascade (unread inbox -> old inbox sample -> archived sample).
- 2026-09-08: Single batch prompt per daily run to minimize token consumption and API overhead.

## Deferred Items

- POST-only one-click unsubscribe via Apps Script Web App HMAC endpoint is deferred to a future enhancement; direct HTTPS and `mailto:` links will be supported in v1.
- Full paperwork OCR / Google Drive filing pipeline is deferred to a separate integration plan.
- Custom domain/sender whitelist bypass rules (pre-LLM short-circuit) deferred until baseline Gemini Flash classification accuracy is measured in dry-run mode.

## Phase 1: Triage Contracts and Message Extraction Layer

### Tangible output

TypeScript type definitions for triage categories, prompt schemas, and action directives, paired with a robust message extractor that pulls sanitized snippets, attachment indicators, and unsubscribe headers with unit test coverage.

### Completion criteria

- Strict type definitions for 7 triage categories (`personal`, `finance`, `govt`, `receipts`, `newsletters`, `alerts`, `junk`), prompt input/output payloads, and thread triage actions.
- Extraction helper parses sender name/domain, subject, 300-char truncated body snippet, attachment counts/types (document, photo, calendar, media, generic), thread date/age, size in KB, and `List-Unsubscribe` / `List-Unsubscribe-Post` headers.
- Safe fallback behavior for malformed or empty message bodies.
- Unit tests verify extraction correctness against diverse email message fixtures without requiring live Gmail services.
- `SOURCE_SCRIPTS` in `src/Gmail/actions/labelAsProcessed.ts` includes `Gmail-AI-Sorter` with emoji marker `🧠`.

### Dependencies and risks

- Depends on existing Apps Script types (`gas-types-detailed`) and message helper utilities.
- Risk: Message body extraction could exceed execution time or memory if large HTML bodies are parsed inefficiently.
- Mitigation: Truncate body reads, strip HTML tags cleanly, and limit attachment inspection to metadata.

### Steps

_Not yet elaborated. Populate immediately before this phase starts._

### Validation

- Unit tests in `tests/triage-extraction.test.ts` covering snippet extraction, attachment icon mapping, and unsubscribe header parsing.
- Run `npm test` and `npm run build`.

### Checkpoint

_Interactive mode only, and only when code changed this phase and is at a viable, self-contained point:_

Suggested commit message:

```text
feat(triage): add triage contracts and email extraction layer
```

## Phase 2: Gemini Flash Client and Structured Classification

### Tangible output

A lightweight `GeminiClient` utilizing `UrlFetchApp` to query Google AI Studio's Gemini Flash model with strict JSON schema constraints, fail-safe response validation, and comprehensive mock tests.

### Completion criteria

- `GeminiClient` reads API key from `PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')` with explicit configuration error if missing.
- Structured system prompt enforces strict JSON array response adhering to `TriageClassification` schema (`id`, `category`, `timeSensitive`, `actionRequired`, `summary`, `highlights`, `keyDetail`).
- Validation layer checks raw model response for JSON validity and schema conformance; throws descriptive error on malformed response to prevent partial/corrupt actions.
- Transport abstraction permits injecting a mocked fetch handler for automated local testing.
- Unit and contract tests verify successful parsing, retry/timeout handling, and error abortion on malformed payloads.

### Dependencies and risks

- Depends on Phase 1 contracts.
- Risk: Gemini Flash API changes, rate limits, or occasional malformed JSON output.
- Mitigation: Enforce `response_mime_type: "application/json"` in Gemini generationConfig, and abort the run cleanly if output validation fails.

### Steps

_Not yet elaborated. Populate immediately before this phase starts._

### Validation

- Unit tests in `tests/gemini-client.test.ts` with recorded fixture responses and malformed error scenarios.
- Run `npm test` and `npm run build`.

### Checkpoint

_Interactive mode only, and only when code changed this phase and is at a viable, self-contained point:_

Suggested commit message:

```text
feat(gemini): implement Gemini Flash client with structured schema validation
```

## Phase 3: Fetch Cascade Selection and Action Execution Engine

### Tangible output

A selection cascade that pulls up to `DAILY_LIMIT = 50` threads across unread inbox, sampled old inbox, and sampled archive, coupled with an action executor applying triage labels, 7-day recycle tags, and magic markers with full dry-run support.

### Completion criteria

- Stateless cascade queries:
  1. `in:inbox is:unread -label:"🪄✨ Magic ✨🪄"` (greedy take up to 50)
  2. `in:inbox -label:"🪄✨ Magic ✨🪄"` (random sample if slots remain)
  3. `in:anywhere -in:inbox -in:trash -in:spam -label:"🪄✨ Magic ✨🪄"` (random sample if slots remain)
- Action executor rules:
  - Stale time-sensitive emails: apply `Auto-Recycle/7d` only (skip triage label).
  - Newsletters, alerts, junk (non-stale): apply category triage label + `Auto-Recycle/7d`.
  - Retain categories (personal, finance, govt, receipts): apply category triage label only.
  - Processed marker: apply `labelProcessed('Gmail-AI-Sorter', threads)`.
  - Never directly delete or archive threads; let the existing recycle workflow handle deferred trashing.
- `dryRun` flag skips label mutations and returns simulated actions for auditing.
- Action limit guard strictly caps mutations to `DAILY_LIMIT`.
- Unit tests verify cascade priority, random sampling, and action rule evaluation.

### Dependencies and risks

- Depends on Phase 1 extraction and Phase 2 classification.
- Risk: Gmail label creation or batch label application quotas.
- Mitigation: Cache label lookups in memory and batch label operations where supported.

### Steps

_Not yet elaborated. Populate immediately before this phase starts._

### Validation

- Unit tests in `tests/sorter-cascade-executor.test.ts` verifying cascade priority, slot allocation, and action dispatch.
- Run `npm test` and `npm run build`.

### Checkpoint

_Interactive mode only, and only when code changed this phase and is at a viable, self-contained point:_

Suggested commit message:

```text
feat(sorter): add fetch cascade and triage action execution engine
```

## Phase 4: Storage Reporting and Daily Digest Composition

### Tangible output

A digest composer and quota reporter that compiles run statistics, storage metrics, triage breakdown, attachment previews, and unsubscribe links into a clear plain-text/UTF-8 email delivered to the user.

### Completion criteria

- Storage reporter queries Google Workspace quota usage (Gmail used/total quota, Drive storage) and estimates MB queued for recycle.
- Formats structured email body:
  - Header with run counts, action needed tally, recycle tally, and storage metrics.
  - High inbox volume overflow warning banner if unread inbox count >= `DAILY_LIMIT`.
  - Action Required section at top for rapid human triage.
  - Categorized sections with direct Gmail label links and bulleted highlights.
  - Clickable attachment icons (📷, 📄, 📅, 🎵, 🎬, 📎) and unsubscribe links (`⛓️‍💥 Unsubscribe` or `⛓️‍💥 Unsubscribe ✉️`).
  - 7-day recycling warning section listing items queued for automatic trashing.
- `sendDigest` delivers email to `Session.getActiveUser().getEmail()` with clear `[DRY RUN]` prefix in subject and body when simulation mode is active.
- Unit tests verify formatting across empty, partial, and overflow run states.

### Dependencies and risks

- Depends on Phase 3 action summary outputs.
- Risk: Email delivery formatting breaks in mobile Gmail clients or overflows character limits.
- Mitigation: Keep plain-text formatting clean, test link rendering, and bound maximum digest length.

### Steps

_Not yet elaborated. Populate immediately before this phase starts._

### Validation

- Unit tests in `tests/digest-composer.test.ts` checking markdown/text rendering and link generation.
- Run `npm test` and `npm run build`.

### Checkpoint

_Interactive mode only, and only when code changed this phase and is at a viable, self-contained point:_

Suggested commit message:

```text
feat(digest): implement storage stats and daily triage digest composer
```

## Phase 5: Apps Script Wiring, Trigger Setup, and End-to-End Dry Run

### Tangible output

Top-level entry points (`aiSorter`, `dryRunAiSorter`), scheduled daily trigger configuration in `triggerFactory`, manifest permissions update, and documented operational verification procedure.

### Completion criteria

- Top-level entry points in `src/_s/Gmail/aiSorter.ts` coordinating fetch -> extract -> classify -> execute -> digest.
- `appsscript.json` manifest includes `https://www.googleapis.com/auth/script.external_request` for `UrlFetchApp` and `https://www.googleapis.com/auth/script.send_mail` if needed.
- `triggerFactory.ts` provides idempotent `aiSorterTrigger` (daily early morning, e.g. 06:00).
- `dryRunAiSorter` runs safely end-to-end against real/seed mailbox data without mutations and delivers digest.
- Full build passes: `npm run clean-build && npm run build` and all test suites pass.
- Runbook checklist in `README.md` or `runbooks/` updated for setting `GEMINI_API_KEY` via clasp or Apps Script project settings.

### Dependencies and risks

- Depends on Phases 1 through 4.
- Risk: Apps Script execution timeout (6-minute maximum for consumer accounts).
- Mitigation: With `DAILY_LIMIT = 50`, single batch Gemini call, and bounded snippet extraction, total execution time remains well under 2 minutes.

### Steps

_Not yet elaborated. Populate immediately before this phase starts._

### Validation

- Run `npm test` across all unit/integration suites.
- Run `npm run build` and inspect `dist/` output and `dist/appsscript.json`.
- Execute dry run in Apps Script environment or with seed test emails.

### Checkpoint

_Interactive mode only, and only when code changed this phase and is at a viable, self-contained point:_

Suggested commit message:

```text
feat(entrypoint): wire aiSorter entry points, trigger, and manifest permissions
```

## Progress Log

- 2026-09-03: Completed baseline automation safety refresh (`2026-09-03-automation-safety-refresh.md`): fixed pagination mutation bugs, calendar parsing, idempotent triggers, and manifest permissions.
- 2026-09-08: Confirmed build and test health: 59 passing tests, clean TypeScript compilation, and Babel output.
- 2026-09-08: Restructured `docs/plans/email-sorting-roadmap.md` into canonical executable plan with 5 domain-based phases targeting the Full Gemini Flash AI Pipeline.
