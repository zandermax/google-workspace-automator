# Implementation Plan: Triage Page Size and Subject Fallback

**Goal**: Display thread size on the triage page in the item metadata line matching the daily digest, and fallback to `(no subject)` when a subject is missing or whitespace-only, remaining clickable.

**Architecture**:
- Persist `sizeKb` in `TriageSummary` during sorting so it can be loaded with zero API overhead on the triage webapp.
- In `queryPendingThreads`, read `sizeKb` from `TriageSummary` or fall back to calculating size from thread messages (body length + attachment sizes, minimum 1 KB).
- In `actionsPageRenderer`, format size via `formatSizeKb(item.sizeKb)` and display in metadata line; handle empty/whitespace subjects with `(no subject)` pointing to the thread link.

---

### Task 1: Extend `TriageSummary` with `sizeKb`

**Files to modify**:
- `src/Gmail/pendingTriageSummaries.ts`
- `tests/pending-actions.test.ts`

**Steps**:
1. Add a test in `tests/pending-actions.test.ts` verifying that `saveTriageSummaries` saves `sizeKb` and `getTriageSummary` parses and returns `sizeKb`.
2. Run test to verify failure (`npm test -- tests/pending-actions.test.ts`).
3. Update `TriageSummary` interface in `src/Gmail/pendingTriageSummaries.ts` to include `sizeKb?: number`.
4. In `saveTriageSummaries`, save `sizeKb: directive.email.sizeKb`.
5. In `getTriageSummary`, parse `sizeKb` if present and of type number.
6. Run test to verify success (`npm test -- tests/pending-actions.test.ts`).

---

### Task 2: Include `sizeKb` in `PendingItem` and `queryPendingThreads`

**Files to modify**:
- `src/Gmail/queryPendingThreads.ts`
- `tests/query-pending-threads.test.ts`

**Steps**:
1. Add a test in `tests/query-pending-threads.test.ts` verifying:
   - `sizeKb` is populated from `summary.sizeKb` when available.
   - `sizeKb` falls back to message bytes + attachment sizes when summary is absent or has no `sizeKb`.
2. Update existing tests in `tests/query-pending-threads.test.ts` that check equality against `PendingItem` to include `sizeKb`.
3. Run tests to verify failure.
4. Update `PendingItem` interface in `src/Gmail/queryPendingThreads.ts` to include `sizeKb: number`.
5. Update `queryPendingThreads` in `src/Gmail/queryPendingThreads.ts` to populate `sizeKb` from summary or calculate fallback from message body length and attachments (minimum 1 KB).
6. Run tests to verify success (`npm test -- tests/query-pending-threads.test.ts`).

---

### Task 3: Render size and fallback `(no subject)` on the Triage Page

**Files to modify**:
- `src/Gmail/actionsPageRenderer.ts`
- `tests/actions-page-renderer.test.ts`

**Steps**:
1. Update `tests/actions-page-renderer.test.ts` with test cases:
   - Verifying the metadata line contains `${sender} &middot; ${age} &middot; ${formattedSize}` (e.g. `250 KB` or `1.5 MB`).
   - Verifying that when `subject` is empty, missing, or whitespace, it renders `(no subject)` wrapped in the link to the thread.
2. Run tests to verify failure.
3. In `src/Gmail/actionsPageRenderer.ts`:
   - Import `formatSizeKb` from `./digestComposer`.
   - Update `renderItemHtml`:
     - Determine subject: `const subjectDisplay = item.subject && item.subject.trim() ? item.subject.trim() : '(no subject)';`
     - Update metadata line: `<div style="font-size:11px;color:#6b7280;">${escapeHtml(item.sender)} &middot; ${formatAge(item.ageInDays)} &middot; ${formatSizeKb(item.sizeKb)}</div>`
     - Render subject link with `escapeHtml(subjectDisplay)`.
4. Run tests to verify success (`npm test -- tests/actions-page-renderer.test.ts`).

---

### Task 4: Full verification

**Steps**:
1. Run full test suite: `npm test`.
2. Run typecheck / build: `npm run build`.
3. Check git status and diff.
