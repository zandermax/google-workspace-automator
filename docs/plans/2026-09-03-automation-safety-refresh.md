# Automation Safety Refresh Plan

## Plan Metadata

- Status: in-progress
- Mode: autopilot
- Canonical location: `docs/plans/2026-09-03-automation-safety-refresh.md`
- Last updated: 2026-09-03
- Goal: Make the existing Google Apps Script cleanup automations safe to extend by removing known pagination, calendar parsing, trigger duplication, testing, deployment, and permission risks.
- Success criteria:
  - Mutating Gmail queries process all matching threads without offset-based skips.
  - Invite expiration behavior is explicit and correctly tested for supported ICS forms.
  - Trigger setup is idempotent and cannot silently multiply scheduled jobs.
  - One documented local test command exercises the real source implementation where practical.
  - Deployment checks do not mutate the working tree or silently rewrite source before deployment.
  - The Apps Script manifest contains only services required by the source.
  - Every implementation phase reaches a validated, self-contained commit boundary before execution pauses.
- Constraints and assumptions:
  - Execution is autopilot, with no user interaction expected during phases.
  - The user wants to perform the commits and pushes; the executing agent must stop at each commit boundary and must not stage, commit, branch, or push.
  - Preserve the current Apps Script runtime, public entry-point names, label semantics, and existing user-facing cleanup behavior unless a safety fix requires a behavior change.
  - Prefer small, reversible changes and existing Node built-in test infrastructure over introducing a new test framework.
  - Time-zone support is either implemented correctly or narrowed explicitly; silently treating named local time zones as UTC is not acceptable.
  - `.remote/` remains ignored and is not used as a build input.
  - Git operations are limited to read-only inspection such as status, diff, log, show, and branch listing.

## Current State

- Current phase: Phase 5 - Deployment Command Hygiene (Completed, awaiting commit boundary handoff)
- Current step: Phase 5 Checkpoint - commit and push boundary
- Next action: User inspects, commits, and pushes Phase 5 changes before elaborating and starting Phase 6.
- Blockers: none

## Decisions

- 2026-09-03: Include all seven review suggestions, ordered by operational risk and dependency.
- 2026-09-03: Use autopilot execution with an explicit stop after each phase reaches a validated commit boundary.
- 2026-09-03: Store this plan in the repository under `docs/plans/` as the single canonical plan artifact.
- 2026-09-03: Do not have the executing agent create commits. Each phase ends with a clean handoff point where the user can inspect, commit, and push before resuming.
- 2026-09-03: Treat pagination mutation safety as the first implementation phase because it affects multiple existing destructive jobs.
- 2026-09-03: Treat unsupported or ambiguous ICS time-zone forms as an explicit contract decision, backed by tests, rather than guessing a conversion.

## Deferred Items

- Broader sorter architecture and new categorization features remain outside this plan; resume them after the safety refresh passes.
- Full live Google Apps Script verification remains an operational follow-up where local mocks cannot prove Gmail trigger behavior, manifest authorization, or real search pagination.
- Replacing the custom query builders with a third-party library is deferred because it would increase scope without being necessary for the identified risks.

## Phase 1: Gmail Query And Mutation Safety

### Tangible output

A corrected Gmail query execution path for destructive callers, with regression tests proving that mutation during processing does not skip matching threads and that query-builder date helpers emit correct Gmail syntax.

### Completion criteria

- Existing batch cleanup jobs process every matching result across multiple pages even when processed threads leave the search result set.
- Pagination behavior remains bounded and compatible with Apps Script limits.
- `after()` and `before()` either produce valid, correct Gmail queries or are removed/replaced with an explicitly tested API.
- Tests cover more than 100 matching threads and date boundaries around month/year changes.
- No public cleanup entry point names change.

### Dependencies and risks

- Depends on the existing `Query` and `GmailQuery` iterator contracts.
- Risks changing result ordering or behavior for non-mutating consumers.
- Tests must distinguish iterator pagination from caller-side mutation; a solution that only passes static query tests is insufficient.
- Recovery is straightforward: revert the phase changes if the focused pagination tests or build fail.

### Steps

