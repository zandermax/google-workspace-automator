import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
	escapeHtml,
	decodeHtmlEntities,
	stripHtml,
} from '../src/helpers/html';

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
	assert.equal(decodeHtmlEntities('&unknown; &#notanumber;'), '&unknown; &#notanumber;');
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
