/**
 * Camera management module
 * Handles webcam acquisition, stream lifecycle, and state tracking
 *
 * @module camera
 */

/**
 * @typedef {'off' | 'requesting' | 'active' | 'error'} CameraState
 */

/**
 * @callback StateChangeCallback
 * @param {CameraState} state - The new camera state
 * @param {string} [error] - Optional error message when state is 'error'
 */

/**
 * Manages webcam acquisition, stream management, and camera state.
 *
 * Provides a clean lifecycle API for requesting camera permissions,
 * starting/stopping the video stream, and tracking state changes
 * via a callback pattern.
 *
 * @example
 * const videoEl = document.getElementById('camera-feed');
 * const camera = new CameraManager(videoEl);
 *
 * camera.onStateChange((state, error) => {
 *   console.log(`Camera state: ${state}`, error ?? '');
 * });
 *
 * await camera.start();
 * // ... later
 * camera.stop();
 */
export class CameraManager {
    /** @type {HTMLVideoElement} */
    #videoElement;

    /** @type {MediaStream | null} */
    #stream;

    /** @type {CameraState} */
    #state;

    /** @type {StateChangeCallback | null} */
    #stateChangeCallback;

    /**
     * Video constraints used when requesting the camera stream.
     * facingMode 'user' for front-facing camera, ideal 1280×720 @ 30fps.
     * @type {MediaStreamConstraints}
     */
    static #VIDEO_CONSTRAINTS = {
        audio: false,
        video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 60 }
        }
    };

    /**
     * Create a CameraManager.
     *
     * @param {HTMLVideoElement} videoElement - The video element to attach the camera stream to.
     * @throws {Error} If videoElement is not a valid HTMLVideoElement.
     */
    constructor(videoElement) {
        if (!videoElement || !(videoElement instanceof HTMLVideoElement)) {
            throw new Error(
                'CameraManager requires a valid HTMLVideoElement. ' +
                `Received: ${videoElement}`
            );
        }

        this.#videoElement = videoElement;
        this.#stream = null;
        this.#state = 'off';
        this.#stateChangeCallback = null;
    }

    // ──────────────────────────────────────────────
    // Public API — Getters
    // ──────────────────────────────────────────────

    /**
     * Whether the camera stream is currently active and producing frames.
     * @returns {boolean}
     */
    get active() {
        return this.#state === 'active';
    }

    /**
     * The current camera state.
     * @returns {CameraState}
     */
    get state() {
        return this.#state;
    }

    /**
     * The underlying video element.
     * @returns {HTMLVideoElement}
     */
    get video() {
        return this.#videoElement;
    }

    /**
     * The current MediaStream, or null if the camera is not active.
     * @returns {MediaStream | null}
     */
    get stream() {
        return this.#stream;
    }

    // ──────────────────────────────────────────────
    // Public API — Methods
    // ──────────────────────────────────────────────

    /**
     * Register a callback that fires whenever the camera state changes.
     *
     * @param {StateChangeCallback} callback - Receives (state, error?).
     */
    onStateChange(callback) {
        if (typeof callback !== 'function') {
            throw new Error('onStateChange requires a function callback.');
        }
        this.#stateChangeCallback = callback;
    }

    /**
     * Request camera permission, acquire the media stream, and attach it
     * to the video element. The returned promise resolves with the
     * MediaStream once the video is ready to play.
     *
     * If the camera is already active the existing stream is returned
     * without re-requesting permissions.
     *
     * @returns {Promise<MediaStream>} The acquired MediaStream.
     * @throws {Error} Descriptive error for permission denied, no camera found,
     *                 browser incompatibility, or any other failure.
     */
    async start() {
        // Already running — return existing stream
        if (this.#state === 'active' && this.#stream) {
            return this.#stream;
        }

        // Guard: browser support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            const msg =
                'Camera access is not supported in this browser. ' +
                'Please use a modern browser (Chrome, Firefox, Edge, Safari) ' +
                'and ensure the page is served over HTTPS.';
            this.#setState('error', msg);
            throw new Error(msg);
        }

        this.#setState('requesting');

        try {
            const stream = await navigator.mediaDevices.getUserMedia(
                CameraManager.#VIDEO_CONSTRAINTS
            );

            this.#stream = stream;

            // Configure the video element
            this.#videoElement.srcObject = stream;
            this.#videoElement.setAttribute('playsinline', '');
            this.#videoElement.setAttribute('autoplay', '');
            this.#videoElement.muted = true;

            // Wait until the video is actually producing frames
            await this.#waitForVideoReady();

            // Listen for unexpected track endings (e.g. user revokes permission
            // or unplugs camera)
            for (const track of stream.getTracks()) {
                track.addEventListener('ended', this.#handleTrackEnded);
            }

            this.#setState('active');
            return stream;
        } catch (err) {
            const message = CameraManager.#describeError(err);
            this.#setState('error', message);
            // Clean up any partial stream that may have been acquired
            this.#releaseStream();
            throw new Error(message);
        }
    }

    /**
     * Stop the camera stream, release all tracks, and reset state.
     * Safe to call even if the camera is already stopped.
     */
    stop() {
        this.#releaseStream();
        this.#setState('off');
    }

    // ──────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────

    /**
     * Transition to a new state and notify the listener (if any).
     *
     * @param {CameraState} newState
     * @param {string} [error]
     */
    #setState(newState, error) {
        const prev = this.#state;
        this.#state = newState;

        if (this.#stateChangeCallback && (newState !== prev || newState === 'error')) {
            try {
                this.#stateChangeCallback(newState, error);
            } catch (cbErr) {
                console.error('[CameraManager] State-change callback threw:', cbErr);
            }
        }
    }

    /**
     * Stop all tracks on the current stream and detach from the video element.
     */
    #releaseStream() {
        if (this.#stream) {
            for (const track of this.#stream.getTracks()) {
                track.removeEventListener('ended', this.#handleTrackEnded);
                track.stop();
            }
            this.#stream = null;
        }

        this.#videoElement.srcObject = null;
        this.#videoElement.removeAttribute('src');
        this.#videoElement.load(); // Reset the element fully
    }

    /**
     * Wait until the video element has enough data to start playback.
     * Resolves once `loadeddata` fires or the video already has data.
     *
     * @returns {Promise<void>}
     */
    #waitForVideoReady() {
        return new Promise((resolve, reject) => {
            const video = this.#videoElement;

            // Already has data (e.g. switching streams quickly)
            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                video.play().then(resolve).catch(reject);
                return;
            }

            const onLoaded = () => {
                cleanup();
                video.play().then(resolve).catch(reject);
            };

            const onError = () => {
                cleanup();
                reject(new Error('Video element encountered an error while loading the camera stream.'));
            };

            const cleanup = () => {
                video.removeEventListener('loadeddata', onLoaded);
                video.removeEventListener('error', onError);
            };

            video.addEventListener('loadeddata', onLoaded, { once: true });
            video.addEventListener('error', onError, { once: true });
        });
    }

    /**
     * Handler for unexpected track `ended` events (camera unplugged, permission revoked, etc.).
     * Arrow function to preserve `this` binding.
     *
     * @type {(event: Event) => void}
     */
    #handleTrackEnded = (_event) => {
        // Check if ALL tracks have ended; only then transition to 'off'
        if (this.#stream && this.#stream.getTracks().every(t => t.readyState === 'ended')) {
            this.#releaseStream();
            this.#setState('error', 'Camera stream ended unexpectedly. The camera may have been disconnected or permissions revoked.');
        }
    };

    /**
     * Map a getUserMedia error to a human-readable description.
     *
     * @param {Error | DOMException} err
     * @returns {string} Descriptive error message.
     */
    static #describeError(err) {
        const name = err.name || '';

        switch (name) {
            case 'NotAllowedError':
            case 'PermissionDeniedError':
                return (
                    'Camera permission was denied. ' +
                    'Please allow camera access in your browser settings and reload the page.'
                );

            case 'NotFoundError':
            case 'DevicesNotFoundError':
                return (
                    'No camera device was found. ' +
                    'Please connect a webcam and try again.'
                );

            case 'NotReadableError':
            case 'TrackStartError':
                return (
                    'The camera is already in use by another application. ' +
                    'Please close other apps that may be using the camera and try again.'
                );

            case 'OverconstrainedError':
                return (
                    `Camera does not support the requested settings (${err.constraint || 'unknown constraint'}). ` +
                    'A different camera resolution will be attempted on next start.'
                );

            case 'AbortError':
                return (
                    'Camera access was aborted. ' +
                    'This can happen if the page lost focus during the permission prompt. Please try again.'
                );

            case 'SecurityError':
                return (
                    'Camera access was blocked due to security restrictions. ' +
                    'Please ensure the page is served over HTTPS.'
                );

            case 'TypeError':
                return (
                    'Invalid camera constraints were specified. ' +
                    'This is a bug — please report it.'
                );

            default:
                return `Camera error: ${err.message || name || 'Unknown error'}`;
        }
    }
}
