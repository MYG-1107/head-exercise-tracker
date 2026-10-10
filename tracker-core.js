/* Pure tracking logic. No DOM, camera, networking, or persistence. */
(function attachCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HeadTrackerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  'use strict';
  const DIRECTIONS = Object.freeze(['UP', 'DOWN', 'LEFT', 'RIGHT']);
  const VALID = new Set([...DIRECTIONS, 'CENTER']);

  function safeGoal(value, fallback = 3) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 100 ? number : fallback;
  }
  function cloneCounts(counts) { return { UP: counts.UP, DOWN: counts.DOWN, LEFT: counts.LEFT, RIGHT: counts.RIGHT }; }

  function createTracker(targetPerDirection = 3) {
    let target = safeGoal(targetPerDirection);
    const counts = { UP: 0, DOWN: 0, LEFT: 0, RIGHT: 0 };
    let previous = 'CENTER';
    let armed = null;
    let mustFindNeutral = false;

    const total = () => DIRECTIONS.reduce((sum, direction) => sum + counts[direction], 0);
    const complete = () => DIRECTIONS.every(direction => counts[direction] >= target);
    const snapshot = () => ({ counts: cloneCounts(counts), targetPerDirection: target, total: total(), totalTarget: target * DIRECTIONS.length, complete: complete() });

    function count(direction, manual = false) {
      if (!DIRECTIONS.includes(direction)) return { type: 'invalid-direction', direction, ...snapshot() };
      if (counts[direction] >= target) return { type: 'direction-goal-reached', direction, ...snapshot() };
      counts[direction] += 1;
      return { type: manual ? 'manual-repetition' : 'repetition', direction, directionGoalReached: counts[direction] >= target, ...snapshot() };
    }

    return Object.freeze({
      observe(input) {
        const direction = VALID.has(input) ? input : 'CENTER';
        if (mustFindNeutral) {
          if (direction === 'CENTER') {
            mustFindNeutral = false;
            previous = 'CENTER';
            armed = null;
            return { type: 'neutral-restored', direction, ...snapshot() };
          }
          return { type: 'waiting-for-neutral', direction, ...snapshot() };
        }
        if (direction === previous) return { type: 'steady', direction, ...snapshot() };
        const from = previous;
        let event;
        if (from === 'CENTER' && direction !== 'CENTER') {
          armed = direction;
          event = { type: 'movement-started', direction, from, to: direction, ...snapshot() };
        } else if (from !== 'CENTER' && direction === 'CENTER') {
          event = armed === from ? count(from) : { type: 'returned-without-valid-cycle', direction: from, ...snapshot() };
          event.from = from;
          event.to = direction;
          armed = null;
        } else {
          armed = null;
          event = { type: 'direction-switch-without-neutral', direction, from, to: direction, ...snapshot() };
        }
        previous = direction;
        return event;
      },
      recordManual(direction) { return count(String(direction || '').toUpperCase(), true); },
      interruptMovement() {
        previous = 'CENTER';
        armed = null;
        mustFindNeutral = true;
        return snapshot();
      },
      resetMovement() {
        previous = 'CENTER';
        armed = null;
        mustFindNeutral = false;
        return snapshot();
      },
      setTargetPerDirection(value) { target = safeGoal(value, target); return snapshot(); },
      reset() {
        DIRECTIONS.forEach(direction => { counts[direction] = 0; });
        previous = 'CENTER'; armed = null; mustFindNeutral = false;
        return snapshot();
      },
      getSnapshot: snapshot
    });
  }

  function directionFromPose(pose, baseline, thresholds = {}) {
    if (!pose || !baseline || !Number.isFinite(pose.horizontal) || !Number.isFinite(pose.vertical) ||
        !Number.isFinite(baseline.horizontal) || !Number.isFinite(baseline.vertical)) return 'CENTER';
    const h = Number.isFinite(thresholds.horizontal) ? thresholds.horizontal : 0.09;
    const v = Number.isFinite(thresholds.vertical) ? thresholds.vertical : 0.10;
    const nh = Number.isFinite(thresholds.neutralHorizontal) ? thresholds.neutralHorizontal : h * 0.50;
    const nv = Number.isFinite(thresholds.neutralVertical) ? thresholds.neutralVertical : v * 0.50;
    const dx = pose.horizontal - baseline.horizontal;
    const dy = pose.vertical - baseline.vertical;
    if (Math.abs(dx) <= nh && Math.abs(dy) <= nv) return 'CENTER';
    if (Math.abs(dy) >= v && Math.abs(dy) >= Math.abs(dx) * 0.9) return dy < 0 ? 'UP' : 'DOWN';
    if (Math.abs(dx) >= h) return dx > 0 ? 'LEFT' : 'RIGHT';
    if (Math.abs(dy) >= v) return dy < 0 ? 'UP' : 'DOWN';
    return 'CENTER';
  }

  return Object.freeze({ DIRECTIONS, createTracker, directionFromPose });
});