- [x] **P1-S1 - Establish executable regression cases.** Add focused tests for `after()` and `before()` query strings, month/year/leap-day boundaries, stable pagination over more than 100 results, and a shrinking result set caused by processing. Use deterministic mocked search responses and assert both returned items and search-call arguments. Keep the tests close to the existing Node test conventions and avoid testing a copied implementation.
- [x] **P1-S2 - Correct date query construction.** Update `GmailQuery.after()` and `GmailQuery.before()` to emit the corresponding Gmail operator with a one-based month and calendar day-of-month. Preserve chaining and existing query formatting. Use the tests from P1-S1 as the acceptance contract.
- [x] **P1-S3 - Introduce mutation-safe batch processing.** Refactor the shared Gmail execution path or its destructive callers so matching thread identities are collected using stable pages before those threads are trashed or otherwise removed from the search result. Preserve bounded page sizes and avoid changing non-mutating query behavior unnecessarily. Do not solve this by merely incrementing an offset against a result set that callers mutate.
- [x] **P1-S4 - Migrate affected cleanup callers.** Apply the mutation-safe path to existing destructive Gmail jobs that currently iterate and mutate matching results, including old unread, promotions, updates, bot SMS, and recycle flows where the shared contract applies. Keep labeling-before-trash behavior and existing counts intact.
- [x] **P1-S5 - Validate the phase and prepare the handoff.** Run focused query/pagination tests, TypeScript compilation, lint, and the Apps Script build. Inspect the diff for scope and confirm no public trigger or cleanup entry-point names changed. Stop only when the phase is self-contained and ready for the user's commit.

### Validation

- Run the focused query/date/pagination tests added in P1-S1.
- Run `npx tsc`, `npm run lint`, and `npm run build`.
- Confirm a mocked shrinking-result scenario processes every original candidate exactly once.
- Confirm date tests include January, December, year transitions, and leap-day behavior.
- Confirm the diff contains only query execution, date helper, affected destructive callers, and directly associated tests.

### Checkpoint

Automated go/no-go gate: all Phase 1 completion criteria and focused validation must pass. Stop execution at the validated commit boundary and report the exact files and checks so the user can commit and push before the next phase.

## Phase 2: Calendar Invite Expiration Correctness

### Tangible output

A documented and tested ICS expiration contract used by both real and dry-run invite cleanup paths, including safe handling of UTC, date-only, folded, parameterized, and named-time-zone values.

### Completion criteria

- The parser does not interpret a named local `TZID` timestamp as UTC.
- Supported ICS forms and unsupported forms are explicit in code and tests.
- The invite cleanup inspects the intended messages/attachments for a thread, including the updated-invite case where applicable.
- A thread is labeled and trashed at most once per run.
- Tests import and exercise the actual parser and cleanup decision logic rather than duplicating an old regex or loop.
- Existing dry-run behavior remains mutation-free.

### Dependencies and risks

- Depends on Phase 1 only if shared query behavior is reused by the invite job; otherwise it can remain locally scoped.
- Apps Script and Node may differ in time-zone database behavior, so avoid adding a runtime dependency that cannot be deployed reliably.
- Calendar semantics such as `DTEND;VALUE=DATE` are end-exclusive in ICS; preserve the existing intended policy unless tests expose a contradiction.
- Recovery is to retain the existing UTC/date-only contract while reverting only newly introduced named-time-zone behavior if the deployment runtime cannot support it safely.

### Steps

