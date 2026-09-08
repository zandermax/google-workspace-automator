import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
	getInviteExpiration,
	markThreadForProcessing,
} from '../src/_s/Gmail/delete-old-invites';

test('identifies expired invite end dates for dry-run reporting', () => {
	const now = new Date('2026-09-01T12:00:00.000Z');
	const result = getInviteExpiration(
		`BEGIN:VCALENDAR
BEGIN:VEVENT
DTEND:20260901T110000Z
END:VEVENT
END:VCALENDAR`,
		now
	);

	assert.deepEqual(result, {
		eventEnd: new Date('2026-09-01T11:00:00.000Z'),
		isExpired: true,
	});
});

test('identifies future invite end dates for dry-run reporting', () => {
	const now = new Date('2026-09-01T12:00:00.000Z');
	const result = getInviteExpiration('DTEND:20260901T130000Z', now);

	assert.deepEqual(result, {
		eventEnd: new Date('2026-09-01T13:00:00.000Z'),
		isExpired: false,
	});
});

test('rejects named local timezone-qualified invite end dates instead of treating as UTC', () => {
	const now = new Date('2026-09-01T12:00:00.000Z');
	const result = getInviteExpiration(
		'DTEND;TZID=America/New_York:20260831T120000',
		now
	);

	assert.equal(result, null);
});

test('rejects floating local invite end dates without UTC indicator', () => {
	const now = new Date('2026-09-01T12:00:00.000Z');
	const result = getInviteExpiration('DTEND:20260831T120000', now);

	assert.equal(result, null);
});

test('identifies expired parameterized UTC invite end dates ending in Z', () => {
	const now = new Date('2026-09-01T12:00:00.000Z');
	const result = getInviteExpiration('DTEND;TZID=UTC:20260831T120000Z', now);

	assert.deepEqual(result, {
		eventEnd: new Date('2026-08-31T12:00:00.000Z'),
		isExpired: true,
	});
});

test('unfolds split ICS properties before parsing their end date', () => {
	const now = new Date('2026-09-01T12:00:00.000Z');
	const result = getInviteExpiration('DTEND:20260831T1\r\n 20000Z', now);

	assert.equal(result?.isExpired, true);
	assert.equal(result?.eventEnd.toISOString(), '2026-08-31T12:00:00.000Z');
});

test('identifies date-only events as expired after their end date', () => {
	const now = new Date('2026-09-02T12:00:00.000Z');
	const resultWithParam = getInviteExpiration('DTEND;VALUE=DATE:20260901', now);
	const resultBareDate = getInviteExpiration('DTEND:20260901', now);

	assert.deepEqual(resultWithParam, {
		eventEnd: new Date('2026-09-01T00:00:00.000Z'),
		isExpired: true,
	});
	assert.deepEqual(resultBareDate, {
		eventEnd: new Date('2026-09-01T00:00:00.000Z'),
		isExpired: true,
	});
});

test('marks a thread only once when it has multiple expired invite attachments', () => {
	const processedThreadIds = new Set<string>();

	assert.equal(markThreadForProcessing(processedThreadIds, 'thread-1'), true);
	assert.equal(markThreadForProcessing(processedThreadIds, 'thread-1'), false);
	assert.equal(markThreadForProcessing(processedThreadIds, 'thread-2'), true);
	assert.deepEqual([...processedThreadIds], ['thread-1', 'thread-2']);
});

test('returns null when an invite end date cannot be parsed', () => {
	const now = new Date('2026-09-01T12:00:00.000Z');
	const result = getInviteExpiration('BEGIN:VCALENDAR\nEND:VCALENDAR', now);

	assert.equal(result, null);
});
