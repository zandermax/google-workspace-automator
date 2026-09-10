import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
	GeminiClient,
	validateClassificationResponse,
	buildPromptContent,
	DEFAULT_GEMINI_MODEL,
	selectFlashFallbackModels,
	type HttpTransport,
	type HttpResponseLike,
} from '../src/Gmail/GeminiClient';
import type { GeminiClassificationInput } from '../src/types/Gmail/triage';

const mockInputs: GeminiClassificationInput[] = [
	{
		id: 'thread-1',
		sender: 'alice@example.com',
		subject: 'Dinner tonight',
		snippet: 'Hey, are we still meeting for dinner at 7?',
		hasAttachment: false,
		ageInDays: 0,
		sizeKb: 2,
	},
	{
		id: 'thread-2',
		sender: 'billing@utility.com',
		subject: 'Your Electric Bill',
		snippet: 'Your bill of $84.20 is due on 2026-09-20.',
		hasAttachment: true,
		ageInDays: 1,
		sizeKb: 15,
	},
];

const createMockTransport = (
	statusCode: number,
	responseText: string,
	onRequest?: (url: string, params: Record<string, unknown>) => void
): HttpTransport => ({
	fetch(url: string, params: Record<string, unknown>): HttpResponseLike {
		if (onRequest) {
			onRequest(url, params);
		}
		return {
			getResponseCode: () => statusCode,
			getContentText: () => responseText,
		};
	},
});

test('GeminiClient defaults to gemini-3.8-flash and accepts custom model', () => {
	const defaultClient = new GeminiClient({
		apiKey: 'test-key',
		transport: createMockTransport(200, '{}'),
	});
	assert.equal(defaultClient.getModel(), DEFAULT_GEMINI_MODEL);
	assert.equal(defaultClient.getModel(), 'gemini-3.8-flash');

	const customClient = new GeminiClient({
		apiKey: 'test-key',
		model: 'gemini-1.5-pro',
		transport: createMockTransport(200, '{}'),
	});
	assert.equal(customClient.getModel(), 'gemini-1.5-pro');
});

test('GeminiClient throws if API key cannot be resolved', () => {
	assert.throws(
		() => new GeminiClient({ apiKey: '' }),
		/Gemini API key is not configured/iu
	);
});

test('GeminiClient returns empty array when input list is empty without fetching', () => {
	let fetchCalled = false;
	const client = new GeminiClient({
		apiKey: 'test-key',
		transport: {
			fetch: () => {
				fetchCalled = true;
				throw new Error('Should not be called');
			},
		},
	});

	const result = client.classifyBatch([]);
	assert.deepEqual(result, []);
	assert.equal(fetchCalled, false);
});

test('GeminiClient successfully calls API and parses valid classification batch', () => {
	const mockGeminiOutput = JSON.stringify([
		{
			id: 'thread-1',
			category: 'triage/personal',
			timeSensitive: false,
			actionRequired: true,
			summary: 'Dinner plans with Alice tonight at 7.',
			highlights: ['dinner at 7'],
			keyDetail: 'Tonight at 7',
		},
		{
			id: 'thread-2',
			category: 'triage/finance',
			timeSensitive: true,
			actionRequired: true,
			summary: 'Electric utility bill statement.',
			highlights: ['Balance $84.20'],
			keyDetail: 'Due 2026-09-20',
		},
	]);

	const mockApiResponse = JSON.stringify({
		candidates: [
			{
				content: {
					parts: [
						{
							text: mockGeminiOutput,
						},
					],
				},
			},
		],
	});

	let requestedUrl = '';
	let requestedParams: Record<string, unknown> = {};

	const client = new GeminiClient({
		apiKey: 'secret-key-123',
		transport: createMockTransport(200, mockApiResponse, (url, params) => {
			requestedUrl = url;
			requestedParams = params;
		}),
	});

	const results = client.classifyBatch(mockInputs);

	assert.equal(results.length, 2);
	assert.equal(results[0].id, 'thread-1');
	assert.equal(results[0].category, 'triage/personal');
	assert.equal(results[0].actionRequired, true);
	assert.equal(results[1].id, 'thread-2');
	assert.equal(results[1].category, 'triage/finance');

	assert.ok(requestedUrl.includes('models/gemini-3.8-flash:generateContent'));
	assert.ok(requestedUrl.includes('key=secret-key-123'));
	assert.equal(requestedParams.method, 'post');
	assert.equal(requestedParams.contentType, 'application/json');

	const parsedBody = JSON.parse(requestedParams.payload as string);
	assert.equal(
		parsedBody.generationConfig?.response_mime_type,
		'application/json'
	);
});

test('GeminiClient throws if HTTP response status is not 2xx', () => {
	const client = new GeminiClient({
		apiKey: 'test-key',
		transport: createMockTransport(
			401,
			JSON.stringify({ error: { message: 'API key expired' } })
		),
	});

	assert.throws(
		() => client.classifyBatch(mockInputs),
		/Gemini API request failed with status 401/iu
	);
});

