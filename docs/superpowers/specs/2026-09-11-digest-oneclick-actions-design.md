# Design: Digest One-Click Actions (Actions Page)

## 1. Overview

Today, resolving a triaged email requires opening Gmail and manually archiving/deleting each thread. This feature adds a single **Actions Page** — an Apps Script Web App linked prominently at the top of the daily digest email (larger font, opens in a new tab) — that lists every thread still awaiting a decision and lets the user Archive or Delete it with one real click, without needing per-item links embedded in the email itself.

This supersedes the original per-item signed-link approach (see [docs/plans/digest-oneclick-actions.md](../../plans/digest-oneclick-actions.md)): a single Web App entry point is simpler, avoids link-prefetch/scanner risk entirely (actions only fire from a real click on an already-authenticated page, never from a bare emailed `GET` link), and is backed by a persistent label rather than expiring signed tokens.

Two behaviors from outside the original scope are folded in here because they directly affect correctness:
- **Nothing is silently lost.** Every triaged thread is durably tracked via a label until the user acts on it or deletes it themselves.
- **The open backlog never balloons.** The existing `DAILY_LIMIT` becomes a steady-state cap on total open (untriaged-and-unactioned) threads, not just a per-run processing quota.

## 2. Architecture & Data Flow

```
[aiSorter pipeline run]
       │
       ▼
[Count current Digest/Pending-Action threads] ──► pendingCount
       │
       ▼
[remainingCapacity = max(0, DAILY_LIMIT - pendingCount)]
       │
       ├── remainingCapacity === 0 ──► Skip cascade selection, Gemini, labeling,
       │                               storage metrics. Send minimal digest
       │                               (subject + one line + Actions Page link).
       │
       └── remainingCapacity > 0 ───► Cascade-select up to remainingCapacity NEW threads
                                       (existing pipeline, unchanged) → classify → determine
                                       directives → execute actions, applying
                                       Digest/Pending-Action to every processed thread
                                       (in addition to existing triage/recycle labels)
                                       → compose full digest with Actions Page link at top

[Actions Page Web App] (opened anytime, independent of any specific digest run)
       │
       ▼
[doGet] ──► access gated by Apps Script deployment (access: MYSELF) ──► live query:
            GmailApp.search('label:Digest/Pending-Action'), grouped by category
       │
       ▼
[User clicks Archive or Delete on an item] ──► google.script.run ──► server function:
            performs the Gmail action, then removes Digest/Pending-Action label
            (Delete removes the label implicitly by trashing the thread)
```

`recycle.ts` (the existing 7-day auto-recycle trigger) is unaffected — it runs independently of the digest pipeline and Actions Page.

## 3. Data Structures & Constants

### 3.1 New label constant (`src/Gmail/actionRules.ts` or a shared constants module)
```ts
export const PENDING_ACTION_LABEL = 'Digest/Pending-Action' as const;
```

### 3.2 `ActionExecutorOptions` / `executeTriageActions` (`src/Gmail/actionExecutor.ts`)
- On every successfully processed (non-dry-run) thread, in addition to existing `triageLabel`/`recycleLabel` handling, unconditionally apply `PENDING_ACTION_LABEL` via the same `ensureLabel`/label-cache mechanism already in place.
- Dry runs continue to skip all label mutations, as today.

### 3.3 Pending-count helper (`src/Gmail/actionExecutor.ts` or new `src/Gmail/pendingActions.ts`)
```ts
export interface PendingCountProvider {
  countPending(): number;
}

export const getPendingActionCount = (
  provider?: PendingCountProvider
): number => { /* default impl uses GmailApp.search('label:Digest/Pending-Action').length */ };
```
Kept dependency-injectable (matching `StorageProvider`/`EmailSender` conventions already used in `StorageStats.ts` / `sendDigest.ts`) so it's unit-testable without `GmailApp`.

### 3.4 Actions Page data query (`src/Gmail/digest-actions/queryPendingThreads.ts`)
```ts
export interface PendingItem {
  threadId: string;
  category: TriageCategory;
  subject: string;
  sender: string;
  ageInDays: number;
}

export const queryPendingThreads = (
  search: SearchFunction<ThreadLike> = defaultGmailSearch
): PendingItem[]
```
Groups by category the same way `composeDigestHtml` already does today (reusing `CATEGORY_METADATA` for icons/colors), sorted oldest-first within each group.

## 4. Backlog-Aware Processing Cap

