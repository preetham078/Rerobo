/**
 * @fileoverview Landmark processing: smoothing, confidence filtering,
 * tracking-loss recovery, and velocity limiting.
 *
 * Each landmark set (pose, hand-0, hand-1, face, …) is tracked independently.
 * When detection is lost for more than TRACKING_LOST_FRAMES, the set is marked
 * as "lost" and the last confident pose is frozen.  When detection resumes the
 * processor interpolates from the frozen pose to the live pose over
 * RECOVERY_FRAMES frames so the robot doesn't snap.
 */

import { SMOOTHING, CONFIDENCE } from './constants.js';
import { lerp, clamp, distance } from './utils.js';

/* ------------------------------------------------------------------ */
/*  LandmarkProcessor                                                  */
/* ------------------------------------------------------------------ */

/**
 * Manages landmark smoothing, confidence filtering, and tracking recovery.
 */
export class LandmarkProcessor {
  constructor() {
    /** @type {Object<string, Array<{x:number,y:number,z:number}>>} key → smoothed landmarks */
    this._smoothed = {};

    /** @type {Object<string, Array<{x:number,y:number,z:number}>>} key → last high-confidence landmarks */
    this._lastConfident = {};

    /** @type {Object<string, number>} key → consecutive frames without detection */
    this._lostFrames = {};

    /** @type {Object<string, {from: Array<{x:number,y:number,z:number}>, framesLeft: number}>} */
    this._recovering = {};

    /** @type {Object<string, number>} key → latest average confidence */
    this._lastConfidenceValue = {};
  }

