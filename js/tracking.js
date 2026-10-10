/**
 * @fileoverview MediaPipe model initialization and per-frame landmark
 * detection.  Pose is loaded first (required); hand and face models are
 * loaded in the background and silently skipped if unavailable.
 *
 * Every detected frame is run through {@link LandmarkProcessor} for
 * smoothing, confidence filtering, and tracking-loss recovery before
 * being delivered to the frame callback.
 */

import { LandmarkProcessor } from './landmarks.js';

/* ------------------------------------------------------------------ */
/*  Type definitions                                                   */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} TrackingFrame
 * @property {number} timestamp - `performance.now()` when the frame was captured.
 * @property {{ landmarks: Array|null, confidence: number, lost: boolean, recovering: boolean }} pose
 * @property {Array<{ key: string, landmarks: Array|null, confidence: number, lost: boolean, recovering: boolean }>} hands
 * @property {{ landmarks: Array|null, confidence: number, lost: boolean, recovering: boolean }} face
 * @property {boolean}  poseDetected  - `true` when processed pose landmarks are non-null.
 * @property {number}   handsDetected - Count of hands with non-null landmarks (0-2).
 * @property {boolean}  faceDetected  - `true` when processed face landmarks are non-null.
 */

/* ------------------------------------------------------------------ */
/*  TrackingManager                                                    */
/* ------------------------------------------------------------------ */

/**
 * Manages MediaPipe model loading and per-frame detection.
 */
export class TrackingManager {
  constructor() {
    /** @private {import('@mediapipe/tasks-vision').PoseLandmarker|null} */
    this._poseLandmarker = null;

    /** @private {import('@mediapipe/tasks-vision').HandLandmarker|null} */
    this._handLandmarker = null;

    /** @private {import('@mediapipe/tasks-vision').FaceLandmarker|null} */
    this._faceLandmarker = null;

    /** @private {boolean} */
    this._ready = false;

    /** @private {LandmarkProcessor} */
    this._landmarkProcessor = new LandmarkProcessor();

    /** @private {number} */
    this._lastVideoTime = -1;

    /** @private {((frame: TrackingFrame) => void)|null} */
    this._onFrame = null;
  }

  /* ---------------------------------------------------------------- */
  /*  Accessors                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Register a callback that fires with every processed frame.
   * @param {(frame: TrackingFrame) => void} callback
   */
  onFrame(callback) {
    this._onFrame = callback;
  }

  /** @returns {boolean} Whether the pose model is loaded and ready. */
  get ready() {
    return this._ready;
  }

  /** @returns {boolean} Whether hand tracking is available. */
  get handsAvailable() {
    return Boolean(this._handLandmarker);
  }

  /** @returns {boolean} Whether face tracking is available. */
  get faceAvailable() {
    return Boolean(this._faceLandmarker);
  }

  /* ---------------------------------------------------------------- */
  /*  Initialization                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Initialize MediaPipe models.
   *
   * Loads the **Pose** model first (required) — the method rejects if it
   * fails.  **Hand** and **Face** models are loaded in the background; if
   * either fails the corresponding `*Available` flag stays `false` and a
   * console warning is emitted.
   *
   * @throws {Error} If the pose model fails to load.
   */
  async initialize() {
    /* ---------- Vision WASM runtime ---------- */
    const vision = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs'
    );

    const fileset = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
    );

    /* ---------- Pose (required) ---------- */
    this._poseLandmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    this._ready = true;

    /* ---------- Hands (optional, non-blocking) ---------- */
    vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
      .then((tracker) => {
        this._handLandmarker = tracker;
      })
      .catch((err) => {
        console.warn('Hand tracking unavailable:', err);
      });

    /* ---------- Face (optional, non-blocking) ---------- */
    vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
      .then((tracker) => {
        this._faceLandmarker = tracker;
      })
      .catch((err) => {
        console.warn('Face tracking unavailable:', err);
      });
  }

  /* ---------------------------------------------------------------- */
  /*  Per-frame processing                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Process a single video frame.
   *
   * Runs all available detectors on the current frame, pushes each result
   * through the {@link LandmarkProcessor}, and returns the assembled
   * {@link TrackingFrame}.  Returns `null` when the video element is not
   * ready or hasn't advanced to a new frame.
   *
   * @param {HTMLVideoElement} video
   * @returns {TrackingFrame|null}
   */
  processFrame(video) {
    /* ---------- Guard: video must have a new frame ---------- */
    if (!this._ready || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }
    if (video.currentTime === this._lastVideoTime) {
      return null;
    }
    this._lastVideoTime = video.currentTime;

    const now = performance.now();

    /* ---------- Run detectors ---------- */
    const poseResult = this._poseLandmarker.detectForVideo(video, now);

    const handResult = this._handLandmarker
      ? this._handLandmarker.detectForVideo(video, now)
      : { landmarks: [], handedness: [] };

    const faceResult = this._faceLandmarker
      ? this._faceLandmarker.detectForVideo(video, now)
      : null;

    /* ---------- Process pose ---------- */
    const poseProcessed = this._landmarkProcessor.process(
      poseResult.landmarks?.[0] || null,
      'pose',
    );

    /* ---------- Process hands ---------- */
    const rawHandLandmarks = handResult.landmarks || [];
    const hands = rawHandLandmarks.map((lm, i) => {
      const categoryName =
        handResult.handedness?.[i]?.[0]?.categoryName || 'Right';
      const processed = this._landmarkProcessor.process(lm, `hand-${i}`);
      return {
        key: categoryName,
        ...processed,
      };
    });

    /* ---------- Process face ---------- */
    const faceProcessed = this._landmarkProcessor.process(
      faceResult?.faceLandmarks?.[0] || null,
      'face',
    );

    /* ---------- Assemble frame ---------- */
    /** @type {TrackingFrame} */
    const frame = {
      timestamp: now,
      pose: poseProcessed,
      hands,
      face: faceProcessed,
      poseDetected: Boolean(poseProcessed.landmarks),
      handsDetected: hands.filter((h) => h.landmarks).length,
      faceDetected: Boolean(faceProcessed.landmarks),
    };

    if (this._onFrame) {
      this._onFrame(frame);
    }

    return frame;
  }

  /* ---------------------------------------------------------------- */
  /*  Reset                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Reset all landmark processor state and the video-time guard.
   * Call this when switching cameras or restarting tracking.
   */
  reset() {
    this._landmarkProcessor.resetAll();
    this._lastVideoTime = -1;
  }
}
