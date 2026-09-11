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

interface AccountStorageQuota {
	usedBytes: number;
	limitBytes: number;
}

/** `fields` is required, otherwise Drive omits the quota block from the response. */
const DRIVE_ABOUT_URL =
	'https://www.googleapis.com/drive/v3/about?fields=storageQuota';

const parseQuotaBytes = (value: unknown): number => {
	const parsed = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

let cachedAccountQuota: AccountStorageQuota | null | undefined;

/**
 * `DriveApp.getStorageUsed()` only counts Drive files, which massively
 * under-reports accounts whose quota is dominated by Gmail. The Drive REST
 * `about` resource reports the whole-account total (Drive + Gmail + Photos).
 */
const readAccountStorageQuota = (): AccountStorageQuota | null => {
	if (cachedAccountQuota !== undefined) {
		return cachedAccountQuota;
	}

	cachedAccountQuota = null;

	try {
		if (
			typeof UrlFetchApp === 'undefined' ||
			typeof ScriptApp === 'undefined' ||
			!ScriptApp.getOAuthToken
		) {
			return cachedAccountQuota;
		}

		const response = UrlFetchApp.fetch(DRIVE_ABOUT_URL, {
			headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
			muteHttpExceptions: true,
		});

		if (response.getResponseCode() !== 200) {
			throw new Error(
				`Drive about request failed with HTTP ${response.getResponseCode()}.`
			);
		}

		const quota = (
			JSON.parse(response.getContentText()) as {
				storageQuota?: { limit?: string; usage?: string };
			}
		).storageQuota;

		if (quota) {
			cachedAccountQuota = {
				usedBytes: parseQuotaBytes(quota.usage),
				limitBytes: parseQuotaBytes(quota.limit),
			};
		}
	} catch (error) {
		if (typeof Logger !== 'undefined') {
			Logger.log(
				`Falling back to DriveApp storage figures: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	return cachedAccountQuota;
};

const defaultStorageProvider: StorageProvider = {
	getStorageUsed(): number {
		const quota = readAccountStorageQuota();
		if (quota && quota.usedBytes > 0) {
			return quota.usedBytes;
		}
		if (typeof DriveApp !== 'undefined' && DriveApp.getStorageUsed) {
			return DriveApp.getStorageUsed();
		}
		return 0;
	},
	getStorageLimit(): number {
		const quota = readAccountStorageQuota();
		if (quota && quota.limitBytes > 0) {
			return quota.limitBytes;
		}
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

export const formatUsagePercent = (
	usedBytes: number,
	totalBytes: number
): string => {
	if (totalBytes <= 0 || usedBytes <= 0) {
		return '';
	}
	return `${Math.round((usedBytes / totalBytes) * 100)}%`;
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