  /* ---------------------------------------------------------------- */
  /*  Public API                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Process a set of landmarks with smoothing, confidence filtering and
   * velocity limiting.
   *
   * @param {Array<{x:number,y:number,z:number,visibility?:number,presence?:number}>|null} landmarks
   *   Raw landmarks from MediaPipe.  Pass `null` when the detector did not
   *   find the target in the current frame.
   * @param {string} key
   *   Identifier for this landmark set ('pose', 'hand-0', 'face', …).
   * @returns {{
   *   landmarks: Array<{x:number,y:number,z:number}>|null,
   *   confidence: number,
   *   lost: boolean,
   *   recovering: boolean
   * }}
   */
  process(landmarks, key) {
    /* -------------------------------------------------------------- */
    /*  No detection in this frame                                     */
    /* -------------------------------------------------------------- */
    if (!landmarks || landmarks.length === 0) {
      this._lostFrames[key] = (this._lostFrames[key] || 0) + 1;

      const lost = this._lostFrames[key] > CONFIDENCE.TRACKING_LOST_FRAMES;
      const frozen = this._lastConfident[key] || null;

      return {
        landmarks: frozen,
        confidence: 0,
        lost,
        recovering: false,
      };
    }

    /* -------------------------------------------------------------- */
    /*  Detection present – check if we're recovering from loss        */
    /* -------------------------------------------------------------- */
    const wasLost = (this._lostFrames[key] || 0) > CONFIDENCE.TRACKING_LOST_FRAMES;

    if (wasLost && this._lastConfident[key]) {
      // Begin recovery: interpolate from frozen pose → new pose
      this._recovering[key] = {
        from: this._lastConfident[key].map(lm => ({ x: lm.x, y: lm.y, z: lm.z })),
        framesLeft: CONFIDENCE.RECOVERY_FRAMES,
      };
    }

    // Reset lost counter
    this._lostFrames[key] = 0;

    /* -------------------------------------------------------------- */
    /*  Per-landmark processing                                        */
    /* -------------------------------------------------------------- */
    const prev = this._smoothed[key];
    const prevConfident = this._lastConfident[key];
    const processed = [];
    let confidenceSum = 0;
    let confidenceCount = 0;

    for (let i = 0; i < landmarks.length; i++) {
      const raw = landmarks[i];

      // ---- confidence for this landmark ----
      const vis = raw.visibility ?? 1;
      const pres = raw.presence ?? 1;
      const lmConf = Math.min(vis, pres);
      confidenceSum += lmConf;
      confidenceCount += 1;

      // ---- fall back to last confident value when below threshold ----
      let target;
      if (lmConf < CONFIDENCE.LANDMARK_MIN && prevConfident && prevConfident[i]) {
        target = { x: prevConfident[i].x, y: prevConfident[i].y, z: prevConfident[i].z };
      } else {
        target = { x: raw.x, y: raw.y, z: raw.z };
      }

      // ---- velocity limiting ----
      if (prev && prev[i]) {
        const d = distance(target, prev[i]);
        if (d > SMOOTHING.VELOCITY_LIMIT) {
          const scale = SMOOTHING.VELOCITY_LIMIT / d;
          target.x = prev[i].x + (target.x - prev[i].x) * scale;
          target.y = prev[i].y + (target.y - prev[i].y) * scale;
          target.z = prev[i].z + (target.z - prev[i].z) * scale;
        }
      }

      // ---- confidence-weighted EMA smoothing ----
      if (prev && prev[i]) {
        const alpha = lerp(SMOOTHING.LANDMARK_ALPHA_MIN, SMOOTHING.LANDMARK_ALPHA_MAX, lmConf);
        target.x = lerp(prev[i].x, target.x, alpha);
        target.y = lerp(prev[i].y, target.y, alpha);
        target.z = lerp(prev[i].z, target.z, alpha);
      }

      processed.push(target);
    }

    /* -------------------------------------------------------------- */
    /*  Recovery interpolation                                         */
    /* -------------------------------------------------------------- */
    let recovering = false;
    const rec = this._recovering[key];

    if (rec && rec.framesLeft > 0) {
      recovering = true;
      // t goes from 0 → 1 as framesLeft counts down
      const t = 1 - rec.framesLeft / CONFIDENCE.RECOVERY_FRAMES;

      for (let i = 0; i < processed.length && i < rec.from.length; i++) {
        processed[i].x = lerp(rec.from[i].x, processed[i].x, t);
        processed[i].y = lerp(rec.from[i].y, processed[i].y, t);
        processed[i].z = lerp(rec.from[i].z, processed[i].z, t);
      }

      rec.framesLeft -= 1;
      if (rec.framesLeft <= 0) {
        delete this._recovering[key];
      }
    }

    /* -------------------------------------------------------------- */
    /*  Store state                                                    */
    /* -------------------------------------------------------------- */
    this._smoothed[key] = processed;
    this._lastConfident[key] = processed.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }));

    const avgConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0;
    this._lastConfidenceValue[key] = avgConfidence;

    return {
      landmarks: processed,
      confidence: avgConfidence,
      lost: false,
      recovering,
    };
  }

  /**
   * Reset all tracking state for a single key.
   * @param {string} key
   */
  reset(key) {
    delete this._smoothed[key];
    delete this._lastConfident[key];
    delete this._lostFrames[key];
    delete this._recovering[key];
    delete this._lastConfidenceValue[key];
  }

  /**
   * Reset tracking state for every key.
   */
  resetAll() {
    this._smoothed = {};
    this._lastConfident = {};
    this._lostFrames = {};
    this._recovering = {};
    this._lastConfidenceValue = {};
  }

  /**
   * Get the current tracking status for a key.
   * @param {string} key
   * @returns {{ lost: boolean, recovering: boolean, lostFrames: number, confidence: number }}
   */
  getStatus(key) {
    const lostFrames = this._lostFrames[key] || 0;
    const lost = lostFrames > CONFIDENCE.TRACKING_LOST_FRAMES;
    const recovering = Boolean(this._recovering[key] && this._recovering[key].framesLeft > 0);
    const confidence = this._lastConfidenceValue[key] || 0;

    return { lost, recovering, lostFrames, confidence };
  }
}