In `runAiSorterPipeline` (`src/_s/Gmail/aiSorter.ts`):
1. Compute `pendingCount = getPendingActionCount()` before cascade selection.
2. `remainingCapacity = Math.max(0, dailyLimit - pendingCount)`.
3. If `remainingCapacity === 0`:
   - Skip `selectCascadeThreads`, Gemini classification, `determineTriageDirectives`, `executeTriageActions`, and `getStorageMetrics` entirely.
   - Send a minimal digest via a new `sendBacklogOnlyDigest(pendingCount, actionsUrl)` (or a `DailyDigestData` variant with an `entries: []` / `backlogOnly: true` flag consumed by a simplified branch in `digestComposer.ts`) containing only the subject, a one-line summary ("No new emails processed — {N} pending your review"), and the Actions Page link.
   - Return early with `processedCount: 0`.
4. Otherwise, pass `remainingCapacity` as the effective limit into `selectCascadeThreads` (instead of the raw `dailyLimit`), and proceed with the existing pipeline unchanged.

`DAILY_LIMIT` itself is unchanged (still 50, still overridable); only its semantics shift from "new items per run" to "target ceiling on total open backlog."

## 5. Actions Page (Web App)

### 5.1 Deployment configuration (`appsscript.json`)
```json
"webapp": {
  "access": "MYSELF",
  "executeAs": "USER_DEPLOYING"
}
```
Google's own sign-in gates every request before any code runs. No bearer token/secret (`DIGEST_KEY` or otherwise) is used — a URL-embedded secret would be a bearer credential, not authentication, and weaker than deployment-level access control.

### 5.2 Entry point (`src/_s/Gmail/digest-actions.ts`)
- `doGet(e)`: renders an `HtmlService` page listing `queryPendingThreads()` grouped by category, styled consistently with the digest's existing `CATEGORY_METADATA` accents/tints.
- Exposed global functions callable via `google.script.run` from the rendered page's client-side JS:
  - `archiveDigestThread(threadId: string): void` — archives the thread, removes `Digest/Pending-Action`.
  - `deleteDigestThread(threadId: string): void` — moves the thread to trash (label removal is implicit).
- No "Mark Read" action — only Archive and Delete. Not-yet-triaged stays not-yet-triaged until explicitly resolved.
- On success, the client-side callback removes/greys out that row in place (no full page reload).

### 5.3 Digest link (`src/Gmail/digestComposer.ts`, `src/Gmail/actions/sendDigest.ts`)
- URL obtained via `ScriptApp.getService().getUrl()` at digest-composition time — never hardcoded or stored in a Script Property — wrapped in an injectable provider (e.g. `ActionsPageUrlProvider`) for testability, matching the existing DI pattern for `StorageProvider`/`EmailSender`.
- Rendered at the top of both the HTML and plain-text digest bodies, in a visually larger font than the rest of the digest, as a link that opens in a new tab (`target="_blank"` in HTML).

## 6. Testing Strategy

1. **Label application (`tests/... actionExecutor tests`):** every non-dry-run processed thread receives `Digest/Pending-Action` in addition to its existing labels; dry runs apply no labels.
2. **Pending-count helper:** unit tests with an injected fake search function covering zero, partial, and over-limit backlog counts.
3. **Backlog-aware cap (pipeline test, extends `tests/ai-sorter-pipeline.test.ts`):**
   - `pendingCount < dailyLimit` → cascade selection is invoked with `remainingCapacity`, full pipeline runs.
   - `pendingCount >= dailyLimit` → cascade selection, Gemini, execution, and storage metrics are never invoked; a minimal digest is sent instead.
4. **Actions Page query logic (`queryPendingThreads`):** unit tests with an injected fake search function, asserting correct grouping/sorting and that archived/deleted-and-relabeled threads are excluded.
5. **Manifest guard (new test):** asserts `appsscript.json`'s `webapp.access === "MYSELF"` and `webapp.executeAs === "USER_DEPLOYING"`, run in the standard Jest/`node --test` suite so CI catches accidental drift.
6. **Live anonymous-access smoke check (new script, `scripts/verify-webapp-access.ts`, run manually post-deploy via `npm run verify:webapp-access -- <url>`):** performs an unauthenticated `fetch` against the deployed Web App URL and asserts the response is **not** the app's real content (expected: Google's own sign-in/permission-denied page).
7. **Manual verification:** opening the deployed link in a private/incognito browser window (or signed in as a different Google account) as a final sanity check that access is actually denied — covers the case the anonymous-fetch check can't (a *different* authenticated Google identity).

## 7. Non-Goals / Out of Scope

- No bulk actions (e.g. "Archive all Newsletters") — per-item only for now.
- No "Mark Read" action.
- No signed/expiring tokens of any kind — superseded by the persistent label + `MYSELF` access control.
- No changes to `recycle.ts`'s independent 7-day auto-recycle behavior.
