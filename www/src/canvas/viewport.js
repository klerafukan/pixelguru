/**
 * viewport.js
 * Verwaltet Zoom und Pan des Pixel-Canvas per CSS-Transform.
 *
 * Koordinatensystem:
 *   screen   = wrapper-relative Pixel (was der User sieht)
 *   logical  = Canvas-CSS-Pixel ohne Transform (was der Renderer kennt)
 *   screen = panX + logical * scale
 */

const MIN_SCALE = 0.25;
const MAX_SCALE = 10;

export class Viewport {
  /**
   * @param {HTMLElement} wrapper  – #canvas-wrapper
   * @param {HTMLCanvasElement} canvas
   */
  constructor(wrapper, canvas) {
    this._wrapper = wrapper;
    this._canvas  = canvas;
    this.scale = 1;
    this.panX  = 0;
    this.panY  = 0;

    canvas.style.transformOrigin = '0 0';
    canvas.style.position        = 'absolute';
    canvas.style.top             = '0';
    canvas.style.left            = '0';

    this._fitToWrapper();
  }

  /** Canvas passend einpassen und zentrieren */
  _fitToWrapper() {
    const wW = this._wrapper.clientWidth;
    const wH = this._wrapper.clientHeight;
    const cW = parseInt(this._canvas.style.width)  || this._canvas.offsetWidth;
    const cH = parseInt(this._canvas.style.height) || this._canvas.offsetHeight;

    if (!wW || !cW) return;

    // Maximal scale 1 beim Start (nicht upscalen), aber immer reinpassen
    this.scale = Math.min(1, wW / cW, wH / cH);
    this.panX  = (wW - cW * this.scale) / 2;
    this.panY  = (wH - cH * this.scale) / 2;
    this._apply();
  }

  /**
   * Zoom zu einem Punkt (wrapper-relative Koordinaten).
   * @param {number} wrapX
   * @param {number} wrapY
   * @param {number} factor  – z.B. 1.1 = 10% rein
   */
  zoomAt(wrapX, wrapY, factor) {
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
    const f = newScale / this.scale;
    this.panX  = wrapX - (wrapX - this.panX) * f;
    this.panY  = wrapY - (wrapY - this.panY) * f;
    this.scale = newScale;
    this._apply();
  }

  /** Verschieben um (dx, dy) Screen-Pixel */
  pan(dx, dy) {
    this.panX += dx;
    this.panY += dy;
    this._apply();
  }

  /** Screen-Koordinaten → logische Canvas-Koordinaten */
  screenToCanvas(clientX, clientY) {
    const rect = this._wrapper.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.panX) / this.scale,
      y: (clientY - rect.top  - this.panY) / this.scale,
    };
  }

  _apply() {
    this._canvas.style.transform =
      `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
  }
}