- [x] **P2-S1 - Establish explicit ICS expiration contract tests.** Define tests for supported forms (UTC `Z`, date-only `VALUE=DATE:YYYYMMDD` and `YYYYMMDD`, folded properties) and explicit rejection of unsupported forms (named local `TZID` without silent UTC misinterpretation, malformed or missing DTEND). Ensure tests import `getInviteExpiration` directly.
- [x] **P2-S2 - Implement safe ICS parsing.** Update `getInviteExpiration` in `src/_s/Gmail/delete-old-invites.ts` to require UTC `Z` for date-times, correctly parse date-only values, and return `null` for named `TZID` or ambiguous local date-times so they fail safe and are never silently treated as UTC.
- [x] **P2-S3 - Implement thread-level inspection and updated-invite safety.** Refactor `deleteOldInvites` and `dryRunDeleteOldInvites` to scan all messages in a thread, identify all `.ics` attachments, and evaluate thread eligibility: trash if and only if at least one valid `.ics` exists, all `.ics` invites in the thread are expired, and none are unparseable/future. Ensure single labeling/trashing per thread via `markThreadForProcessing` and use `processSync` for safe batch pagination.
- [x] **P2-S4 - Update and deduplicate invite test suites.** Replace stale duplicated logic in `tests/delete-old-invites.test.ts` and `tests/delete-old-invites-integration.test.ts` with tests exercising the real `getInviteExpiration`, `deleteOldInvites`, and `dryRunDeleteOldInvites`. Include tests for threads with updated invites across multiple messages, multiple attachments, and mutation-free dry-run verification.
- [x] **P2-S5 - Validate Phase 2 and prepare checkpoint.** Run all invite tests, full `npm test`, `npm run lint`, and `npm run build`. Confirm entry-point signatures are intact and pause at the commit boundary for user review.

### Validation

- Run focused invite parser, dry-run, and mocked integration tests.
- Run the build and inspect generated Apps Script output for the invite entry point.
- Verify no Gmail mutation APIs are called by dry-run tests.

### Checkpoint

Automated go/no-go gate: all Phase 2 criteria and focused validations pass. Stop at the validated commit boundary for the user to commit and push.

## Phase 3: Idempotent Trigger Management

### Tangible output

Trigger installation behavior that safely reuses or replaces the intended scheduled trigger instead of creating duplicates, plus tests for repeated installation and unrelated triggers.

### Completion criteria

- Re-running a trigger wrapper or installer does not create another trigger for the same handler and schedule.
- Existing unrelated project triggers are preserved.
- Trigger creation remains compatible with the current Apps Script V8 runtime and handler registry.
- Trigger wrappers retain their current public names and schedule semantics.
- Failures during trigger inspection or creation are observable through logging and do not falsely report success.

### Dependencies and risks

- Depends on the `ScriptApp` trigger API shape supplied by `gas-types-detailed`.
- A replacement strategy must avoid deleting unrelated user-created triggers.
- Local tests require a narrow ScriptApp mock; live verification is still needed after deployment.
- Recovery is to disable only the installer entry point and retain existing triggers if a live API mismatch appears.

### Steps

- [x] **P3-S1 - Establish trigger idempotence tests.** Add focused unit tests in `tests/trigger-management.test.ts` for `triggerFactory.ts` exercising repeated installation scenarios, confirming duplicate triggers are not created for the same handler, unrelated triggers for other handlers/spreadsheets are preserved, replacement and creation actions are logged, and `ScriptApp` failures are logged and rethrown.
- [x] **P3-S2 - Implement idempotent trigger management in `triggerFactory.ts`.** Inspect existing triggers with `ScriptApp.getProjectTriggers()`, remove any existing triggers matching the target `triggerFunction` using `ScriptApp.deleteTrigger()`, create the replacement trigger with the specified schedule, log actions via `Logger.log`, and ensure errors are logged and rethrown. Ensure `weeklyTrigger` returns the created trigger for API consistency.
- [x] **P3-S3 - Validate Phase 3 and prepare checkpoint.** Run `npm test`, `npm run lint`, and `npm run build`. Confirm all trigger wrapper names (`deleteBotSmsEmailsTrigger`, `deleteOldInvitesTrigger`, `deleteOldPromosTrigger`, `deleteOldUnreadTrigger`, `deleteOldUpdatesTrigger`, `recycleTrigger`, `deleteOldUntitledSsTrigger`) and their schedule semantics are unchanged. Pause at the commit boundary for user review.

### Validation

- Run focused trigger-factory tests with repeated installation scenarios.
- Run TypeScript compilation and Apps Script build validation.
- Confirm trigger wrapper names and registry values remain unchanged.

### Checkpoint

Automated go/no-go gate: idempotence tests, compilation, and build validation pass. Stop at the validated commit boundary for the user to commit and push.

