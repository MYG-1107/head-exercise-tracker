const test = require('node:test');
const assert = require('node:assert/strict');
const { createRepetitionTracker, directionFromPose } = require('../tracker-core.js');

test('counts one repetition only after direction then centre', () => {
  const t = createRepetitionTracker(3);
  assert.equal(t.observe('LEFT').type, 'movement-started');
  assert.equal(t.observe('LEFT').type, 'steady');
  const e = t.observe('CENTER');
  assert.equal(e.type, 'repetition'); assert.equal(e.counts.LEFT, 1); assert.equal(e.total, 1);
});
test('direct switch between non-centre directions never counts', () => {
  const t = createRepetitionTracker(3); t.observe('LEFT');
  assert.equal(t.observe('RIGHT').type, 'direction-switch-without-neutral');
  assert.notEqual(t.observe('CENTER').type, 'repetition'); assert.equal(t.getSnapshot().total, 0);
});
test('interruption cancels an unfinished cycle without clearing completed counts', () => {
  const t = createRepetitionTracker(3); t.observe('UP'); t.observe('CENTER'); t.observe('DOWN'); t.interruptMovement();
  assert.equal(t.getSnapshot().counts.UP, 1); assert.equal(t.getSnapshot().counts.DOWN, 0);
  t.observe('DOWN'); assert.equal(t.observe('CENTER').counts.DOWN, 1);
});
test('direction count never exceeds the selected target', () => {
  const t = createRepetitionTracker(1); t.observe('UP'); t.observe('CENTER'); t.observe('UP');
  assert.equal(t.observe('CENTER').counts.UP, 1); assert.equal(t.getSnapshot().total, 1);
});
test('manual cycle recording works and completes total target', () => {
  const t = createRepetitionTracker(1); t.recordManual('UP'); t.recordManual('DOWN'); t.recordManual('LEFT');
  const result = t.recordManual('RIGHT'); assert.equal(result.type, 'manual-repetition'); assert.equal(result.complete, true); assert.equal(result.total, 4);
});
test('target selection accepts valid positive limits and ignores invalid values', () => {
  const t = createRepetitionTracker(3); assert.equal(t.setTargetPerDirection(5).totalTarget, 20);
  assert.equal(t.setTargetPerDirection(-1).targetPerDirection, 5); assert.equal(t.setTargetPerDirection(101).targetPerDirection, 5);
});
test('pose classifier detects four directions relative to calibrated neutral', () => {
  const b = { horizontal: 0, vertical: 0 };
  assert.equal(directionFromPose({ horizontal: 0, vertical: -0.25 }, b), 'UP');
  assert.equal(directionFromPose({ horizontal: 0, vertical: 0.24 }, b), 'DOWN');
  assert.equal(directionFromPose({ horizontal: 0.27, vertical: 0 }, b), 'LEFT');
  assert.equal(directionFromPose({ horizontal: -0.27, vertical: 0 }, b), 'RIGHT');
  assert.equal(directionFromPose({ horizontal: 0.06, vertical: 0.05 }, b), 'CENTER');
});
test('invalid directions never affect counts', () => {
  const t = createRepetitionTracker(3); const event = t.recordManual('NOT A DIRECTION');
  assert.equal(event.type, 'invalid-direction'); assert.equal(t.getSnapshot().total, 0);
});
