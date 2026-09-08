import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { getInviteExpiration } from '../src/_s/Gmail/delete-old-invites';

test('extracts event end date from ICS DTEND line', () => {
	const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test@example.com
DTSTART:20200515T100000Z
DTEND:20200515T110000Z
SUMMARY:Past Conference
DESCRIPTION:A conference that already happened
END:VEVENT
END:VCALENDAR`;

	const now = new Date();
	const result = getInviteExpiration(icsContent, now);

	assert.ok(result, 'Should parse valid DTEND line');
	assert.deepEqual(
		result?.eventEnd,
		new Date('2020-05-15T11:00:00.000Z'),
		'Should parse 2020-05-15T11:00:00.000Z'
	);
	assert.equal(result?.isExpired, true, 'Past event should be expired');
});

test('ignores ICS without DTEND line', () => {
	const invalidIcsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test@example.com
DTSTART:20300515T100000Z
SUMMARY:Future Event with no end
END:VEVENT
END:VCALENDAR`;

	const result = getInviteExpiration(invalidIcsContent);
	assert.equal(result, null, 'Should return null if no DTEND present');
});

test('correctly identifies future events as not eligible for deletion', () => {
	const futureDate = new Date();
	futureDate.setFullYear(futureDate.getFullYear() + 10);

	const year = futureDate.getUTCFullYear();
	const month = String(futureDate.getUTCMonth() + 1).padStart(2, '0');
	const day = String(futureDate.getUTCDate()).padStart(2, '0');

	const icsContent = `DTEND:${year}${month}${day}T150000Z`;
	const now = new Date();
	const result = getInviteExpiration(icsContent, now);

	assert.ok(result, 'Should parse valid future DTEND format');
	assert.equal(result?.isExpired, false, 'Future event should not be expired');
	assert.ok(result!.eventEnd > now, 'Event end date should be after now');
});

test('correctly handles edge case: event ending one second ago', () => {
	const now = new Date('2026-09-01T12:00:01.000Z');
	const oneSecondAgo = new Date('2026-09-01T12:00:00.000Z');

	const icsContent = 'DTEND:20260901T120000Z';
	const result = getInviteExpiration(icsContent, now);

	assert.ok(result, 'Should parse valid DTEND');
	assert.deepEqual(result?.eventEnd, oneSecondAgo);
	assert.equal(
		result?.isExpired,
		true,
		'Event ending 1 second ago should be expired'
	);
});

test('parses a realistic calendar invite ICS file', () => {
	const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Conference Invitation
X-WR-TIMEZONE:UTC
BEGIN:VEVENT
DTSTART:20180911T090000Z
DTEND:20180911T170000Z
DTSTAMP:20180901T120000Z
UID:abc123@google.com
CREATED:20180901T120000Z
DESCRIPTION:Annual Tech Conference 2018
LOCATION:San Francisco Convention Center
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Annual Tech Conference
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;

	const now = new Date('2026-09-01T12:00:00.000Z');
	const result = getInviteExpiration(icsContent, now);

	assert.ok(result, 'Should extract DTEND from real calendar file');
	assert.deepEqual(result?.eventEnd, new Date('2018-09-11T17:00:00.000Z'));
	assert.equal(result?.isExpired, true, '2018 event should be in the past');
});

test('rejects named local TZID values rather than silently misinterpreting as UTC', () => {
	const now = new Date('2026-09-01T12:00:00.000Z');
	const result = getInviteExpiration(
		'DTEND;TZID=America/New_York:20260831T120000',
		now
	);

	assert.equal(result, null, 'Named TZID without Z must return null');
});

test('parses date-only DTEND events end-exclusively at UTC midnight', () => {
	const now = new Date('2026-09-01T12:00:00.000Z');
	const pastDate = getInviteExpiration('DTEND;VALUE=DATE:20260831', now);
	const futureDate = getInviteExpiration('DTEND:20260905', now);

	assert.deepEqual(pastDate, {
		eventEnd: new Date('2026-08-31T00:00:00.000Z'),
		isExpired: true,
	});
	assert.deepEqual(futureDate, {
		eventEnd: new Date('2026-09-05T00:00:00.000Z'),
		isExpired: false,
	});
});
