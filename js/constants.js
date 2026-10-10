/**
 * @file constants.js
 * @description Centralised configuration constants for the HandTracking3D
 *              motion-capture and retargeting application.
 *
 * Every tunable number lives here so that the rest of the codebase never
 * contains magic literals.  Groups are organised by subsystem.
 */

// ─────────────────────────────────────────────────────────────
//  Joint rotation limits (radians) for every robot joint
// ─────────────────────────────────────────────────────────────

/** @type {Object.<string, Object.<string, [number, number]>>} */
export const JOINT_LIMITS = {
  HEAD:     { pitch: [-0.6, 0.6],  yaw: [-0.85, 0.85], roll: [-0.4, 0.4] },
  NECK:     { pitch: [-0.3, 0.3],  yaw: [-0.5, 0.5],   roll: [-0.2, 0.2] },
  TORSO:    { lean:  [-0.5, 0.5],  yaw: [-0.5, 0.5] },
  ABDOMEN:  { lean:  [-0.4, 0.4],  yaw: [-0.4, 0.4] },
  PELVIS:   { rotation: [-0.5, 0.5], tilt: [-0.4, 0.4], lean: [-0.35, 0.35] },
  SHOULDER: { lift: [-1.6, 1.6],   rotation: [-1.0, 1.0] },
  ELBOW:    { bend: [0, 2.2] },
  WRIST:    { rotation: [-1.2, 1.2] },
  HIP:      { flexion: [-1.0, 1.0], abduction: [-0.8, 0.8], rotation: [-0.6, 0.6] },
  KNEE:     { bend: [0, 2.0] },
  ANKLE:    { pitch: [-0.5, 0.5],  roll: [-0.3, 0.3] },
};

// ─────────────────────────────────────────────────────────────
//  Smoothing parameters
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SmoothingConfig
 * @property {number} LANDMARK_ALPHA_MIN  – smoothing alpha when confidence is low
 * @property {number} LANDMARK_ALPHA_MAX  – smoothing alpha when confidence is high
 * @property {number} ROBOT_JOINT_LERP    – lerp factor for robot joint interpolation
 * @property {number} ROOT_POSITION_LERP  – lerp factor for robot root position
 * @property {number} ROOT_ROTATION_LERP  – lerp factor for robot root rotation
 * @property {number} RECOVERY_LERP       – lerp factor when recovering from tracking loss
 * @property {number} VELOCITY_LIMIT      – max landmark displacement per frame (normalised)
 */
/** @type {SmoothingConfig} */
export const SMOOTHING = {
  LANDMARK_ALPHA_MIN: 0.15,
  LANDMARK_ALPHA_MAX: 0.45,
  ROBOT_JOINT_LERP:   0.12,
  ROOT_POSITION_LERP: 0.1,
  ROOT_ROTATION_LERP: 0.1,
  RECOVERY_LERP:      0.06,
  VELOCITY_LIMIT:     0.15,
};

// ─────────────────────────────────────────────────────────────
//  Confidence thresholds
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ConfidenceConfig
 * @property {number} LANDMARK_MIN       – minimum visibility / presence to use a landmark
 * @property {number} HYSTERESIS_MARGIN  – margin for confidence hysteresis
 * @property {number} TRACKING_LOST_FRAMES – consecutive frames w/o pose → tracking lost
 * @property {number} RECOVERY_FRAMES   – frames to interpolate during recovery
 */
/** @type {ConfidenceConfig} */
export const CONFIDENCE = {
  LANDMARK_MIN:         0.5,
  HYSTERESIS_MARGIN:    0.08,
  TRACKING_LOST_FRAMES: 10,
  RECOVERY_FRAMES:      10,
};

// ─────────────────────────────────────────────────────────────
//  Activity detection thresholds
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ActivityConfig
 * @property {number} WALKING_ANKLE_TRAVEL   – min ankle travel over temporal window
 * @property {number} WALKING_FRAMES         – frames to analyse for walking
 * @property {number} JUMP_HIP_DISPLACEMENT  – hip Y displacement for jump detection
 * @property {number} JUMP_KNEE_EXTENSION    – sum of knee angles for jump
 * @property {number} JUMP_TAKEOFF_DISPLACEMENT
 * @property {number} JUMP_TAKEOFF_EXTENSION
 * @property {number} CROUCH_HEIGHT_RATIO    – body height ratio for crouch
 * @property {number} LOWER_HEIGHT_RATIO     – body height ratio for lowering
 * @property {number} TURN_THRESHOLD         – torso yaw threshold for turn detection
 * @property {number} TURN_EXIT_THRESHOLD    – hysteresis exit threshold
 * @property {number} LATERAL_THRESHOLD      – hip center X displacement for lateral
 * @property {number} FORWARD_THRESHOLD      – hip center Z displacement for fwd/bwd
 * @property {number} HAND_RAISE_OFFSET      – wrist above shoulder threshold
 * @property {number} BENT_KNEE_THRESHOLD    – hip–knee Y distance for bent knee
 * @property {number} LEAN_THRESHOLD         – shoulder–hip X offset for leaning
 * @property {number} TEMPORAL_WINDOW        – frames for temporal analysis
 * @property {number} HYSTERESIS_EXIT_FACTOR – exit threshold = enter × this
 */
