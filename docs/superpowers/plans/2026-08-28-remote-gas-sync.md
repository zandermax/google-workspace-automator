# Remote GAS Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull the currently deployed Google Apps Script project into an ignored `.remote` snapshot and establish a repeatable basis for deployed-code equivalence tests.

**Architecture:** A local Node script reads the existing root `.clasp.json`, writes a sanitized project config inside `.remote`, and runs `clasp pull` there. Pull metadata records the remote script ID, timestamp, local commit, and result. Remote tests are intentionally authored after the first pull reveals the real generated Apps Script layout.

**Tech Stack:** Node.js ESM, `@google/clasp`, npm scripts, Node built-in test runner, Git metadata.

## Global Constraints

- `.remote/` is ignored and never committed.
- Authentication stays in the user's local clasp configuration.
- The pull script must not modify `src/`, `dist/`, or the root `.clasp.json`.
- The normal build and deploy flow remains unchanged.
- Remote tests must distinguish static checks, mocked Apps Script checks, and live GAS checks.

---

### Task 1: Add the ignored remote snapshot command

**Files:**

- Create: `scripts/pull-remote.mjs`
- Modify: `.gitignore`
- Modify: `package.json`

- [x] Add `npm run pull:remote`.
- [x] Require a local `.clasp.json` containing a non-empty `scriptId`.
- [x] Create `.remote` and write only `{ "scriptId": "..." }` to `.remote/.clasp.json`.
- [x] Run `clasp pull` with `.remote` as the working directory.
- [x] Write `.remote/metadata.json` for successful and failed pulls.
- [ ] Verify the command against the real deployed project after local clasp setup.

### Task 2: Document the deployed-state workflow

**Files:**

- Create: `AGENTS.md`
- Create: `tests/remote/README.md`

- [x] Explain that `.remote` is generated deployed state, not source.
- [x] Document local clasp authentication and `npm run pull:remote`.
- [x] Reserve `tests/remote` for tests based on the first real snapshot.
- [ ] Update the remote-test guidance after inspecting the first pulled file layout.

### Task 3: Inspect the first snapshot and define equivalence contracts

**Files:**

- Inspect: `.remote/`
- Create or modify: `tests/remote/*.test.mjs`

- [ ] Inventory deployed files and global Apps Script entry points.
- [ ] Compare deployed entry points with `src/_s/` and `src/_t/` expectations.
- [ ] Add static tests for expected functions and trigger targets.
- [ ] Add normalized local-versus-remote checks that account for Babel/import-removal differences.
- [ ] Add mocked tests for query, labeling, and destructive-operation safety.
- [ ] Record live-GAS-only checks separately instead of pretending Node tests prove them.

### Task 4: Run and document verification

**Files:**

- Modify: `README.md` or `runbooks/new-machine-setup-checklist.md`

- [ ] Run `npm run pull:remote` successfully.
- [ ] Run `npm run build`.
- [ ] Run `npm run lint`.
- [ ] Run `node --test tests/*.mjs tests/remote/*.test.mjs` once remote tests exist.
- [ ] Document how to identify the snapshot's script ID and pull timestamp.
- [ ] Document any deployed-versus-local differences discovered during the first pull.
