/**
 * converterDialog.js
 * Mehrstufiger Import-Dialog:
 *   1. Quelle   – Datei-Picker oder Kamera
 *   2. Prüfen   – Bild behalten oder verwerfen
 *   3. Crop     – optionaler Touch-/Mouse-Zuschnitt
 *   4. Settings – Rastergröße, Farben, Titel + Live-Vorschau
 */

import { convertImage, renderPreview, calcGridSize } from '../data/imageConverter.js';

// ── CropTool ───────────────────────────────────────────────────────────────────

class CropTool {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLImageElement|HTMLCanvasElement} src
   * @param {number} maxW  – max. Anzeigebreite in CSS-px
   */
  constructor(canvas, src, maxW = 300) {
    this.canvas = canvas;
    this.src    = src;

    const srcW = src.naturalWidth  ?? src.width;
    const srcH = src.naturalHeight ?? src.height;
    const maxH = 270;

    this.scale = Math.min(maxW / srcW, maxH / srcH, 1);
    this.dW    = Math.round(srcW * this.scale);
    this.dH    = Math.round(srcH * this.scale);

    canvas.width        = this.dW;
    canvas.height       = this.dH;
    canvas.style.width  = this.dW + 'px';
    canvas.style.height = this.dH + 'px';

    // Crop-Rechteck in Display-Koordinaten, initiell = ganzes Bild
    this.crop  = { x: 0, y: 0, w: this.dW, h: this.dH };
    this._drag = null;

    this._bindEvents();
    this._draw();
  }

  // ── Zeichnen ────────────────────────────────────────────────────

  _draw() {
    const ctx       = this.canvas.getContext('2d');
    const { x, y, w, h } = this.crop;

    ctx.clearRect(0, 0, this.dW, this.dH);
    ctx.drawImage(this.src, 0, 0, this.dW, this.dH);

    // Abdunklung außerhalb des Ausschnitts
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0,     0,          this.dW, y);
    ctx.fillRect(0,     y + h,      this.dW, this.dH - y - h);
    ctx.fillRect(0,     y,          x,       h);
    ctx.fillRect(x + w, y,          this.dW - x - w, h);

    // Rahmen
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    // Drittel-Linien (Drittelteilung)
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      ctx.moveTo(x + w * i / 3, y);     ctx.lineTo(x + w * i / 3, y + h);
      ctx.moveTo(x,             y + h * i / 3); ctx.lineTo(x + w, y + h * i / 3);
    }
    ctx.stroke();

    // Eck-Handles
    const hs = 14;
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur  = 4;
    [[x, y], [x + w - hs, y], [x, y + h - hs], [x + w - hs, y + h - hs]].forEach(([hx, hy]) => {
      ctx.fillRect(hx, hy, hs, hs);
    });
    ctx.shadowBlur = 0;
  }

  // ── Input-Hilfsfunktionen ────────────────────────────────────────

  _pos(e) {
    const r  = this.canvas.getBoundingClientRect();
    const t  = e.touches ? e.touches[0] : e;
    return {
      x: (t.clientX - r.left) * (this.dW / r.width),
      y: (t.clientY - r.top)  * (this.dH / r.height),
    };
  }

  _hit(px, py) {
    const { x, y, w, h } = this.crop;
    const ht = 28; // Touch-Trefferbereich
    if (px >= x - ht/2 && px <= x + ht     && py >= y - ht/2 && py <= y + ht)     return 'nw';
    if (px >= x + w-ht && px <= x + w+ht/2 && py >= y - ht/2 && py <= y + ht)     return 'ne';
    if (px >= x - ht/2 && px <= x + ht     && py >= y + h-ht && py <= y + h+ht/2) return 'sw';
    if (px >= x + w-ht && px <= x + w+ht/2 && py >= y + h-ht && py <= y + h+ht/2) return 'se';
    if (px >= x && px <= x + w && py >= y && py <= y + h) return 'move';
    return null;
  }

  _onDown(e) {
    e.preventDefault();
    const p    = this._pos(e);
    const mode = this._hit(p.x, p.y);
    if (!mode) return;
    this._drag = { mode, sx: p.x, sy: p.y, sc: { ...this.crop } };
  }

  _onMove(e) {
    e.preventDefault();
    if (!this._drag) return;
    const p   = this._pos(e);
    const dx  = p.x - this._drag.sx;
    const dy  = p.y - this._drag.sy;
    const sc  = this._drag.sc;
    const MIN = 24;
    let { x, y, w, h } = sc;

    switch (this._drag.mode) {
      case 'move':
        x = Math.max(0, Math.min(this.dW - w, sc.x + dx));
        y = Math.max(0, Math.min(this.dH - h, sc.y + dy));
        break;
      case 'nw':
        x = Math.max(0, Math.min(sc.x + sc.w - MIN, sc.x + dx));
        y = Math.max(0, Math.min(sc.y + sc.h - MIN, sc.y + dy));
        w = sc.x + sc.w - x;  h = sc.y + sc.h - y;
        break;
      case 'ne':
        y = Math.max(0, Math.min(sc.y + sc.h - MIN, sc.y + dy));
        w = Math.max(MIN, Math.min(this.dW - sc.x, sc.w + dx));
        h = sc.y + sc.h - y;
        break;
      case 'sw':
        x = Math.max(0, Math.min(sc.x + sc.w - MIN, sc.x + dx));
        w = sc.x + sc.w - x;
        h = Math.max(MIN, Math.min(this.dH - sc.y, sc.h + dy));
        break;
      case 'se':
        w = Math.max(MIN, Math.min(this.dW - sc.x, sc.w + dx));
        h = Math.max(MIN, Math.min(this.dH - sc.y, sc.h + dy));
        break;
    }
    this.crop = { x, y, w, h };
    this._draw();
  }

  _onUp() { this._drag = null; }

  _bindEvents() {
    const el = this.canvas;
    el.addEventListener('mousedown',  e => this._onDown(e));
    el.addEventListener('mousemove',  e => this._onMove(e));
    el.addEventListener('mouseup',    ()  => this._onUp());
    el.addEventListener('mouseleave', ()  => this._onUp());
    el.addEventListener('touchstart', e => this._onDown(e), { passive: false });
    el.addEventListener('touchmove',  e => this._onMove(e), { passive: false });
    el.addEventListener('touchend',   ()  => this._onUp());
  }

  /** Gibt ein HTMLCanvasElement mit dem zugeschnittenen Bereich in Originalauflösung zurück */
  getCropped() {
    const sx  = Math.round(this.crop.x / this.scale);
    const sy  = Math.round(this.crop.y / this.scale);
    const sw  = Math.max(1, Math.round(this.crop.w / this.scale));
    const sh  = Math.max(1, Math.round(this.crop.h / this.scale));
    const out = document.createElement('canvas');
    out.width  = sw;
    out.height = sh;
    out.getContext('2d').drawImage(this.src, sx, sy, sw, sh, 0, 0, sw, sh);
    return out;
  }
}

