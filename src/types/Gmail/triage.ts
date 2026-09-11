export const TRIAGE_CATEGORIES = [
	'triage/personal',
	'triage/finance',
	'triage/govt',
	'triage/receipts',
	'triage/newsletters',
	'triage/alerts',
	'triage/junk',
	'triage/unknown',
] as const;

export type TriageCategory = (typeof TRIAGE_CATEGORIES)[number];

export const ATTACHMENT_TYPES = [
	'photo',
	'doc',
	'calendar',
	'audio',
	'video',
	'generic',
] as const;

export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

export const ATTACHMENT_ICONS: Record<AttachmentType, string> = {
	photo: '📷',
	doc: '📄',
	calendar: '📅',
	audio: '🎵',
	video: '🎬',
	generic: '📎',
};

export interface ExtractedEmailSnippet {
	id: string;
	sender: string;
	senderDomain: string;
	subject: string;
	snippet: string;
	hasAttachment: boolean;
	attachmentTypes: AttachmentType[];
	attachmentIcons: string[];
	ageInDays: number;
	sizeKb: number;
	date: Date;
	unsubscribeUrl?: string;
	unsubscribeMailto?: string;
}

export interface GeminiClassificationInput {
	id: string;
	sender: string;
	subject: string;
	snippet: string;
	hasAttachment: boolean;
	ageInDays: number;
	sizeKb: number;
}

export interface EffectiveDuplicateRef {
	threadId: string;
	subject: string;
}

export interface TriageClassification {
	id: string;
	category: TriageCategory;
	timeSensitive: boolean;
	actionRequired: boolean;
	summary: string;
	highlights: string[];
	keyDetail: string;
	duplicateOfId?: string;
}

export type TriageActionType =
	'apply-label-only' | 'recycle-7d-only' | 'apply-label-and-recycle-7d';

export interface TriageExecutionDirective {
	threadId: string;
	classification: TriageClassification;
	email: ExtractedEmailSnippet;
	actionType: TriageActionType;
	triageLabel?: TriageCategory;
	recycleLabel?: 'Auto-Recycle/7d';
	reason: string;
	effectiveDuplicates?: EffectiveDuplicateRef[];
}

export interface StorageMetrics {
	gmailUsedBytes: number;
	gmailTotalBytes: number;
	driveFreeBytes?: number;
	estimatedRecycleBytes: number;
}

export interface DailyDigestData {
	date: Date;
	processedCount: number;
	dailyLimit: number;
	actionRequiredCount: number;
	autoRecyclingCount: number;
	isHighVolumeOverflow: boolean;
	isDryRun: boolean;
	storage: StorageMetrics;
	entries: TriageExecutionDirective[];
}
