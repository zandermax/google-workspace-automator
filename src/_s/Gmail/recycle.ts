import GmailQuery from '../../Gmail/GmailQuery';
import { labelProcessed } from '../../Gmail/actions/labelAsProcessed';
import { type TimePeriod } from '@/types/Gmail/dateAndTime';

const AUTO_RECYCLE_LABEL_PATTERN = /^Auto-Recycle\/(\d+)(d|w|m|y|day|days|month|months|year|years)$/u;
const RETENTION_DAYS: Record<string, number> = {
	d: 1,
	w: 7,
	m: 30,
	y: 365,
	day: 1,
	days: 1,
	month: 30,
	months: 30,
	year: 365,
	years: 365,
};

const getRecycleLabelDuration = (labelName: string): number | undefined => {
	const match = AUTO_RECYCLE_LABEL_PATTERN.exec(labelName);
	if (!match) {
		return undefined;
	}

	return Number(match[1]) * RETENTION_DAYS[match[2]];
};

export const getShortestAutoRecycleLabel = (
	labelNames: readonly string[]
): string | undefined => {
	let shortestLabel: string | undefined;
	let shortestDuration = Number.POSITIVE_INFINITY;

	for (const labelName of labelNames) {
		const duration = getRecycleLabelDuration(labelName);
		if (duration !== undefined && duration < shortestDuration) {
			shortestLabel = labelName;
			shortestDuration = duration;
		}
	}

	return shortestLabel;
};

export const recycle = () => {
	const labels = GmailApp.getUserLabels();
	for (const label of labels) {
		const recycleLabel = label.getName();
		if (getRecycleLabelDuration(recycleLabel) === undefined) {
			continue;
		}

		new GmailQuery().label(recycleLabel).isNotIn('trash').processSync({
			callback: (threads) => {
				for (const thread of threads) {
					const recycleLabels = thread
						.getLabels()
						.map((threadLabel) => threadLabel.getName())
						.filter((name) => getRecycleLabelDuration(name) !== undefined);
					const shortestLabel = getShortestAutoRecycleLabel(recycleLabels);

					for (const labelName of recycleLabels) {
						if (labelName !== shortestLabel) {
							const duplicateLabel = GmailApp.getUserLabelByName(labelName);
							if (duplicateLabel) {
								thread.removeLabel(duplicateLabel);
							}
						}
					}
				}
			},
		});
	}

	for (const label of labels) {
		const recycleLabel = label.getName();

		if (getRecycleLabelDuration(recycleLabel) !== undefined) {
			const time = recycleLabel.split('/')[1] as TimePeriod;
			Logger.log(`Found recycle label: ${recycleLabel}`);

			const query = new GmailQuery()
				.label(recycleLabel)
				.olderThan(time)
				.isNotIn('trash');
			let count = 0;
			query.processSync({
				callback: (threads) => {
					labelProcessed('Gmail-Autorecycle', threads);
					for (const thread of threads) {
						thread.moveToTrash();
					}

					count += threads.length;
				},
			});

			Logger.log(
				`Processed ${count} messages labelled ${recycleLabel}, older than ${time}`
			);
		}
	}
};