// ── ConverterDialog ────────────────────────────────────────────────────────────

export class ConverterDialog {
  /**
   * @param {HTMLElement} overlayEl
   * @param {(puzzle: object) => void} onPuzzleCreated
   */
  constructor(overlayEl, onPuzzleCreated) {
    this.overlay         = overlayEl;
    this.onPuzzleCreated = onPuzzleCreated;

    this._src        = null;   // HTMLImageElement nach Datei-/Kamera-Auswahl
    this._workSrc    = null;   // Arbeitsquelle: src oder zugeschnittenes Canvas
    this._cropTool   = null;
    this._maxDim     = 20;
    this._colorCount = 5;
    this._glitter    = false;
    this._puzzle     = null;

    this._bind();
  }

  open()  { this.overlay.classList.remove('hidden'); this._gotoStep('source'); }
  close() { this.overlay.classList.add('hidden');    this._reset(); }

  // ── Schritte ─────────────────────────────────────────────────────

  _gotoStep(name) {
    this.overlay.querySelectorAll('[data-step]').forEach(el =>
      el.classList.toggle('hidden', el.dataset.step !== name)
    );
    const titles = {
      source:   'Bild importieren',
      preview:  'Bild prüfen',
      crop:     'Zuschneiden',
      settings: 'Puzzle konfigurieren',
    };
    this.overlay.querySelector('#import-dialog-title').textContent = titles[name] ?? 'Importieren';
    // Confirm-Button nur im letzten Schritt zeigen
    this.overlay.querySelector('#import-confirm').classList.toggle('hidden', name !== 'settings');
  }

  // ── Event-Binding ─────────────────────────────────────────────────

