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
 * Rewrites every non-ASCII character as a numeric HTML entity so emoji survive
 * regardless of the charset an email client assumes for the message body.
 */
export const toHtmlNumericEntities = (html: string): string =>
	html.replace(
		/[\u0080-\u{10FFFF}]/gu,
		(char) => `&#${char.codePointAt(0) ?? 0};`
	);

/**
 * Encodes an email subject using RFC 2047 MIME encoded-word syntax (=?UTF-8?B?...?=)
 * when it contains non-ASCII characters (e.g. emoji, em-dash).
 *
 * Apps Script's GmailApp.sendEmail() transmits headers as Latin-1/ASCII without UTF-8
 * encoding, converting surrogate pairs into question marks ('??'). Encoding as RFC 2047
 * ensures the subject header remains pure 7-bit ASCII while email clients decode and
 * render the full emoji.
 */
export const toRfc2047Subject = (subject: string): string => {
	if (
		!/[^\x00-\x7F]/u.test(subject) ||
		(subject.startsWith('=?') && subject.endsWith('?='))
	) {
		return subject;
	}

	let base64: string;
	if (typeof Buffer !== 'undefined') {
		base64 = Buffer.from(subject, 'utf8').toString('base64');
	} else if (
		typeof Utilities !== 'undefined' &&
		typeof Utilities.base64Encode === 'function' &&
		typeof Utilities.Charset !== 'undefined'
	) {
		base64 = Utilities.base64Encode(subject, Utilities.Charset.UTF_8);
	} else {
		const bytes = new TextEncoder().encode(subject);
		let bin = '';
		for (let i = 0; i < bytes.length; i += 1) {
			bin += String.fromCharCode(bytes[i]);
		}
		base64 = btoa(bin);
	}

	return `=?UTF-8?B?${base64}?=`;
};

/**
 * Decodes named, decimal, and hexadecimal HTML entities in a single pass.
 */
export const decodeHtmlEntities = (text: string): string =>
	text.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/giu, (match, entity) => {
		if (entity.startsWith('#x') || entity.startsWith('#X')) {
			const code = parseInt(entity.slice(2), 16);
			if (code === 0xa0) return ' ';
			return !isNaN(code) && code > 0 ? String.fromCodePoint(code) : match;
		}
		if (entity.startsWith('#')) {
			const code = parseInt(entity.slice(1), 10);
			if (code === 160) return ' ';
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