## Phase 4: Test Suite Contract And Coverage

### Tangible output

A single documented test command and a focused suite that exercises production source for invite cleanup, query safety, trigger behavior, and build invariants without stale duplicate implementations.

### Completion criteria

- `package.json` exposes one repeatable test command covering the intended Node tests.
- Invite tests no longer reimplement the parser or destructive loop with obsolete behavior.
- Mocks are isolated and restore global Apps Script stubs between tests.
- Tests cover the important safety properties: no dry-run mutation, one action per thread, pagination under mutation, and repeated trigger installation.
- README or an appropriate runbook documents the command and its boundary: local tests do not prove execution inside GAS.
- Existing tests continue to pass without requiring a network connection or clasp credentials.

### Dependencies and risks

- Depends on the production seams established in Phases 1-3.
- Avoid broad test rewrites that obscure behavioral changes or introduce brittle snapshots.
- Node test execution may need a TypeScript loader; use the already-installed `tsx` dependency unless the existing build supports a simpler path.
- Recovery is to retain legacy tests temporarily only when a production-source equivalent has not yet been established, documenting the gap rather than deleting coverage blindly.

### Steps

- [x] **P4-S1 - Unify test command in `package.json`.** Update `npm test` script to discover all test files across `tests/**/*.test.ts` and `src/**/*.test.ts` via Node test runner with `tsx`, ensuring tests like `src/Gmail/sorter.test.ts` are not silently omitted.
- [x] **P4-S2 - Isolate global stubs across test suites.** Add setup and teardown hooks (`beforeEach`/`afterEach`) in test suites that mock globals (`tests/gmail-query-safety.test.ts`, `tests/delete-old-invites-integration.test.ts`, and `tests/trigger-management.test.ts`) so that `GmailApp`, `ScriptApp`, and `Logger` mocks are restored and do not leak across tests.
- [x] **P4-S3 - Document test command and GAS runtime boundary.** Add clear testing documentation in `README.md` explaining how to run local tests, what is verified locally (pure logic, query builders, mock integration, trigger idempotence, build transforms), and the boundary: local tests run on Node.js using mocks and do not prove runtime execution inside Google Apps Script.
- [x] **P4-S4 - Validate Phase 4 and prepare checkpoint.** Run `npm test`, `npm run lint`, and `npm run build`. Confirm all 58 tests pass offline without credentials or network calls, and pause at the commit boundary for user review.

### Validation

- Run the new single test command from a clean dependency state.
- Run TypeScript compilation and lint checks in non-mutating mode where available.
- Verify test discovery includes all intended tests and excludes generated `dist/` files.

### Checkpoint

Automated go/no-go gate: the documented test command passes and coverage is source-backed for the identified risks. Stop at the validated commit boundary for the user to commit and push.

## Phase 5: Deployment Command Hygiene

### Tangible output

Separate write-oriented local maintenance commands from read-only deployment checks so CI/deployment cannot rewrite source files as a side effect.

### Completion criteria

- Formatting and linting have explicit check-only commands suitable for CI/deployment.
- `npm run push` does not run `prettier --write` or `eslint --fix` as an implicit deployment step.
- Build output remains generated from the checked source and still excludes Node test files.
- README deployment instructions match the actual scripts.
- Existing local formatting and lint-fix workflows remain available for intentional maintenance.

### Dependencies and risks

- Depends on the test command and source changes from earlier phases only for validation, not implementation.
- CI may currently depend on automatic fixes; inspect repository workflow files before changing script names or ordering.
- The generated `dist/` directory must not be committed or treated as source.
- Recovery is to restore the prior script aliases while retaining separate check commands if downstream automation is discovered.

### Steps

