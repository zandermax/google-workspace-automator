import {
	sendDryRunInboxSortDigest,
	type InboxSortDryRunSummary,
} from 'Gmail/sorter';

export const dryRunSortInbox = (): InboxSortDryRunSummary => {
	const summary = sendDryRunInboxSortDigest({
		maxThreads: 20,
		includeRead: false,
	});

	Logger.log(
		`Dry-run sorter complete: ${summary.processed} processed, ${summary.reviewQueue.length} in review.`
	);

	return summary;
};
