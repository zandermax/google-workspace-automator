import {
	type AttachmentType,
	type ExtractedEmailSnippet,
	type GeminiClassificationInput,
	ATTACHMENT_ICONS,
} from '@/types/Gmail/triage';

export interface AttachmentLike {
	getContentType(): string;
	getName(): string;
	getSize?(): number;
}

export interface MessageLike {
	getId(): string;
	getFrom(): string;
	getSubject(): string;
	getPlainBody?(): string;
	getBody?(): string;
	getDate(): Date;
	getAttachments?(): AttachmentLike[];
	getHeader?(name: string): string;
	getRawContent?(): string;
	getThread?(): {
		getId(): string;
	};
}

export interface ThreadLike {
	getId(): string;
	getMessages(): MessageLike[];
}

export const sanitizeSnippet = (rawBody?: string, maxLength = 300): string => {
	if (!rawBody) {
		return '';
	}

	const withoutStyles = rawBody
		.replace(/<style[\s\S]*?<\/style>/giu, ' ')
		.replace(/<script[\s\S]*?<\/script>/giu, ' ');

	const withoutHtml = withoutStyles.replace(/<[^>]+>/gu, ' ');

	const decoded = withoutHtml
		.replace(/&nbsp;/giu, ' ')
		.replace(/&amp;/giu, '&')
		.replace(/&lt;/giu, '<')
		.replace(/&gt;/giu, '>')
		.replace(/&quot;/giu, '"')
		.replace(/&#39;/giu, "'")
		.replace(/&#039;/giu, "'");

	const singleSpaced = decoded.replace(/\s+/gu, ' ').trim();

	if (singleSpaced.length <= maxLength) {
		return singleSpaced;
	}

	return singleSpaced.slice(0, maxLength).trim();
};

export const parseDomainFromEmail = (sender: string): string => {
	if (!sender) {
		return '';
	}

	const emailMatch = /<([^>]+)>/u.exec(sender);
	const address = (emailMatch ? emailMatch[1] : sender).trim();
	const atIndex = address.lastIndexOf('@');

	if (atIndex === -1 || atIndex === address.length - 1) {
		return '';
	}

	return address.slice(atIndex + 1).toLowerCase();
};

export const classifyAttachment = (
	contentType: string,
	name = ''
): AttachmentType => {
	const type = contentType.toLowerCase();
	const filename = name.toLowerCase();

	if (
		type.includes('calendar') ||
		type.includes('ics') ||
		filename.endsWith('.ics') ||
		filename.endsWith('.ifb')
	) {
		return 'calendar';
	}

	if (
		type.startsWith('image/') ||
		/\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/iu.test(filename)
	) {
		return 'photo';
	}

	if (
		type.includes('pdf') ||
		type.includes('word') ||
		type.includes('document') ||
		type.includes('sheet') ||
		type.includes('excel') ||
		type.includes('presentation') ||
		type.includes('powerpoint') ||
		type.includes('csv') ||
		type === 'text/plain' ||
		/\.(pdf|docx?|xlsx?|pptx?|csv|txt|rtf|odt|ods|odp)$/iu.test(filename)
	) {
		return 'doc';
	}

	if (
		type.startsWith('audio/') ||
		/\.(mp3|wav|m4a|aac|ogg|flac)$/iu.test(filename)
	) {
		return 'audio';
	}

	if (
		type.startsWith('video/') ||
		/\.(mp4|mov|avi|mkv|webm)$/iu.test(filename)
	) {
		return 'video';
	}

	return 'generic';
};

export const parseUnsubscribeHeaders = (
	headerValue?: string
): { url?: string; mailto?: string } => {
	if (!headerValue) {
		return {};
	}

	const matches = headerValue.match(/<([^>]+)>/gu);
	const links = matches
		? matches.map((m) => m.slice(1, -1).trim())
		: headerValue.split(',').map((part) => part.trim());

	let url: string | undefined;
	let mailto: string | undefined;

	for (const link of links) {
		if (!url && /^https?:\/\//iu.test(link)) {
			url = link;
		} else if (!mailto && /^mailto:/iu.test(link)) {
			mailto = link;
		}
	}

	return { url, mailto };
};

export const calculateAgeInDays = (date: Date, now = new Date()): number => {
	const diffMs = now.getTime() - date.getTime();
	return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
};

export const extractUnsubscribeHeaderFromMessage = (
	message: MessageLike
): { url?: string; mailto?: string } => {
	if (typeof message.getHeader === 'function') {
		const header = message.getHeader('List-Unsubscribe');
		if (header) {
			return parseUnsubscribeHeaders(header);
		}
	}

	if (typeof message.getRawContent === 'function') {
		const raw = message.getRawContent();
		if (raw) {
			const match =
				/List-Unsubscribe:\s*([^\r\n]+(?:\r?\n[ \t]+[^\r\n]+)*)/iu.exec(raw);
			if (match) {
				return parseUnsubscribeHeaders(match[1]);
			}
		}
	}

	return {};
};

export const extractEmailSnippetFromMessage = (
	message: MessageLike,
	now = new Date()
): ExtractedEmailSnippet => {
	const id = message.getThread ? message.getThread().getId() : message.getId();
	const sender = message.getFrom() || '(unknown sender)';
	const senderDomain = parseDomainFromEmail(sender);
	const subject = message.getSubject() || '(no subject)';

	const body =
		(typeof message.getPlainBody === 'function'
			? message.getPlainBody()
			: undefined) ||
		(typeof message.getBody === 'function' ? message.getBody() : '') ||
		'';
	const snippet = sanitizeSnippet(body, 300);

	const rawAttachments =
		typeof message.getAttachments === 'function'
			? message.getAttachments() || []
			: [];
	const attachmentTypes: AttachmentType[] = [];
	let attachmentBytes = 0;

	for (const att of rawAttachments) {
		const type = classifyAttachment(att.getContentType(), att.getName());
		if (!attachmentTypes.includes(type)) {
			attachmentTypes.push(type);
		}
		if (typeof att.getSize === 'function') {
			attachmentBytes += att.getSize() || 0;
		}
	}

	const hasAttachment = rawAttachments.length > 0;
	const attachmentIcons = attachmentTypes.map((t) => ATTACHMENT_ICONS[t]);

	const date = message.getDate() || now;
	const ageInDays = calculateAgeInDays(date, now);

	const bodyBytes = body.length;
	const totalBytes = attachmentBytes + bodyBytes;
	const sizeKb = Math.max(1, Math.round(totalBytes / 1024));

	const { url: unsubscribeUrl, mailto: unsubscribeMailto } =
		extractUnsubscribeHeaderFromMessage(message);

	return {
		id,
		sender,
		senderDomain,
		subject,
		snippet,
		hasAttachment,
		attachmentTypes,
		attachmentIcons,
		ageInDays,
		sizeKb,
		date,
		unsubscribeUrl,
		unsubscribeMailto,
	};
};

export const extractEmailSnippetFromThread = (
	thread: ThreadLike,
	now = new Date()
): ExtractedEmailSnippet => {
	const messages = thread.getMessages();
	const latestMessage = messages[messages.length - 1];

	if (!latestMessage) {
		return {
			id: thread.getId(),
			sender: '(unknown sender)',
			senderDomain: '',
			subject: '(no subject)',
			snippet: '',
			hasAttachment: false,
			attachmentTypes: [],
			attachmentIcons: [],
			ageInDays: 0,
			sizeKb: 1,
			date: now,
		};
	}

	const snippet = extractEmailSnippetFromMessage(latestMessage, now);
	// Overwrite id with thread id to ensure consistent thread-level tracking
	return {
		...snippet,
		id: thread.getId(),
	};
};

export const toGeminiClassificationInput = (
	extracted: ExtractedEmailSnippet
): GeminiClassificationInput => ({
	id: extracted.id,
	sender: extracted.sender,
	subject: extracted.subject,
	snippet: extracted.snippet,
	hasAttachment: extracted.hasAttachment,
	ageInDays: extracted.ageInDays,
	sizeKb: extracted.sizeKb,
});