/** @type {ActivityConfig} */
export const ACTIVITY = {
  WALKING_ANKLE_TRAVEL:   0.06,
  WALKING_FRAMES:         10,
  JUMP_HIP_DISPLACEMENT:  0.06,
  JUMP_KNEE_EXTENSION:    5.0,
  JUMP_TAKEOFF_DISPLACEMENT: 0.03,
  JUMP_TAKEOFF_EXTENSION: 4.8,
  CROUCH_HEIGHT_RATIO:    0.65,
  LOWER_HEIGHT_RATIO:     0.85,
  TURN_THRESHOLD:         0.25,
  TURN_EXIT_THRESHOLD:    0.15,
  LATERAL_THRESHOLD:      0.04,
  FORWARD_THRESHOLD:      0.04,
  HAND_RAISE_OFFSET:      0.08,
  BENT_KNEE_THRESHOLD:    0.12,
  LEAN_THRESHOLD:         0.08,
  TEMPORAL_WINDOW:        15,
  HYSTERESIS_EXIT_FACTOR: 0.7,
};

// ─────────────────────────────────────────────────────────────
//  Retargeting gains
// ─────────────────────────────────────────────────────────────

/**
 * Gain / scale factors that map captured motion magnitudes to robot joint
 * rotations and root translations.
 *
 * @typedef {Object} RetargetingConfig
 */
/** @type {RetargetingConfig} */
export const RETARGETING = {
  TORSO_LEAN_GAIN:          1.0,
  TORSO_YAW_GAIN:           2.8,

  ROOT_X_GAIN:             -7,
  ROOT_Y_GAIN:              6,
  ROOT_Z_GAIN:             -9,
  ROOT_X_CLAMP:             2.5,
  ROOT_Y_CLAMP:             2.2,
  ROOT_Z_CLAMP:             3.5,

  ARM_SHOULDER_Z_GAIN:      1.9,
  ARM_ELBOW_BEND_SCALE:     0.58,
  ARM_WRIST_Z_GAIN:         3,

  LEG_LIFT_GAIN:            1.0,
  LEG_KNEE_BEND_SCALE:      0.42,
  LEG_Z_GAIN:               1.5,

  FOOT_Y_GAIN:              0.6,
  FOOT_LIFT_SCALE:          0.25,

  HEAD_YAW_GAIN:            8,
  HEAD_PITCH_GAIN:          4,
  HEAD_ROLL_TO_NECK:        0.35,

  WALKING_LEG_BOOST:        1.4,
  WALKING_COUNTER_ROTATION: 0.15,

  KINEMATICS_LERP:          0.14,
};

// ─────────────────────────────────────────────────────────────
//  Calibration
// ─────────────────────────────────────────────────────────────

/** @type {{ CAPTURE_FRAMES: number, STABILITY_THRESHOLD: number }} */
export const CALIBRATION = {
  CAPTURE_FRAMES:      90,   // ~3 s at 30 fps
  STABILITY_THRESHOLD: 0.02,
};

// ─────────────────────────────────────────────────────────────
//  Recording
// ─────────────────────────────────────────────────────────────

/** @type {{ MAX_FRAMES: number }} */
export const RECORDING = {
  MAX_FRAMES: 18000,          // ~10 min at 30 fps
};

// ─────────────────────────────────────────────────────────────
//  MediaPipe pose landmark indices
// ─────────────────────────────────────────────────────────────

/**
 * Named indices into the 33-landmark array returned by
 * MediaPipe Pose / Holistic.
 *
 * @type {Object.<string, number>}
 */
export const POSE = {
  NOSE:             0,
  LEFT_EYE_INNER:   1,
  LEFT_EYE:         2,
  LEFT_EYE_OUTER:   3,
  RIGHT_EYE_INNER:  4,
  RIGHT_EYE:        5,
  RIGHT_EYE_OUTER:  6,
  LEFT_EAR:         7,
  RIGHT_EAR:        8,
  MOUTH_LEFT:       9,
  MOUTH_RIGHT:     10,
  LEFT_SHOULDER:   11,
  RIGHT_SHOULDER:  12,
  LEFT_ELBOW:      13,
  RIGHT_ELBOW:     14,
  LEFT_WRIST:      15,
  RIGHT_WRIST:     16,
  LEFT_PINKY:      17,
  RIGHT_PINKY:     18,
  LEFT_INDEX:      19,
  RIGHT_INDEX:     20,
  LEFT_THUMB:      21,
  RIGHT_THUMB:     22,
  LEFT_HIP:        23,
  RIGHT_HIP:       24,
  LEFT_KNEE:       25,
  RIGHT_KNEE:      26,
  LEFT_ANKLE:      27,
  RIGHT_ANKLE:     28,
  LEFT_HEEL:       29,
  RIGHT_HEEL:      30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX:32,
};

// ─────────────────────────────────────────────────────────────
//  Skeleton connections for overlay drawing
// ─────────────────────────────────────────────────────────────

/**
 * Pose body connections (pairs of landmark indices).
 * @type {Array<[number, number]>}
 */
export const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [24, 26], [26, 28], [27, 31], [28, 32],
];

/**
 * Hand skeleton connections (pairs of landmark indices within a 21-point hand).
 * @type {Array<[number, number]>}
 */
export const HAND_CONNECTIONS = [
  [0,  1], [1,  2], [2,  3], [3,  4],       // thumb
  [0,  5], [5,  6], [6,  7], [7,  8],       // index
  [5,  9], [9, 10], [10, 11], [11, 12],     // middle
  [9, 13], [13, 14], [14, 15], [15, 16],    // ring
  [13, 17], [17, 18], [18, 19], [19, 20],   // pinky
  [0, 17],                                   // palm base
];

// ─────────────────────────────────────────────────────────────
//  UI update throttle
// ─────────────────────────────────────────────────────────────

/** Minimum interval (ms) between telemetry DOM updates (~10 Hz). */
export const UI_THROTTLE_MS = 100;
