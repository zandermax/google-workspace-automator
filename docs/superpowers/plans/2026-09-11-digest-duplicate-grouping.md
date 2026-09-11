# Digest Effective Duplicates Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group same or non-meaningfully different emails (such as multiple event reminders) into a single digest entry showing the most recent email normally with a bulleted list of "Effective duplicates" linked to each respective email thread.

**Architecture:** Gemini batch classification returns an optional `duplicateOfId` referencing another email in the batch. A runtime deduplication module validates `duplicateOfId` references against real email IDs in the batch, clusters connected duplicates, selects the most recent email as primary, merges any `actionRequired` flags, and attaches subordinate items as `effectiveDuplicates`. The digest composer then renders these duplicates with subject links in HTML and plain text.

**Tech Stack:** TypeScript, Node.js (`node:test`, `node:assert`), Google Apps Script compatible compilation via Babel/TypeScript.

## Global Constraints

- Runtime stays 100% Google Apps Script compatible; no Node-only runtime dependencies in `src/`.
- Must validate `duplicateOfId` against actual email IDs present in the current batch; invalid or self-referential IDs are ignored.
- Only affects presentation in daily digest; all emails continue to receive normal triage execution (labeling and recycling).
- The most recent email in each cluster (by `email.date` / `ageInDays`) is the primary entry.
- If any member in a duplicate cluster has `actionRequired: true`, the primary item must also have `actionRequired: true`.

---

### Task 1: Update Types for Duplicate References

**Files:**
- Modify: `src/types/Gmail/triage.ts`
- Test: `tests/apps-script-build.test.ts` (type check & build verification)

**Interfaces:**
- Consumes: Existing `TriageClassification` and `TriageExecutionDirective` types.
- Produces:
  ```ts
  export interface EffectiveDuplicateRef {
    threadId: string;
    subject: string;
  }
  ```
  and updated fields:
  - `TriageClassification.duplicateOfId?: string;`
  - `TriageExecutionDirective.effectiveDuplicates?: EffectiveDuplicateRef[];`

- [ ] **Step 1: Write type updates in `src/types/Gmail/triage.ts`**

Add `EffectiveDuplicateRef` interface, add `duplicateOfId?: string` to `TriageClassification`, and add `effectiveDuplicates?: EffectiveDuplicateRef[]` to `TriageExecutionDirective`.

```ts
export interface EffectiveDuplicateRef {
	threadId: string;
	subject: string;
}
```

- [ ] **Step 2: Run build & test to verify type safety**

Run: `npm test`
Expected: PASS (no type errors)

- [ ] **Step 3: Commit**

```bash
git add src/types/Gmail/triage.ts
git commit -m "feat(types): add duplicateOfId and EffectiveDuplicateRef types"
```

---

### Task 2: Update GeminiClient Schema & System Instruction

**Files:**
- Modify: `src/Gmail/GeminiClient.ts`
- Test: `tests/gemini-client.test.ts`

**Interfaces:**
- Consumes: `TriageClassification` with optional `duplicateOfId`.
- Produces: `CLASSIFICATION_RESPONSE_SCHEMA` with optional `duplicateOfId: { type: 'STRING' }` and updated `SYSTEM_INSTRUCTION`.

- [ ] **Step 1: Write the failing test in `tests/gemini-client.test.ts`**

Add a test verifying that `CLASSIFICATION_RESPONSE_SCHEMA` includes `duplicateOfId` and that `SYSTEM_INSTRUCTION` mentions `duplicateOfId`.

```ts
test('Gemini schema and instruction support duplicateOfId', () => {
	const props = CLASSIFICATION_RESPONSE_SCHEMA.items.properties;
	assert.ok('duplicateOfId' in props, 'duplicateOfId must be defined in schema properties');
	assert.ok(SYSTEM_INSTRUCTION.includes('duplicateOfId'), 'SYSTEM_INSTRUCTION must describe duplicateOfId');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/gemini-client.test.ts`
Expected: FAIL (assertion error: `duplicateOfId` not in schema or instruction)

- [ ] **Step 3: Update `src/Gmail/GeminiClient.ts`**

In `CLASSIFICATION_RESPONSE_SCHEMA.items.properties`, add:
```ts
duplicateOfId: {
	type: 'STRING',
},
```
Note: Do not add `duplicateOfId` to `required` array so the model can omit it or return null/empty when not applicable.

