/* Pure counting logic: no DOM, camera, network, or persistence. */
(function attachCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HeadTrackerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCore() {
  'use strict';
  const DIRECTIONS = Object.freeze(['UP', 'DOWN', 'LEFT', 'RIGHT']);
  const VALID = new Set([...DIRECTIONS, 'CENTER']);

  function createRepetitionTracker(targetPerDirection = 3) {
    let target = validTarget(targetPerDirection, 3);
    const counts = { UP: 0, DOWN: 0, LEFT: 0, RIGHT: 0 };
    let previous = 'CENTER';
    let armed = null;
    const snapshot = () => ({ counts: { ...counts }, targetPerDirection: target, total: DIRECTIONS.reduce((sum, dir) => sum + counts[dir], 0), totalTarget: target * 4, complete: DIRECTIONS.every(dir => counts[dir] >= target) });
    function increment(direction, manual = false) {
      if (!DIRECTIONS.includes(direction)) return { type: 'invalid-direction', direction, ...snapshot() };
      if (counts[direction] >= target) return { type: 'direction-goal-reached', direction, ...snapshot() };
      counts[direction] += 1;
      return { type: manual ? 'manual-repetition' : 'repetition', direction, directionGoalReached: counts[direction] >= target, ...snapshot() };
    }
    return {
      observe(input) {
        const direction = VALID.has(input) ? input : 'CENTER';
        if (direction === previous) return { type: 'steady', direction, ...snapshot() };
        const from = previous;
        let event;
        if (from === 'CENTER' && direction !== 'CENTER') {
          armed = direction;
          event = { type: 'movement-started', direction, from, to: direction, ...snapshot() };
        } else if (from !== 'CENTER' && direction === 'CENTER') {
          event = armed === from ? increment(from) : { type: 'returned-without-valid-cycle', direction: from, ...snapshot() };
          event.from = from; event.to = direction;
          armed = null;
        } else {
          armed = null;
          event = { type: 'direction-switch-without-neutral', direction, from, to: direction, ...snapshot() };
        }
        previous = direction;
        return event;
      },
      recordManual(direction) { return increment(String(direction || '').toUpperCase(), true); },
      interruptMovement() { previous = 'CENTER'; armed = null; },
      setTargetPerDirection(value) { target = validTarget(value, target); return snapshot(); },
      reset() { DIRECTIONS.forEach(dir => { counts[dir] = 0; }); previous = 'CENTER'; armed = null; return snapshot(); },
      getSnapshot: snapshot
    };
  }
  function validTarget(value, fallback) { const n = Number(value); return Number.isInteger(n) && n >= 1 && n <= 100 ? n : fallback; }

  function directionFromPose(pose, baseline, thresholds = {}) {
    if (!pose || !baseline || !Number.isFinite(pose.horizontal) || !Number.isFinite(pose.vertical) || !Number.isFinite(baseline.horizontal) || !Number.isFinite(baseline.vertical)) return 'CENTER';
    const h = Number.isFinite(thresholds.horizontal) ? thresholds.horizontal : 0.20;
    const v = Number.isFinite(thresholds.vertical) ? thresholds.vertical : 0.18;
    const dx = pose.horizontal - baseline.horizontal;
    const dy = pose.vertical - baseline.vertical;
    if (Math.abs(dy) >= v && Math.abs(dy) >= Math.abs(dx) * 0.85) return dy < 0 ? 'UP' : 'DOWN';
    if (Math.abs(dx) >= h) return dx > 0 ? 'LEFT' : 'RIGHT';
    if (Math.abs(dy) >= v) return dy < 0 ? 'UP' : 'DOWN';
    return 'CENTER';
  }
  return Object.freeze({ DIRECTIONS, createRepetitionTracker, directionFromPose });
});
