/**
 * renderer.js
 * Zeichnet das Pixel-Grid auf den Canvas.
 * Jeder Pixel hat eine Farb-ID. Gefärbte Pixel werden voll gefüllt,
 * ungefärbte zeigen eine gedimmte Hintergrundfarbe + Zahlenbeschriftung.
 */

const CELL_SIZE  = 40;  // Gesamtgröße einer Zelle inkl. Rand
const CELL_PAD   = 2;   // Zwischenraum zwischen Zellen
const CELL_INNER = CELL_SIZE - CELL_PAD;

// Glitzer-Partikel: animiert, pro Zelle
const SPARKLE_DURATION = 700; // ms

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
    this._sparkles = new Map(); // key → { particles, startTime, col, row }
    this._sparkleFrame = null;
    this._lastGlitterSpawn = 0;
    this._glitterBase = null; // statische Sternpositionen für Grundglitzer
    this._glitterDots = null;

    this._dpr = window.devicePixelRatio || 1;
    this._cols = puzzle.gridSize[0];
    this._rows = puzzle.gridSize[1];

    // O(1)-Farbsuche statt palette.find() pro Zelle
    this._grayByColorId = this._buildGrayMap(puzzle.palette);
    this._colorHexById  = new Map(puzzle.palette.map(c => [c.id, c.hex]));

    this._viewScale = 1;

    // Offscreen-Canvas als Base-Layer:
    // Alle Zellen werden hier gezeichnet. draw() kopiert es per drawImage
    // (ein einziger GPU-Blit). Nur bei Änderungen wird der base neu gebaut.
    this._base    = document.createElement('canvas');
    this._baseCtx = this._base.getContext('2d');

    this._resize();
    this._rebuildBase();
    if (puzzle.glitter) this._animateSparkles();
  }

  /**
   * Berechnet Grauton aus der tatsächlichen Farbhelligkeit (sRGB-Luminanz).
   * Dunkle Farben → dunkles Grau, helle Farben → helles Grau.
   */
  _buildGrayMap(palette) {
    const map = new Map();
    palette.forEach(color => {
      const hex = color.hex.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      // Perceptuelle Luminanz nach sRGB
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Wertebereich 70–220: immer sichtbar, aber mit echtem Helligkeitsunterschied
      const v = Math.round(70 + lum * 150);
      const h = v.toString(16).padStart(2, '0');
      map.set(color.id, `#${h}${h}${h}`);
    });
    return map;
  }

  setViewScale(scale) {
    const wasVisible = this._viewScale * CELL_SIZE >= 10;
    const isVisible  = scale * CELL_SIZE >= 10;
    this._viewScale = scale;
    if (wasVisible !== isVisible) {
      this._rebuildBase();
      this.draw();
    }
  }

  _resize() {
    const w = this._cols * CELL_SIZE;
    const h = this._rows * CELL_SIZE;
    this.canvas.width  = w * this._dpr;
    this.canvas.height = h * this._dpr;
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
    this._base.width  = w * this._dpr;
    this._base.height = h * this._dpr;
  }

  /** Gesamter Base neu aufbauen (bei Farbwechsel / Zoom-Schwelle) */
  _rebuildBase() {
    const ctx = this._baseCtx;
    ctx.fillStyle = '#999999';
    ctx.fillRect(0, 0, this._base.width, this._base.height);
    ctx.save();
    ctx.scale(this._dpr, this._dpr);
    for (let row = 0; row < this._rows; row++) {
      for (let col = 0; col < this._cols; col++) {
        this._drawCell(ctx, col, row);
      }
    }
    ctx.restore();
  }

  /** Einzelne Zelle auf dem Base-Canvas aktualisieren (beim Malen) */
  _updateCellOnBase(col, row) {
    const ctx = this._baseCtx;
    ctx.save();
    ctx.scale(this._dpr, this._dpr);
    // Zell-Bereich komplett zurücksetzen
    ctx.fillStyle = '#999999';
    ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    this._drawCell(ctx, col, row);
    ctx.restore();
  }

  /** Vollständiges Neuzeichnen: ein einziger GPU-Blit */
  draw() {
    const ctx = this.canvas.getContext('2d');
    ctx.drawImage(this._base, 0, 0);
  }

  /** Einzelne Zelle zeichnen */
  _drawCell(ctx, col, row) {
    const colorId     = this.puzzle.pixels[row][col];
    const filled      = this.progress[row][col];
    const isSelected  = this.selectedColorId !== null;
    const isThisColor = this.selectedColorId === colorId;

    // Gefüllte Zellen: volle Fläche (kein Rand) → nahtlose Farbfläche
    // Ungefüllte Zellen: mit Abstand → Gitter-Optik für Zahlen
    const x = filled ? col * CELL_SIZE       : col * CELL_SIZE + CELL_PAD / 2;
    const y = filled ? row * CELL_SIZE       : row * CELL_SIZE + CELL_PAD / 2;
    const s = filled ? CELL_SIZE             : CELL_INNER;

    // ── Zellfläche ────────────────────────────────────────────
    if (filled) {
      const color = this.puzzle.palette.find(p => p.id === colorId);
      ctx.fillStyle = color ? color.hex : '#888';
    } else {
      // Grauton bleibt IMMER gleich – egal ob Farbe gewählt oder nicht
      ctx.fillStyle = this._grayByColorId.get(colorId) ?? '#d4d4d4';
    }
    ctx.fillRect(x, y, s, s);

    // ── Weißes Overlay auf passenden (ungefüllten) Zellen ────
    if (!filled && isSelected && isThisColor) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x, y, s, s);
    }

    // ── Nicht-passende Zellen abdunkeln ───────────────────────
    if (!filled && isSelected && !isThisColor) {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(x, y, s, s);
    }

    // Glitzer wird im RAF-Loop separat über draw() gezeichnet

    // ── Zahlenbeschriftung (nur ab Mindest-Zellgröße sichtbar) ──
    if (!filled && colorId > 0 && this._viewScale * CELL_SIZE >= 10) {
      const fontSize = Math.floor(s * 0.42);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      if (isSelected && isThisColor) {
        // Zahl in echter Palettenfarbe – Rand schwarz bei hellen, weiß bei dunklen Farben
        const color = this.puzzle.palette.find(p => p.id === colorId);
        const hex = color ? color.hex : '#333333';
        const h = hex.replace('#', '');
        const lum = 0.2126 * parseInt(h.substring(0,2),16)/255
                  + 0.7152 * parseInt(h.substring(2,4),16)/255
                  + 0.0722 * parseInt(h.substring(4,6),16)/255;
        ctx.fillStyle   = hex;
        ctx.strokeStyle = lum > 0.4 ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)';
        ctx.lineWidth   = Math.max(1, fontSize * 0.18);
        ctx.lineJoin    = 'round';
        ctx.strokeText(String(colorId), x + s / 2, y + s / 2);
        ctx.fillText(String(colorId), x + s / 2, y + s / 2);
        ctx.lineWidth = 1; // zurücksetzen
      } else {
        // Grau, dezent lesbar
        ctx.fillStyle = '#777788';
        ctx.fillText(String(colorId), x + s / 2, y + s / 2);
      }
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
    this._rebuildBase();
    this.draw();
  }

  updateProgress(progress, newCol, newRow) {
    this.progress = progress;
    if (newCol !== undefined && newRow !== undefined) {
      // Nur die eine veränderte Zelle auf dem Base aktualisieren
      this._updateCellOnBase(newCol, newRow);

      const key      = `${newCol},${newRow}`;
      const cx       = newCol * CELL_SIZE + CELL_SIZE / 2;
      const cy       = newRow * CELL_SIZE + CELL_SIZE / 2;
      const colorHex = this._colorHexById.get(this.puzzle.pixels[newRow][newCol]) ?? '#ffffff';
      const accents  = [colorHex, '#ffffff', '#ffe066', '#ff88cc', '#88eeff'];

      const particles = [];
      for (let i = 0; i < 16; i++) {
        const angle = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5) * 0.5;
        const speed = 0.6 + Math.random() * 1.6;
        particles.push({
          x:        cx + (Math.random() - 0.5) * CELL_SIZE * 0.3,
          y:        cy + (Math.random() - 0.5) * CELL_SIZE * 0.3,
          vx:       Math.cos(angle) * speed,
          vy:       Math.sin(angle) * speed - 0.8,
          size:     2.5 + Math.random() * 3.5,
          type:     Math.random() < 0.55 ? 'star' : 'circle',
          color:    accents[Math.floor(Math.random() * accents.length)],
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.25,
        });
      }

      this._sparkles.set(key, { particles, startTime: performance.now(), col: newCol, row: newRow });
      // Glitzer inkrementell anhängen – kein teurer Vollrebuild auf jedem Tap
      if (this.puzzle.glitter && this._glitterBase !== null) {
        this._appendCellGlitter(newCol, newRow);
      }
      if (!this._sparkleFrame) this._animateSparkles();
    }
    this.draw();
  }

  _animateSparkles() {
    const now = performance.now();
    const ctx = this.canvas.getContext('2d');

    // Statischen Glitzer-Layer einmalig aufbauen
    if (this.puzzle.glitter && !this._glitterBase) this._buildGlitterBase();

    for (const [key, data] of this._sparkles) {
      if (now - data.startTime > SPARKLE_DURATION) this._sparkles.delete(key);
    }

    // Glitzer-Modus: Partikel auf allen bemalten Zellen spawnen
    if (this.puzzle.glitter) {
      if (now - this._lastGlitterSpawn >= 280) {
        this._lastGlitterSpawn = now;
        const painted = [];
        for (let row = 0; row < this._rows; row++) {
          for (let col = 0; col < this._cols; col++) {
            if (this.puzzle.pixels[row][col] > 0 && this.progress[row][col]) {
              painted.push({ col, row });
            }
          }
        }
        if (painted.length > 0) {
          const n = Math.min(8, Math.max(2, Math.floor(painted.length * 0.07)));
          for (let i = 0; i < n; i++) {
            const { col, row } = painted[Math.floor(Math.random() * painted.length)];
            this._spawnGlitterOnCell(col, row);
          }
        }
      }
    }

    if (this._sparkles.size === 0) {
      if (this.puzzle.glitter) {
        // Loop offen halten bis nächste Spawn-Runde
        this._sparkleFrame = requestAnimationFrame(() => this._animateSparkles());
        return;
      }
      this._sparkleFrame = null;
      this.draw();
      return;
    }

    this.draw(); // Basis
    ctx.save();
    ctx.scale(this._dpr, this._dpr);

    // ── Statischer Grundglitzer: pulsierende Sterne ohne Bewegung ──
    if (this.puzzle.glitter && this._glitterBase && this._glitterBase.length > 0) {
      const t = now / 1000;
      for (const s of this._glitterBase) {
        const alpha = 0.05 + 0.9 * (0.5 + 0.5 * Math.sin(t * s.period + s.phase));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.color;
        this._drawStar4(ctx, s.x, s.y, s.size);
      }
      ctx.globalAlpha = 1;
    }

    // ── Aufblinkende Punkte ──
    if (this.puzzle.glitter && this._glitterDots && this._glitterDots.length > 0) {
      const t = now / 1000;
      for (const d of this._glitterDots) {
        ctx.fillStyle = d.color || '#ffffff';
        const v = 0.5 + 0.5 * Math.sin(t * d.period * Math.PI * 2 + d.phase);
        const alpha = v * v; // quadratisch: kurze helle Blitze, lange dunkel
        if (alpha < 0.04) continue; // unsichtbare überspringen
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff'; // zurücksetzen
    }

    // ── Bewegte Random-Partikel ──
    for (const [, data] of this._sparkles) {
      const t     = (now - data.startTime) / SPARKLE_DURATION;
      const alpha = Math.pow(1 - t, 1.4);

      for (const p of data.particles) {
        const elapsed = t * SPARKLE_DURATION / 1000;
        const px  = p.x  + p.vx  * elapsed * 60;
        const py  = p.y  + p.vy  * elapsed * 60 + 0.5 * 4 * elapsed * elapsed * 60;
        const rot = p.rotation + p.rotSpeed * elapsed * 60;
        const sz  = p.size * (1 - t * 0.4); // leicht schrumpfen

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(px, py);
        ctx.rotate(rot);
        ctx.fillStyle = p.color;

        if (p.type === 'star') {
          const r1 = sz, r2 = sz * 0.38;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4;
            const r = i % 2 === 0 ? r1 : r2;
            i === 0 ? ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r)
                    : ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, sz, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    ctx.restore();
    this._sparkleFrame = requestAnimationFrame(() => this._animateSparkles());
  }

  /** Statische Sternpositionen für den Grundglitzer aufbauen – einmalig pro Puzzle */
  _buildGlitterBase() {
    const painted = [];
    for (let row = 0; row < this._rows; row++) {
      for (let col = 0; col < this._cols; col++) {
        if (this.puzzle.pixels[row][col] > 0 && this.progress[row][col]) {
          painted.push({ col, row });
        }
      }
    }

    // Adaptives Limit: Ziel max. ~800 Sterne + ~1600 Punkte unabhängig von Grid-Größe
    const n = Math.max(1, painted.length);
    const starsPerCell = Math.min(9, Math.max(2, Math.ceil(800 / n)));
    const dotsPerCell  = Math.min(16, Math.max(3, Math.ceil(1600 / n)));

    const stars = [];
    const dots  = [];
    for (const { col, row } of painted) {
      const colorHex = this._colorHexById.get(this.puzzle.pixels[row][col]);
      this._pushCellGlitter(col, row, starsPerCell, dotsPerCell, stars, dots, colorHex);
    }
    this._glitterBase = stars;
    this._glitterDots = dots;
  }

  /** Neue Zelle inkrementell zum bestehenden Glitzer-Layer anhängen */
  _appendCellGlitter(col, row) {
    const colorHex = this._colorHexById.get(this.puzzle.pixels[row][col]);
    this._pushCellGlitter(col, row, 7, 14, this._glitterBase, this._glitterDots, colorHex);
  }

  _pushCellGlitter(col, row, starsPerCell, dotsPerCell, stars, dots, colorHex) {
    const cx = col * CELL_SIZE + CELL_SIZE / 2;
    const cy = row * CELL_SIZE + CELL_SIZE / 2;

    // Luminanz der Kachelfarbe bestimmen → Kontrastfarben für helle Kacheln
    let lum = 0;
    if (colorHex) {
      const h = colorHex.replace('#', '');
      lum = 0.2126 * parseInt(h.substring(0,2),16)/255
          + 0.7152 * parseInt(h.substring(2,4),16)/255
          + 0.0722 * parseInt(h.substring(4,6),16)/255;
    }
    const isLight = lum > 0.5;
    const starColors = isLight
      ? ['#7a5200', '#1a1a6e', '#4a0080', '#005a3a', '#7a2000']  // dunkle Kontraste
      : ['#ffffff', '#ffe066', '#c8f0ff', '#ffccee'];              // hell/weiß
    const dotColor = isLight ? '#4a3300' : '#ffffff';

    for (let i = 0; i < starsPerCell; i++) {
      const big = i < 2 && Math.random() > 0.6;
      stars.push({
        x:      cx + (Math.random() - 0.5) * CELL_SIZE * 0.95,
        y:      cy + (Math.random() - 0.5) * CELL_SIZE * 0.95,
        phase:  Math.random() * Math.PI * 2,
        period: 0.4 + Math.random() * 1.4,
        size:   big ? (2.5 + Math.random() * 2.5) : (0.3 + Math.random() * 0.9),
        color:  starColors[Math.floor(Math.random() * starColors.length)],
      });
    }
    for (let i = 0; i < dotsPerCell; i++) {
      dots.push({
        x:      cx + (Math.random() - 0.5) * CELL_SIZE * 0.95,
        y:      cy + (Math.random() - 0.5) * CELL_SIZE * 0.95,
        phase:  Math.random() * Math.PI * 2,
        period: 0.2 + Math.random() * 0.6,
        size:   0.4 + Math.random() * 1.0,
        color:  dotColor,
      });
    }
  }

  /** Vierzäckiger Stern */
  _drawStar4(ctx, x, y, r) {
    const r2 = r * 0.22;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a  = (i * Math.PI) / 4;
      const ri = i % 2 === 0 ? r : r2;
      i === 0
        ? ctx.moveTo(x + Math.cos(a) * ri, y + Math.sin(a) * ri)
        : ctx.lineTo(x + Math.cos(a) * ri, y + Math.sin(a) * ri);
    }
    ctx.closePath();
    ctx.fill();
  }

  _spawnGlitterOnCell(col, row) {
    const key      = `gli_${col},${row}`;
    const cx       = col * CELL_SIZE + CELL_SIZE / 2;
    const cy       = row * CELL_SIZE + CELL_SIZE / 2;
    const colorHex = this._colorHexById.get(this.puzzle.pixels[row][col]) ?? '#ffffff';
    const h = colorHex.replace('#', '');
    const lum = 0.2126 * parseInt(h.substring(0,2),16)/255
              + 0.7152 * parseInt(h.substring(2,4),16)/255
              + 0.0722 * parseInt(h.substring(4,6),16)/255;
    const accents = lum > 0.5
      ? ['#7a5200', '#1a1a6e', '#4a0080', colorHex, '#005a3a']
      : ['#ffffff', '#ffffff', colorHex, '#ffe066', '#ffccee', '#aaffff'];
    const particles = [];
    const count = 2 + (Math.random() > 0.5 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const big   = Math.random() > 0.55;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.04 + Math.random() * 0.14;
      particles.push({
        x:        cx + (Math.random() - 0.5) * CELL_SIZE * 0.75,
        y:        cy + (Math.random() - 0.5) * CELL_SIZE * 0.75,
        vx:       Math.cos(angle) * speed,
        vy:       Math.sin(angle) * speed,
        size:     big ? (2.2 + Math.random() * 3.0) : (0.7 + Math.random() * 1.3),
        type:     'star',
        color:    accents[Math.floor(Math.random() * accents.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.07,
      });
    }
    this._sparkles.set(key, { particles, startTime: performance.now(), col, row });
  }

  destroy() {
    if (this._sparkleFrame) { cancelAnimationFrame(this._sparkleFrame); this._sparkleFrame = null; }
    this._sparkles.clear();
  }
}