- [x] **P5-S1 - Add check-only formatting and linting commands.** Expose `format:check` (`prettier --cache --check .`) and `lint:check` (`eslint --cache .`) in `package.json` for read-only validation in CI/deployments, while retaining `format` (`prettier --cache --write .`) and `lint` (`eslint --fix --cache .`) for intentional local maintenance. Add `.prettierignore` to exclude `dist/`, `.remote/`, and `.git/`.
- [x] **P5-S2 - Remove mutating steps from deployment pipeline.** Update `npm run push` in `package.json` so it runs `clean-build`, `build`, and `clasp push` without invoking write-oriented `format` or `lint --fix` as side effects.
- [x] **P5-S3 - Update README deployment and script instructions.** Update `README.md` deployment descriptions and useful commands list to reflect the non-mutating deployment pipeline and check-only commands.
- [x] **P5-S4 - Validate Phase 5 and prepare checkpoint.** Run `npm run format:check`, `npm run lint:check`, `npm run build`, and `npm test`. Verify dry deployment preparation (`npm run clean-build && npm run build`) leaves tracked source files completely unmodified via read-only git status inspection, and pause at the commit boundary for user review.

### Validation

- Run formatting check, lint check, build, and the full test command.
- Verify a dry deployment preparation does not modify tracked source files using read-only git diff/status inspection.
- Confirm README commands are executable as written, excluding credentialed `clasp push` unless credentials are available.

### Checkpoint

Automated go/no-go gate: all local checks pass and deployment preparation is non-mutating. Stop at the validated commit boundary for the user to commit and push.

## Phase 6: Apps Script Manifest Least Privilege

### Tangible output

A manifest containing only the advanced Google services required by the current source, with documentation for any intentionally retained service.

### Completion criteria

- Source usage is compared against every enabled advanced service in `appsscript.json`.
- Unused advanced services are removed from the manifest.
- Built-in services such as `GmailApp` and `DriveApp` are not incorrectly treated as advanced-service dependencies.
- The resulting build still copies the manifest unchanged and remains deployable.
- Any required reauthorization or live GAS verification is documented before deployment.

### Dependencies and risks

- Depends on the source inventory and build behavior, but should remain a small manifest-only change unless validation requires documentation updates.
- Removing a service can invalidate deployed code outside this repository; inspect the current repository and remote snapshot if available before removal.
- Apps Script authorization changes may require a one-time manual action after deployment.
- Recovery is to restore an intentionally required service with a documented reason.

### Steps

_Not yet elaborated. In autopilot mode, elaborate immediately before this phase begins._

### Validation

- Run source-to-manifest usage checks, build, lint, and the full test command.
- Inspect the generated `dist/appsscript.json` contents.
- Report live authorization verification as a post-deployment item if clasp/GAS access is unavailable.

### Checkpoint

Automated go/no-go gate: manifest validation, build, lint, and tests pass. Stop at the validated commit boundary for the user to commit and push. After the user confirms the phase commit is pushed, mark the plan complete and record any live-GAS verification gap.

## Progress Log

