import {
	type GeminiClassificationInput,
	type TriageClassification,
	TRIAGE_CATEGORIES,
} from '@/types/Gmail/triage';
import {
	DEFAULT_GEMINI_MODEL,
	DEFAULT_FALLBACK_MODELS,
	GEMINI_FALLBACK_MODELS,
} from './constants';

export {
	DEFAULT_GEMINI_MODEL,
	DEFAULT_FALLBACK_MODELS,
	GEMINI_FALLBACK_MODELS,
};

export interface HttpResponseLike {
	getResponseCode(): number;
	getContentText(): string;
}

export interface HttpTransport {
	fetch(url: string, params: Record<string, unknown>): HttpResponseLike;
}

export interface GeminiModelCatalogItem {
	name: string;
	supportedGenerationMethods?: string[];
}

export interface GeminiClientOptions {
	apiKey?: string;
	model?: string;
	fallbackModels?: string[];
	transport?: HttpTransport;
	onFallback?: (
		failedModel: string,
		nextModel: string,
		error?: unknown
	) => void;
}

const defaultTransport: HttpTransport = {
	fetch(url: string, params: Record<string, unknown>): HttpResponseLike {
		if (typeof UrlFetchApp === 'undefined') {
			throw new Error('UrlFetchApp is not available in this environment.');
		}

		return UrlFetchApp.fetch(url, params as any);
	},
};

const resolveApiKey = (explicitKey?: string): string => {
	if (explicitKey) {
		return explicitKey;
	}

	if (
		typeof PropertiesService !== 'undefined' &&
		PropertiesService.getScriptProperties
	) {
		const propertyKey =
			PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
		if (propertyKey) {
			return propertyKey;
		}
	}

	throw new Error(
		'Gemini API key is not configured. Please set GEMINI_API_KEY in Script Properties.'
	);
};

const resolveModel = (explicitModel?: string): string | undefined => {
	if (explicitModel) {
		return explicitModel;
	}

	if (
		typeof PropertiesService !== 'undefined' &&
		PropertiesService.getScriptProperties
	) {
		const propertyModel =
			PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL');
		if (propertyModel) {
			return propertyModel;
		}
	}

	return undefined;
};

export function parseModelVersion(modelName: string): number[] {
	const match = modelName.match(/gemini-(\d+(?:\.\d+)*)-(?:flash|flash-lite)/);
	if (!match) return [0];
	return match[1].split('.').map((num) => parseInt(num, 10));
}

export function compareModelVersions(a: string, b: string): number {
	const versionA = parseModelVersion(a);
	const versionB = parseModelVersion(b);
	const maxLen = Math.max(versionA.length, versionB.length);
	for (let i = 0; i < maxLen; i += 1) {
		const numA = versionA[i] ?? 0;
		const numB = versionB[i] ?? 0;
		if (numA !== numB) {
			return numB - numA; // descending order
		}
	}
	return 0;
}

