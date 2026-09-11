import { labelProcessed } from './actions/labelAsProcessed';
import { DAILY_LIMIT } from './cascadeSelection';
import { PENDING_ACTION_LABEL } from './actionRules';
import { type TriageExecutionDirective } from '@/types/Gmail/triage';

export interface LabelLike {
	getName(): string;
	addToThread(thread: unknown): void;
}

export interface ThreadLikeWithId {
	getId(): string;
}

export interface ActionExecutorOptions<TThread extends ThreadLikeWithId = ThreadLikeWithId> {
	dryRun?: boolean;
	dailyLimit?: number;
	getLabel?: (name: string) => LabelLike | null;
	createLabel?: (name: string) => LabelLike;
	resolveThread?: (threadId: string) => TThread | null;
	markProcessed?: (threads: TThread[]) => void;
}

export interface ActionExecutionResult {
	processedCount: number;
	labeledCount: number;
	recycledCount: number;
	skippedCount: number;
	isDryRun: boolean;
	directives: TriageExecutionDirective[];
}

const defaultGetLabel = (name: string): LabelLike | null => {
	if (typeof GmailApp === 'undefined') {
		throw new Error('GmailApp is not available in this environment.');
	}

	return GmailApp.getUserLabelByName(name);
};

const defaultCreateLabel = (name: string): LabelLike => {
	if (typeof GmailApp === 'undefined') {
		throw new Error('GmailApp is not available in this environment.');
	}

	return GmailApp.createLabel(name);
};

const defaultResolveThread = (threadId: string): ThreadLikeWithId | null => {
	if (typeof GmailApp === 'undefined') {
		throw new Error('GmailApp is not available in this environment.');
	}

	return GmailApp.getThreadById(threadId);
};

const defaultMarkProcessed = (threads: ThreadLikeWithId[]): void => {
	labelProcessed(
		'Gmail-AI-Sorter',
		threads as unknown as GoogleAppsScript.Gmail.GmailThread[]
	);
};

export const executeTriageActions = <TThread extends ThreadLikeWithId = ThreadLikeWithId>(
	directives: TriageExecutionDirective[],
	options: ActionExecutorOptions<TThread> = {}
): ActionExecutionResult => {
	const dryRun = options.dryRun === true;
	const dailyLimit = options.dailyLimit ?? DAILY_LIMIT;
	const getLabel = options.getLabel ?? defaultGetLabel;
	const createLabel = options.createLabel ?? defaultCreateLabel;
	const resolveThread = options.resolveThread ?? (defaultResolveThread as (id: string) => TThread | null);
	const markProcessed = options.markProcessed ?? (defaultMarkProcessed as (threads: TThread[]) => void);

	const labelCache = new Map<string, LabelLike>();
	const ensureLabel = (name: string): LabelLike => {
		const cached = labelCache.get(name);
		if (cached) {
			return cached;
		}

		const existing = getLabel(name);
		const label = existing ?? createLabel(name);
		labelCache.set(name, label);
		return label;
	};

	let processedCount = 0;
	let labeledCount = 0;
	let recycledCount = 0;
	let skippedCount = 0;
	const executedDirectives: TriageExecutionDirective[] = [];
	const mutatedThreads: TThread[] = [];

	for (const directive of directives) {
		if (processedCount >= dailyLimit) {
			if (typeof Logger !== 'undefined') {
				Logger.log(
					`Reached daily action limit of ${dailyLimit} threads. Skipping remaining directives.`
				);
			}
			skippedCount += 1;
			continue;
		}

		if (dryRun) {
			if (directive.triageLabel) {
				labeledCount += 1;
			}
			if (directive.recycleLabel) {
				recycledCount += 1;
			}
			processedCount += 1;
			executedDirectives.push(directive);

			if (typeof Logger !== 'undefined') {
				Logger.log(
					`[DRY RUN] Would process thread ${directive.threadId} -> Action: ${directive.actionType} (${directive.reason})`
				);
			}
			continue;
		}

		// Live execution
		const thread = resolveThread(directive.threadId);
		if (!thread) {
			if (typeof Logger !== 'undefined') {
				Logger.log(
					`Could not resolve thread with ID "${directive.threadId}". Skipping.`
				);
			}
			skippedCount += 1;
			continue;
		}

		if (directive.triageLabel) {
			const label = ensureLabel(directive.triageLabel);
			label.addToThread(thread);
			labeledCount += 1;
		}

		if (directive.recycleLabel) {
			const label = ensureLabel(directive.recycleLabel);
			label.addToThread(thread);
			recycledCount += 1;
		}

		const pendingLabel = ensureLabel(PENDING_ACTION_LABEL);
		pendingLabel.addToThread(thread);

		mutatedThreads.push(thread);
		processedCount += 1;
		executedDirectives.push(directive);
	}

	if (!dryRun && mutatedThreads.length > 0) {
		markProcessed(mutatedThreads);
	}

	return {
		processedCount,
		labeledCount,
		recycledCount,
		skippedCount,
		isDryRun: dryRun,
		directives: executedDirectives,
	};
};
