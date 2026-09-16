import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { getShortestAutoRecycleLabel } from '../src/_s/Gmail/recycle';

test('getShortestAutoRecycleLabel selects the shortest valid recycle window', () => {
	assert.equal(
		getShortestAutoRecycleLabel([
			'Auto-Recycle/30d',
			'Auto-Recycle/7d',
			'Auto-Recycle/3d',
			'other-label',
		]),
		'Auto-Recycle/3d'
	);
});