export function selectFlashFallbackModels(
	models: GeminiModelCatalogItem[]
): string[] {
	const validModels = models
		.filter((m) => {
			if (!m.supportedGenerationMethods) return true;
			return m.supportedGenerationMethods.includes('generateContent');
		})
		.map((m) => m.name.replace(/^models\//, ''));

	// Standard flash: gemini-X.Y-flash (not lite, not image, etc.)
	const standardFlash = validModels
		.filter((name) => /^gemini-\d+(?:\.\d+)*-flash$/.test(name))
		.sort(compareModelVersions);

	// Flash lite: gemini-X.Y-flash-lite
	const flashLite = validModels
		.filter((name) => /^gemini-\d+(?:\.\d+)*-flash-lite$/.test(name))
		.sort(compareModelVersions);

	const candidates: string[] = [];
	if (standardFlash[0]) {
		candidates.push(standardFlash[0]);
	}
	if (standardFlash[1]) {
		candidates.push(standardFlash[1]);
	}
	if (flashLite[0]) {
		candidates.push(flashLite[0]);
	}

	return candidates.length > 0 ? candidates : [...DEFAULT_FALLBACK_MODELS];
}

export function fetchProgrammaticFallbackModels(
	apiKey: string,
	transport: HttpTransport
): string[] {
	try {
		const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
		const response = transport.fetch(url, {
			method: 'get',
			muteHttpExceptions: true,
		});
		if (response.getResponseCode() === 200) {
			const data = JSON.parse(response.getContentText()) as {
				models?: GeminiModelCatalogItem[];
			};
			if (Array.isArray(data.models)) {
				return selectFlashFallbackModels(data.models);
			}
		}
	} catch {
		// Fall back to default fallback models if listing fails
	}
	return [...DEFAULT_FALLBACK_MODELS];
}

const isUnavailableStatus = (
	statusCode: number,
	responseText: string
): boolean => {
	return (
		statusCode === 503 ||
		statusCode === 429 ||
		statusCode === 500 ||
		statusCode === 502 ||
		statusCode === 504 ||
		(statusCode >= 500 && statusCode < 600) ||
		/UNAVAILABLE|high demand/i.test(responseText)
	);
};

export const SYSTEM_INSTRUCTION = `You are an expert email triage classifier for personal inbox management.
Classify the provided batch of email snippets into exactly one category per email, evaluating urgency, actionability, and content summaries.

The valid categories are:
- "triage/personal": Messages from real people the user knows (friends, family, colleagues writing personal notes).
- "triage/finance": Invoices, banking updates, tax records, payment receipts, statement notifications.
- "triage/govt": Official correspondence from government bodies, legal authorities, or civic institutions.
- "triage/receipts": Order confirmations and commercial purchase receipts for physical or digital goods.
- "triage/newsletters": Subscriptions, content digests, marketing newsletters, and periodic publications.
- "triage/alerts": Automated system alerts, monitoring notifications, verification codes, security events.
- "triage/junk": Confidently disposable low-value promotions, spam, or unsolicited outreach.

Fields to return for each item:
- "id": The exact ID of the input email item.
- "category": One of the exact category strings above.
- "timeSensitive": Boolean. True if the value of the email decays quickly (e.g. an alert or promo is time-sensitive; an article, tutorial, or personal greeting is not).
- "actionRequired": Boolean. True if the email requires a reply or human decision right now. Always false if the email is stale or irrelevant.
- "summary": A concise sentence (maximum 12 words) describing what the email is actually about.
- "highlights": An array of up to 3 short notable takeaway strings from the email content (empty array if none).
- "keyDetail": The single most operationally relevant detail if actionRequired (e.g., deadline, amount, date), otherwise an empty string "".

Return a JSON array of objects conforming to this specification.`;

export const buildPromptContent = (
	inputs: GeminiClassificationInput[]
): string => {
	return `Classify the following ${inputs.length} email items:\n\n${JSON.stringify(inputs, null, 2)}`;
};

export const validateClassificationResponse = (
	rawJsonText: string,
	expectedInputs: GeminiClassificationInput[]
): TriageClassification[] => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawJsonText);
	} catch (error) {
		throw new Error(
			`Gemini response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
		);
	}

	if (!Array.isArray(parsed)) {
		throw new Error('Gemini response must be a JSON array of classifications.');
	}

	const expectedIds = new Set(expectedInputs.map((i) => i.id));
	const classifications: TriageClassification[] = [];

	for (let i = 0; i < parsed.length; i += 1) {
		const item = parsed[i];
		if (!item || typeof item !== 'object') {
			throw new Error(`Item at index ${i} is not an object.`);
		}

		const {
			id,
			category,
			timeSensitive,
			actionRequired,
			summary,
			highlights,
			keyDetail,
		} = item as Record<string, unknown>;

		if (typeof id !== 'string' || !expectedIds.has(id)) {
			throw new Error(
				`Item at index ${i} has invalid or unexpected id: "${String(id)}".`
			);
		}

		if (
			typeof category !== 'string' ||
			!TRIAGE_CATEGORIES.includes(
				category as (typeof TRIAGE_CATEGORIES)[number]
			)
		) {
			throw new Error(
				`Item with id "${id}" has invalid category: "${String(category)}".`
			);
		}

		if (typeof timeSensitive !== 'boolean') {
			throw new Error(
				`Item with id "${id}" has non-boolean timeSensitive field.`
			);
		}

		if (typeof actionRequired !== 'boolean') {
			throw new Error(
				`Item with id "${id}" has non-boolean actionRequired field.`
			);
		}

		if (typeof summary !== 'string') {
			throw new Error(`Item with id "${id}" has non-string summary field.`);
		}

		if (
			!Array.isArray(highlights) ||
			!highlights.every((h) => typeof h === 'string')
		) {
			throw new Error(
				`Item with id "${id}" has invalid highlights array (must be string[]).`
			);
		}

		if (typeof keyDetail !== 'string') {
			throw new Error(`Item with id "${id}" has non-string keyDetail field.`);
		}

		classifications.push({
			id,
			category: category as (typeof TRIAGE_CATEGORIES)[number],
			timeSensitive,
			actionRequired,
			summary,
			highlights,
			keyDetail,
		});
	}

	return classifications;
};

export class GeminiClient {
	private readonly apiKey: string;
	private readonly primaryModel?: string;
	private readonly transport: HttpTransport;
	private readonly onFallback?: (
		failedModel: string,
		nextModel: string,
		error?: unknown
	) => void;
	private fallbackModels?: string[];

	constructor(options: GeminiClientOptions = {}) {
		this.apiKey = resolveApiKey(options.apiKey);
		this.primaryModel = options.model ? resolveModel(options.model) : undefined;
		this.fallbackModels = options.fallbackModels;
		this.transport = options.transport ?? defaultTransport;
		this.onFallback = options.onFallback;
	}

	getModel(): string {
		return (
			this.primaryModel ?? this.getFallbackChain()[0] ?? DEFAULT_GEMINI_MODEL
		);
	}

	getFallbackChain(): string[] {
		if (this.fallbackModels && this.fallbackModels.length > 0) {
			return this.primaryModel
				? [
						this.primaryModel,
						...this.fallbackModels.filter((m) => m !== this.primaryModel),
					]
				: this.fallbackModels;
		}

		const discovered = fetchProgrammaticFallbackModels(
			this.apiKey,
			this.transport
		);
		this.fallbackModels = discovered;

		return this.primaryModel
			? [
					this.primaryModel,
					...discovered.filter((m) => m !== this.primaryModel),
				]
			: discovered;
	}

	private logFallback(
		failedModel: string,
		nextModel: string,
		statusCode: number,
		error: Error
	): void {
		const message = `Gemini model "${failedModel}" is unavailable (status ${statusCode}). Falling back to "${nextModel}"...`;
		if (typeof Logger !== 'undefined') {
			Logger.log(message);
		}
		console.warn(message);
		this.onFallback?.(failedModel, nextModel, error);
	}

	classifyBatch(inputs: GeminiClassificationInput[]): TriageClassification[] {
		if (inputs.length === 0) {
			return [];
		}

		const modelsToTry = this.getFallbackChain();
		let lastError: Error | null = null;

		for (let i = 0; i < modelsToTry.length; i += 1) {
			const model = modelsToTry[i];
			const nextModel = modelsToTry[i + 1];

			const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

			const requestBody = {
				system_instruction: {
					parts: [{ text: SYSTEM_INSTRUCTION }],
				},
				contents: [
					{
						parts: [{ text: buildPromptContent(inputs) }],
					},
				],
				generationConfig: {
					response_mime_type: 'application/json',
				},
			};

			const response = this.transport.fetch(url, {
				method: 'post',
				contentType: 'application/json',
				payload: JSON.stringify(requestBody),
				muteHttpExceptions: true,
			});

			const statusCode = response.getResponseCode();
			const responseText = response.getContentText();

			if (statusCode < 200 || statusCode >= 300) {
				const errorMsg = `Gemini API request failed with status ${statusCode}: ${responseText}`;
				lastError = new Error(errorMsg);

				if (nextModel && isUnavailableStatus(statusCode, responseText)) {
					this.logFallback(model, nextModel, statusCode, lastError);
					continue;
				}

				throw lastError;
			}

			let responseJson: unknown;
			try {
				responseJson = JSON.parse(responseText);
			} catch (error) {
				throw new Error(
					`Gemini API returned unparseable response container: ${error instanceof Error ? error.message : String(error)}`
				);
			}

			const candidates = (
				responseJson as {
					candidates?: Array<{
						content?: { parts?: Array<{ text?: string }> };
					}>;
				}
			)?.candidates;
			const text = candidates?.[0]?.content?.parts?.[0]?.text;

			if (!text) {
				throw new Error(
					`Gemini API response contained no candidate content text: ${responseText}`
				);
			}

			return validateClassificationResponse(text, inputs);
		}

		throw lastError ?? new Error('All candidate Gemini models failed.');
	}
}
