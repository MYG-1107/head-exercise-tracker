/* Pure tracking state logic. No DOM access, networking, camera, or persistence. */
(function attachTrackerCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HeadTrackerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createTrackerCore() {
  'use strict';

  const DIRECTIONS = Object.freeze(['UP', 'DOWN', 'LEFT', 'RIGHT']);
  const VALID_DIRECTIONS = new Set([...DIRECTIONS, 'CENTER']);

  function positiveInteger(value, fallback = 3) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
  }

  function copyCounts(counts) {
    return { UP: counts.UP, DOWN: counts.DOWN, LEFT: counts.LEFT, RIGHT: counts.RIGHT };
  }

  function createRepetitionTracker(targetPerDirection = 3) {
    let target = positiveInteger(targetPerDirection);
    const counts = { UP: 0, DOWN: 0, LEFT: 0, RIGHT: 0 };
    let previousDirection = 'CENTER';
    let armedDirection = null;

    function total() {
      return DIRECTIONS.reduce((sum, direction) => sum + counts[direction], 0);
    }

    function complete() {
      return DIRECTIONS.every(direction => counts[direction] >= target);
    }

    function snapshot() {
      return {
        counts: copyCounts(counts),
        targetPerDirection: target,
        total: total(),
        totalTarget: target * DIRECTIONS.length,
        complete: complete()
      };
    }

    function countDirection(direction, source) {
      if (!DIRECTIONS.includes(direction)) {
        return { type: 'invalid-direction', direction, ...snapshot() };
      }
      if (counts[direction] >= target) {
        return { type: 'direction-goal-reached', direction, ...snapshot() };
      }
      counts[direction] += 1;
      const isComplete = complete();
      return {
        type: source === 'manual' ? 'manual-repetition' : 'repetition',
        direction,
        directionGoalReached: counts[direction] >= target,
        complete: isComplete,
        ...snapshot()
      };
    }

    return {
      observe(inputDirection) {
        const direction = VALID_DIRECTIONS.has(inputDirection) ? inputDirection : 'CENTER';
        if (direction === previousDirection) {
          return { type: 'steady', direction, ...snapshot() };
        }

        const from = previousDirection;
        let event;
        if (from === 'CENTER' && direction !== 'CENTER') {
          armedDirection = direction;
          event = { type: 'movement-started', direction, from, to: direction };
        } else if (from !== 'CENTER' && direction === 'CENTER') {
          if (armedDirection === from) {
            event = countDirection(from, 'camera');
            event.from = from;
            event.to = direction;
          } else {
            event = { type: 'returned-without-valid-cycle', direction: from, from, to: direction, ...snapshot() };
          }
          armedDirection = null;
        } else {
          // Switching from one non-neutral direction directly to another is not a cycle.
          armedDirection = null;
          event = { type: 'direction-switch-without-neutral', direction, from, to: direction, ...snapshot() };
        }
        previousDirection = direction;
        return event;
      },

      recordManual(direction) {
        // In manual mode, the user confirms they completed the whole cycle themselves.
        return countDirection(String(direction || '').toUpperCase(), 'manual');
      },

      interruptMovement() {
        // If the face disappears, never count the incomplete movement when tracking resumes.
        previousDirection = 'CENTER';
        armedDirection = null;
      },

      setTargetPerDirection(value) {
        target = positiveInteger(value, target);
        return snapshot();
      },

      reset({ keepCounts = false } = {}) {
        previousDirection = 'CENTER';
        armedDirection = null;
        if (!keepCounts) DIRECTIONS.forEach(direction => { counts[direction] = 0; });
        return snapshot();
      },

      getSnapshot: snapshot
    };
  }

  function directionFromPose(pose, baseline, thresholds = {}) {
    if (!pose || !baseline || !Number.isFinite(pose.horizontal) || !Number.isFinite(pose.vertical) ||
        !Number.isFinite(baseline.horizontal) || !Number.isFinite(baseline.vertical)) {
      return 'CENTER';
    }
    const horizontalThreshold = Number.isFinite(thresholds.horizontal) ? thresholds.horizontal : 0.30;
    const verticalThreshold = Number.isFinite(thresholds.vertical) ? thresholds.vertical : 0.27;
    const dx = pose.horizontal - baseline.horizontal;
    const dy = pose.vertical - baseline.vertical;
    if (Math.abs(dy) >= verticalThreshold && Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'UP' : 'DOWN';
    if (Math.abs(dx) >= horizontalThreshold) return dx > 0 ? 'LEFT' : 'RIGHT';
    if (Math.abs(dy) >= verticalThreshold) return dy < 0 ? 'UP' : 'DOWN';
    return 'CENTER';
  }

  return Object.freeze({ DIRECTIONS, createRepetitionTracker, directionFromPose });
});
