const test = require('node:test');
const assert = require('node:assert/strict');
const { createRepetitionTracker, directionFromPose } = require('../tracker-core.js');

test('one camera repetition requires direction then centre', () => {
  const tracker = createRepetitionTracker(3);
  assert.equal(tracker.observe('LEFT').type, 'movement-started');
  assert.equal(tracker.observe('LEFT').type, 'steady');
  assert.equal(tracker.observe('LEFT').type, 'steady');
  const completed = tracker.observe('CENTER');
  assert.equal(completed.type, 'repetition');
  assert.equal(completed.counts.LEFT, 1);
  assert.equal(completed.total, 1);
});

test('a direct switch between non-neutral directions is never counted', () => {
  const tracker = createRepetitionTracker(3);
  tracker.observe('LEFT');
  assert.equal(tracker.observe('RIGHT').type, 'direction-switch-without-neutral');
  assert.notEqual(tracker.observe('CENTER').type, 'repetition');
  assert.equal(tracker.getSnapshot().total, 0);
});

test('face loss interrupts an incomplete cycle but preserves completed cycles', () => {
  const tracker = createRepetitionTracker(3);
  tracker.observe('UP'); tracker.observe('CENTER');
  tracker.observe('DOWN'); tracker.interruptMovement();
  assert.equal(tracker.getSnapshot().counts.UP, 1);
  assert.equal(tracker.getSnapshot().counts.DOWN, 0);
  tracker.observe('DOWN');
  assert.equal(tracker.observe('CENTER').counts.DOWN, 1);
});

test('same direction cannot produce repeated counts without an intervening centre', () => {
  const tracker = createRepetitionTracker(3);
  tracker.observe('UP');
  for (let i = 0; i < 40; i++) tracker.observe('UP');
  assert.equal(tracker.getSnapshot().counts.UP, 0);
  tracker.observe('CENTER');
  tracker.observe('UP');
  assert.equal(tracker.getSnapshot().counts.UP, 1);
});

test('goal cap and session completion are correct', () => {
  const tracker = createRepetitionTracker(1);
  for (const direction of ['UP', 'DOWN', 'LEFT', 'RIGHT']) tracker.recordManual(direction);
  assert.equal(tracker.getSnapshot().complete, true);
  assert.equal(tracker.getSnapshot().total, 4);
  assert.equal(tracker.recordManual('UP').type, 'direction-goal-reached');
  assert.equal(tracker.getSnapshot().counts.UP, 1);
});

test('manual entries are independent and reject invalid directions', () => {
  const tracker = createRepetitionTracker(2);
  assert.equal(tracker.recordManual('bogus').type, 'invalid-direction');
  assert.equal(tracker.recordManual('up').counts.UP, 1);
  assert.equal(tracker.recordManual('RIGHT').counts.RIGHT, 1);
});

test('invalid target values do not introduce zero or negative goals', () => {
  const tracker = createRepetitionTracker(3);
  tracker.setTargetPerDirection(-1);
  assert.equal(tracker.getSnapshot().targetPerDirection, 3);
  tracker.setTargetPerDirection(5);
  assert.equal(tracker.getSnapshot().totalTarget, 20);
});

test('pose classifier identifies four directions relative to calibration', () => {
  const base = { horizontal: 0, vertical: 0 };
  assert.equal(directionFromPose({ horizontal: 0, vertical: -0.3 }, base), 'UP');
  assert.equal(directionFromPose({ horizontal: 0, vertical: 0.3 }, base), 'DOWN');
  assert.equal(directionFromPose({ horizontal: 0.3, vertical: 0 }, base), 'LEFT');
  assert.equal(directionFromPose({ horizontal: -0.3, vertical: 0 }, base), 'RIGHT');
  assert.equal(directionFromPose({ horizontal: 0.01, vertical: 0.01 }, base), 'CENTER');
});

test('pose classifier uses hysteresis around neutral to reduce direction flicker', () => {
  const base = { horizontal: 0, vertical: 0 };
  assert.equal(directionFromPose({ horizontal: 0.085, vertical: 0 }, base, { activeDirection: 'LEFT' }), 'LEFT');
  assert.equal(directionFromPose({ horizontal: 0.025, vertical: 0 }, base, { activeDirection: 'LEFT' }), 'CENTER');
});

test('malformed pose inputs safely return centre', () => {
  assert.equal(directionFromPose(null, null), 'CENTER');
  assert.equal(directionFromPose({ horizontal: NaN, vertical: 1 }, { horizontal: 0, vertical: 0 }), 'CENTER');
});