- 2026-09-03: Discovery completed. Confirmed the repository uses TypeScript plus Babel for Apps Script output, Node tests, Gmail query iterators, scheduled trigger wrappers, and an ignored generated `dist/` boundary.
- 2026-09-03: Identified pagination mutation risk in `src/common/Query/index.ts` and `src/Gmail/GmailQuery/index.ts`.
- 2026-09-03: Identified incorrect `after()`/`before()` query construction in `src/Gmail/GmailQuery/index.ts`.
- 2026-09-03: Identified named `TZID` values being parsed as UTC in `src/_s/Gmail/delete-old-invites.ts`.
- 2026-09-03: Identified duplicate-trigger risk in `src/_t/triggerFactory.ts`.
- 2026-09-03: Identified missing unified test script and stale tests that duplicate old invite logic.
- 2026-09-03: Identified deployment scripts that format and lint with write/fix behavior before building.
- 2026-09-03: Identified potentially unused advanced services in `appsscript.json`; confirm usage before removing any.
- 2026-09-03: Plan ready for autopilot execution with six user-owned commit boundaries.
- 2026-09-03: Phase 1 elaborated. The mutation fix must collect stable candidates before destructive mutation; offset arithmetic alone is insufficient when Gmail search results shrink between pages.
- 2026-09-03: Current execution step is P1-S1; all later phase steps remain intentionally unelaborated.
- 2026-09-07: Completed P1-S1. Added comprehensive regression tests in tests/gmail-query-safety.test.ts covering after()/before() query construction (single/double digit month and days, leap years, year boundaries, chaining), stable pagination over 100 results, shrinking result sets from caller mutation (for both processSync and Symbol.iterator), custom start/max pagination options, and asserting exact search-call arguments.
- 2026-09-07: Completed P1-S2. Confirmed and refined date query construction in GmailQuery.after() and GmailQuery.before() using one-based month and calendar day-of-month, cleaned up JSDoc signatures, and verified against date test cases. All tests pass and build succeeds.
- 2026-09-07: Completed P1-S3, P1-S4, and P1-S5. Removed broken GmailQuery[Symbol.iterator] override so GmailQuery inherits Query's page prefetching, made Query[Symbol.iterator] callable with zero arguments (Partial<Parameters<G>>), migrated destructive cleanup callers (deleteOldUnread, deleteOldPromos, deleteOldUpdates, deleteBotSmsEmails) to processSync to eliminate offset-based mutation skips, added end-to-end caller tests in tests/gmail-query-safety.test.ts, ran npm test (40 passing), npm run lint, and npm run build. Phase 1 reached validated commit boundary.
- 2026-09-07: Completed Phase 2 (P2-S1 through P2-S5). Elaborated Phase 2 steps. Implemented explicit ICS contract in getInviteExpiration requiring UTC Z or date-only values, returning null for named TZID or floating date-times without Z to fail safe rather than silently misinterpreting them as UTC. Refactored deleteOldInvites and dryRunDeleteOldInvites to inspect all messages and attachments in a thread, safely preserving threads with updated future invites or unparseable/unsupported attachments, and using processSync for mutation-safe pagination. Deduplicated and modernized tests/delete-old-invites.test.ts, tests/delete-old-invites-integration.test.ts, and tests/delete-old-invites-dry-run.test.ts to import production functions directly. Fixed infinite loop in test search mock. Validated with npm test (47 passing), npm run lint, and npm run build. Phase 2 reached validated commit boundary.
- 2026-09-08: Completed Phase 3 (P3-S1 through P3-S3). Elaborated Phase 3 steps. Added comprehensive unit tests in tests/trigger-management.test.ts verifying initial trigger installation, idempotent replacement without duplicate accumulation, preservation of unrelated handlers, multiple duplicate cleanup, weekly/daily/dry-run schedule helper consistency, and ScriptApp error propagation with logging. Updated src/_t/triggerFactory.ts with removeExistingTriggers to delete pre-existing triggers for the same handler before creating the replacement trigger, logged trigger removals and creations, logged and rethrown creation errors, and aligned weeklyTrigger return value. Validated with npm test (54 passing), npm run lint, and npm run build. Phase 3 reached validated commit boundary.
- 2026-09-08: Completed Phase 4 (P4-S1 through P4-S4). Elaborated Phase 4 steps. Updated package.json test script to discover all test files across tests/ and src/ via node --import tsx --test 'tests/**/\*.test.ts' 'src/**/*.test.ts', bringing active test coverage to 58 tests. Added beforeEach/afterEach mock restoration hooks across tests/gmail-query-safety.test.ts, tests/delete-old-invites-integration.test.ts, and tests/trigger-management.test.ts ensuring GmailApp, ScriptApp, and Logger stubs are completely isolated and restored between tests. Documented npm test, coverage scopes, and the GAS runtime boundary in README.md. Validated with npm test (58 passing), npm run lint, and npm run build. Phase 4 reached validated commit boundary.- 2026-09-08: Completed Phase 5 (P5-S1 through P5-S4). Elaborated Phase 5 steps. Added check-only commands format:check (prettier --cache --check .) and lint:check (eslint --cache .) in package.json, and added .prettierignore to ignore build/snapshot output. Refactored npm run push to eliminate implicit mutating format and lint --fix steps, executing clean-build, build, and clasp push. Updated README deployment instructions and command documentation to reflect non-mutating deployment checks. Verified dry deployment leaves tracked source files unmodified via read-only git status inspection. Validated with format:check, lint:check, npm test (58 passing), and npm run build. Phase 5 reached validated commit boundary.
