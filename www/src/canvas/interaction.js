/**
 * interaction.js
 * Verwaltet alle Touch- und Maus-Gesten auf dem Canvas.
 *
 * Zustände:
 *   idle      – nichts aktiv
 *   painting  – 1 Finger / LMB, Farbe gewählt → Pixel malen
 *   panning   – 1 Finger / LMB, keine Farbe → verschieben
 *   pinching  – 2 Finger → Zoom + Pan
 */

export class Interaction {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement}       wrapper   – #canvas-wrapper
   * @param {import('./renderer.js').Renderer}   renderer
   * @param {import('./viewport.js').Viewport}   viewport
   * @param {(col: number, row: number) => void} onCellPaint
   */
  constructor(canvas, wrapper, renderer, viewport, onCellPaint) {
    this.canvas      = canvas;
    this.wrapper     = wrapper;
    this.renderer    = renderer;
    this.viewport    = viewport;
    this.onCellPaint = onCellPaint;

    this._state       = 'idle';
    this._lastPainted = null;
    this._lastPanPos  = null;
    this._lastPinch   = null;
    // RAF-Buffer: neueste Position pro Frame, verhindert Arbeit über 60 fps
    this._pendingPaint = null;
    this._pendingPinch = null;
    this._rafId        = null;

    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove  = this._onTouchMove.bind(this);
    this._onTouchEnd   = this._onTouchEnd.bind(this);
    this._onMouseDown  = this._onMouseDown.bind(this);
    this._onMouseMove  = this._onMouseMove.bind(this);
    this._onMouseUp    = this._onMouseUp.bind(this);
    this._onWheel      = this._onWheel.bind(this);

    // passive:true ist sicher, weil #pixel-canvas touch-action:none hat—
    // der Browser scrollt den Canvas-Bereich nie selbst
    canvas.addEventListener('touchstart', this._onTouchStart, { passive: true });
    canvas.addEventListener('touchmove',  this._onTouchMove,  { passive: true });
    canvas.addEventListener('touchend',   this._onTouchEnd,   { passive: true });
    canvas.addEventListener('mousedown',  this._onMouseDown);
    window.addEventListener('mousemove',  this._onMouseMove);
    window.addEventListener('mouseup',    this._onMouseUp);
    canvas.addEventListener('wheel',      this._onWheel, { passive: false });
  }

  // ── Touch ─────────────────────────────────────────────────────

  _onTouchStart(e) {
    // Kein e.preventDefault() nötig – Canvas hat touch-action:none
    if (e.touches.length >= 2) {
      this._state      = 'pinching';
      this._lastPinch  = this._pinchInfo(e.touches);
      this._pendingPaint = null;
      return;
    }
    const t = e.touches[0];
    this._lastPanPos = { x: t.clientX, y: t.clientY };

    if (this.renderer.selectedColorId !== null && this._cellMatchesAtPoint(t.clientX, t.clientY)) {
      // Ersttap trifft eine passende, noch unbemalte Zelle → Mal-Modus
      this._state       = 'painting';
      this._lastPainted = null;
      this._paintAt(t.clientX, t.clientY);
    } else {
      // Kein Treffer (falsche Farbe, leer, bereits gemalt) → Pan-Modus
      this._state = 'panning';
    }
  }

  _onTouchMove(e) {
    if (e.touches.length >= 2) {
      if (this._state !== 'pinching') {
        this._state     = 'pinching';
        this._lastPinch = this._pinchInfo(e.touches);
      }
      // Koordinaten kopieren (Touch-Objekte werden vom Browser wiederverwendet)
      this._pendingPinch = {
        t0: { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY },
        t1: { clientX: e.touches[1].clientX, clientY: e.touches[1].clientY },
      };
      this._scheduleRaf();
      return;
    }
    const t = e.touches[0];
    if (this._state === 'painting') {
      // RAF-throttled: nur die letzte Position pro Frame verarbeiten
      this._pendingPaint = { x: t.clientX, y: t.clientY };
      this._scheduleRaf();
    } else if (this._state === 'panning') {
      // Pan = CSS-Transform, sofort anwenden (0 Latenz, läuft im Compositor)
      this.viewport.pan(t.clientX - this._lastPanPos.x, t.clientY - this._lastPanPos.y);
      this._lastPanPos = { x: t.clientX, y: t.clientY };
    }
  }

  _onTouchEnd(e) {
    this._pendingPaint = null;
    this._pendingPinch = null;
    if (e.touches.length === 0) {
      this._state       = 'idle';
      this._lastPainted = null;
    } else if (e.touches.length === 1) {
      this._state      = 'panning';
      this._lastPanPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }

  // ── RAF-Scheduler ─────────────────────────────────────────────

  _scheduleRaf() {
    if (this._rafId !== null) return; // bereits angemeldet
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      // Pinch zuerst (bestimmt neuen Scale)
      if (this._pendingPinch) {
        const { t0, t1 } = this._pendingPinch;
        this._pendingPinch = null;
        const cur  = { dist: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
                       midX: (t0.clientX + t1.clientX) / 2,
                       midY: (t0.clientY + t1.clientY) / 2 };
        const rect = this.wrapper.getBoundingClientRect();
        const zoom = cur.dist / (this._lastPinch.dist || cur.dist);
        this.viewport.zoomAt(cur.midX - rect.left, cur.midY - rect.top, zoom);
        this.viewport.pan(cur.midX - this._lastPinch.midX, cur.midY - this._lastPinch.midY);
        this._lastPinch = cur;
        this.renderer.setViewScale(this.viewport.scale);
      }
      // Dann Paint
      if (this._pendingPaint) {
        const { x, y } = this._pendingPaint;
        this._pendingPaint = null;
        this._paintAt(x, y);
      }
    });
  }

  // ── Maus ──────────────────────────────────────────────────────

  _onMouseDown(e) {
    if (this.renderer.selectedColorId !== null) {
      this._state       = 'painting';
      this._lastPainted = null;
      this._paintAt(e.clientX, e.clientY);
    } else {
      this._state      = 'panning';
      this._lastPanPos = { x: e.clientX, y: e.clientY };
    }
  }

  _onMouseMove(e) {
    if (this._state === 'painting') {
      this._paintAt(e.clientX, e.clientY);
    } else if (this._state === 'panning') {
      this.viewport.pan(e.clientX - this._lastPanPos.x, e.clientY - this._lastPanPos.y);
      this._lastPanPos = { x: e.clientX, y: e.clientY };
    }
  }

  _onMouseUp() {
    this._state       = 'idle';
    this._lastPainted = null;
  }

  _onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const rect   = this.wrapper.getBoundingClientRect();
    this.viewport.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    this.renderer.setViewScale(this.viewport.scale);
  }

  // ── Hilfsfunktion: trifft der Punkt eine passende, unbemalte Zelle? ──

  _cellMatchesAtPoint(clientX, clientY) {
    const logical = this.viewport.screenToCanvas(clientX, clientY);
    const cell    = this.renderer.getCellAtLogical(logical.x, logical.y);
    if (!cell) return false;
    const selColor = this.renderer.selectedColorId;
    return selColor !== null
      && this.renderer.puzzle.pixels[cell.row][cell.col] === selColor
      && !this.renderer.progress[cell.row][cell.col];
  }

  // ── Malen ─────────────────────────────────────────────────────

  _paintAt(clientX, clientY) {
    const logical = this.viewport.screenToCanvas(clientX, clientY);
    const cell    = this.renderer.getCellAtLogical(logical.x, logical.y);
    if (!cell) return;

    const selColor = this.renderer.selectedColorId;
    if (selColor === null) return;
    if (this.renderer.puzzle.pixels[cell.row][cell.col] !== selColor) return;

    const key = `${cell.col},${cell.row}`;
    if (this._lastPainted === key) return;
    this._lastPainted = key;

    this.onCellPaint(cell.col, cell.row);
  }

  // ── Pinch-Hilfsfunktion ───────────────────────────────────────

  _pinchInfo(touches) {
    const [a, b] = [touches[0], touches[1]];
    const dx = b.clientX - a.clientX;
    const dy = b.clientY - a.clientY;
    return {
      dist: Math.sqrt(dx * dx + dy * dy),
      midX: (a.clientX + b.clientX) / 2,
      midY: (a.clientY + b.clientY) / 2,
    };
  }

  destroy() {
    if (this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchmove',  this._onTouchMove);
    this.canvas.removeEventListener('touchend',   this._onTouchEnd);
    this.canvas.removeEventListener('mousedown',  this._onMouseDown);
    window.removeEventListener('mousemove',       this._onMouseMove);
    window.removeEventListener('mouseup',         this._onMouseUp);
    this.canvas.removeEventListener('wheel',      this._onWheel);
  }
}
