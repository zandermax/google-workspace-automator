# Design Spec: Show Size and Subject Fallback on Triage Page

## 1. Overview

The triage actions page (`renderActionsPageHtml`) displays pending threads grouped by category.
This change enhances the triage items in two ways:

1. **Show Size on Metadata Line**: Display thread size in the item metadata line matching the daily digest format: `${sender} · ${age} · ${size}` (e.g. `250 KB` or `1.5 MB`).
2. **Subject Fallback**: When a thread has an empty or whitespace-only subject, display `(no subject)` instead, and keep it clickable linking to the thread in a new tab.

## 2. Requirements

- The item metadata line on the triage page changes from:
  `${escapeHtml(item.sender)} &middot; ${formatAge(item.ageInDays)}`
  to:
  `${escapeHtml(item.sender)} &middot; ${formatAge(item.ageInDays)} &middot; ${formatSizeKb(item.sizeKb)}`
- If `item.subject` is empty, missing, or whitespace-only, render `(no subject)` as the link text inside `<a><strong>...</strong></a>` pointing to the thread URL (`buildThreadLink(item.threadId)`) with `target="_blank"` and `rel="noopener"`.
- `PendingItem` in `queryPendingThreads.ts` includes `sizeKb: number`.
- `TriageSummary` in `pendingTriageSummaries.ts` persists `sizeKb?: number` so `saveTriageSummaries` saves `sizeKb` to ScriptProperties.
- `queryPendingThreads` reads `sizeKb` from `TriageSummary`. If missing (older cache or missing summary), it computes `sizeKb` by calculating total body and attachment bytes from the thread's messages, with minimum 1 KB (matching `extraction.ts`).
- Update existing tests and add test coverage for:
  - `renderActionsPageHtml` rendering size on metadata line.
  - `renderActionsPageHtml` rendering `(no subject)` when subject is empty.
  - `queryPendingThreads` propagating `sizeKb` from summary or fallback.
  - `saveTriageSummaries` / `getTriageSummary` storing and retrieving `sizeKb`.

## 3. Detailed Changes

### 3.1 `src/types/Gmail/triage.ts` (if applicable) & `src/Gmail/pendingTriageSummaries.ts`

- Extend `TriageSummary` interface:
  ```ts
  export interface TriageSummary {
  	category?: TriageCategory;
  	summary: string;
  	highlights: string[];
  	keyDetail: string;
  	sizeKb?: number;
  }
  ```
- In `saveTriageSummaries`, extract `sizeKb: directive.email.sizeKb` and serialize it.
- In `getTriageSummary`, parse `sizeKb` if present and numeric:
  ```ts
  ...(typeof parsed.sizeKb === 'number' ? { sizeKb: parsed.sizeKb } : {}),
  ```

### 3.2 `src/Gmail/queryPendingThreads.ts`

- In `PendingItem` interface:
  ```ts
  export interface PendingItem {
      ...
      sizeKb: number;
  }
  ```
- In `PendingMessageLike`:
  Ensure message can return attachments or body for fallback calculation if needed:
  ```ts
  interface PendingAttachmentLike {
      getSize?(): number;
  }
  interface PendingMessageLike {
      ...
      getPlainBody?(): string;
      getAttachments?(): PendingAttachmentLike[];
  }
  ```
- In `queryPendingThreads`:
  Check `summary?.sizeKb`. If `typeof summary?.sizeKb === 'number'`, use it.
  Else, calculate fallback size from `thread.getMessages()`:
  Sum `(msg.getBody?.() || msg.getPlainBody?.() || '').length` + attachment sizes, minimum 1 KB.

### 3.3 `src/Gmail/actionsPageRenderer.ts`

- Import `formatSizeKb` from `./digestComposer`.
- Update subject display logic in `renderItemHtml`:
  ```ts
  const subjectDisplay = item.subject?.trim() || '(no subject)';
  ```
- Update metadata line:
  ```ts
  <div style="font-size:11px;color:#6b7280;">${escapeHtml(item.sender)} &middot; ${formatAge(item.ageInDays)} &middot; ${formatSizeKb(item.sizeKb)}</div>
  <div style="font-size:14px;margin-top:2px;"><a href="${buildThreadLink(item.threadId)}" target="_blank" rel="noopener" style="color:#111827;text-decoration:none;"><strong>${escapeHtml(subjectDisplay)}</strong></a></div>
  ```

### 3.4 Tests

- `tests/actions-page-renderer.test.ts`:
  - Assert metadata line includes `&middot; <formatted size>`.
  - Assert empty subject renders `(no subject)` in clickable link.
- `tests/pending-actions.test.ts`:
  - Test `saveTriageSummaries` and `getTriageSummary` with `sizeKb`.
- `tests/query-pending-threads.test.ts`:
  - Test `queryPendingThreads` extracts `sizeKb` from summary or calculates fallback.
