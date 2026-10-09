const test = require('node:test');
const assert = require('node:assert/strict');
const { createRepetitionTracker, directionFromPose } = require('../tracker-core.js');

test('counts one camera repetition only after returning to centre', () => {
  const tracker = createRepetitionTracker(3);
  assert.equal(tracker.observe('LEFT').type, 'movement-started');
  assert.equal(tracker.observe('LEFT').type, 'steady');
  const result = tracker.observe('CENTER');
  assert.equal(result.type, 'repetition');
  assert.equal(result.counts.LEFT, 1);
  assert.equal(result.total, 1);
});

test('does not count a direct switch from one direction to another', () => {
  const tracker = createRepetitionTracker(3);
  tracker.observe('LEFT');
  const switched = tracker.observe('RIGHT');
  assert.equal(switched.type, 'direction-switch-without-neutral');
  const returned = tracker.observe('CENTER');
  assert.notEqual(returned.type, 'repetition');
  assert.equal(returned.total, 0);
});

test('face-tracking interruption clears an unfinished movement, not completed counts', () => {
  const tracker = createRepetitionTracker(3);
  tracker.observe('UP');
  tracker.observe('CENTER');
  tracker.observe('DOWN');
  tracker.interruptMovement();
  assert.equal(tracker.getSnapshot().counts.UP, 1);
  assert.equal(tracker.getSnapshot().counts.DOWN, 0);
  tracker.observe('DOWN');
  assert.equal(tracker.observe('CENTER').counts.DOWN, 1);
});

test('each directional count is capped at the chosen target', () => {
  const tracker = createRepetitionTracker(1);
  tracker.observe('UP');
  tracker.observe('CENTER');
  tracker.observe('UP');
  const second = tracker.observe('CENTER');
  assert.equal(second.counts.UP, 1);
  assert.equal(second.total, 1);
});

test('manual records count confirmed completed cycles and report whole-session completion', () => {
  const tracker = createRepetitionTracker(1);
  tracker.recordManual('UP');
  tracker.recordManual('DOWN');
  tracker.recordManual('LEFT');
  const result = tracker.recordManual('RIGHT');
  assert.equal(result.type, 'manual-repetition');
  assert.equal(result.complete, true);
  assert.equal(result.total, 4);
  assert.equal(result.totalTarget, 4);
});

test('pose classifier compares calibrated pose with horizontal and vertical thresholds', () => {
  const baseline = { horizontal: 0.1, vertical: 0.7 };
  assert.equal(directionFromPose({ horizontal: 0.1, vertical: 0.3 }, baseline), 'UP');
  assert.equal(directionFromPose({ horizontal: 0.1, vertical: 1.1 }, baseline), 'DOWN');
  assert.equal(directionFromPose({ horizontal: 0.5, vertical: 0.7 }, baseline), 'LEFT');
  assert.equal(directionFromPose({ horizontal: -0.3, vertical: 0.7 }, baseline), 'RIGHT');
  assert.equal(directionFromPose({ horizontal: 0.15, vertical: 0.75 }, baseline), 'CENTER');
});
