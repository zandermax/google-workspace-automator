# Test and runtime checklist

This project mixes two realities:

- a TypeScript codebase that must compile and lint locally
- a Google Apps Script runtime that must still execute correctly when pushed via `clasp`

The goal of this document is to make both the operational requirements and the missing test work explicit.

## Things that must run

These are the minimum checks that should pass before shipping any change.

### Local project health

- `npm install`
- `npm run build`
- `npm run format`
- `npm run lint`
- `node --test tests/*.mjs`

These are the core checks for the repo itself. The current repo already has a Node test file for the sorter logic, and the project should stay green before deploys.

### Apps Script runtime smoke checks

The compiled output is pushed to Apps Script via the deploy flow:

- `npm run push`

This should be treated as a deploy-time smoke check, not just a convenience script.

Before relying on a production push, the following should still be validated in the Apps Script runtime:

- trigger registration still works
- the target Gmail and Drive functions are present in the script project
- the scheduled trigger can run without crashing
- Gmail query patterns still return the expected threads
- labels and trash actions behave as expected on real mail

### Operational jobs that need to stay working

These are the jobs that are already part of the active automation layer and should continue to run without regressions:

- Gmail cleanup jobs in `src/_s/Gmail/`
  - delete old invites
  - delete old promo mail
  - delete old unread mail
  - delete old update mail
  - recycle
  - delete bot SMS mail
- Drive maintenance jobs in `src/_s/Drive/`
  - delete old untitled spreadsheets
  - delete tiny files
- scheduled trigger functions in `src/_t/`

If a change affects one of these jobs, it should be verified against the behavior it is responsible for.

---

## Things that still need implementation for tests

The repo has some test coverage already, but more test work is still required before a stricter production pass.

### 1. Gmail query builder tests

Files to cover:

- `src/Gmail/GmailQuery/index.ts`
- `src/Gmail/GmailQuery/utils.ts`

Needed behaviors:

- query composition for `from`, `to`, `subject`, `label`, `in`, `has`, and negation helpers
- handling of arrays and multi-term filters
- date query generation and edge cases
- ensuring dangerous/invalid query fragments do not get constructed silently

### 2. Trigger factory tests

Files to cover:

- `src/_t/triggerFactory.ts`
- trigger wrappers in `src/_t/Gmail/*.ts` and `src/_t/Drive/*.ts`

Needed behaviors:

- correct scheduling intervals for `dailyTrigger`, `twiceDailyTrigger`, and `weeklyTrigger`
- correct trigger function names being passed to `ScriptApp.newTrigger(...)`
- no invalid time configuration is produced

### 3. Shared label/action tests

Files to cover:

- `src/Gmail/actions/labelAsProcessed.ts`
- `src/Gmail/common.ts`

Needed behaviors:

- label processing is idempotent
- labels are applied only when the thread should be marked as processed
- error handling for missing or malformed Gmail thread metadata

### 4. Sorter logic tests

Files to cover:

- `src/sorter/selection-logic.mjs`
- any future sorter helper modules

Needed behaviors:

- daily limit is enforced
- unread inbox mail is prioritized over older mail
- old inbox mail is sampled rather than always taking the first entries
- archived mail is only considered after inbox pools are handled
- dry-run and safe-mode logic prevents destructive actions

This is the main logic that already has some current tests in `tests/sorter-phase1.test.mjs` and should continue to be expanded as the sorter grows.

### 5. Drive automation tests

Files to cover:

- `src/_s/Drive/*.ts`
- `src/Drive/*`

Needed behaviors:

- deletion rules for old untitled spreadsheets and tiny files follow the intended thresholds
- no accidental deletion of non-target files
- query filters select only eligible files

### 6. Apps Script integration smoke tests

These should eventually be run against the real Apps Script environment or a closely mimicked environment.

Needed behaviors:

- the script can initialize triggers without crashing
- GmailApp operations return expected data for real sample threads
- labeling and moving to trash behave consistently
- the system reports runtime errors cleanly to logs

---

## Recommended priority order

1. Keep the repo build and lint checks green
2. Extend the sorter tests already in `tests/sorter-phase1.test.mjs`
3. Add Gmail query builder coverage
4. Add trigger factory coverage
5. Add action/label safety tests
6. Add Drive cleanup regression tests
7. Add real Apps Script smoke verification once the automation is stable

## Short version

The project already has runtime requirements and a few test beginnings, but it still needs a fuller safety net around:

- Gmail query behavior
- trigger creation
- label processing
- sorter safety constraints
- Drive cleanup rules
- end-to-end Apps Script runtime validation

That is the work to keep in motion before treating the automation as production-ready.