In `SYSTEM_INSTRUCTION`, add guidance:
```text
When multiple emails in this batch are the same or not meaningfully different (e.g. repeated reminders or notifications for the exact same event or topic), set "duplicateOfId" to the "id" of the other email it duplicates. If the email is unique or the primary instance, leave "duplicateOfId" empty or omitted.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/gemini-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Gmail/GeminiClient.ts tests/gemini-client.test.ts
git commit -m "feat(gemini): add duplicateOfId to schema and system instructions"
```

---

### Task 3: Implement Deduplication & Clustering Logic

**Files:**
- Create: `src/Gmail/deduplication.ts`
- Test: `tests/deduplication.test.ts`

**Interfaces:**
- Consumes: `TriageExecutionDirective[]` from `src/types/Gmail/triage.ts`.
- Produces: `groupDirectivesByDuplicates(directives: TriageExecutionDirective[]): TriageExecutionDirective[]`.

- [ ] **Step 1: Write comprehensive failing tests in `tests/deduplication.test.ts`**

Cover:
1. Returns identical array when no duplicates exist.
2. Discards `duplicateOfId` that does not match any real email `id` in the batch.
3. Discards self-referential `duplicateOfId === id`.
4. Handles multi-step chains ($C \to B \to A$) and cyclic references ($A \to B \to A$).
5. Selects the most recent email (by `email.date` / `ageInDays`) as primary, regardless of which email had `duplicateOfId`.
6. Attaches subordinate duplicate refs `{ threadId, subject }` to `primary.effectiveDuplicates`.
7. Elevates `actionRequired: true` if an older duplicate had `actionRequired: true`.
8. Preserves original list order among unique clusters.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/deduplication.test.ts`
Expected: FAIL (cannot find module `src/Gmail/deduplication`)

- [ ] **Step 3: Implement `src/Gmail/deduplication.ts`**

Implement `groupDirectivesByDuplicates`:
```ts
import type {
	EffectiveDuplicateRef,
	TriageExecutionDirective,
} from '@/types/Gmail/triage';

export function groupDirectivesByDuplicates(
	directives: TriageExecutionDirective[]
): TriageExecutionDirective[] {
	if (directives.length <= 1) {
		return directives;
	}

	const directiveById = new Map<string, TriageExecutionDirective>();
	for (const d of directives) {
		directiveById.set(d.email.id, d);
	}

	// Adjacency list for connected components
	const adj = new Map<string, Set<string>>();
	for (const d of directives) {
		adj.set(d.email.id, new Set<string>());
	}

	for (const d of directives) {
		const targetId = d.classification.duplicateOfId?.trim();
		if (targetId && targetId !== d.email.id && directiveById.has(targetId)) {
			adj.get(d.email.id)!.add(targetId);
			adj.get(targetId)!.add(d.email.id);
		}
	}

	const visited = new Set<string>();
	const result: TriageExecutionDirective[] = [];

	for (const d of directives) {
		const id = d.email.id;
		if (visited.has(id)) {
			continue;
		}

		// Traverse connected component (cluster)
		const clusterIds: string[] = [];
		const queue: string[] = [id];
		visited.add(id);

		while (queue.length > 0) {
			const curr = queue.shift()!;
			clusterIds.push(curr);
			for (const neighbor of adj.get(curr)!) {
				if (!visited.has(neighbor)) {
					visited.add(neighbor);
					queue.push(neighbor);
				}
			}
		}

		const clusterDirectives = clusterIds.map((cid) => directiveById.get(cid)!);

		if (clusterDirectives.length === 1) {
			result.push(clusterDirectives[0]);
			continue;
		}

		// Sort by recency: newest date first, or smaller ageInDays
		clusterDirectives.sort((a, b) => {
			const dateA = a.email.date ? a.email.date.getTime() : 0;
			const dateB = b.email.date ? b.email.date.getTime() : 0;
			if (dateA !== dateB) {
				return dateB - dateA;
			}
			return a.email.ageInDays - b.email.ageInDays;
		});

		const primary = clusterDirectives[0];
		const duplicates = clusterDirectives.slice(1);

		const effectiveDuplicates: EffectiveDuplicateRef[] = duplicates.map((dup) => ({
			threadId: dup.threadId,
			subject: dup.email.subject,
		}));

		const hasActionRequired = clusterDirectives.some(
			(item) => item.classification.actionRequired
		);

		result.push({
			...primary,
			classification: {
				...primary.classification,
				actionRequired: hasActionRequired,
			},
			effectiveDuplicates,
		});
	}

	return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/deduplication.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Gmail/deduplication.ts tests/deduplication.test.ts
git commit -m "feat(gmail): implement groupDirectivesByDuplicates clustering"
```

---

### Task 4: Render Effective Duplicates in Digest Composer

**Files:**
- Modify: `src/Gmail/digestComposer.ts`
- Test: `tests/digest-composer.test.ts`

**Interfaces:**
- Consumes: `TriageExecutionDirective` with optional `effectiveDuplicates`.
- Produces: Updated HTML output (`composeDigestHtml`) and plain text output (`composeDigestBody`) displaying the duplicates section.

- [ ] **Step 1: Write failing tests in `tests/digest-composer.test.ts`**

Add tests checking:
1. `renderEmailItemHtml` / `composeDigestHtml` renders an `<ul style="...">` with link `buildThreadLink(threadId)` and subject text for each duplicate when `effectiveDuplicates` is present.
2. `renderEmailItem` / `composeDigestBody` renders "Effective duplicates:" with bulleted subjects in plain text.
3. When `effectiveDuplicates` is undefined or empty, no duplicates block is rendered.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/digest-composer.test.ts`
Expected: FAIL (assertion error: "Effective duplicates" not in output)

- [ ] **Step 3: Update `src/Gmail/digestComposer.ts`**

1. In `renderEmailItem`:
```ts
if (directive.effectiveDuplicates && directive.effectiveDuplicates.length > 0) {
	lines.push('   Effective duplicates:');
	for (const dup of directive.effectiveDuplicates) {
		lines.push(`   • ${dup.subject}`);
	}
}
```

2. In `renderEmailItemHtml`:
```ts
let duplicatesHtml = '';
if (directive.effectiveDuplicates && directive.effectiveDuplicates.length > 0) {
	const dupListItems = directive.effectiveDuplicates
		.map(
			(dup) =>
				`<li style="margin:2px 0;"><a href="${buildThreadLink(dup.threadId)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(dup.subject)}</a></li>`
		)
		.join('');
	duplicatesHtml = `<div style="margin-top:6px;font-size:12px;color:#4b5563;">
	<span style="font-weight:600;">Effective duplicates:</span>
	<ul style="margin:2px 0 0 18px;padding:0;color:#374151;">${dupListItems}</ul>
</div>`;
}
```
Place `duplicatesHtml` right before `unsubscribeHtml` in the card item markup.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/digest-composer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Gmail/digestComposer.ts tests/digest-composer.test.ts
git commit -m "feat(digest): render effective duplicates in plain text and html digests"
```

