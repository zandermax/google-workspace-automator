import { PENDING_ACTION_LABEL } from './actionRules';
import { type ThreadLikeWithId } from './actionExecutor';

export interface RemovableLabelLike {
	getName(): string;
	addToThread(thread: unknown): void;
	removeFromThread(thread: unknown): void;
}

export interface ArchivableThread extends ThreadLikeWithId {
	moveToArchive(): void;
}

export interface TrashableThread extends ThreadLikeWithId {
	moveToTrash(): void;
}

export interface DigestActionOptions<TThread extends ThreadLikeWithId> {
	getLabel?: (name: string) => RemovableLabelLike | null;
	resolveThread?: (threadId: string) => TThread | null;
}

export interface DigestActionResult {
	threadId: string;
	action: 'archive' | 'delete';
	resolved: boolean;
}

const defaultGetRemovableLabel = (name: string): RemovableLabelLike | null => {
	if (typeof GmailApp === 'undefined') {
		throw new Error('GmailApp is not available in this environment.');
	}

	return GmailApp.getUserLabelByName(name) as unknown as RemovableLabelLike | null;
};

const defaultResolveArchivableThread = (threadId: string): ArchivableThread | null => {
	if (typeof GmailApp === 'undefined') {
		throw new Error('GmailApp is not available in this environment.');
	}

	return GmailApp.getThreadById(threadId) as unknown as ArchivableThread;
};

const defaultResolveTrashableThread = (threadId: string): TrashableThread | null => {
	if (typeof GmailApp === 'undefined') {
		throw new Error('GmailApp is not available in this environment.');
	}

	return GmailApp.getThreadById(threadId) as unknown as TrashableThread;
};

export const archiveDigestThread = <TThread extends ArchivableThread = ArchivableThread>(
	threadId: string,
	options: DigestActionOptions<TThread> = {}
): DigestActionResult => {
	const resolveThread = options.resolveThread ?? (defaultResolveArchivableThread as (id: string) => TThread | null);
	const getLabel = options.getLabel ?? defaultGetRemovableLabel;

	const thread = resolveThread(threadId);
	if (!thread) {
		return { threadId, action: 'archive', resolved: false };
	}

	thread.moveToArchive();

	const label = getLabel(PENDING_ACTION_LABEL);
	if (label) {
		label.removeFromThread(thread);
	}

	return { threadId, action: 'archive', resolved: true };
};

export const deleteDigestThread = <TThread extends TrashableThread = TrashableThread>(
	threadId: string,
	options: DigestActionOptions<TThread> = {}
): DigestActionResult => {
	const resolveThread = options.resolveThread ?? (defaultResolveTrashableThread as (id: string) => TThread | null);

	const thread = resolveThread(threadId);
	if (!thread) {
		return { threadId, action: 'delete', resolved: false };
	}

	thread.moveToTrash();

	return { threadId, action: 'delete', resolved: true };
};
