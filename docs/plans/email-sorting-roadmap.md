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

- Current phase: Phase 4: Storage Reporting and Daily Digest Composition (Completed)
- Current step: Phase 4 Checkpoint - commit boundary
- Next action: User inspects uncommitted changes, commits Phase 4 work, and confirms to start Phase 5.
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

- [x] **P1-S1 - Define TypeScript types and schemas.** Create `src/types/Gmail/triage.ts` with strict types: `TriageCategory` (`triage/personal`, `triage/finance`, `triage/govt`, `triage/receipts`, `triage/newsletters`, `triage/alerts`, `triage/junk`), `AttachmentType` (`photo`, `doc`, `calendar`, `audio`, `video`, `generic`), `ExtractedEmailMetadata`, `TriageClassification` (Gemini output schema), and `TriageActionDirective`.
- [x] **P1-S2 - Register AI sorter source script.** In `src/Gmail/actions/labelAsProcessed.ts`, add `'Gmail-AI-Sorter'` to `SOURCE_SCRIPTS` with the `🧠` emoji marker in `scriptEmoji`.
- [x] **P1-S3 - Implement message extraction module.** Create `src/Gmail/extraction.ts` with pure helpers and Apps Script message adapters:
  - Text sanitizer stripping HTML tags, extra whitespace, and truncating to <=300 characters.
  - Attachment classifier mapping MIME types to `AttachmentType` and emoji icons (`📷`, `📄`, `📅`, `🎵`, `🎬`, `📎`).
  - Unsubscribe header parser extracting direct HTTPS URLs and `mailto:` links from message headers.
  - Overall thread extractor producing `ExtractedEmailMetadata` with safe fallbacks for missing/empty fields.
- [x] **P1-S4 - Write comprehensive extraction unit tests.** Create `tests/triage-extraction.test.ts` testing snippet truncation, HTML stripping, attachment categorization, edge cases (no subject, empty body, unknown attachment MIME), and unsubscribe header parsing (`<https://...>`, `<mailto:...>`).
- [x] **P1-S5 - Validate Phase 1.** Run `npm test` and `npm run build` to confirm zero regressions and clean TypeScript/Babel compilation.

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

- [x] **P2-S1 - Implement GeminiClient with transport abstraction.** Create `src/Gmail/GeminiClient.ts` with an injectable transport interface (`fetch: (url: string, options: any) => { getResponseCode(): number; getContentText(): string }`), default fallback to `UrlFetchApp`, API key retrieval from `PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')` (or explicit options), and model selection defaulting to `gemini-3.8-flash` (overridable via `GEMINI_MODEL` script property or options).
- [x] **P2-S2 - Build system instructions and structured prompt generator.** Implement prompt builders that encode the triage category contracts, few-shot/guidance rules (stale time-sensitivity, highlights extraction), and format `GeminiClassificationInput[]` into `contents` with `generationConfig: { response_mime_type: "application/json" }`.
- [x] **P2-S3 - Implement response validation.** Add `validateClassificationResponse` to parse the JSON string, verify that it is an array matching the input IDs, and check that each entry contains valid `TriageCategory`, boolean flags, and string fields, throwing explicit descriptive errors on malformed payloads.
- [x] **P2-S4 - Write comprehensive test suite.** Create `tests/gemini-client.test.ts` testing happy path classification, missing API key errors, HTTP error codes, malformed JSON, schema property validation, and unrecognized category rejection.
- [x] **P2-S5 - Validate Phase 2.** Run `npm test`, `npm run lint:check`, and `npm run build` to confirm all unit tests pass and code compiles cleanly.

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

- [x] **P3-S1 - Implement cascade selection module.** Create `src/Gmail/cascadeSelection.ts` with greedy 3-tier cascade:
  1. `in:inbox is:unread -label:"🪄✨ Magic ✨🪄"` (greedy take up to `DAILY_LIMIT = 50`).
  2. If room remains: `in:inbox -label:"🪄✨ Magic ✨🪄"` (oversample `remaining * 5`, shuffle with Fisher-Yates, take `remaining`).
  3. If room remains: `in:anywhere -in:inbox -in:trash -in:spam -label:"🪄✨ Magic ✨🪄"` (oversample `remaining * 5`, shuffle, take `remaining`).
  - Supports injected search function `(query: string, start: number, max: number) => ThreadLike[]` and custom random generator for deterministic testing.
  - Returns selected threads and detects high volume overflow (`unreadCount >= DAILY_LIMIT`).
- [x] **P3-S2 - Implement directive decision rules.** Create `src/Gmail/actionRules.ts` with `determineTriageDirective(email, classification, staleThresholdDays = 7)`:
  - If `timeSensitive` and `ageInDays >= 7`: `recycle-7d-only` (skip triage label, apply `Auto-Recycle/7d`).
  - Else if category is `triage/newsletters`, `triage/alerts`, or `triage/junk`: `apply-label-and-recycle-7d` (apply triage label + `Auto-Recycle/7d`).
  - Else (retain categories: personal, finance, govt, receipts): `apply-label-only`.
  - Attaches reason and labels to `TriageExecutionDirective`.