  _bind() {
    const q = s => this.overlay.querySelector(s);

    // Schließen
    q('#import-close').addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close(); });

    // Datei-Picker
    q('#import-file').addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) this._loadFile(f);
    });

    // Kamera
    q('#import-camera-btn').addEventListener('click', () => q('#import-camera').click());
    q('#import-camera').addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) this._loadFile(f);
    });

    // Drag & Drop
    const dz = q('#import-dropzone');
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', ()  => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      const f = e.dataTransfer?.files[0];
      if (f?.type.startsWith('image/')) this._loadFile(f);
    });

    // Behalten / Verwerfen
    q('#import-discard').addEventListener('click', () => {
      this._src = null;
      this._gotoStep('source');
    });
    q('#import-keep').addEventListener('click', () => {
      this._gotoStep('crop');
      requestAnimationFrame(() => {
        const container = q('#crop-container');
        this._cropTool  = new CropTool(q('#crop-canvas'), this._src, container.clientWidth || 300);
      });
    });

    // Crop
    q('#crop-skip').addEventListener('click', () => {
      this._workSrc = this._src;
      this._goToSettings();
    });
    q('#crop-apply').addEventListener('click', () => {
      this._workSrc = this._cropTool ? this._cropTool.getCropped() : this._src;
      this._goToSettings();
    });

    // Rastergröße
    this.overlay.querySelectorAll('[data-grid]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.overlay.querySelectorAll('[data-grid]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._maxDim = parseInt(btn.dataset.grid);
        this._updatePreview();
      });
    });

    // Farbanzahl
    this.overlay.querySelectorAll('[data-colors]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.overlay.querySelectorAll('[data-colors]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._colorCount = parseInt(btn.dataset.colors);
        this._updatePreview();
      });
    });

    // Titel
    q('#import-title').addEventListener('input', () => this._updatePreview());

    // Glitzer
    q('#import-glitter').addEventListener('change', e => {
      this._glitter = e.target.checked;
      if (this._puzzle) this._puzzle.glitter = this._glitter;
    });

    // Bestätigen
    q('#import-confirm').addEventListener('click', () => {
      if (!this._puzzle) return;
      this.onPuzzleCreated(this._puzzle);
      this.close();
    });
  }

  // ── Bild laden ────────────────────────────────────────────────────

  _loadFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        this._src = img;

        // Vorschau für Schritt 2
        const cv    = this.overlay.querySelector('#import-preview-canvas');
        const scale = Math.min(300 / img.naturalWidth, 220 / img.naturalHeight, 1);
        cv.width        = Math.round(img.naturalWidth  * scale);
        cv.height       = Math.round(img.naturalHeight * scale);
        cv.style.width  = cv.width  + 'px';
        cv.style.height = cv.height + 'px';
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);

        this._gotoStep('preview');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ── Einstellungsschritt ───────────────────────────────────────────

  _goToSettings() {
    const src  = this._workSrc;
    const srcW = src.naturalWidth  ?? src.width;
    const srcH = src.naturalHeight ?? src.height;

    // Original-Preview aktualisieren
    const oc    = this.overlay.querySelector('#import-original');
    const scale = Math.min(130 / srcW, 130 / srcH, 1);
    oc.width        = Math.round(srcW * scale);
    oc.height       = Math.round(srcH * scale);
    oc.style.width  = oc.width  + 'px';
    oc.style.height = oc.height + 'px';
    oc.getContext('2d').drawImage(src, 0, 0, oc.width, oc.height);

    // Grid-Buttons mit tatsächlichen Dimensionen beschriften
    this.overlay.querySelectorAll('[data-grid]').forEach(btn => {
      const md   = parseInt(btn.dataset.grid);
      const dims = calcGridSize(srcW, srcH, md);
      const sm   = btn.querySelector('small');
      if (sm) sm.textContent = `${dims.cols}×${dims.rows}`;
    });

    this._gotoStep('settings');
    this._updatePreview();
  }

  _updatePreview() {
    if (!this._workSrc) return;
    const title  = this.overlay.querySelector('#import-title').value.trim() || 'Mein Bild';
    this._puzzle = convertImage(this._workSrc, this._maxDim, this._colorCount, title);
    this._puzzle.glitter = this._glitter;
    renderPreview(this.overlay.querySelector('#import-result'), this._puzzle, 6);
    this.overlay.querySelector('#import-confirm').disabled = false;
  }

  // ── Reset ─────────────────────────────────────────────────────────

  _reset() {
    this._src = null;  this._workSrc = null;  this._puzzle = null;  this._cropTool = null;

    const q = s => this.overlay.querySelector(s);
    q('#import-file').value   = '';
    q('#import-camera').value = '';
    q('#import-title').value  = '';
    q('#import-glitter').checked = false;
    q('#import-confirm').disabled = true;

    this.overlay.querySelectorAll('[data-grid]').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.grid) === 20);
      const sm = btn.querySelector('small');
      if (sm) sm.textContent = '…';
    });
    this.overlay.querySelectorAll('[data-colors]').forEach((btn, i) => {
      btn.classList.toggle('active', i === 0);
    });

    this._maxDim     = 20;
    this._colorCount = 5;
  }
}
