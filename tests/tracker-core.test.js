const test = require('node:test');
const assert = require('node:assert/strict');
const { createTracker, directionFromPose } = require('../tracker-core.js');

test('camera repetition updates only after a complete direction-to-centre cycle', () => {
  const tracker = createTracker(2);
  assert.equal(tracker.observe('UP').type, 'movement-started');
  assert.equal(tracker.observe('UP').type, 'steady');
  const result = tracker.observe('CENTER');
  assert.equal(result.type, 'repetition');
  assert.equal(result.counts.UP, 1);
  assert.equal(result.total, 1);
});

test('directly switching directions never counts a completed repetition', () => {
  const tracker = createTracker(2);
  tracker.observe('LEFT');
  assert.equal(tracker.observe('RIGHT').type, 'direction-switch-without-neutral');
  assert.notEqual(tracker.observe('CENTER').type, 'repetition');
  assert.equal(tracker.getSnapshot().total, 0);
});

test('face interruption requires centre to be detected before the next repetition can start', () => {
  const tracker = createTracker(3);
  tracker.observe('UP');
  tracker.interruptMovement();
  assert.equal(tracker.observe('DOWN').type, 'waiting-for-neutral');
  assert.equal(tracker.getSnapshot().total, 0);
  assert.equal(tracker.observe('CENTER').type, 'neutral-restored');
  tracker.observe('DOWN');
  assert.equal(tracker.observe('CENTER').counts.DOWN, 1);
});

test('uncompleted movement can be interrupted without losing earlier counts', () => {
  const tracker = createTracker(3);
  tracker.observe('UP');
  tracker.observe('CENTER');
  tracker.observe('RIGHT');
  tracker.interruptMovement();
  const snap = tracker.getSnapshot();
  assert.equal(snap.counts.UP, 1);
  assert.equal(snap.counts.RIGHT, 0);
});

test('manual entries record one user-confirmed complete cycle', () => {
  const tracker = createTracker(1);
  assert.equal(tracker.recordManual('UP').type, 'manual-repetition');
  assert.equal(tracker.recordManual('up').type, 'direction-goal-reached');
  assert.equal(tracker.getSnapshot().counts.UP, 1);
});

test('session completes only when every direction reaches the selected goal', () => {
  const tracker = createTracker(1);
  tracker.recordManual('UP');
  tracker.recordManual('DOWN');
  tracker.recordManual('LEFT');
  assert.equal(tracker.getSnapshot().complete, false);
  const final = tracker.recordManual('RIGHT');
  assert.equal(final.complete, true);
  assert.equal(final.total, 4);
  assert.equal(final.totalTarget, 4);
});

test('goal update changes total target without modifying counts', () => {
  const tracker = createTracker(3);
  tracker.recordManual('LEFT');
  const result = tracker.setTargetPerDirection(5);
  assert.equal(result.targetPerDirection, 5);
  assert.equal(result.totalTarget, 20);
  assert.equal(result.counts.LEFT, 1);
});

test('reset clears counts and movement state', () => {
  const tracker = createTracker(2);
  tracker.observe('DOWN');
  tracker.observe('CENTER');
  tracker.reset();
  assert.equal(tracker.getSnapshot().total, 0);
  assert.equal(tracker.observe('LEFT').type, 'movement-started');
});

test('pose classifier detects four directions relative to neutral', () => {
  const baseline = { horizontal: 0, vertical: 0 };
  assert.equal(directionFromPose({ horizontal: 0, vertical: -0.3 }, baseline), 'UP');
  assert.equal(directionFromPose({ horizontal: 0, vertical: 0.3 }, baseline), 'DOWN');
  assert.equal(directionFromPose({ horizontal: 0.3, vertical: 0 }, baseline), 'LEFT');
  assert.equal(directionFromPose({ horizontal: -0.3, vertical: 0 }, baseline), 'RIGHT');
});

test('pose classifier ignores neutral-level jitter and invalid input', () => {
  const baseline = { horizontal: 0.1, vertical: -0.2 };
  assert.equal(directionFromPose({ horizontal: 0.11, vertical: -0.19 }, baseline), 'CENTER');
  assert.equal(directionFromPose(null, baseline), 'CENTER');
  assert.equal(directionFromPose({ horizontal: NaN, vertical: 0 }, baseline), 'CENTER');
});
