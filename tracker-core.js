/* Pure movement state logic. No DOM, camera, networking, or persistence. */
(function attach(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HeadTrackerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createApi() {
  'use strict';
  const DIRECTIONS = Object.freeze(['UP', 'DOWN', 'LEFT', 'RIGHT']);
  const VALID = new Set([...DIRECTIONS, 'CENTER']);

  function validTarget(value, fallback = 3) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 100 ? number : fallback;
  }
  function makeCounts() { return { UP: 0, DOWN: 0, LEFT: 0, RIGHT: 0 }; }

  function createRepetitionTracker(targetPerDirection = 3) {
    let target = validTarget(targetPerDirection);
    const counts = makeCounts();
    let previous = 'CENTER';
    let armed = null;

    function total() { return DIRECTIONS.reduce((sum, direction) => sum + counts[direction], 0); }
    function complete() { return DIRECTIONS.every(direction => counts[direction] >= target); }
    function snapshot() {
      return { counts: { ...counts }, targetPerDirection: target, total: total(), totalTarget: target * DIRECTIONS.length, complete: complete() };
    }
    function count(direction, source) {
      if (!DIRECTIONS.includes(direction)) return { type: 'invalid-direction', direction, ...snapshot() };
      if (counts[direction] >= target) return { type: 'direction-goal-reached', direction, ...snapshot() };
      counts[direction] += 1;
      const snap = snapshot();
      return { type: source === 'manual' ? 'manual-repetition' : 'repetition', direction, directionGoalReached: counts[direction] >= target, ...snap };
    }

    return Object.freeze({
      observe(input) {
        const direction = VALID.has(input) ? input : 'CENTER';
        if (direction === previous) return { type: 'steady', direction, ...snapshot() };
        const from = previous;
        let event;
        if (from === 'CENTER' && direction !== 'CENTER') {
          armed = direction;
          event = { type: 'movement-started', direction, from, to: direction, ...snapshot() };
        } else if (from !== 'CENTER' && direction === 'CENTER') {
          event = armed === from
            ? { ...count(from, 'camera'), from, to: direction }
            : { type: 'returned-without-valid-cycle', direction: from, from, to: direction, ...snapshot() };
          armed = null;
        } else {
          armed = null;
          event = { type: 'direction-switch-without-neutral', direction, from, to: direction, ...snapshot() };
        }
        previous = direction;
        return event;
      },
      recordManual(input) { return count(String(input || '').toUpperCase(), 'manual'); },
      interruptMovement() { previous = 'CENTER'; armed = null; },
      setTargetPerDirection(value) { target = validTarget(value, target); return snapshot(); },
      reset() { DIRECTIONS.forEach(direction => { counts[direction] = 0; }); previous = 'CENTER'; armed = null; return snapshot(); },
      getSnapshot: snapshot
    });
  }

  /*
   * Pose is normalized by eye distance. Entry thresholds are deliberately separate
   * from exit thresholds (hysteresis) to reduce flicker near neutral.
   * The labels LEFT/RIGHT are preview-screen directions for a mirrored selfie preview.
   */
  function directionFromPose(pose, baseline, options = {}) {
    if (!pose || !baseline || !Number.isFinite(pose.horizontal) || !Number.isFinite(pose.vertical) ||
        !Number.isFinite(baseline.horizontal) || !Number.isFinite(baseline.vertical)) return 'CENTER';
    const hEnter = Number.isFinite(options.horizontalEnter) ? options.horizontalEnter : 0.13;
    const vEnter = Number.isFinite(options.verticalEnter) ? options.verticalEnter : 0.12;
    const hExit = Number.isFinite(options.horizontalExit) ? options.horizontalExit : 0.065;
    const vExit = Number.isFinite(options.verticalExit) ? options.verticalExit : 0.06;
    const active = VALID.has(options.activeDirection) ? options.activeDirection : 'CENTER';
    const dx = pose.horizontal - baseline.horizontal;
    const dy = pose.vertical - baseline.vertical;

    if (active === 'UP' && dy <= -vExit && Math.abs(dy) >= Math.abs(dx) * 0.72) return 'UP';
    if (active === 'DOWN' && dy >= vExit && Math.abs(dy) >= Math.abs(dx) * 0.72) return 'DOWN';
    if (active === 'LEFT' && dx >= hExit && Math.abs(dx) >= Math.abs(dy) * 0.72) return 'LEFT';
    if (active === 'RIGHT' && dx <= -hExit && Math.abs(dx) >= Math.abs(dy) * 0.72) return 'RIGHT';

    const hStrength = Math.abs(dx) / hEnter;
    const vStrength = Math.abs(dy) / vEnter;
    if (hStrength < 1 && vStrength < 1) return 'CENTER';
    if (vStrength >= hStrength) return dy < 0 ? 'UP' : 'DOWN';
    return dx > 0 ? 'LEFT' : 'RIGHT';
  }
  return Object.freeze({ DIRECTIONS, createRepetitionTracker, directionFromPose });
});
