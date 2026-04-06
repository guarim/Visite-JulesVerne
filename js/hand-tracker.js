/**
 * hand-tracker.js
 * Reconnaissance des mains via MediaPipe Hands
 * Gestion : curseur index droit, zoom 2 mains, retour arrière poings
 */

class HandTracker {
  constructor(options = {}) {
    this.options = {
      onIndexPosition: options.onIndexPosition || null,   // (x, y, isVisible) => void
      onZoom: options.onZoom || null,                     // (zoomFactor) => void — 1 = normal, >1 = zoom
      onZoomEnd: options.onZoomEnd || null,               // () => void
      onGoBack: options.onGoBack || null,                 // () => void
      onReady: options.onReady || null,                   // () => void
      maxZoom: options.maxZoom || 30,
    };

    this.videoEl = null;
    this.hands = null;
    this.camera = null;
    this.running = false;

    // état
    this.lastIndexPos = null;
    this.zoomActive = false;
    this.zoomStartDist = null;
    this.bothFistsTimer = null;
    this.fistsFrames = 0;
    this.FIST_FRAMES_NEEDED = 15;
  }

  async init(videoEl) {
    this.videoEl = videoEl;

    try {
      // Demande accès caméra
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      videoEl.srcObject = stream;
      videoEl.play();

      // Init MediaPipe Hands
      const { Hands } = window;
      if (!Hands) { console.error('MediaPipe Hands non chargé'); return; }

      this.hands = new Hands({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`
      });

      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.6,
      });

      this.hands.onResults((results) => this._onResults(results));

      // Utilisation de Camera utility si disponible, sinon boucle manuelle
      if (window.Camera) {
        this.camera = new window.Camera(videoEl, {
          onFrame: async () => {
            await this.hands.send({ image: videoEl });
          },
          width: 640, height: 480
        });
        this.camera.start();
      } else {
        // Boucle manuelle
        const loop = async () => {
          if (!this.running) return;
          await this.hands.send({ image: videoEl });
          requestAnimationFrame(loop);
        };
        this.running = true;
        requestAnimationFrame(loop);
      }

      if (this.options.onReady) this.options.onReady();
    } catch (err) {
      console.warn('Erreur démarrage caméra:', err);
    }
  }

  _onResults(results) {
    const lms = results.multiHandLandmarks || [];
    const handedness = results.multiHandedness || [];

    // Identifier mains gauche / droite
    let rightHand = null, leftHand = null;
    lms.forEach((marks, i) => {
      const label = handedness[i]?.label;
      // MediaPipe inverse gauche/droite (caméra miroir)
      if (label === 'Left') rightHand = marks;
      else if (label === 'Right') leftHand = marks;
    });

    // ── 1. Curseur index main droite ──────────────────────────
    if (rightHand && lms.length === 1) {
      const extended = this._isIndexOnly(rightHand);
      if (extended) {
        const tip = rightHand[8]; // INDEX_FINGER_TIP
        // Miroir horizontal (camera inversée)
        const x = (1 - tip.x) * window.innerWidth;
        const y = tip.y * (window.innerHeight - 64) + 64;
        if (this.options.onIndexPosition) {
          this.options.onIndexPosition(x, y, true);
        }
        this.fistsFrames = 0;
        return;
      }
    }

    // Cacher curseur si pas en mode index seul
    if (lms.length !== 2 && !(lms.length === 1 && this._isIndexOnly(lms[0]))) {
      if (this.options.onIndexPosition) {
        this.options.onIndexPosition(0, 0, false);
      }
    }

    // ── 2. Zoom 2 mains (pouces + index se touchent) ──────────
    if (lms.length === 2 && rightHand && leftHand) {
      const rightPinch = this._isPinch(rightHand);
      const leftPinch = this._isPinch(leftHand);

      if (rightPinch && leftPinch) {
        // Distance entre les deux "pinces"
        const rTip = rightHand[8];
        const lTip = leftHand[8];
        const dist = Math.hypot(rTip.x - lTip.x, rTip.y - lTip.y);

        if (!this.zoomActive) {
          this.zoomActive = true;
          this.zoomStartDist = dist;
        }

        const ratio = dist / this.zoomStartDist;
        const zoom = Math.min(Math.max(ratio, 1), this.options.maxZoom);
        if (this.options.onZoom) this.options.onZoom(zoom);

        // Zoom initial quand distance revient à zéro
        if (ratio <= 1.05) {
          this.zoomActive = false;
          this.zoomStartDist = null;
          if (this.options.onZoomEnd) this.options.onZoomEnd();
        }
        this.fistsFrames = 0;
        return;
      } else {
        if (this.zoomActive) {
          this.zoomActive = false;
          this.zoomStartDist = null;
          if (this.options.onZoomEnd) this.options.onZoomEnd();
        }
      }

      // ── 3. Deux poings fermés → retour arrière ───────────────
      const rightFist = this._isFist(rightHand);
      const leftFist  = this._isFist(leftHand);

      if (rightFist && leftFist) {
        this.fistsFrames++;
        if (this.fistsFrames >= this.FIST_FRAMES_NEEDED) {
          this.fistsFrames = 0;
          if (this.options.onGoBack) this.options.onGoBack();
        }
      } else {
        this.fistsFrames = 0;
      }
    } else {
      this.fistsFrames = 0;
      if (this.zoomActive) {
        this.zoomActive = false;
        this.zoomStartDist = null;
        if (this.options.onZoomEnd) this.options.onZoomEnd();
      }
    }
  }

  /* ── Helpers landmarks ─────────────────────────────────────── */

  // Seul l'index est levé (les autres repliés)
  _isIndexOnly(lm) {
    const extended = this._fingerExtended;
    const idx   = extended(lm, 8,  6);  // index
    const mid   = extended(lm, 12, 10);
    const ring  = extended(lm, 16, 14);
    const pinky = extended(lm, 20, 18);
    const thumb = lm[4].y > lm[3].y; // pouce vers le bas = replié (approx)
    return idx && !mid && !ring && !pinky;
  }

  // Pince : pouce (4) et index (8) proches
  _isPinch(lm) {
    const d = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
    return d < 0.07;
  }

  // Poing : tous les doigts repliés
  _isFist(lm) {
    const tips = [8, 12, 16, 20];
    const mids = [6, 10, 14, 18];
    return tips.every((t, i) => lm[t].y > lm[mids[i]].y);
  }

  _fingerExtended(lm, tipIdx, pipIdx) {
    return lm[tipIdx].y < lm[pipIdx].y;
  }

  stop() {
    this.running = false;
    if (this.camera) this.camera.stop();
  }
}

window.HandTracker = HandTracker;
