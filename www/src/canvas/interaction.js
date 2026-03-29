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

    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove  = this._onTouchMove.bind(this);
    this._onTouchEnd   = this._onTouchEnd.bind(this);
    this._onMouseDown  = this._onMouseDown.bind(this);
    this._onMouseMove  = this._onMouseMove.bind(this);
    this._onMouseUp    = this._onMouseUp.bind(this);
    this._onWheel      = this._onWheel.bind(this);

    canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   this._onTouchEnd,   { passive: false });
    canvas.addEventListener('mousedown',  this._onMouseDown);
    window.addEventListener('mousemove',  this._onMouseMove);
    window.addEventListener('mouseup',    this._onMouseUp);
    canvas.addEventListener('wheel',      this._onWheel, { passive: false });
  }

  // ── Touch ─────────────────────────────────────────────────────

  _onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length >= 2) {
      this._state      = 'pinching';
      this._lastPinch  = this._pinchInfo(e.touches);
      return;
    }
    const t = e.touches[0];
    if (this.renderer.selectedColorId !== null) {
      this._state       = 'painting';
      this._lastPainted = null;
      this._paintAt(t.clientX, t.clientY);
    } else {
      this._state      = 'panning';
      this._lastPanPos = { x: t.clientX, y: t.clientY };
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length >= 2) {
      if (this._state !== 'pinching') {
        this._state     = 'pinching';
        this._lastPinch = this._pinchInfo(e.touches);
        return;
      }
      const cur  = this._pinchInfo(e.touches);
      const rect = this.wrapper.getBoundingClientRect();
      const zoom = cur.dist / (this._lastPinch.dist || cur.dist);
      this.viewport.zoomAt(cur.midX - rect.left, cur.midY - rect.top, zoom);
      this.viewport.pan(cur.midX - this._lastPinch.midX, cur.midY - this._lastPinch.midY);
      this._lastPinch = cur;
      return;
    }
    const t = e.touches[0];
    if (this._state === 'painting') {
      this._paintAt(t.clientX, t.clientY);
    } else if (this._state === 'panning') {
      this.viewport.pan(t.clientX - this._lastPanPos.x, t.clientY - this._lastPanPos.y);
      this._lastPanPos = { x: t.clientX, y: t.clientY };
    }
  }

  _onTouchEnd(e) {
    e.preventDefault();
    if (e.touches.length === 0) {
      this._state       = 'idle';
      this._lastPainted = null;
    } else if (e.touches.length === 1) {
      // Von Pinch auf 1 Finger → pan
      this._state      = 'panning';
      this._lastPanPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
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
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchmove',  this._onTouchMove);
    this.canvas.removeEventListener('touchend',   this._onTouchEnd);
    this.canvas.removeEventListener('mousedown',  this._onMouseDown);
    window.removeEventListener('mousemove',       this._onMouseMove);
    window.removeEventListener('mouseup',         this._onMouseUp);
    this.canvas.removeEventListener('wheel',      this._onWheel);
  }
}
