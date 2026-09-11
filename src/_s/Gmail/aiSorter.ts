import {
	type ThreadLike,
	extractEmailSnippetFromThread,
	toGeminiClassificationInput,
} from '../../Gmail/extraction';
import { GeminiClient } from '../../Gmail/GeminiClient';
import {
	selectCascadeThreads,
	type SearchFunction,
} from '../../Gmail/cascadeSelection';
import { determineTriageDirectives } from '../../Gmail/actionRules';
import {
	executeTriageActions,
	type ActionExecutionResult,
	type ThreadLikeWithId,
} from '../../Gmail/actionExecutor';
import { groupDirectivesByDuplicates } from '../../Gmail/deduplication';
import { getStorageMetrics, type StorageProvider } from '../../Gmail/StorageStats';
import { sendDigest, type EmailSender } from '../../Gmail/actions/sendDigest';
import {
	type DailyDigestData,
	type ExtractedEmailSnippet,
	type GeminiClassificationInput,
	type TriageClassification,
} from '@/types/Gmail/triage';

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
}

export interface AiSorterPipelineResult {
	processedCount: number;
	actionRequiredCount: number;
	autoRecyclingCount: number;
	isHighVolumeOverflow: boolean;
	isDryRun: boolean;
	executionResult: ActionExecutionResult;
	digestSubject: string;
}

export const runAiSorterPipeline = (
	options: AiSorterPipelineOptions = {}
): AiSorterPipelineResult => {
	const dryRun = options.dryRun === true;
	const dailyLimit = options.dailyLimit ?? 50;

	if (typeof Logger !== 'undefined') {
		Logger.log(
			`Starting AI email sorter pipeline (dryRun: ${dryRun}, limit: ${dailyLimit})...`
		);
	}

	// 1. Fetch cascade selection
	const cascadeResult = selectCascadeThreads<ThreadLike>({
		limit: dailyLimit,
		search: options.search,
		random: options.random,
	});

	const threads = cascadeResult.threads;

	if (typeof Logger !== 'undefined') {
		Logger.log(
			`Selected ${threads.length} threads (unread: ${cascadeResult.counts.unreadInbox}, old inbox: ${cascadeResult.counts.oldInbox}, archived: ${cascadeResult.counts.archived}). Overflow: ${cascadeResult.isHighVolumeOverflow}`
		);
	}

	// 2. Extract snippets
	const emailSnippets: ExtractedEmailSnippet[] = [];
	const geminiInputs: GeminiClassificationInput[] = [];

	for (const thread of threads) {
		const snippet = extractEmailSnippetFromThread(thread);
		emailSnippets.push(snippet);
		geminiInputs.push(toGeminiClassificationInput(snippet));
	}

	// 3. Batch classification via Gemini Flash
	let classifications: TriageClassification[] = [];
	if (geminiInputs.length > 0) {
		const client =
			options.geminiClient ??
			new GeminiClient({
				apiKey: options.geminiApiKey,
				model: options.geminiModel,
			});

		classifications = client.classifyBatch(geminiInputs);
	}

	// 4. Determine execution directives
	const directives = determineTriageDirectives(
		emailSnippets,
		classifications,
		options.staleDaysThreshold
	);

	// 5. Execute triage actions
	const executionResult = executeTriageActions<ThreadLikeWithId>(directives, {
		dryRun,
		dailyLimit,
	});

	// 6. Gather storage metrics
	const storageMetrics = getStorageMetrics(directives, {
		storageProvider: options.storageProvider,
	});

	// 7. Compose and send daily digest
	const displayEntries = groupDirectivesByDuplicates(directives);

	const actionRequiredCount = displayEntries.filter(
		(d) => d.classification.actionRequired
	).length;
	const autoRecyclingCount = displayEntries.filter(
		(d) => d.recycleLabel !== undefined
	).length;

	const digestData: DailyDigestData = {
		date: new Date(),
		processedCount: executionResult.processedCount,
		dailyLimit,
		actionRequiredCount,
		autoRecyclingCount,
		isHighVolumeOverflow: cascadeResult.isHighVolumeOverflow,
		isDryRun: dryRun,
		actionsPageUrl: '',
		storage: storageMetrics,
		entries: displayEntries,
	};

	const digestResult = sendDigest(digestData, {
		recipient: options.recipient,
		emailSender: options.emailSender,
	});

	if (typeof Logger !== 'undefined') {
		Logger.log(
			`AI email sorter pipeline finished: ${executionResult.processedCount} threads processed.`
		);
	}

	return {
		processedCount: executionResult.processedCount,
		actionRequiredCount,
		autoRecyclingCount,
		isHighVolumeOverflow: cascadeResult.isHighVolumeOverflow,
		isDryRun: dryRun,
		executionResult,
		digestSubject: digestResult.subject,
	};
};

export const aiSorter = () => runAiSorterPipeline({ dryRun: false });

export const dryRunAiSorter = () => runAiSorterPipeline({ dryRun: true });
