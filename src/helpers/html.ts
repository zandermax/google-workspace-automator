/**
 * HTML escaping and decoding utilities optimized for Google Apps Script (V8)
 * and Node.js execution environments.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
};

const HTML_UNESCAPE_MAP: Record<string, string> = {
	amp: '&',
	apos: "'",
	gt: '>',
	lt: '<',
	nbsp: ' ',
	quot: '"',
};

/**
 * Escapes characters for safe inclusion in HTML.
 *
 * In Google Apps Script, leverages the native `HtmlService.createHtmlOutput().appendUntrusted()`
 * contextual escaping engine. In Node.js or environments where `HtmlService` is not defined,
 * falls back to a high-performance single-pass regex replacement map.
 */
export const escapeHtml = (text: string): string => {
	if (
		typeof HtmlService !== 'undefined' &&
		typeof HtmlService.createHtmlOutput === 'function'
	) {
		return HtmlService.createHtmlOutput().appendUntrusted(text).getContent();
	}

	return text.replace(/[&<>"']/gu, (char) => HTML_ESCAPE_MAP[char] ?? char);
};

/**
 * Decodes named, decimal, and hexadecimal HTML entities in a single pass.
 */
export const decodeHtmlEntities = (text: string): string =>
	text.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/giu, (match, entity) => {
		if (entity.startsWith('#x') || entity.startsWith('#X')) {
			const code = parseInt(entity.slice(2), 16);
			return !isNaN(code) && code > 0 ? String.fromCodePoint(code) : match;
		}
		if (entity.startsWith('#')) {
			const code = parseInt(entity.slice(1), 10);
			return !isNaN(code) && code > 0 ? String.fromCodePoint(code) : match;
		}
		const lower = entity.toLowerCase();
		return HTML_UNESCAPE_MAP[lower] ?? match;
	});

/**
 * Strips HTML tags, styles, and scripts from raw body text and decodes HTML entities.
 */
export const stripHtml = (html: string): string => {
	const withoutStyles = html
		.replace(/<style[\s\S]*?<\/style>/giu, ' ')
		.replace(/<script[\s\S]*?<\/script>/giu, ' ');

	const withoutHtml = withoutStyles.replace(/<[^>]+>/gu, ' ');

	return decodeHtmlEntities(withoutHtml).replace(/\s+/gu, ' ').trim();
};