- [x] **P3-S3 - Implement action executor.** Create `src/Gmail/actionExecutor.ts`:
  - Executes directives with label caching (`getUserLabelByName` / `createLabel`).
  - Applies `triage/*` labels, `Auto-Recycle/7d`, and `labelProcessed('Gmail-AI-Sorter', thread)`.
  - Supports `dryRun: true` mode (no mutations, logging only).
  - Enforces `DAILY_LIMIT` safety guard on mutations.
- [x] **P3-S4 - Write comprehensive test suite.** Create `tests/sorter-cascade-executor.test.ts` testing cascade priority, pool fallthrough, random sampling, overflow flag, directive decision rules (all categories, time-sensitive stale vs recent), and executor live/dry-run behavior.
- [x] **P3-S5 - Validate Phase 3.** Run `npm test`, `npm run lint:check`, and `npm run build` to confirm all tests pass and compilation succeeds.

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

- [x] **P4-S1 - Implement StorageStats module.** Create `src/Gmail/StorageStats.ts` with:
  - Account storage metrics query via `DriveApp.getStorageUsed()` and `DriveApp.getStorageLimit()` with injectable fallback.
  - Recycle queued size calculation from `TriageExecutionDirective[]` (summing `email.sizeKb` for directives having `recycleLabel`).
  - Unit formatting utilities (`formatBytes`, `formatMegabytes`, `formatGigabytes`).
- [x] **P4-S2 - Implement digestComposer.** Create `src/Gmail/digestComposer.ts`:
  - Structured plain-text/UTF-8 format matching blueprint:
    - Summary header: processed count, action needed count, auto-recycling count, storage metrics.
    - High-volume overflow warning banner when `isHighVolumeOverflow === true`.
    - ⚡ ACTION REQUIRED section.
    - Categorized sections (👤 PERSONAL, 💳 FINANCE, 🏛️ GOVT, 🧾 RECEIPTS, 📰 NEWSLETTERS, 🚨 ALERTS, 🗑️ JUNK) with count and Gmail label direct link (`https://mail.google.com/mail/u/0/#label/...`).
    - 🕰️ RECYCLING IN 7 DAYS section listing threads queued for deferred deletion.
    - Clickable attachment icons (📷, 📄, 📅, 🎵, 🎬, 📎) and unsubscribe links (`⛓️‍💥 Unsubscribe` or `⛓️‍💥 Unsubscribe ✉️`).
- [x] **P4-S3 - Implement sendDigest action.** Create `src/Gmail/actions/sendDigest.ts`:
  - Subject line formatting: `📬 Daily Email Digest — YYYY-MM-DD` (prefixed with `[DRY RUN]` if `isDryRun`).
  - Delivers email via `GmailApp.sendEmail` to active user (`Session.getActiveUser().getEmail()`), with injectable mailer function for testing.
- [x] **P4-S4 - Write comprehensive test suite.** Create `tests/digest-composer.test.ts`:
  - Test byte and unit formatting in `StorageStats`.
  - Test digest composer with all sections populated, action required items, attachment icons, unsubscribe links, and overflow warning banner.
  - Test empty run and dry-run digest rendering.
  - Test `sendDigest` email dispatch, subject formatting, and recipient resolution.
- [x] **P4-S5 - Validate Phase 4.** Run `npm test`, `npm run lint:check`, and `npm run build` to confirm all tests pass and code compiles cleanly.

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
- 2026-09-08: Completed Phase 1: added triage contracts in `src/types/Gmail/triage.ts`, registered `Gmail-AI-Sorter` with `🧠` in `src/Gmail/actions/labelAsProcessed.ts`, implemented extractor in `src/Gmail/extraction.ts`, and added 12 new passing unit tests in `tests/triage-extraction.test.ts` (71 total tests pass, clean build).
- 2026-09-10: Completed Phase 2: implemented `GeminiClient` in `src/Gmail/GeminiClient.ts` defaulting to `gemini-3.8-flash` with transport abstraction, system instruction, structured schema prompts, and strict response validation. Added 9 unit tests in `tests/gemini-client.test.ts` (80 total tests pass, clean build and lint).
- 2026-09-10: Completed Phase 3: implemented cascade selection in `src/Gmail/cascadeSelection.ts` (3-tier greedy cascade with overflow detection), directive decision rules in `src/Gmail/actionRules.ts` (time-sensitive staleness, 7d recycle, and triage labels), and action executor in `src/Gmail/actionExecutor.ts` (dry-run and live modes, label caching, and daily limit guards). Added 10 unit tests in `tests/sorter-cascade-executor.test.ts` (90 total tests pass, clean build and lint).
- 2026-09-10: Completed Phase 4: implemented storage reporting in `src/Gmail/StorageStats.ts`, UTF-8 plain-text digest formatting in `src/Gmail/digestComposer.ts`, and email dispatch in `src/Gmail/actions/sendDigest.ts`. Added 6 unit tests in `tests/digest-composer.test.ts` (96 total tests pass, clean build and lint).
