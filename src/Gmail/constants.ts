export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export const GEMINI_FALLBACK_MODELS = [
	'gemini-3.8-flash',
	'gemini-3.7-flash',
	'gemini-3.8-flash-lite',
	'gemini-3.5-flash-lite',
] as const;

export const DEFAULT_FALLBACK_MODELS = GEMINI_FALLBACK_MODELS;
