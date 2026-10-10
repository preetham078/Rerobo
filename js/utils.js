/**
 * @file utils.js
 * @description Math helpers and general-purpose utilities shared across the
 *              HandTracking3D motion-capture and retargeting application.
 *
 * All angular helpers work in **radians** unless noted otherwise.
 * 3-D point arguments are plain objects with `{ x, y, z }` properties
 * (the same shape returned by MediaPipe landmarks).
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// ─────────────────────────────────────────────────────────────
//  Geometry helpers
// ─────────────────────────────────────────────────────────────

/**
 * Calculate the angle (in radians) at vertex **b** formed by the segments
 * a→b and c→b.
 *
 * Uses the dot-product / cross-product formulation so the result is always
 * in the range [0, π].
 *
 * @param {{ x: number, y: number, z: number }} a – first point
 * @param {{ x: number, y: number, z: number }} b – vertex (middle point)
 * @param {{ x: number, y: number, z: number }} c – third point
 * @returns {number} Angle in radians ∈ [0, π]
 */
export function jointAngle(a, b, c) {
  const ba = new THREE.Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
  const bc = new THREE.Vector3(c.x - b.x, c.y - b.y, c.z - b.z);

  const dot = ba.dot(bc);
  const cross = ba.length() * bc.length();

  // Guard against degenerate (zero-length) segments
  if (cross < 1e-10) return 0;

  // Clamp to avoid NaN from floating-point drift
  return Math.acos(THREE.MathUtils.clamp(dot / cross, -1, 1));
}

/**
 * Calculate the direction angle (in radians) of the limb from point **a** to
 * point **b**, projected onto the YZ plane.
 *
 * The returned angle is measured from the positive Y-axis towards the
 * positive Z-axis (atan2 convention).
 *
 * @param {{ x: number, y: number, z: number }} a – proximal point
 * @param {{ x: number, y: number, z: number }} b – distal point
 * @returns {number} Direction angle in radians ∈ (-π, π]
 */
export function limbDirection(a, b) {
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.atan2(dz, dy);
}

/**
 * Euclidean distance between two 3-D points.
 *
 * @param {{ x: number, y: number, z: number }} a
 * @param {{ x: number, y: number, z: number }} b
 * @returns {number}
 */
export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Midpoint between two 3-D points.
 *
 * @param {{ x: number, y: number, z: number }} a
 * @param {{ x: number, y: number, z: number }} b
 * @returns {{ x: number, y: number, z: number }}
 */
export function midpoint(a, b) {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: (a.z + b.z) * 0.5,
  };
}

// ─────────────────────────────────────────────────────────────
//  Numeric helpers
// ─────────────────────────────────────────────────────────────

/**
 * Clamp a scalar value between **min** and **max** (inclusive).
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/**
 * Clamp a scalar value using a `[min, max]` array (convenience wrapper
 * around {@link clamp}).
 *
 * @param {number} value
 * @param {[number, number]} range – `[min, max]`
 * @returns {number}
 */
export function clampRange(value, range) {
  return clamp(value, range[0], range[1]);
}

/**
 * Linear interpolation between **a** and **b** by factor **t**.
 *
 * @param {number} a – start value
 * @param {number} b – end value
 * @param {number} t – interpolation factor ∈ [0, 1]
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ─────────────────────────────────────────────────────────────
//  Formatting helpers
// ─────────────────────────────────────────────────────────────

/**
 * Format a duration given in **milliseconds** as an `MM:SS` string.
 *
 * @param {number} ms – duration in milliseconds
 * @returns {string} e.g. `"03:07"`
 */
export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Format a `Date` object (or the current time) as an `HH:MM:SS` string
 * using the local timezone.
 *
 * @param {Date} [date=new Date()] – date to format
 * @returns {string} e.g. `"14:05:09"`
 */
export function formatTime(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ─────────────────────────────────────────────────────────────
//  Angle conversion
// ─────────────────────────────────────────────────────────────

/**
 * Convert degrees to radians.
 *
 * @param {number} deg
 * @returns {number}
 */
export function degToRad(deg) {
  return THREE.MathUtils.degToRad(deg);
}

/**
 * Convert radians to degrees.
 *
 * @param {number} rad
 * @returns {number}
 */
export function radToDeg(rad) {
  return THREE.MathUtils.radToDeg(rad);
}

// ─────────────────────────────────────────────────────────────
//  Function utilities
// ─────────────────────────────────────────────────────────────

/**
 * Create a **throttled** version of **fn** that executes at most once every
 * **interval** milliseconds.  The first invocation fires immediately; a
 * trailing call is also guaranteed so the last intent is never swallowed.
 *
 * @param {Function} fn       – function to throttle
 * @param {number}   interval – minimum ms between executions
 * @returns {Function} throttled function
 */
export function throttle(fn, interval) {
  let lastTime = 0;
  let trailingTimeout = null;

  return function throttled(...args) {
    const now = performance.now();

    const invoke = () => {
      lastTime = performance.now();
      fn.apply(this, args);
    };

    if (now - lastTime >= interval) {
      // Enough time has passed – fire immediately
      if (trailingTimeout !== null) {
        clearTimeout(trailingTimeout);
        trailingTimeout = null;
      }
      invoke();
    } else if (trailingTimeout === null) {
      // Schedule a trailing invocation so the last call isn't lost
      const remaining = interval - (now - lastTime);
      trailingTimeout = setTimeout(() => {
        trailingTimeout = null;
        invoke();
      }, remaining);
    }
  };
}
