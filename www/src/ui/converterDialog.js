/**
 * converterDialog.js
 * UI-Controller für den Bild-Import-Dialog.
 * Liest Einstellungen (Rastergröße, Farbanzahl), zeigt Live-Vorschau
 * und gibt das fertige Puzzle-Objekt per Callback zurück.
 */

import { GRID_SIZES, COLOR_COUNTS, convertImage, renderPreview } from '../data/imageConverter.js';

export class ConverterDialog {
  /**
   * @param {HTMLElement} overlayEl         – #import-overlay
   * @param {(puzzle: object) => void} onPuzzleCreated
   */
  constructor(overlayEl, onPuzzleCreated) {
    this.overlay          = overlayEl;
    this.onPuzzleCreated  = onPuzzleCreated;

    this._img        = null;
    this._maxDim     = 20;
    this._colorCount = COLOR_COUNTS[0].count;
    this._puzzle     = null;

    this._bind();
  }

  open() {
    this.overlay.classList.remove('hidden');
  }

  close() {
    this.overlay.classList.add('hidden');
    this._reset();
  }

  // ── Event-Binding ──────────────────────────────────────────────

  _bind() {
    const q = sel => this.overlay.querySelector(sel);

    // Schließen per Button oder Klick auf Overlay-Hintergrund
    q('#import-close').addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', e => {
      if (e.target === this.overlay) this.close();
    });

    // Datei-Auswahl
    q('#import-file').addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) this._loadFile(file);
    });

    // Drag & Drop
    const dropzone = q('#import-dropzone');
    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer?.files[0];
      if (file && file.type.startsWith('image/')) this._loadFile(file);
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

    // Titel-Änderung → Vorschau neu erzeugen
    q('#import-title').addEventListener('input', () => this._updatePreview());

    // Bestätigen
    q('#import-confirm').addEventListener('click', () => {
      if (!this._puzzle) return;
      this.onPuzzleCreated(this._puzzle);
      this.close();
    });
  }

  // ── Bild laden ────────────────────────────────────────────────

  _loadFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        this._img = img;
        this._showOriginalPreview(img);
        this._updatePreview();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  _showOriginalPreview(img) {
    const canvas = this.overlay.querySelector('#import-original');
    const maxW = 130, maxH = 130;
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    canvas.width  = Math.round(img.naturalWidth  * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.style.width  = canvas.width  + 'px';
    canvas.style.height = canvas.height + 'px';
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

    this.overlay.querySelector('#import-previews').classList.remove('hidden');
    this.overlay.querySelector('#import-dropzone').classList.add('hidden');
  }

  // ── Live-Vorschau ─────────────────────────────────────────────

  _updatePreview() {
    if (!this._img) return;

    const title = this.overlay.querySelector('#import-title').value.trim() || 'Mein Bild';
    this._puzzle = convertImage(this._img, this._maxDim, this._colorCount, title);

    renderPreview(this.overlay.querySelector('#import-result'), this._puzzle, 6);

    this.overlay.querySelector('#import-confirm').disabled = false;
  }

  // ── Reset ─────────────────────────────────────────────────────

  _reset() {
    this._img    = null;
    this._puzzle = null;

    const q = sel => this.overlay.querySelector(sel);
    q('#import-previews').classList.add('hidden');
    q('#import-dropzone').classList.remove('hidden');
    q('#import-file').value  = '';
    q('#import-title').value = '';
    q('#import-confirm').disabled = true;

    // Buttons auf Standard zurücksetzen
    this.overlay.querySelectorAll('[data-grid]').forEach((btn, i) => {
      btn.classList.toggle('active', i === 0);
    });
    this.overlay.querySelectorAll('[data-colors]').forEach((btn, i) => {
      btn.classList.toggle('active', i === 0);
    });

    this._maxDim     = GRID_SIZES[0].maxDim;
    this._colorCount = COLOR_COUNTS[0].count;
  }
}
