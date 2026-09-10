import {
	type StorageMetrics,
	type TriageExecutionDirective,
} from '@/types/Gmail/triage';

export interface StorageProvider {
	getStorageUsed(): number;
	getStorageLimit(): number;
}

export interface StorageStatsOptions {
	storageProvider?: StorageProvider;
}

const defaultStorageProvider: StorageProvider = {
	getStorageUsed(): number {
		if (typeof DriveApp !== 'undefined' && DriveApp.getStorageUsed) {
			return DriveApp.getStorageUsed();
		}
		return 0;
	},
	getStorageLimit(): number {
		if (typeof DriveApp !== 'undefined' && DriveApp.getStorageLimit) {
			return DriveApp.getStorageLimit();
		}
		return 0;
	},
};

export const calculateEstimatedRecycleBytes = (
	directives: readonly TriageExecutionDirective[]
): number => {
	let totalBytes = 0;
	for (const directive of directives) {
		if (directive.recycleLabel) {
			totalBytes += (directive.email.sizeKb || 0) * 1024;
		}
	}
	return totalBytes;
};

const formatUnitValue = (val: number): string => {
	if (Number.isInteger(val) || val >= 10) {
		return `${Math.round(val)}`;
	}
	return val.toFixed(1);
};

export const formatBytes = (bytes: number): string => {
	if (bytes <= 0 || !Number.isFinite(bytes)) {
		return '0 B';
	}
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	const kb = bytes / 1024;
	if (kb < 1024) {
		return `${formatUnitValue(kb)} KB`;
	}
	const mb = kb / 1024;
	if (mb < 1024) {
		return `${formatUnitValue(mb)} MB`;
	}
	const gb = mb / 1024;
	return `${formatUnitValue(gb)} GB`;
};

export const formatMegabytes = (bytes: number): string => {
	const mb = bytes / (1024 * 1024);
	if (mb < 0.1 && mb > 0) {
		return '< 0.1 MB';
	}
	return `${formatUnitValue(mb)} MB`;
};

export const formatGigabytes = (bytes: number): string => {
	const gb = bytes / (1024 * 1024 * 1024);
	return `${formatUnitValue(gb)} GB`;
};

export const getStorageMetrics = (
	directives: readonly TriageExecutionDirective[] = [],
	options: StorageStatsOptions = {}
): StorageMetrics => {
	const provider = options.storageProvider ?? defaultStorageProvider;

	let gmailUsedBytes = 0;
	let gmailTotalBytes = 0;

	try {
		gmailUsedBytes = provider.getStorageUsed();
		gmailTotalBytes = provider.getStorageLimit();
	} catch (error) {
		if (typeof Logger !== 'undefined') {
			Logger.log(
				`Failed to retrieve storage metrics: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	const estimatedRecycleBytes = calculateEstimatedRecycleBytes(directives);
	const driveFreeBytes =
		gmailTotalBytes > gmailUsedBytes
			? gmailTotalBytes - gmailUsedBytes
			: undefined;

	return {
		gmailUsedBytes,
		gmailTotalBytes,
		driveFreeBytes,
		estimatedRecycleBytes,
	};
};
