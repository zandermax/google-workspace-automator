import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
	escapeHtml,
	decodeHtmlEntities,
	stripHtml,
	toHtmlNumericEntities,
	toRfc2047Subject,
} from '../src/helpers/html';

test('toHtmlNumericEntities converts non-BMP and BMP emoji to numeric entities', () => {
	assert.equal(
		toHtmlNumericEntities('<div>📬 Digest — ⚡</div>'),
		'<div>&#128236; Digest &#8212; &#9889;</div>'
	);
	assert.equal(
		toHtmlNumericEntities('<b>plain ascii</b>'),
		'<b>plain ascii</b>'
	);
});

test('toRfc2047Subject encodes non-ASCII subjects using RFC 2047 MIME syntax', () => {
	const subject = '📬 Daily Email Digest — 2026-09-10';
	const encoded = toRfc2047Subject(subject);

	assert.equal(
		encoded,
		'=?UTF-8?B?8J+TrCBEYWlseSBFbWFpbCBEaWdlc3Qg4oCUIDIwMjYtMDktMTA=?='
	);
	assert.doesNotMatch(encoded, /[^\x00-\x7F]/u);
});

test('toRfc2047Subject preserves pure-ASCII subjects without encoding', () => {
	const asciiSubject = '[DRY RUN] Daily Email Digest - 2026-09-10';
	assert.equal(toRfc2047Subject(asciiSubject), asciiSubject);
});

test('toRfc2047Subject does not double-encode already encoded subjects', () => {
	const alreadyEncoded =
		'=?UTF-8?B?8J+TrCBEYWlseSBFbWFpbCBEaWdlc3Qg4oCUIDIwMjYtMDktMTA=?=';
	assert.equal(toRfc2047Subject(alreadyEncoded), alreadyEncoded);
});

test('toRfc2047Subject uses Utilities.base64Encode when available in GAS environment', () => {
	let encodeCalledWith = '';
	const fakeUtilities = {
		base64Encode(text: string) {
			encodeCalledWith = text;
			return 'GAS_BASE64';
		},
		Charset: { UTF_8: 'UTF-8' },
	};

	const originalBuffer = (globalThis as any).Buffer;
	const originalUtilities = (globalThis as any).Utilities;

	delete (globalThis as any).Buffer;
	(globalThis as any).Utilities = fakeUtilities;

	try {
		const encoded = toRfc2047Subject('📬 test');
		assert.equal(encoded, '=?UTF-8?B?GAS_BASE64?=');
		assert.equal(encodeCalledWith, '📬 test');
	} finally {
		if (originalBuffer !== undefined) {
			(globalThis as any).Buffer = originalBuffer;
		}
		if (originalUtilities !== undefined) {
			(globalThis as any).Utilities = originalUtilities;
		} else {
			delete (globalThis as any).Utilities;
		}
	}
});

test('escapeHtml escapes HTML-unsafe characters using fallback single-pass map', () => {
	const raw = `Tom & Jerry <"Cartoons" & 'Animation'>`;
	const escaped = escapeHtml(raw);

	assert.equal(
		escaped,
		'Tom &amp; Jerry &lt;&quot;Cartoons&quot; &amp; &#39;Animation&#39;&gt;'
	);
});

test('escapeHtml handles strings with no special characters and empty strings', () => {
	assert.equal(escapeHtml('Hello world 123!'), 'Hello world 123!');
	assert.equal(escapeHtml(''), '');
});

test('escapeHtml uses HtmlService.createHtmlOutput when available in GAS environment', () => {
	let appendUntrustedCalledWith = '';
	const fakeHtmlOutput = {
		appendUntrusted(content: string) {
			appendUntrustedCalledWith = content;
			return this;
		},
		getContent() {
			return `[gas-escaped:${appendUntrustedCalledWith}]`;
		},
	};

	const originalHtmlService = (globalThis as any).HtmlService;
	(globalThis as any).HtmlService = {
		createHtmlOutput: () => fakeHtmlOutput,
	};

	try {
		const result = escapeHtml('<b>test & "quote"</b>');
		assert.equal(result, '[gas-escaped:<b>test & "quote"</b>]');
		assert.equal(appendUntrustedCalledWith, '<b>test & "quote"</b>');
	} finally {
		if (originalHtmlService !== undefined) {
			(globalThis as any).HtmlService = originalHtmlService;
		} else {
			delete (globalThis as any).HtmlService;
		}
	}
});

test('decodeHtmlEntities decodes named, decimal, and hexadecimal entities', () => {
	const input =
		'Fish &amp; Chips &lt;dinner&gt; &quot;Chef&#39;s Special&quot; Price:&nbsp;&#160;$10 &apos;Fresh&#x27; &#039;Daily&#039;';
	const decoded = decodeHtmlEntities(input);

	assert.equal(
		decoded,
		"Fish & Chips <dinner> \"Chef's Special\" Price:  $10 'Fresh' 'Daily'"
	);
});

test('decodeHtmlEntities preserves unknown entities and handles edge cases', () => {
	assert.equal(
		decodeHtmlEntities('&unknown; &#notanumber;'),
		'&unknown; &#notanumber;'
	);
	assert.equal(decodeHtmlEntities(''), '');
});

test('stripHtml removes styles, scripts, HTML tags, decodes entities, and collapses whitespace', () => {
	const rawHtml = `
		<style>
			body { background: #000; }
		</style>
		<div class="content">
			<h1>Weekly Digest &amp; News</h1>
			<p>Hello &lt;Team&gt;,&nbsp;welcome to &quot;Sprint #42&#39;s&quot; update!</p>
			<script>window.analytics.track('open');</script>
		</div>
	`;

	const clean = stripHtml(rawHtml);
	assert.equal(
		clean,
		'Weekly Digest & News Hello <Team>, welcome to "Sprint #42\'s" update!'
	);
});
