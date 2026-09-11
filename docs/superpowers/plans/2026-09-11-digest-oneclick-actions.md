# Digest One-Click Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single Actions Page (Apps Script Web App) linked at the top of the daily digest that lists every thread still awaiting triage and lets the user Archive or Delete it with one real click, backed by a persistent Gmail label so nothing is silently lost and the open backlog never grows past `DAILY_LIMIT`.

**Architecture:** Every processed thread gets a durable `Digest/Pending-Action` label in addition to its existing category/recycle labels. A new Web App (`doGet`, deployed with `access: MYSELF`) queries Gmail live for that label, groups results by category, and renders Archive/Delete buttons wired via `google.script.run`. The digest pipeline computes remaining backlog capacity before selecting new threads to process each run, and sends a minimal digest (skipping classification entirely) once the backlog is already at capacity.

**Tech Stack:** TypeScript, Node.js (`node:test`, `node:assert`), Google Apps Script compatible compilation via Babel/TypeScript, `clasp`.

## Global Constraints

- Runtime stays 100% Google Apps Script compatible for everything under `src/`; only `scripts/` (Node-only CLI tooling, never deployed) may use Node built-ins like global `fetch`.
- Label name is exactly `Digest/Pending-Action`; applied to every non-dry-run processed thread, across all triage categories (including ones also getting `Auto-Recycle/7d`).
- `DAILY_LIMIT` becomes the steady-state ceiling on total open (`Digest/Pending-Action`-labeled) backlog, not just a per-run new-item quota: each run only pulls in `max(0, DAILY_LIMIT - pendingCount)` new threads.
- When `pendingCount >= DAILY_LIMIT`, skip cascade selection, Gemini classification, labeling, and storage-metrics gathering entirely; send a minimal digest instead.
- No "Mark Read" action anywhere — only Archive and Delete.
- No signed/expiring tokens or shared secrets (no `DIGEST_KEY`). Access control is exclusively `appsscript.json`'s `webapp.access: "MYSELF"` + `webapp.executeAs: "USER_DEPLOYING"`.
- Actions Page groups pending items by category (mirroring the digest's own sections); per-item Archive/Delete buttons only, no bulk actions.
- Follow existing dependency-injection conventions (`StorageProvider`, `EmailSender`, `SearchFunction<T>`) for anything touching `GmailApp`/`ScriptApp`/`ScriptApp`, so all new logic is unit-testable without the real Apps Script runtime.

---

### Task 1: Persistent `Digest/Pending-Action` Label on Every Processed Thread

**Files:**
- Modify: `src/Gmail/actionRules.ts`
- Modify: `src/Gmail/actionExecutor.ts`
- Test: `tests/sorter-cascade-executor.test.ts`

**Interfaces:**
- Consumes: existing `ensureLabel`/`getLabel`/`createLabel` machinery already in `executeTriageActions`.
- Produces: `export const PENDING_ACTION_LABEL = 'Digest/Pending-Action' as const;` from `src/Gmail/actionRules.ts`, consumed by Task 2, Task 6, and Task 8.

- [ ] **Step 1: Update the existing live-execution test to expect the new label, and add a dedicated recycle-only test (both will fail)**

In `tests/sorter-cascade-executor.test.ts`, update the `deepEqual` assertion in `executeTriageActions live mode applies labels, marks processed, and respects dailyLimit` (the test using `th-1`/`th-2`/`th-3` directives) to expect `Digest/Pending-Action` applied to every processed thread, in addition to its existing labels:

```ts
	assert.deepEqual(labelsApplied, [
		{ label: 'triage/personal', threadId: 'th-1' },
		{ label: 'Digest/Pending-Action', threadId: 'th-1' },
		{ label: 'triage/newsletters', threadId: 'th-2' },
		{ label: 'Auto-Recycle/7d', threadId: 'th-2' },
		{ label: 'Digest/Pending-Action', threadId: 'th-2' },
	]);
```

Then add a new test at the end of the file confirming a `recycle-7d-only` directive (no `triageLabel`) still receives the pending label:

```ts
test('executeTriageActions applies Digest/Pending-Action to every processed thread, including recycle-7d-only', () => {
	const labelsApplied: Array<{ label: string; threadId: string }> = [];
	const mockLabels = new Map<string, LabelLike>();
	const getOrCreateLabel = (name: string): LabelLike => {
		let l = mockLabels.get(name);
		if (!l) {
			l = {
				getName: () => name,
				addToThread: (t: any) => {
					labelsApplied.push({ label: name, threadId: t.getId() });
				},
			};
			mockLabels.set(name, l);
		}
		return l;
	};

	const directive = {
		threadId: 'th-recycle',
		classification: {
			id: 'th-recycle',
			category: 'triage/junk',
			timeSensitive: true,
			actionRequired: false,
			summary: '',
			highlights: [],
			keyDetail: '',
		} as TriageClassification,
		email: { id: 'th-recycle' } as ExtractedEmailSnippet,
		actionType: 'recycle-7d-only' as const,
		recycleLabel: 'Auto-Recycle/7d' as const,
		reason: 'stale junk',
	};

	executeTriageActions([directive], {
		dryRun: false,
		getLabel: (name) => mockLabels.get(name) ?? null,
		createLabel: (name) => getOrCreateLabel(name),
		resolveThread: (id) => createMockThread(id),
		markProcessed: () => {},
	});

	assert.deepEqual(labelsApplied, [
		{ label: 'Auto-Recycle/7d', threadId: 'th-recycle' },
		{ label: 'Digest/Pending-Action', threadId: 'th-recycle' },
	]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test tests/sorter-cascade-executor.test.ts`
Expected: FAIL (assertion mismatches — `Digest/Pending-Action` not yet applied)

- [ ] **Step 3: Add the label constant**

In `src/Gmail/actionRules.ts`, add next to `AUTO_RECYCLE_LABEL`:

```ts
export const AUTO_RECYCLE_LABEL = 'Auto-Recycle/7d' as const;
export const PENDING_ACTION_LABEL = 'Digest/Pending-Action' as const;
```

- [ ] **Step 4: Apply the label unconditionally to every processed thread in `executeTriageActions`**

In `src/Gmail/actionExecutor.ts`, import the constant:

```ts
import { labelProcessed } from './actions/labelAsProcessed';
import { DAILY_LIMIT } from './cascadeSelection';
import { PENDING_ACTION_LABEL } from './actionRules';
import { type TriageExecutionDirective } from '@/types/Gmail/triage';
```

Then, in the live-execution branch, after the existing `recycleLabel` block and before `mutatedThreads.push(thread);`, add:

```ts
		if (directive.recycleLabel) {
			const label = ensureLabel(directive.recycleLabel);
			label.addToThread(thread);
			recycledCount += 1;
		}

		const pendingLabel = ensureLabel(PENDING_ACTION_LABEL);
		pendingLabel.addToThread(thread);

		mutatedThreads.push(thread);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --import tsx --test tests/sorter-cascade-executor.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/Gmail/actionRules.ts src/Gmail/actionExecutor.ts tests/sorter-cascade-executor.test.ts
git commit -m "feat(gmail): apply Digest/Pending-Action label to every processed thread"
```

---

### Task 2: Pending Backlog Count Helper

**Files:**
- Create: `src/Gmail/pendingActions.ts`
- Test: `tests/pending-actions.test.ts`

**Interfaces:**
- Consumes: `PENDING_ACTION_LABEL` from `src/Gmail/actionRules.ts` (Task 1).
- Produces: `PendingCountProvider` interface and `getPendingActionCount(provider?: PendingCountProvider): number`, consumed by Task 5 (`aiSorter.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/pending-actions.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getPendingActionCount } from '../src/Gmail/pendingActions';

test('getPendingActionCount delegates to the injected provider', () => {
	const count = getPendingActionCount({ countPending: () => 7 });
	assert.equal(count, 7);
});

test('getPendingActionCount returns zero when nothing is pending', () => {
	const count = getPendingActionCount({ countPending: () => 0 });
	assert.equal(count, 0);
});

test('getPendingActionCount throws a clear error when GmailApp is unavailable and no provider is given', () => {
	assert.throws(() => getPendingActionCount(), /GmailApp is not available/u);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/pending-actions.test.ts`
Expected: FAIL with "Cannot find module '../src/Gmail/pendingActions'"

- [ ] **Step 3: Implement `src/Gmail/pendingActions.ts`**

```ts
import { PENDING_ACTION_LABEL } from './actionRules';

export interface PendingCountProvider {
	countPending(): number;
}

const defaultPendingCountProvider: PendingCountProvider = {
	countPending(): number {
		if (typeof GmailApp === 'undefined') {
			throw new Error('GmailApp is not available in this environment.');
		}

		return GmailApp.search(`label:"${PENDING_ACTION_LABEL}" -in:trash`).length;
	},
};

export const getPendingActionCount = (
	provider: PendingCountProvider = defaultPendingCountProvider
): number => provider.countPending();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/pending-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Gmail/pendingActions.ts tests/pending-actions.test.ts
git commit -m "feat(gmail): add getPendingActionCount backlog helper"
```

---

### Task 3: `actionsPageUrl` Field and Digest Link Rendering

**Files:**
- Modify: `src/types/Gmail/triage.ts`
- Modify: `src/Gmail/digestComposer.ts`
- Test: `tests/digest-composer.test.ts`

**Interfaces:**
- Consumes: existing `DailyDigestData`, `composeDigestBody`, `composeDigestHtml`.
- Produces: `DailyDigestData.actionsPageUrl: string` (required field), consumed by Task 4 and Task 5.

- [ ] **Step 1: Add `actionsPageUrl` to every `DailyDigestData` literal in the test file, plus two new failing assertions**

In `tests/digest-composer.test.ts`, add near the top of the file (after existing imports):

```ts
const TEST_ACTIONS_URL = 'https://script.google.com/macros/s/test-deployment/exec';
```

Then, in **every** `const data: DailyDigestData = { ... }` object literal in this file (there are 7), add `actionsPageUrl: TEST_ACTIONS_URL,` immediately after the `isDryRun: ...,` line. For example:

```ts
	const data: DailyDigestData = {
		date,
		processedCount: 3,
		dailyLimit: 50,
		actionRequiredCount: 1,
		autoRecyclingCount: 1,
		isHighVolumeOverflow: false,
		isDryRun: false,
		actionsPageUrl: TEST_ACTIONS_URL,
		storage: {
			gmailUsedBytes: 4 * 1024 * 1024 * 1024,
			gmailTotalBytes: 15 * 1024 * 1024 * 1024,
			driveFreeBytes: 11 * 1024 * 1024 * 1024,
			estimatedRecycleBytes: 1200 * 1024,
		},
		entries: [d1, d2, d3],
	};
```

Apply the same single-line insertion to the other 6 literals in the file (they follow the identical `isDryRun: <value>,` → `storage: {` shape).

Then add two new tests at the end of the file:

```ts
test('composeDigestBody includes the Actions Page link near the top', () => {
	const data: DailyDigestData = {
		date: new Date('2026-09-11'),
		processedCount: 0,
		dailyLimit: 50,
		actionRequiredCount: 0,
		autoRecyclingCount: 0,
		isHighVolumeOverflow: false,
		isDryRun: false,
		actionsPageUrl: TEST_ACTIONS_URL,
		storage: { gmailUsedBytes: 0, gmailTotalBytes: 0, estimatedRecycleBytes: 0 },
		entries: [],
	};

	const body = composeDigestBody(data);
	assert.ok(body.includes(`Review & take action: ${TEST_ACTIONS_URL}`));
});

test('composeDigestHtml renders the Actions Page link as a larger-font link that opens in a new tab', () => {
	const data: DailyDigestData = {
		date: new Date('2026-09-11'),
		processedCount: 0,
		dailyLimit: 50,
		actionRequiredCount: 0,
		autoRecyclingCount: 0,
		isHighVolumeOverflow: false,
		isDryRun: false,
		actionsPageUrl: TEST_ACTIONS_URL,
		storage: { gmailUsedBytes: 0, gmailTotalBytes: 0, estimatedRecycleBytes: 0 },
		entries: [],
	};

	const html = composeDigestHtml(data);
	assert.ok(html.includes(`href="${TEST_ACTIONS_URL}"`));
	assert.ok(html.includes('target="_blank"'));
	assert.ok(html.includes('font-size:17px'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test tests/digest-composer.test.ts`
Expected: FAIL (TypeScript error: `actionsPageUrl` does not exist on type `DailyDigestData`, plus the two new assertions fail)

- [ ] **Step 3: Add `actionsPageUrl` to the type**

In `src/types/Gmail/triage.ts`, update `DailyDigestData`:

```ts
export interface DailyDigestData {
	date: Date;
	processedCount: number;
	dailyLimit: number;
	actionRequiredCount: number;
	autoRecyclingCount: number;
	isHighVolumeOverflow: boolean;
	isDryRun: boolean;
	actionsPageUrl: string;
	storage: StorageMetrics;
	entries: TriageExecutionDirective[];
}
```

- [ ] **Step 4: Render the link in `composeDigestBody`**

In `src/Gmail/digestComposer.ts`, update the header section of `composeDigestBody`:

```ts
	lines.push(headerTitle);
	lines.push(`👉 Review & take action: ${data.actionsPageUrl}`);

	const spaceFreedStr = formatMegabytes(data.storage.estimatedRecycleBytes);
```

- [ ] **Step 5: Render the link in `composeDigestHtml`**

In `src/Gmail/digestComposer.ts`, update the closing return template of `composeDigestHtml`:

```ts
	return `<div style="font-family:${HTML_FONT_STACK};font-size:14px;line-height:1.5;color:#1f2937;max-width:640px;margin:0 auto;">
	<div style="font-size:20px;font-weight:700;margin-bottom:4px;">${escapeHtml(headerTitle)}</div>
	<div style="margin-bottom:12px;"><a href="${escapeHtml(data.actionsPageUrl)}" target="_blank" rel="noopener" style="font-size:17px;font-weight:600;color:#2563eb;text-decoration:none;">👉 Review &amp; Take Action →</a></div>
	<div style="font-size:13px;color:#6b7280;margin-bottom:16px;">Processed: ${data.processedCount} / ${data.dailyLimit} &nbsp;·&nbsp; Action needed: ${data.actionRequiredCount} &nbsp;·&nbsp; Auto-recycling: ${data.autoRecyclingCount} &nbsp;·&nbsp; Space freed: ${spaceFreedStr}</div>
	${storageHtml}
	${overflowHtml}
	${sections.join('')}
	${recyclingFooterHtml}
	${emptyStateHtml}
</div>`;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --import tsx --test tests/digest-composer.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/types/Gmail/triage.ts src/Gmail/digestComposer.ts tests/digest-composer.test.ts
git commit -m "feat(digest): render Actions Page link at the top of the digest"
```

---

### Task 4: Actions Page URL Provider and Pipeline Wiring

**Files:**
- Create: `src/Gmail/actionsPageUrlProvider.ts`
- Modify: `src/_s/Gmail/aiSorter.ts`
- Test: `tests/ai-sorter-pipeline.test.ts`

**Interfaces:**
- Consumes: `DailyDigestData.actionsPageUrl` (Task 3).
- Produces: `ActionsPageUrlProvider` interface and `getActionsPageUrl(provider?): string`, and `AiSorterPipelineOptions.actionsPageUrlProvider`, consumed by Task 5.

- [ ] **Step 1: Write the failing test**

In `tests/ai-sorter-pipeline.test.ts`, update the first test (`runAiSorterPipeline dry run executes complete pipeline without mutations and produces digest`) to pass an `actionsPageUrlProvider` and assert the link appears in the sent email:

```ts
	const result = runAiSorterPipeline({
		dryRun: true,
		dailyLimit: 10,
		geminiClient,
		actionsPageUrlProvider: {
			getActionsPageUrl: () => 'https://script.google.com/macros/s/test-deployment/exec',
		},
		search: (query) => {
			if (query === CASCADE_QUERIES.unreadInbox) {
				return [t1, t2];
			}
			return [];
		},
		storageProvider: {
			getStorageUsed: () => 2 * 1024 * 1024 * 1024,
			getStorageLimit: () => 15 * 1024 * 1024 * 1024,
		},
		recipient: 'owner@example.com',
		emailSender: {
			sendEmail: (recipient, subject, body) => {
				sentEmail = { recipient, subject, body };
			},
		},
	});
```

Then add an assertion after the existing ones:

```ts
	assert.ok(
		sentEmail?.body.includes(
			'https://script.google.com/macros/s/test-deployment/exec'
		)
	);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/ai-sorter-pipeline.test.ts`
Expected: FAIL (TypeScript error: `actionsPageUrlProvider` does not exist on `AiSorterPipelineOptions`)

- [ ] **Step 3: Implement `src/Gmail/actionsPageUrlProvider.ts`**

```ts
export interface ActionsPageUrlProvider {
	getActionsPageUrl(): string;
}

const defaultActionsPageUrlProvider: ActionsPageUrlProvider = {
	getActionsPageUrl(): string {
		if (typeof ScriptApp === 'undefined' || !ScriptApp.getService) {
			throw new Error('ScriptApp is not available in this environment.');
		}

		return ScriptApp.getService().getUrl();
	},
};

export const getActionsPageUrl = (
	provider: ActionsPageUrlProvider = defaultActionsPageUrlProvider
): string => provider.getActionsPageUrl();
```

- [ ] **Step 4: Wire the provider into `runAiSorterPipeline`**

In `src/_s/Gmail/aiSorter.ts`, add the import:

```ts
import { getActionsPageUrl, type ActionsPageUrlProvider } from '../../Gmail/actionsPageUrlProvider';
```

Add the option to `AiSorterPipelineOptions`:

```ts
export interface AiSorterPipelineOptions {
	dryRun?: boolean;
	dailyLimit?: number;
	staleDaysThreshold?: number;
	geminiApiKey?: string;
	geminiModel?: string;
	geminiClient?: GeminiClient;
	search?: SearchFunction<ThreadLike>;
	storageProvider?: StorageProvider;
	emailSender?: EmailSender;
	recipient?: string;
	random?: () => number;
	actionsPageUrlProvider?: ActionsPageUrlProvider;
}
```

Inside `runAiSorterPipeline`, compute the URL right after the initial `Logger.log` start message:

```ts
	const actionsPageUrl = getActionsPageUrl(options.actionsPageUrlProvider);

	// 1. Fetch cascade selection
```

Finally, add `actionsPageUrl` to the `digestData` object literal:

```ts
	const digestData: DailyDigestData = {
		date: new Date(),
		processedCount: executionResult.processedCount,
		dailyLimit,
		actionRequiredCount,
		autoRecyclingCount,
		isHighVolumeOverflow: cascadeResult.isHighVolumeOverflow,
		isDryRun: dryRun,
		actionsPageUrl,
		storage: storageMetrics,
		entries: displayEntries,
	};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test tests/ai-sorter-pipeline.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/Gmail/actionsPageUrlProvider.ts src/_s/Gmail/aiSorter.ts tests/ai-sorter-pipeline.test.ts
git commit -m "feat(gmail): wire Actions Page URL into the digest pipeline"
```

---

### Task 5: Backlog-Aware Processing Cap and Minimal Digest

**Files:**
- Modify: `src/Gmail/digestComposer.ts`
- Modify: `src/Gmail/actions/sendDigest.ts`
- Modify: `src/_s/Gmail/aiSorter.ts`
- Test: `tests/digest-composer.test.ts`
- Test: `tests/ai-sorter-pipeline.test.ts`

**Interfaces:**
- Consumes: `getPendingActionCount` (Task 2), `getActionsPageUrl` (Task 4).
- Produces: `composeBacklogOnlyDigestSubject`, `composeBacklogOnlyDigestBody`, `composeBacklogOnlyDigestHtml` (from `digestComposer.ts`), and `sendBacklogOnlyDigest` (from `sendDigest.ts`).

- [ ] **Step 1: Write failing tests for the new compose functions**

Add to `tests/digest-composer.test.ts`:

```ts
test('composeBacklogOnlyDigestSubject reports pending count and no new items', () => {
	const subject = composeBacklogOnlyDigestSubject(new Date('2026-09-11'), 12, false);
	assert.equal(subject, '📬 Daily Email Digest — 2026-09-11 — 12 pending, none new');
});

test('composeBacklogOnlyDigestSubject prefixes DRY RUN when applicable', () => {
	const subject = composeBacklogOnlyDigestSubject(new Date('2026-09-11'), 1, true);
	assert.ok(subject.startsWith('[DRY RUN]'));
});

test('composeBacklogOnlyDigestBody includes pending count and the Actions Page link', () => {
	const body = composeBacklogOnlyDigestBody(3, TEST_ACTIONS_URL);
	assert.ok(body.includes('3 items pending your review'));
	assert.ok(body.includes(`👉 Review & take action: ${TEST_ACTIONS_URL}`));
});

test('composeBacklogOnlyDigestBody uses singular phrasing for exactly one pending item', () => {
	const body = composeBacklogOnlyDigestBody(1, TEST_ACTIONS_URL);
	assert.ok(body.includes('1 item pending your review'));
});

test('composeBacklogOnlyDigestHtml renders the pending count and a new-tab Actions Page link', () => {
	const html = composeBacklogOnlyDigestHtml(3, TEST_ACTIONS_URL);
	assert.ok(html.includes('3 items pending your review'));
	assert.ok(html.includes(`href="${TEST_ACTIONS_URL}"`));
	assert.ok(html.includes('target="_blank"'));
});
```

Add the corresponding imports at the top of the test file:

```ts
import {
	composeDigestSubject,
	composeDigestBody,
	composeDigestHtml,
	composeBacklogOnlyDigestSubject,
	composeBacklogOnlyDigestBody,
	composeBacklogOnlyDigestHtml,
} from '../src/Gmail/digestComposer';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test tests/digest-composer.test.ts`
Expected: FAIL (functions do not exist)

- [ ] **Step 3: Implement the compose functions**

In `src/Gmail/digestComposer.ts`, add after `composeDigestSubject`:

```ts
export const composeBacklogOnlyDigestSubject = (
	date: Date,
	pendingCount: number,
	isDryRun = false
): string => {
	const dateStr = formatIsoDate(date);
	const base = `📬 Daily Email Digest — ${dateStr} — ${pendingCount} pending, none new`;
	return isDryRun ? `[DRY RUN] ${base}` : base;
};

const pendingCountPhrase = (pendingCount: number): string =>
	`${pendingCount} item${pendingCount === 1 ? '' : 's'} pending your review`;

export const composeBacklogOnlyDigestBody = (
	pendingCount: number,
	actionsPageUrl: string
): string =>
	[
		`No new emails processed — ${pendingCountPhrase(pendingCount)}.`,
		`👉 Review & take action: ${actionsPageUrl}`,
	].join('\n');

export const composeBacklogOnlyDigestHtml = (
	pendingCount: number,
	actionsPageUrl: string
): string => `<div style="font-family:${HTML_FONT_STACK};font-size:14px;line-height:1.5;color:#1f2937;max-width:640px;margin:0 auto;">
	<div style="font-size:16px;margin-bottom:12px;">No new emails processed — ${pendingCountPhrase(pendingCount)}.</div>
	<div><a href="${escapeHtml(actionsPageUrl)}" target="_blank" rel="noopener" style="font-size:17px;font-weight:600;color:#2563eb;text-decoration:none;">👉 Review &amp; Take Action →</a></div>
</div>`;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test tests/digest-composer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the compose functions**

```bash
git add src/Gmail/digestComposer.ts tests/digest-composer.test.ts
git commit -m "feat(digest): add minimal backlog-only digest composers"
```

- [ ] **Step 6: Write the failing full-pipeline test for the backlog-cap branch**

Add to `tests/ai-sorter-pipeline.test.ts`:

```ts
test('runAiSorterPipeline skips new processing and sends a minimal digest when backlog is already at capacity', () => {
	let sentEmail: { recipient: string; subject: string; body: string } | null = null;
	let searchWasCalled = false;
	let geminiWasCalled = false;

	const geminiClient = new GeminiClient({
		apiKey: 'test-key',
		transport: {
			fetch: () => {
				geminiWasCalled = true;
				return createMockGeminiTransport([]).fetch('', {});
			},
		},
	});

	const result = runAiSorterPipeline({
		dryRun: false,
		dailyLimit: 5,
		geminiClient,
		pendingCountProvider: { countPending: () => 5 },
		actionsPageUrlProvider: {
			getActionsPageUrl: () => 'https://script.google.com/macros/s/test-deployment/exec',
		},
		search: () => {
			searchWasCalled = true;
			return [];
		},
		recipient: 'owner@example.com',
		emailSender: {
			sendEmail: (recipient, subject, body) => {
				sentEmail = { recipient, subject, body };
			},
		},
	});

	assert.equal(result.processedCount, 0);
	assert.equal(searchWasCalled, false);
	assert.equal(geminiWasCalled, false);
	assert.ok(sentEmail !== null);
	assert.ok(sentEmail?.subject.includes('5 pending, none new'));
	assert.ok(
		sentEmail?.body.includes(
			'https://script.google.com/macros/s/test-deployment/exec'
		)
	);
});

test('runAiSorterPipeline only requests remaining capacity when some backlog already exists', () => {
	const t1 = createMockThread('thread-1', 'Lunch tomorrow', 'friend@example.com', 'Are we still on for lunch?');
	let requestedLimit = -1;

	const geminiClient = new GeminiClient({
		apiKey: 'test-key',
		transport: createMockGeminiTransport([
			{
				id: 'thread-1',
				category: 'triage/personal',
				timeSensitive: false,
				actionRequired: false,
				summary: 'Lunch tomorrow inquiry.',
				highlights: [],
				keyDetail: '',
			},
		]),
	});

	runAiSorterPipeline({
		dryRun: true,
		dailyLimit: 10,
		geminiClient,
		pendingCountProvider: { countPending: () => 7 },
		actionsPageUrlProvider: { getActionsPageUrl: () => 'https://example.com/exec' },
		search: (query, _start, max) => {
			requestedLimit = max;
			if (query === CASCADE_QUERIES.unreadInbox) {
				return [t1];
			}
			return [];
		},
		storageProvider: { getStorageUsed: () => 0, getStorageLimit: () => 0 },
		emailSender: { sendEmail: () => {} },
	});

	assert.equal(requestedLimit, 3);
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `node --import tsx --test tests/ai-sorter-pipeline.test.ts`
Expected: FAIL (`pendingCountProvider` does not exist on `AiSorterPipelineOptions`; cascade selection still requests the full `dailyLimit`)

- [ ] **Step 8: Add `sendBacklogOnlyDigest` to `sendDigest.ts`**

In `src/Gmail/actions/sendDigest.ts`, export `resolveRecipient` (drop the `const`, add `export`) and add the new function plus its imports:

```ts
import {
	type DailyDigestData,
} from '@/types/Gmail/triage';
import {
	composeDigestBody,
	composeDigestHtml,
	composeDigestSubject,
	composeBacklogOnlyDigestBody,
	composeBacklogOnlyDigestHtml,
	composeBacklogOnlyDigestSubject,
} from '../digestComposer';
```

```ts
export const resolveRecipient = (explicitRecipient?: string): string => {
```

Add after `sendDigest`:

```ts
export interface SendBacklogOnlyDigestOptions extends SendDigestOptions {
	date?: Date;
	isDryRun?: boolean;
}

export interface SendBacklogOnlyDigestResult {
	recipient: string;
	subject: string;
	body: string;
}

export const sendBacklogOnlyDigest = (
	pendingCount: number,
	actionsPageUrl: string,
	options: SendBacklogOnlyDigestOptions = {}
): SendBacklogOnlyDigestResult => {
	const recipient = resolveRecipient(options.recipient);
	const date = options.date ?? new Date();
	const isDryRun = options.isDryRun ?? false;
	const subject = composeBacklogOnlyDigestSubject(date, pendingCount, isDryRun);
	const body = composeBacklogOnlyDigestBody(pendingCount, actionsPageUrl);
	const htmlBody = composeBacklogOnlyDigestHtml(pendingCount, actionsPageUrl);
	const sender = options.emailSender ?? defaultEmailSender;

	sender.sendEmail(recipient, subject, body, { htmlBody });

	if (typeof Logger !== 'undefined') {
		Logger.log(`Sent backlog-only digest to ${recipient}: "${subject}"`);
	}

	return { recipient, subject, body };
};
```

- [ ] **Step 9: Wire the backlog-aware cap into `runAiSorterPipeline`**

In `src/_s/Gmail/aiSorter.ts`, add imports:

```ts
import { getPendingActionCount, type PendingCountProvider } from '../../Gmail/pendingActions';
import { sendBacklogOnlyDigest } from '../../Gmail/actions/sendDigest';
```

Add `pendingCountProvider` to `AiSorterPipelineOptions`:

```ts
	actionsPageUrlProvider?: ActionsPageUrlProvider;
	pendingCountProvider?: PendingCountProvider;
}
```

Replace the existing `const actionsPageUrl = getActionsPageUrl(options.actionsPageUrlProvider);` line (added in Task 4) and the `// 1. Fetch cascade selection` block right after it with the following — this inserts the capacity check/early-return in between, and changes the cascade selection's `limit` from `dailyLimit` to `remainingCapacity`:

```ts
	const actionsPageUrl = getActionsPageUrl(options.actionsPageUrlProvider);
	const pendingCount = getPendingActionCount(options.pendingCountProvider);
	const remainingCapacity = Math.max(0, dailyLimit - pendingCount);

	if (remainingCapacity === 0) {
		if (typeof Logger !== 'undefined') {
			Logger.log(
				`Backlog (${pendingCount}) already at or above daily limit (${dailyLimit}); skipping new processing.`
			);
		}

		const digestResult = sendBacklogOnlyDigest(pendingCount, actionsPageUrl, {
			recipient: options.recipient,
			emailSender: options.emailSender,
			isDryRun: dryRun,
		});

		return {
			processedCount: 0,
			actionRequiredCount: 0,
			autoRecyclingCount: 0,
			isHighVolumeOverflow: false,
			isDryRun: dryRun,
			executionResult: {
				processedCount: 0,
				labeledCount: 0,
				recycledCount: 0,
				skippedCount: 0,
				isDryRun: dryRun,
				directives: [],
			},
			digestSubject: digestResult.subject,
		};
	}

	// 1. Fetch cascade selection
	const cascadeResult = selectCascadeThreads<ThreadLike>({
		limit: remainingCapacity,
		search: options.search,
		random: options.random,
	});
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `node --import tsx --test tests/ai-sorter-pipeline.test.ts`
Expected: PASS

- [ ] **Step 11: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add src/Gmail/actions/sendDigest.ts src/_s/Gmail/aiSorter.ts tests/ai-sorter-pipeline.test.ts
git commit -m "feat(gmail): cap new processing to remaining backlog capacity"
```

---

### Task 6: Actions Page Data Query

**Files:**
- Create: `src/Gmail/queryPendingThreads.ts`
- Test: `tests/query-pending-threads.test.ts`

**Interfaces:**
- Consumes: `PENDING_ACTION_LABEL` (Task 1), `TRIAGE_CATEGORIES`/`TriageCategory` from `@/types/Gmail/triage`.
- Produces: `PendingItem`, `queryPendingThreads(search?, now?): PendingItem[]`, `groupPendingItemsByCategory(items): PendingItemGroup[]`, consumed by Task 8.

- [ ] **Step 1: Write the failing test**

Create `tests/query-pending-threads.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
	queryPendingThreads,
	groupPendingItemsByCategory,
	type PendingThreadLike,
} from '../src/Gmail/queryPendingThreads';

const createThread = (
	id: string,
	subject: string,
	sender: string,
	labels: string[],
	lastMessageDate: Date
): PendingThreadLike => ({
	getId: () => id,
	getFirstMessageSubject: () => subject,
	getLastMessageDate: () => lastMessageDate,
	getLabels: () => labels.map((name) => ({ getName: () => name })),
	getMessages: () => [{ getFrom: () => sender }],
});

test('queryPendingThreads resolves category from thread labels and computes age in days', () => {
	const now = new Date('2026-09-11T00:00:00Z');
	const thread = createThread(
		't-1',
		'Invoice due',
		'billing@service.com',
		['triage/finance', 'Digest/Pending-Action'],
		new Date('2026-09-08T00:00:00Z')
	);

	const items = queryPendingThreads(() => [thread], now);

	assert.deepEqual(items, [
		{
			threadId: 't-1',
			category: 'triage/finance',
			subject: 'Invoice due',
			sender: 'billing@service.com',
			ageInDays: 3,
		},
	]);
});

test('queryPendingThreads falls back to triage/unknown when no category label is present', () => {
	const now = new Date('2026-09-11T00:00:00Z');
	const thread = createThread(
		't-2',
		'Mystery mail',
		'someone@example.com',
		['Digest/Pending-Action'],
		now
	);

	const items = queryPendingThreads(() => [thread], now);
	assert.equal(items[0].category, 'triage/unknown');
	assert.equal(items[0].ageInDays, 0);
});

test('queryPendingThreads sorts oldest first', () => {
	const now = new Date('2026-09-11T00:00:00Z');
	const newer = createThread('newer', 'Newer', 'a@b.com', ['triage/personal'], new Date('2026-09-10T00:00:00Z'));
	const older = createThread('older', 'Older', 'a@b.com', ['triage/personal'], new Date('2026-09-01T00:00:00Z'));

	const items = queryPendingThreads(() => [newer, older], now);
	assert.deepEqual(items.map((i) => i.threadId), ['older', 'newer']);
});

test('groupPendingItemsByCategory groups by category in TRIAGE_CATEGORIES order and omits empty categories', () => {
	const now = new Date('2026-09-11T00:00:00Z');
	const items = queryPendingThreads(
		() => [
			createThread('t-newsletter', 'News', 'a@b.com', ['triage/newsletters'], now),
			createThread('t-personal', 'Hi', 'a@b.com', ['triage/personal'], now),
		],
		now
	);

	const groups = groupPendingItemsByCategory(items);
	assert.deepEqual(
		groups.map((g) => g.category),
		['triage/personal', 'triage/newsletters']
	);
	assert.equal(groups[0].items.length, 1);
	assert.equal(groups[1].items.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/query-pending-threads.test.ts`
Expected: FAIL with "Cannot find module '../src/Gmail/queryPendingThreads'"

- [ ] **Step 3: Implement `src/Gmail/queryPendingThreads.ts`**

```ts
import {
	TRIAGE_CATEGORIES,
	type TriageCategory,
} from '@/types/Gmail/triage';
import { PENDING_ACTION_LABEL } from './actionRules';

export interface PendingThreadLike {
	getId(): string;
	getFirstMessageSubject(): string;
	getLastMessageDate(): Date;
	getLabels(): Array<{ getName(): string }>;
	getMessages(): Array<{ getFrom(): string }>;
}

export interface PendingItem {
	threadId: string;
	category: TriageCategory;
	subject: string;
	sender: string;
	ageInDays: number;
}

export interface PendingItemGroup {
	category: TriageCategory;
	items: PendingItem[];
}

export type PendingThreadSearchFunction = () => PendingThreadLike[];

const defaultSearch: PendingThreadSearchFunction = () => {
	if (typeof GmailApp === 'undefined') {
		throw new Error('GmailApp is not available in this environment.');
	}

	return GmailApp.search(
		`label:"${PENDING_ACTION_LABEL}" -in:trash`
	) as unknown as PendingThreadLike[];
};

const resolveCategory = (thread: PendingThreadLike): TriageCategory => {
	const labelNames = thread.getLabels().map((label) => label.getName());
	for (const category of TRIAGE_CATEGORIES) {
		if (labelNames.includes(category)) {
			return category;
		}
	}

	return 'triage/unknown';
};

const daysSince = (date: Date, now: Date): number =>
	Math.max(0, Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));

export const queryPendingThreads = (
	search: PendingThreadSearchFunction = defaultSearch,
	now: Date = new Date()
): PendingItem[] => {
	const threads = search();

	const items: PendingItem[] = threads.map((thread) => {
		const messages = thread.getMessages();
		const lastMessage = messages[messages.length - 1];

		return {
			threadId: thread.getId(),
			category: resolveCategory(thread),
			subject: thread.getFirstMessageSubject(),
			sender: lastMessage ? lastMessage.getFrom() : '',
			ageInDays: daysSince(thread.getLastMessageDate(), now),
		};
	});

	return items.sort((a, b) => b.ageInDays - a.ageInDays);
};

export const groupPendingItemsByCategory = (
	items: PendingItem[]
): PendingItemGroup[] => {
	const groups: PendingItemGroup[] = [];

	for (const category of TRIAGE_CATEGORIES) {
		const categoryItems = items.filter((item) => item.category === category);
		if (categoryItems.length > 0) {
			groups.push({ category, items: categoryItems });
		}
	}

	return groups;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/query-pending-threads.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Gmail/queryPendingThreads.ts tests/query-pending-threads.test.ts
git commit -m "feat(gmail): add queryPendingThreads for the Actions Page"
```

---

### Task 7: Web App Manifest Access Control

**Files:**
- Modify: `appsscript.json`
- Test: `tests/webapp-manifest.test.ts`

**Interfaces:**
- Produces: `appsscript.json`'s `webapp.access` / `webapp.executeAs` fields, verified by this task's test on every future run (CI drift guard).

- [ ] **Step 1: Write the failing test**

Create `tests/webapp-manifest.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const repoRoot = resolve(__dirname, '..');

test('appsscript.json restricts the Web App deployment to the owner only', () => {
	const manifest = JSON.parse(
		readFileSync(resolve(repoRoot, 'appsscript.json'), 'utf8')
	);

	assert.equal(manifest.webapp?.access, 'MYSELF');
	assert.equal(manifest.webapp?.executeAs, 'USER_DEPLOYING');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/webapp-manifest.test.ts`
Expected: FAIL (`manifest.webapp` is `undefined`)

- [ ] **Step 3: Add the `webapp` block to `appsscript.json`**

```json
{
	"dependencies": {},
	"exceptionLogging": "STACKDRIVER",
	"runtimeVersion": "V8",
	"timeZone": "America/New_York",
	"oauthScopes": [
		"https://www.googleapis.com/auth/script.external_request",
		"https://www.googleapis.com/auth/gmail.modify",
		"https://www.googleapis.com/auth/gmail.send",
		"https://www.googleapis.com/auth/drive.readonly",
		"https://www.googleapis.com/auth/script.scriptapp",
		"https://www.googleapis.com/auth/userinfo.email"
	],
	"webapp": {
		"access": "MYSELF",
		"executeAs": "USER_DEPLOYING"
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/webapp-manifest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add appsscript.json tests/webapp-manifest.test.ts
git commit -m "feat(webapp): restrict digest actions Web App to owner-only access"
```

---

### Task 8: Action Resolver, Page Renderer, and Web App Entry Point

**Files:**
- Create: `src/Gmail/digestActionResolver.ts`
- Create: `src/Gmail/actionsPageRenderer.ts`
- Create: `src/_s/Gmail/digest-actions.ts`
- Test: `tests/digest-action-resolver.test.ts`
- Test: `tests/actions-page-renderer.test.ts`
- Modify: `tests/apps-script-build.test.ts`

**Interfaces:**
- Consumes: `PENDING_ACTION_LABEL` (Task 1), `ThreadLikeWithId`/`LabelLike`-style DI conventions from `src/Gmail/actionExecutor.ts`, `PendingItem`/`PendingItemGroup`/`queryPendingThreads`/`groupPendingItemsByCategory` (Task 6), `CATEGORY_METADATA` from `src/Gmail/digestComposer.ts`.
- Produces: `archiveDigestThread`, `deleteDigestThread` (resolver), `renderActionsPageHtml(groups)` (renderer), and the GAS-visible globals `doGet`, `handleArchiveDigestThread`, `handleDeleteDigestThread`.

- [ ] **Step 1: Write the failing resolver test**

Create `tests/digest-action-resolver.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
	archiveDigestThread,
	deleteDigestThread,
} from '../src/Gmail/digestActionResolver';

test('archiveDigestThread archives the thread and removes the pending label', () => {
	let archived = false;
	let labelRemoved = false;

	const result = archiveDigestThread('t-1', {
		resolveThread: () =>
			({
				getId: () => 't-1',
				moveToArchive: () => {
					archived = true;
				},
			}) as any,
		getLabel: () => ({
			getName: () => 'Digest/Pending-Action',
			addToThread: () => {},
			removeFromThread: () => {
				labelRemoved = true;
			},
		}),
	});

	assert.deepEqual(result, { threadId: 't-1', action: 'archive', resolved: true });
	assert.equal(archived, true);
	assert.equal(labelRemoved, true);
});

test('archiveDigestThread reports unresolved when the thread no longer exists', () => {
	const result = archiveDigestThread('missing', { resolveThread: () => null });
	assert.deepEqual(result, {
		threadId: 'missing',
		action: 'archive',
		resolved: false,
	});
});

test('deleteDigestThread moves the thread to trash', () => {
	let trashed = false;

	const result = deleteDigestThread('t-2', {
		resolveThread: () =>
			({
				getId: () => 't-2',
				moveToTrash: () => {
					trashed = true;
				},
			}) as any,
	});

	assert.deepEqual(result, { threadId: 't-2', action: 'delete', resolved: true });
	assert.equal(trashed, true);
});

test('deleteDigestThread reports unresolved when the thread no longer exists', () => {
	const result = deleteDigestThread('missing', { resolveThread: () => null });
	assert.deepEqual(result, {
		threadId: 'missing',
		action: 'delete',
		resolved: false,
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/digest-action-resolver.test.ts`
Expected: FAIL with "Cannot find module '../src/Gmail/digestActionResolver'"

- [ ] **Step 3: Implement `src/Gmail/digestActionResolver.ts`**

```ts
import { PENDING_ACTION_LABEL } from './actionRules';
import { type ThreadLikeWithId } from './actionExecutor';

export interface RemovableLabelLike {
	getName(): string;
	addToThread(thread: unknown): void;
	removeFromThread(thread: unknown): void;
}

export interface ArchivableThread extends ThreadLikeWithId {
	moveToArchive(): void;
}

export interface TrashableThread extends ThreadLikeWithId {
	moveToTrash(): void;
}

export interface DigestActionOptions<TThread extends ThreadLikeWithId> {
	getLabel?: (name: string) => RemovableLabelLike | null;
	resolveThread?: (threadId: string) => TThread | null;
}

export interface DigestActionResult {
	threadId: string;
	action: 'archive' | 'delete';
	resolved: boolean;
}

const defaultGetLabel = (name: string): RemovableLabelLike | null => {
	if (typeof GmailApp === 'undefined') {
		throw new Error('GmailApp is not available in this environment.');
	}

	return GmailApp.getUserLabelByName(name) as unknown as RemovableLabelLike | null;
};

const defaultResolveArchivableThread = (threadId: string): ArchivableThread | null => {
	if (typeof GmailApp === 'undefined') {
		throw new Error('GmailApp is not available in this environment.');
	}

	return GmailApp.getThreadById(threadId) as unknown as ArchivableThread;
};

const defaultResolveTrashableThread = (threadId: string): TrashableThread | null => {
	if (typeof GmailApp === 'undefined') {
		throw new Error('GmailApp is not available in this environment.');
	}

	return GmailApp.getThreadById(threadId) as unknown as TrashableThread;
};

export const archiveDigestThread = <TThread extends ArchivableThread = ArchivableThread>(
	threadId: string,
	options: DigestActionOptions<TThread> = {}
): DigestActionResult => {
	const resolveThread = options.resolveThread ?? (defaultResolveArchivableThread as (id: string) => TThread | null);
	const getLabel = options.getLabel ?? defaultGetLabel;

	const thread = resolveThread(threadId);
	if (!thread) {
		return { threadId, action: 'archive', resolved: false };
	}

	thread.moveToArchive();

	const label = getLabel(PENDING_ACTION_LABEL);
	if (label) {
		label.removeFromThread(thread);
	}

	return { threadId, action: 'archive', resolved: true };
};

export const deleteDigestThread = <TThread extends TrashableThread = TrashableThread>(
	threadId: string,
	options: DigestActionOptions<TThread> = {}
): DigestActionResult => {
	const resolveThread = options.resolveThread ?? (defaultResolveTrashableThread as (id: string) => TThread | null);

	const thread = resolveThread(threadId);
	if (!thread) {
		return { threadId, action: 'delete', resolved: false };
	}

	thread.moveToTrash();

	return { threadId, action: 'delete', resolved: true };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/digest-action-resolver.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the resolver**

```bash
git add src/Gmail/digestActionResolver.ts tests/digest-action-resolver.test.ts
git commit -m "feat(gmail): add archiveDigestThread/deleteDigestThread action resolver"
```

- [ ] **Step 6: Write the failing renderer test**

Create `tests/actions-page-renderer.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { renderActionsPageHtml } from '../src/Gmail/actionsPageRenderer';
import { type PendingItemGroup } from '../src/Gmail/queryPendingThreads';

test('renderActionsPageHtml renders category groups with Archive/Delete buttons wired to google.script.run', () => {
	const groups: PendingItemGroup[] = [
		{
			category: 'triage/personal',
			items: [
				{
					threadId: 't-1',
					category: 'triage/personal',
					subject: 'Hi',
					sender: 'a@b.com',
					ageInDays: 2,
				},
			],
		},
	];

	const html = renderActionsPageHtml(groups);

	assert.ok(html.includes('👤'));
	assert.ok(html.includes('PERSONAL'));
	assert.ok(html.includes("archiveItem('t-1')"));
	assert.ok(html.includes("deleteItem('t-1')"));
	assert.ok(html.includes('google.script.run'));
	assert.ok(html.includes('handleArchiveDigestThread'));
	assert.ok(html.includes('handleDeleteDigestThread'));
});

test('renderActionsPageHtml shows an empty state when nothing is pending', () => {
	const html = renderActionsPageHtml([]);
	assert.ok(html.includes('Nothing pending review'));
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `node --import tsx --test tests/actions-page-renderer.test.ts`
Expected: FAIL with "Cannot find module '../src/Gmail/actionsPageRenderer'"

- [ ] **Step 8: Implement `src/Gmail/actionsPageRenderer.ts`**

```ts
import { CATEGORY_METADATA } from './digestComposer';
import { escapeHtml } from '../helpers/html';
import { type PendingItem, type PendingItemGroup } from './queryPendingThreads';

const renderItemHtml = (item: PendingItem): string => `<div id="pending-${escapeHtml(item.threadId)}" style="padding:10px 0;border-top:1px solid rgba(0,0,0,0.06);">
	<div style="font-size:11px;color:#6b7280;">${escapeHtml(item.sender)} &middot; ${item.ageInDays}d</div>
	<div style="font-size:14px;margin-top:2px;"><strong>${escapeHtml(item.subject)}</strong></div>
	<div style="margin-top:6px;">
		<button onclick="archiveItem('${escapeHtml(item.threadId)}')" style="margin-right:8px;">Archive</button>
		<button onclick="deleteItem('${escapeHtml(item.threadId)}')">Delete</button>
	</div>
</div>`;

const renderGroupHtml = (group: PendingItemGroup): string => {
	const meta = CATEGORY_METADATA[group.category];
	const itemsHtml = group.items.map(renderItemHtml).join('');

	return `<div style="background:${meta.tint};border-left:4px solid ${meta.accent};border-radius:6px;padding:12px 16px;margin-bottom:16px;">
	<div style="font-weight:700;color:${meta.accent};text-transform:uppercase;font-size:12px;letter-spacing:0.05em;">${meta.icon} ${escapeHtml(meta.title)} (${group.items.length})</div>
	${itemsHtml}
</div>`;
};

export const renderActionsPageHtml = (groups: PendingItemGroup[]): string => {
	const bodyHtml =
		groups.length > 0
			? groups.map(renderGroupHtml).join('')
			: '<div style="text-align:center;padding:24px 0;color:#374151;">🎉 Nothing pending review.</div>';

	return `<!DOCTYPE html>
<html>
<head><base target="_top"></head>
<body style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;max-width:640px;margin:0 auto;padding:16px;">
	<div style="font-size:20px;font-weight:700;margin-bottom:16px;">📋 Pending Triage Actions</div>
	${bodyHtml}
	<script>
		function archiveItem(threadId) {
			google.script.run
				.withSuccessHandler(function () { removeRow(threadId); })
				.handleArchiveDigestThread(threadId);
		}
		function deleteItem(threadId) {
			google.script.run
				.withSuccessHandler(function () { removeRow(threadId); })
				.handleDeleteDigestThread(threadId);
		}
		function removeRow(threadId) {
			var row = document.getElementById('pending-' + threadId);
			if (row) { row.remove(); }
		}
	</script>
</body>
</html>`;
};
```

- [ ] **Step 9: Run test to verify it passes**

Run: `node --import tsx --test tests/actions-page-renderer.test.ts`
Expected: PASS

- [ ] **Step 10: Commit the renderer**

```bash
git add src/Gmail/actionsPageRenderer.ts tests/actions-page-renderer.test.ts
git commit -m "feat(gmail): add renderActionsPageHtml for the Actions Page"
```

- [ ] **Step 11: Add the Web App entry point**

Create `src/_s/Gmail/digest-actions.ts`:

```ts
import {
	queryPendingThreads,
	groupPendingItemsByCategory,
} from '../../Gmail/queryPendingThreads';
import { renderActionsPageHtml } from '../../Gmail/actionsPageRenderer';
import {
	archiveDigestThread,
	deleteDigestThread,
} from '../../Gmail/digestActionResolver';

export const doGet = (): GoogleAppsScript.HTML.HtmlOutput => {
	const items = queryPendingThreads();
	const groups = groupPendingItemsByCategory(items);
	const html = renderActionsPageHtml(groups);

	return HtmlService.createHtmlOutput(html).setTitle('Pending Triage Actions');
};

export const handleArchiveDigestThread = (threadId: string): void => {
	archiveDigestThread(threadId);
};

export const handleDeleteDigestThread = (threadId: string): void => {
	deleteDigestThread(threadId);
};
```

- [ ] **Step 12: Add a build-transform safety-net test**

In `tests/apps-script-build.test.ts`, add a test alongside the existing numeric-separator/class-field checks:

```ts
test('digest-actions Web App entry point strips exports and exposes global functions', () => {
	const result = transformFileSync(
		new URL('../src/_s/Gmail/digest-actions.ts', import.meta.url).pathname
	);

	assert.doesNotMatch(result?.code ?? '', /export|exports/);
	assert.match(result?.code ?? '', /const doGet = /);
	assert.match(result?.code ?? '', /const handleArchiveDigestThread = /);
	assert.match(result?.code ?? '', /const handleDeleteDigestThread = /);
});
```

- [ ] **Step 13: Run the build test to verify it passes**

Run: `node --import tsx --test tests/apps-script-build.test.ts`
Expected: PASS

- [ ] **Step 14: Register the trigger function's build entry (verify `_s/Gmail/index.ts` list is unaffected)**

`doGet` is a special Apps Script entry point (not a time-based trigger), so it must **not** be added to `gmailTriggerFunctions` in `src/_s/Gmail/index.ts`. Run `npm test` to confirm nothing else regresses:

Run: `npm test`
Expected: PASS

- [ ] **Step 15: Commit**

```bash
git add src/_s/Gmail/digest-actions.ts tests/apps-script-build.test.ts
git commit -m "feat(webapp): add digest-actions Web App entry point"
```

---

### Task 9: Live Anonymous-Access Smoke-Check Script

**Files:**
- Create: `scripts/verify-webapp-access.ts`
- Modify: `package.json`
- Test: `tests/verify-webapp-access.test.ts`

**Interfaces:**
- Produces: `verifyWebAppAccessIsRestricted(url, fetchImpl?): Promise<{ passed: boolean; message: string }>`, and the `verify:webapp-access` npm script.

- [ ] **Step 1: Write the failing test**

Create `tests/verify-webapp-access.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyWebAppAccessIsRestricted } from '../scripts/verify-webapp-access';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const repoRoot = resolve(__dirname, '..');

test('verify:webapp-access npm script runs the TypeScript entry point', () => {
	const packageJson = JSON.parse(
		readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
	);

	assert.equal(
		packageJson.scripts['verify:webapp-access'],
		'tsx scripts/verify-webapp-access.ts'
	);
});

test('verifyWebAppAccessIsRestricted passes when the response looks like a Google sign-in/permission page', async () => {
	const result = await verifyWebAppAccessIsRestricted(
		'https://example.com/exec',
		async () =>
			({
				status: 302,
				text: async () => '<html>...accounts.google.com/ServiceLogin...</html>',
			}) as any
	);

	assert.equal(result.passed, true);
});

test('verifyWebAppAccessIsRestricted fails when the response looks like real app content', async () => {
	const result = await verifyWebAppAccessIsRestricted(
		'https://example.com/exec',
		async () =>
			({
				status: 200,
				text: async () => '<html>📋 Pending Triage Actions</html>',
			}) as any
	);

	assert.equal(result.passed, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/verify-webapp-access.test.ts`
Expected: FAIL with "Cannot find module '../scripts/verify-webapp-access'" and a `package.json` script assertion failure

- [ ] **Step 3: Implement `scripts/verify-webapp-access.ts`**

```ts
export interface FetchResponseLike {
	status: number;
	text(): Promise<string>;
}

export type FetchLike = (url: string) => Promise<FetchResponseLike>;

export interface VerifyResult {
	passed: boolean;
	message: string;
}

const OWNER_ONLY_MARKERS = [
	'accounts.google.com',
	'You need permission',
	'You do not have permission',
	'Sign in',
];

export const verifyWebAppAccessIsRestricted = async (
	url: string,
	fetchImpl: FetchLike = fetch
): Promise<VerifyResult> => {
	const response = await fetchImpl(url);
	const body = await response.text();

	const looksLikeOwnerOnlyPage = OWNER_ONLY_MARKERS.some((marker) =>
		body.includes(marker)
	);

	if (looksLikeOwnerOnlyPage) {
		return {
			passed: true,
			message: 'Anonymous request was rejected as expected (owner-only access).',
		};
	}

	return {
		passed: false,
		message: `Anonymous request returned content that did not match any expected access-denied marker (status ${response.status}). The Web App may not be correctly restricted to "Only myself".`,
	};
};

const isMainModule = (): boolean => {
	try {
		return import.meta.url === `file://${process.argv[1]}`;
	} catch {
		return false;
	}
};

async function main(): Promise<void> {
	const url = process.argv[2];
	if (!url) {
		console.error('Usage: npm run verify:webapp-access -- <deployed-web-app-url>');
		process.exit(1);
	}

	const result = await verifyWebAppAccessIsRestricted(url);
	console.log(result.message);
	process.exit(result.passed ? 0 : 1);
}

if (isMainModule()) {
	main();
}
```

- [ ] **Step 4: Add the npm script**

In `package.json`, add alongside `pull:remote`:

```json
		"pull:remote": "tsx scripts/pull-remote.ts",
		"test": "node --import tsx --test 'tests/**/*.test.ts' 'src/**/*.test.ts'",
		"verify:webapp-access": "tsx scripts/verify-webapp-access.ts"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test tests/verify-webapp-access.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/verify-webapp-access.ts package.json tests/verify-webapp-access.test.ts
git commit -m "feat(scripts): add live anonymous-access smoke check for the digest actions Web App"
```

---

## Post-Implementation Manual Steps (not automatable)

These are documented here for the human operator; no task above can perform them:

1. Deploy the Web App (`clasp push` then create/redeploy the Web App deployment in the Apps Script UI or via `clasp deploy`), confirming the deployment picks up `webapp.access: "MYSELF"` from the manifest.
2. Run `npm run verify:webapp-access -- <deployed-exec-url>` against the real deployed URL and confirm it reports `passed: true`.
3. Open the deployed link in a private/incognito browser window (or while signed into a different Google account) to manually confirm access is denied for identities other than the owner.
4. Open the link while signed in as the owner to confirm the Actions Page renders and Archive/Delete buttons work against real Gmail threads.
