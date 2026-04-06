/**
 * page-controller.js
 * Gestion du curseur, hover sur images, navigation, zoom
 */

class PageController {
  constructor() {
    this.cursor      = document.getElementById('hand-cursor');
    this.cursorRing  = document.getElementById('cursor-ring');
    this.zoomOverlay = document.getElementById('zoom-overlay');
    this.zoomImg     = this.zoomOverlay?.querySelector('img');
    this.zoomIndicator = document.getElementById('zoom-indicator');
    this.camStatus   = document.getElementById('camera-status');
    this.cameraVideo = document.getElementById('camera-video');

    this.hoverTarget = null;
    this.hoverTimer  = null;
    this.hoverStart  = null;
    this.navigating  = false;

    this.currentZoomImg = null;
    this.zoomMode = false;

    this._bindNav();
    this._initTracker();
  }

  /* ── Navigation ────────────────────────────────────────────── */
  _bindNav() {
    // Tous les éléments avec data-link
    document.querySelectorAll('[data-link]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateTo(el.dataset.link);
      });
    });
  }

  navigateTo(url) {
    if (this.navigating) return;
    this.navigating = true;
    const overlay = document.getElementById('page-transition');
    if (overlay) {
      overlay.classList.add('entering');
      setTimeout(() => { window.location.href = url; }, 400);
    } else {
      window.location.href = url;
    }
  }

  goBack() {
    if (this.navigating) return;
    if (window.history.length > 1) {
      this.navigating = true;
      window.history.back();
    }
  }

  /* ── Tracker ───────────────────────────────────────────────── */
  _initTracker() {
    const tracker = new HandTracker({
      maxZoom: 30,
      onReady: () => {
        if (this.camStatus) {
          this.camStatus.classList.add('ready');
          this.camStatus.querySelector('.status-text').textContent = 'Caméra active';
        }
      },
      onIndexPosition: (x, y, visible) => {
        this._updateCursor(x, y, visible);
      },
      onZoom: (factor) => {
        this._handleZoom(factor);
      },
      onZoomEnd: () => {
        this._handleZoomEnd();
      },
      onGoBack: () => {
        this.goBack();
      }
    });

    tracker.init(this.cameraVideo);
    this.tracker = tracker;
  }

  /* ── Curseur & hover ───────────────────────────────────────── */
  _updateCursor(x, y, visible) {
    if (!this.cursor) return;

    if (!visible) {
      this.cursor.classList.remove('active', 'over-image');
      if (this.cursorRing) this.cursorRing.classList.remove('active');
      this._clearHoverTimer();
      return;
    }

    this.cursor.classList.add('active');
    this.cursor.style.left = x + 'px';
    this.cursor.style.top  = y + 'px';

    if (this.cursorRing) {
      this.cursorRing.style.left = x + 'px';
      this.cursorRing.style.top  = y + 'px';
    }

    // Détection hover sur éléments cliquables
    const el = this._getClickableAt(x, y);

    if (el) {
      this.cursor.classList.add('over-image');

      if (this.hoverTarget !== el) {
        this._clearHoverTimer();
        this.hoverTarget = el;
        this._startHoverTimer(el, x, y);
      }
    } else {
      this.cursor.classList.remove('over-image');
      if (this.cursorRing) this.cursorRing.classList.remove('active');
      if (this.hoverTarget) {
        this._clearHoverTimer();
        this.hoverTarget = null;
      }
    }
  }

  _getClickableAt(x, y) {
    const elements = document.querySelectorAll('[data-link], [data-zoom-src]');
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return el;
      }
    }
    return null;
  }

  _startHoverTimer(el, x, y) {
    if (this.cursorRing) {
      this.cursorRing.style.left = x + 'px';
      this.cursorRing.style.top  = y + 'px';
      this.cursorRing.style.animation = 'none';
      // force reflow
      void this.cursorRing.offsetWidth;
      this.cursorRing.style.animation = 'cursor-spin 1.5s linear forwards';
      this.cursorRing.classList.add('active');
    }

    this.hoverTimer = setTimeout(() => {
      const link = el.dataset.link;
      const zoomSrc = el.dataset.zoomSrc;

      if (link) {
        this.navigateTo(link);
      } else if (zoomSrc) {
        this._openZoom(zoomSrc);
      }
      this.hoverTarget = null;
    }, 1500);
  }

  _clearHoverTimer() {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    if (this.cursorRing) {
      this.cursorRing.classList.remove('active');
    }
  }

  /* ── Zoom 2 mains ──────────────────────────────────────────── */
  _handleZoom(factor) {
    if (!this.zoomOverlay) return;

    // Trouver l'image la plus proche du centre ou la première image
    if (!this.zoomMode) {
      const imgs = document.querySelectorAll('.grid-item img, .piv-image-panel img');
      if (imgs.length > 0) {
        this.currentZoomImg = imgs[0].src;
        if (this.zoomImg) this.zoomImg.src = this.currentZoomImg;
        this.zoomOverlay.classList.add('active');
        this.zoomMode = true;
      }
    }

    if (this.zoomImg) {
      this.zoomImg.style.transform = `scale(${Math.min(factor, 30)})`;
    }
    if (this.zoomIndicator) {
      this.zoomIndicator.textContent = `ZOOM ×${factor.toFixed(1)}`;
      this.zoomIndicator.classList.add('visible');
    }
  }

  _handleZoomEnd() {
    if (this.zoomOverlay) this.zoomOverlay.classList.remove('active');
    if (this.zoomImg) this.zoomImg.style.transform = 'scale(1)';
    if (this.zoomIndicator) this.zoomIndicator.classList.remove('visible');
    this.zoomMode = false;
    this.currentZoomImg = null;
  }

  _openZoom(src) {
    if (!this.zoomOverlay || !this.zoomImg) return;
    this.zoomImg.src = src;
    this.zoomImg.style.transform = 'scale(1)';
    this.zoomOverlay.classList.add('active');
  }
}

// Démarrage automatique
document.addEventListener('DOMContentLoaded', () => {
  window.pageController = new PageController();

  // Animation entrée de page
  const overlay = document.getElementById('page-transition');
  if (overlay) {
    overlay.classList.remove('entering');
  }
});
