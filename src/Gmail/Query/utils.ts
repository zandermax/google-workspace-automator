import { type TimePeriod } from '../types/dateAndTime';

export const add0 = (number: number) => (number > 9 ? number : `0${number}`);

export const checkQuery = (query = '') => {
	if (!query) throw new Error('No query specified');
};

export const getDateQuery = (timePeriod: TimePeriod) => {
	const timePeriodStrings = timePeriod.split(/(\d+)/u);
	const amount = timePeriodStrings[1];
	const period = timePeriodStrings[2].at(0);
	return `${amount}${period}`;
};
