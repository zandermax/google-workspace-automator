 

/**
 * Helper method to allow parameters to be either an array or single element. This will return an
 * array.
 *
 * @param potentialArray single element or array
 * @returns an array, either the same that was given, or of the single element
 */
export const makeArray = <T>(potentialArray: T | T[]) =>
	Array.isArray(potentialArray) ? potentialArray : [potentialArray];

/**
 * Returns elements of an array by groups of given size
 *
 * @param array Array to split into chunks
 * @param chunkSize number of elements per chunk
 */
export function* arrayByChunk<T>(array: T[], chunkSize: number) {
	for (
		let currentLocation = 0;
		currentLocation < array.length;
		currentLocation += chunkSize
	) {
		yield array.slice(currentLocation, currentLocation + chunkSize);
	}
}