---

### Task 5: Integrate Deduplication into AI Sorter Pipeline & Full Build Verification

**Files:**
- Modify: `src/_s/Gmail/aiSorter.ts`
- Test: `tests/ai-sorter-pipeline.test.ts`

**Interfaces:**
- Consumes: `groupDirectivesByDuplicates` from `src/Gmail/deduplication.ts`.
- Produces: `digestData.entries = groupDirectivesByDuplicates(directives)`.

- [ ] **Step 1: Write an end-to-end pipeline test in `tests/ai-sorter-pipeline.test.ts`**

Add a test simulating two threads from the same sender about the same event reminder where Gemini marks `duplicateOfId`. Verify that:
- `result.processedCount` is 2.
- `result.executionResult.processedCount` is 2.
- The sent digest HTML contains only 1 primary card and has the second email's subject inside the "Effective duplicates" section.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/ai-sorter-pipeline.test.ts`
Expected: FAIL (digest contains 2 cards instead of 1 clustered card)

- [ ] **Step 3: Update `src/_s/Gmail/aiSorter.ts`**

Import `groupDirectivesByDuplicates` from `../../Gmail/deduplication`.
Before creating `digestData`, cluster directives for display:
```ts
const displayEntries = groupDirectivesByDuplicates(directives);

const digestData: DailyDigestData = {
	date: new Date(),
	processedCount: executionResult.processedCount,
	dailyLimit,
	actionRequiredCount,
	autoRecyclingCount,
	isHighVolumeOverflow: cascadeResult.isHighVolumeOverflow,
	isDryRun: dryRun,
	storage: storageMetrics,
	entries: displayEntries,
};
```

- [ ] **Step 4: Run all tests and build**

Run: `npm test`
Expected: PASS all tests, Babel build passes with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/_s/Gmail/aiSorter.ts tests/ai-sorter-pipeline.test.ts
git commit -m "feat(sorter): group effective duplicates in pipeline digest output"
```
