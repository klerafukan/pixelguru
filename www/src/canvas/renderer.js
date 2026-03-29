/**
 * renderer.js
 * Zeichnet das Pixel-Grid auf den Canvas.
 * Jeder Pixel hat eine Farb-ID. Gefärbte Pixel werden voll gefüllt,
 * ungefärbte zeigen eine gedimmte Hintergrundfarbe + Zahlenbeschriftung.
 */

const CELL_SIZE  = 40;  // Gesamtgröße einer Zelle inkl. Rand
const CELL_PAD   = 2;   // Zwischenraum zwischen Zellen
const CELL_INNER = CELL_SIZE - CELL_PAD;

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../data/puzzleStore.js').Puzzle} puzzle
   * @param {import('../data/puzzleStore.js').Progress} progress
   */
  constructor(canvas, puzzle, progress) {
    this.canvas = canvas;
    this.puzzle = puzzle;
    this.progress = progress;
    this.selectedColorId = null;

    this._dpr = window.devicePixelRatio || 1;
    this._cols = puzzle.gridSize[0];
    this._rows = puzzle.gridSize[1];

    // Grauton pro Farb-ID vorberechnen
    this._grayByColorId = this._buildGrayMap(puzzle.palette);

    this._resize();
  }

  /**
   * Verteilt Palette auf Graubereich 210-100.
   * Abwechselnd von beiden Enden -> maximaler Kontrast zwischen Nachbarn.
   */
  _buildGrayMap(palette) {
    const n = palette.length;
    const light = 210, dark = 100;
    const map = new Map();
    palette.forEach((color, i) => {
      const pos = i % 2 === 0 ? i / 2 : n - 1 - Math.floor(i / 2);
      const v   = Math.round(light - (light - dark) * pos / Math.max(n - 1, 1));
      const h   = v.toString(16).padStart(2, '0');
      map.set(color.id, `#${h}${h}${h}`);
    });
    return map;
  }

  _resize() {
    const w = this._cols * CELL_SIZE;
    const h = this._rows * CELL_SIZE;
    this.canvas.width  = w * this._dpr;
    this.canvas.height = h * this._dpr;
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  /** Vollständiges Neuzeichnen */
  draw() {
    const ctx = this.canvas.getContext('2d');
    // Neutralgrau als Hintergrund / Trennlinie zwischen Zellen
    ctx.fillStyle = '#999999';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(this._dpr, this._dpr);

    for (let row = 0; row < this._rows; row++) {
      for (let col = 0; col < this._cols; col++) {
        this._drawCell(ctx, col, row);
      }
    }

    ctx.restore();
  }

  /** Einzelne Zelle zeichnen */
  _drawCell(ctx, col, row) {
    const colorId     = this.puzzle.pixels[row][col];
    const filled      = this.progress[row][col];
    const isSelected  = this.selectedColorId !== null;
    const isThisColor = this.selectedColorId === colorId;

    // Position: CELL_PAD/2 Offset damit der Rand gleichmäßig ist
    const x = col * CELL_SIZE + CELL_PAD / 2;
    const y = row * CELL_SIZE + CELL_PAD / 2;
    const s = CELL_INNER;

    // ── Zellfläche ────────────────────────────────────────────
    if (filled) {
      const color = this.puzzle.palette.find(p => p.id === colorId);
      ctx.fillStyle = color ? color.hex : '#888';
    } else {
      // Grauton bleibt IMMER gleich – egal ob Farbe gewählt oder nicht
      ctx.fillStyle = this._grayByColorId.get(colorId) ?? '#d4d4d4';
    }
    ctx.fillRect(x, y, s, s);

    // ── Zahlenbeschriftung ────────────────────────────────────
    if (!filled && colorId > 0) {
      const fontSize = Math.floor(s * 0.42);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      if (isSelected && isThisColor) {
        // Zahl in echter Palettenfarbe → signalisiert: hier malen!
        const color = this.puzzle.palette.find(p => p.id === colorId);
        ctx.fillStyle = color ? color.hex : '#333';
      } else {
        // Grau, dezent lesbar
        ctx.fillStyle = '#777788';
      }
      ctx.fillText(String(colorId), x + s / 2, y + s / 2);
    }
  }
  /** Grid-Koordinaten aus logischen Canvas-Pixeln (nach Viewport.screenToCanvas) */
  getCellAtLogical(logX, logY) {
    const col = Math.floor(logX / CELL_SIZE);
    const row = Math.floor(logY / CELL_SIZE);
    if (col < 0 || col >= this._cols || row < 0 || row >= this._rows) return null;
    return { col, row };
  }

  setSelectedColor(colorId) {
    this.selectedColorId = colorId;
    this.draw();
  }

  updateProgress(progress) {
    this.progress = progress;
    this.draw();
  }
}