test('selectFlashFallbackModels selects best flash, previous version flash, and latest flash-lite', () => {
	const mockModelCatalog = [
		{
			name: 'models/gemini-3.8-flash',
			supportedGenerationMethods: ['generateContent'],
		},
		{
			name: 'models/gemini-3.7-flash',
			supportedGenerationMethods: ['generateContent'],
		},
		{
			name: 'models/gemini-3.6-flash',
			supportedGenerationMethods: ['generateContent'],
		},
		{
			name: 'models/gemini-3.5-flash-lite',
			supportedGenerationMethods: ['generateContent'],
		},
		{
			name: 'models/gemini-3.1-flash-lite',
			supportedGenerationMethods: ['generateContent'],
		},
		{
			name: 'models/gemini-2.5-flash',
			supportedGenerationMethods: ['generateContent'],
		},
		{
			name: 'models/gemini-3-pro-image',
			supportedGenerationMethods: ['generateContent'],
		},
	];

	const selected = selectFlashFallbackModels(mockModelCatalog);
	assert.deepEqual(selected, [
		'gemini-3.8-flash',
		'gemini-3.7-flash',
		'gemini-3.5-flash-lite',
	]);
});

test('GeminiClient automatically falls back to secondary model on 503 and logs output', () => {
	const calls: string[] = [];
	const loggedFallbacks: Array<{ failedModel: string; nextModel: string }> = [];

	const validResponse = JSON.stringify({
		candidates: [
			{
				content: {
					parts: [
						{
							text: JSON.stringify([
								{
									id: 'thread-1',
									category: 'triage/personal',
									timeSensitive: false,
									actionRequired: true,
									summary: 'Dinner plans with Alice tonight at 7.',
									highlights: ['dinner at 7'],
									keyDetail: 'Tonight at 7',
								},
								{
									id: 'thread-2',
									category: 'triage/finance',
									timeSensitive: true,
									actionRequired: true,
									summary: 'Electric utility bill statement.',
									highlights: ['Balance $84.20'],
									keyDetail: 'Due 2026-09-20',
								},
							]),
						},
					],
				},
			},
		],
	});

	const client = new GeminiClient({
		apiKey: 'test-key',
		fallbackModels: [
			'gemini-3.8-flash',
			'gemini-3.7-flash',
			'gemini-3.5-flash-lite',
		],
		onFallback: (failedModel, nextModel) => {
			loggedFallbacks.push({ failedModel, nextModel });
		},
		transport: {
			fetch(url: string) {
				calls.push(url);
				if (url.includes('models/gemini-3.8-flash:generateContent')) {
					return {
						getResponseCode: () => 503,
						getContentText: () =>
							JSON.stringify({
								error: {
									code: 503,
									message: 'This model is currently experiencing high demand.',
									status: 'UNAVAILABLE',
								},
							}),
					};
				}
				if (url.includes('models/gemini-3.7-flash:generateContent')) {
					return {
						getResponseCode: () => 200,
						getContentText: () => validResponse,
					};
				}
				throw new Error(`Unexpected URL called: ${url}`);
			},
		},
	});

	const results = client.classifyBatch(mockInputs);
	assert.equal(results.length, 2);
	assert.equal(calls.length, 2);
	assert.ok(calls[0].includes('models/gemini-3.8-flash:generateContent'));
	assert.ok(calls[1].includes('models/gemini-3.7-flash:generateContent'));
	assert.deepEqual(loggedFallbacks, [
		{ failedModel: 'gemini-3.8-flash', nextModel: 'gemini-3.7-flash' },
	]);
});

test('GeminiClient falls back to tertiary flash-lite model if second model also returns 503', () => {
	const calls: string[] = [];
	const loggedFallbacks: Array<{ failedModel: string; nextModel: string }> = [];

	const validResponse = JSON.stringify({
		candidates: [
			{
				content: {
					parts: [
						{
							text: JSON.stringify([
								{
									id: 'thread-1',
									category: 'triage/personal',
									timeSensitive: false,
									actionRequired: true,
									summary: 'Dinner plans with Alice tonight at 7.',
									highlights: ['dinner at 7'],
									keyDetail: 'Tonight at 7',
								},
								{
									id: 'thread-2',
									category: 'triage/finance',
									timeSensitive: true,
									actionRequired: true,
									summary: 'Electric utility bill statement.',
									highlights: ['Balance $84.20'],
									keyDetail: 'Due 2026-09-20',
								},
							]),
						},
					],
				},
			},
		],
	});

	const client = new GeminiClient({
		apiKey: 'test-key',
		fallbackModels: [
			'gemini-3.8-flash',
			'gemini-3.7-flash',
			'gemini-3.5-flash-lite',
		],
		onFallback: (failedModel, nextModel) => {
			loggedFallbacks.push({ failedModel, nextModel });
		},
		transport: {
			fetch(url: string) {
				calls.push(url);
				if (
					url.includes('models/gemini-3.8-flash:generateContent') ||
					url.includes('models/gemini-3.7-flash:generateContent')
				) {
					return {
						getResponseCode: () => 503,
						getContentText: () =>
							JSON.stringify({
								error: {
									code: 503,
									message: 'This model is currently experiencing high demand.',
									status: 'UNAVAILABLE',
								},
							}),
					};
				}
				if (url.includes('models/gemini-3.5-flash-lite:generateContent')) {
					return {
						getResponseCode: () => 200,
						getContentText: () => validResponse,
					};
				}
				throw new Error(`Unexpected URL called: ${url}`);
			},
		},
	});

	const results = client.classifyBatch(mockInputs);
	assert.equal(results.length, 2);
	assert.equal(calls.length, 3);
	assert.deepEqual(loggedFallbacks, [
		{ failedModel: 'gemini-3.8-flash', nextModel: 'gemini-3.7-flash' },
		{ failedModel: 'gemini-3.7-flash', nextModel: 'gemini-3.5-flash-lite' },
	]);
});

