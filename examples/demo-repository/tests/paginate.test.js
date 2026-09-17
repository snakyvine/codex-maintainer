import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate } from '../src/paginate.js';

test('the first page contains the first two items', () => {
  assert.deepEqual(paginate([1, 2, 3, 4], 1, 2), [1, 2]);
});
test('later pages contain the remaining items', () => {
  assert.deepEqual(paginate([1, 2, 3, 4], 2, 2), [3, 4]);
});
