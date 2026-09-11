# Design: Effective Duplicates Grouping in Daily Digest

## 1. Overview
When multiple emails in a daily digest batch represent identical or near-identical communications (such as repeated reminders for the same event, sequential status pings, or duplicate notices), the digest should present them consolidated into a single card rather than cluttering the digest with repetitive entries.

The most recent email in the duplicate cluster is displayed normally as the primary item. Subordinate duplicate emails are listed below it as bullet points under an "Effective duplicates" heading, with their subjects linking directly to their respective Gmail threads.

All emails still have their normal triage actions executed (e.g. labeling, auto-recycling); this change only affects how they are consolidated and displayed within the daily digest.

## 2. Architecture & Data Flow

```
[Cascade Threads]
       │
       ▼
[Snippet Extraction]
       │
       ▼
[Gemini Batch Classification] ──► Sets duplicateOfId (referencing another item's id)
       │
       ▼
[Determine Directives] ──────────► Directives carry duplicateOfId
       │
       ▼
[Execute Triage Actions] ────────► Every thread is labeled/recycled individually as usual
       │
       ▼
[Deduplication / Grouping Pass] ─► Validates duplicateOfId against real IDs in batch;
                                   clusters connected items;
                                   selects most recent email as primary;
                                   attaches subordinate items as effectiveDuplicates
       │
       ▼
[Digest Composer] ───────────────► Renders primary item with bulleted "Effective duplicates" links
```

## 3. Data Structures & Types

### 3.1 Types (`src/types/Gmail/triage.ts`)
```ts
export interface EffectiveDuplicateRef {
  threadId: string;
  subject: string;
}

export interface TriageClassification {
  id: string;
  category: TriageCategory;
  timeSensitive: boolean;
  actionRequired: boolean;
  summary: string;
  highlights: string[];
  keyDetail: string;
  duplicateOfId?: string;
}

export interface TriageExecutionDirective {
  threadId: string;
  classification: TriageClassification;
  email: ExtractedEmailSnippet;
  actionType: TriageActionType;
  triageLabel?: TriageCategory;
  recycleLabel?: 'Auto-Recycle/7d';
  reason: string;
  effectiveDuplicates?: EffectiveDuplicateRef[];
}
```

### 3.2 Gemini Schema & Instruction (`src/Gmail/GeminiClient.ts`)
- In `CLASSIFICATION_RESPONSE_SCHEMA`:
  ```ts
  duplicateOfId: {
    type: 'STRING',
    description: 'If this email is an effective duplicate or non-meaningful variation of another email in this batch (e.g. repeated reminder for the same event), the exact id of that other email. Otherwise omit or empty string.'
  }
  ```
- In `SYSTEM_INSTRUCTION`:
  Add clear instruction:
  "When multiple emails are the same or not meaningfully different (for example multiple reminders or follow-ups for the exact same event/topic), set duplicateOfId to the id of the email it is an effective duplicate of. If it is unique or the canonical version, set duplicateOfId to empty string or null."

## 4. Runtime Validation & Clustering Algorithm

Located in `src/Gmail/deduplication.ts` (or `src/Gmail/digestComposer.ts`):
```ts
export function groupDirectivesByDuplicates(
  directives: TriageExecutionDirective[]
): TriageExecutionDirective[]
```

1. **Validation against real batch IDs:**
   - Gather valid ID set: `const validIds = new Set(directives.map(d => d.email.id));`
   - For each directive, ignore `duplicateOfId` if `duplicateOfId === d.email.id` or `!validIds.has(duplicateOfId)`.

2. **Connected Component Clustering:**
   - Build an undirected graph / disjoint-set (Union-Find) connecting `d.email.id` and its valid `duplicateOfId`.
   - Partition directives into disjoint clusters.

3. **Primary Selection & Hierarchy:**
   - Within each cluster:
     - Sort members by recency: `email.date` descending (or `email.ageInDays` ascending).
     - The first member (most recent email) is chosen as the **primary** directive.
     - Subordinate members are mapped to `EffectiveDuplicateRef`:
       `{ threadId: sub.threadId, subject: sub.email.subject }`
     - If any member of the cluster has `actionRequired === true`, the primary's `classification.actionRequired` is marked `true`.
     - Primary directive gets `effectiveDuplicates` set to these subordinate items.

4. **Return Value:**
   - Returns only the primary directives, preserving their original relative ordering.

## 5. Rendering in Digest

### 5.1 HTML Digest (`src/Gmail/digestComposer.ts`)
In `renderEmailItemHtml`:
If `directive.effectiveDuplicates` has elements:
```html
<div style="margin-top:6px;font-size:12px;color:#4b5563;">
  <span style="font-weight:600;">Effective duplicates:</span>
  <ul style="margin:2px 0 0 18px;padding:0;color:#374151;">
    <li style="margin:2px 0;">
      <a href="https://mail.google.com/mail/u/0/#all/${dup.threadId}" style="color:#2563eb;text-decoration:none;">${escapeHtml(dup.subject)}</a>
    </li>
  </ul>
</div>
```

### 5.2 Plain-Text Digest (`src/Gmail/digestComposer.ts`)
In `renderEmailItem`:
```text
   Effective duplicates:
   • Subject 1
   • Subject 2
```

## 6. Integration Points
- `src/_s/Gmail/aiSorter.ts`:
  - Actions execute on all raw directives (`executionResult = executeTriageActions(directives, ...)`).
  - Storage stats compute on all raw directives (`getStorageMetrics(directives, ...)`).
  - Before building `digestData.entries`, cluster them:
    `const displayEntries = groupDirectivesByDuplicates(directives);`
    `digestData.entries = displayEntries;`
  - Note: `processedCount` accurately reports total processed emails from `executionResult`.

## 7. Testing Strategy
1. **Validation & Clustering Unit Tests (`tests/deduplication.test.ts`):**
   - Discards `duplicateOfId` pointing to nonexistent ID.
   - Discards self-referential `duplicateOfId`.
   - Handles multi-node chains ($C \to B \to A$) and cycles ($A \to B \to A$).
   - Selects the most recent email as primary.
   - Correctly propagates `actionRequired: true` if an older duplicate had action required.
2. **Digest Composer Unit Tests (`tests/digest-composer.test.ts`):**
   - Asserts HTML rendering contains "Effective duplicates:" section with bulleted links.
   - Asserts plain-text rendering contains bulleted duplicate subjects.
   - Asserts items without duplicates do not render any "Effective duplicates" markup.
3. **Pipeline E2E Test (`tests/ai-sorter-pipeline.test.ts`):**
   - Simulates batch where 2 emails are duplicate reminders; verifies the final digest contains 1 primary card with 1 effective duplicate link, and all underlying action counts remain accurate.