test('GeminiClient throws if all fallback models are unavailable', () => {
	const loggedFallbacks: Array<{ failedModel: string; nextModel: string }> = [];

	const client = new GeminiClient({
		apiKey: 'test-key',
		fallbackModels: [
			'gemini-3.8-flash',
			'gemini-3.7-flash',
			'gemini-3.5-flash-lite',
		],
		onFallback: (failedModel, nextModel) => {
			loggedFallbacks.push({ failedModel, nextModel });
		},
		transport: {
			fetch() {
				return {
					getResponseCode: () => 503,
					getContentText: () =>
						JSON.stringify({
							error: {
								code: 503,
								message: 'This model is currently experiencing high demand.',
								status: 'UNAVAILABLE',
							},
						}),
				};
			},
		},
	});

	assert.throws(
		() => client.classifyBatch(mockInputs),
		/Gemini API request failed with status 503/iu
	);
	assert.deepEqual(loggedFallbacks, [
		{ failedModel: 'gemini-3.8-flash', nextModel: 'gemini-3.7-flash' },
		{ failedModel: 'gemini-3.7-flash', nextModel: 'gemini-3.5-flash-lite' },
	]);
});

test('GeminiClient throws if HTTP response payload is not valid JSON', () => {
	const client = new GeminiClient({
		apiKey: 'test-key',
		transport: createMockTransport(200, '<html>502 Bad Gateway</html>'),
	});

	assert.throws(
		() => client.classifyBatch(mockInputs),
		/Gemini API returned unparseable response container/iu
	);
});

test('GeminiClient throws if candidates or parts text are missing', () => {
	const client = new GeminiClient({
		apiKey: 'test-key',
		transport: createMockTransport(200, JSON.stringify({ candidates: [] })),
	});

	assert.throws(
		() => client.classifyBatch(mockInputs),
		/Gemini API response contained no candidate content text/iu
	);
});

test('validateClassificationResponse validates well-formed JSON array and catches errors', () => {
	// Not JSON
	assert.throws(
		() => validateClassificationResponse('invalid json', mockInputs),
		/not valid JSON/iu
	);

	// Not an array
	assert.throws(
		() => validateClassificationResponse('{"id": "thread-1"}', mockInputs),
		/must be a JSON array/iu
	);

	// Non-object item
	assert.throws(
		() => validateClassificationResponse('[null]', mockInputs),
		/Item at index 0 is not an object/iu
	);

	// Unexpected ID
	assert.throws(
		() =>
			validateClassificationResponse(
				JSON.stringify([
					{
						id: 'unknown-id',
						category: 'triage/personal',
						timeSensitive: false,
						actionRequired: false,
						summary: 'test',
						highlights: [],
						keyDetail: '',
					},
				]),
				mockInputs
			),
		/invalid or unexpected id/iu
	);

	// Invalid category
	assert.throws(
		() =>
			validateClassificationResponse(
				JSON.stringify([
					{
						id: 'thread-1',
						category: 'triage/unknown-category',
						timeSensitive: false,
						actionRequired: false,
						summary: 'test',
						highlights: [],
						keyDetail: '',
					},
				]),
				mockInputs
			),
		/invalid category/iu
	);

	// Non-boolean timeSensitive
	assert.throws(
		() =>
			validateClassificationResponse(
				JSON.stringify([
					{
						id: 'thread-1',
						category: 'triage/personal',
						timeSensitive: 'yes',
						actionRequired: false,
						summary: 'test',
						highlights: [],
						keyDetail: '',
					},
				]),
				mockInputs
			),
		/non-boolean timeSensitive/iu
	);

	// Invalid highlights (non-string element)
	assert.throws(
		() =>
			validateClassificationResponse(
				JSON.stringify([
					{
						id: 'thread-1',
						category: 'triage/personal',
						timeSensitive: false,
						actionRequired: false,
						summary: 'test',
						highlights: [123],
						keyDetail: '',
					},
				]),
				mockInputs
			),
		/invalid highlights array/iu
	);
});

test('buildPromptContent formats input count and stringifies items', () => {
	const content = buildPromptContent(mockInputs);
	assert.ok(content.includes('Classify the following 2 email items:'));
	assert.ok(content.includes('thread-1'));
	assert.ok(content.includes('thread-2'));
});
