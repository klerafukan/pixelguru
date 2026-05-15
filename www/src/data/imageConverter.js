/**
 * imageConverter.js
 * Konvertiert ein beliebiges Bild in ein PixelGuru-Puzzle.
 *
 * Ablauf:
 *  1. Bild auf Rastergröße herunterskalieren (Seitenverhältnis erhalten)
 *  2. Farb-Quantisierung per k-means++ (k = Anzahl gewünschter Farben)
 *  3. Jeden Pixel der nächsten Palettenfarbe zuordnen → Farb-ID-Grid
 */

export const GRID_SIZES = [
  { id: 'tiny',   label: 'Winzig', maxDim: 12 },
  { id: 'small',  label: 'Klein',  maxDim: 20 },
  { id: 'medium', label: 'Mittel', maxDim: 32 },
  { id: 'large',  label: 'Groß',   maxDim: 48 },
  { id: 'xlarge', label: 'Riesig', maxDim: 64 },
  { id: 'xxl',    label: 'XL',     maxDim: 80 },
];

export const COLOR_COUNTS = [
  { id: 'few',    label: 'Wenige',  count: 5  },
  { id: 'some',   label: 'Einige',  count: 8  },
  { id: 'medium', label: 'Mittel',  count: 12 },
  { id: 'many',   label: 'Viele',   count: 16 },
  { id: 'lots',   label: 'Mehr',    count: 24 },
  { id: 'max',    label: 'Maximum', count: 32 },
];

// ------------------------------------------------------------------
// Öffentliche API
// ------------------------------------------------------------------

/**
 * Wandelt ein Bild in ein Puzzle-Objekt um.
 * @param {HTMLImageElement} img
 * @param {number} maxDim     – max. Zellen auf der längsten Seite (16 / 24 / 32)
 * @param {number} colorCount – Anzahl Farben (5 / 8 / 10)
 * @param {string} title
 * @returns {object}  Puzzle-Objekt (kompatibel mit puzzleStore)
 */
export function convertImage(src, maxDim, colorCount, title) {
  const srcW = src.naturalWidth  ?? src.width;
  const srcH = src.naturalHeight ?? src.height;
  const { cols, rows } = calcGridSize(srcW, srcH, maxDim);

  // Auf Rastergröße herunterskalieren
  const offscreen = document.createElement('canvas');
  offscreen.width  = cols;
  offscreen.height = rows;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, cols, rows);
  const imageData = ctx.getImageData(0, 0, cols, rows);

  // Opake Pixel für Quantisierung sammeln
  const opaqueRGB = [];
  for (let i = 0; i < imageData.data.length; i += 4) {
    if (imageData.data[i + 3] > 127) {
      opaqueRGB.push([imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]]);
    }
  }

  const effectiveK = Math.min(colorCount, Math.max(1, opaqueRGB.length));
  const palette    = kMeansQuantize(opaqueRGB, effectiveK);
  // Für die Pixel-Zuordnung brauchen wir RGB-Arrays, nicht Hex-Strings
  const paletteRGB = palette.map(hexToRgb);

  // Pixel-Grid aufbauen (Farb-ID 1-basiert, 0 = transparent)
  const pixels = [];
  for (let row = 0; row < rows; row++) {
    const rowArr = [];
    for (let col = 0; col < cols; col++) {
      const i = (row * cols + col) * 4;
      if (imageData.data[i + 3] <= 127) {
        rowArr.push(0);
      } else {
        const rgb  = [imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]];
        rowArr.push(nearestIdx(rgb, paletteRGB) + 1);
      }
    }
    pixels.push(rowArr);
  }

  // Leere Cluster aus k-means entfernen (ghost colors in Farbpalette)
  const usedIds = new Set();
  for (const row of pixels) for (const id of row) if (id > 0) usedIds.add(id);
  const remap = new Map();
  let nextId  = 1;
  const paletteCompact = [];
  for (let i = 0; i < palette.length; i++) {
    if (usedIds.has(i + 1)) {
      remap.set(i + 1, nextId++);
      paletteCompact.push(palette[i]);
    }
  }
  for (const row of pixels) {
    for (let c = 0; c < row.length; c++) {
      if (row[c] > 0) row[c] = remap.get(row[c]);
    }
  }

  return {
    id:        `imported_${Date.now()}`,
    title:     title || 'Mein Bild',
    gridSize:  [cols, rows],
    palette:   paletteCompact.map((hex, i) => ({ id: i + 1, hex, label: String(i + 1) })),
    pixels,
    previewUrl: null,
  };
}

/**
 * Zeichnet eine skalierte Puzzle-Vorschau auf ein Canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {object} puzzle
 * @param {number} [cellSize=6]   – gewünschte Zellgröße in CSS-px
 * @param {number} [maxW=130]     – max. Breite des Canvas in CSS-px
 * @param {number} [maxH=130]     – max. Höhe des Canvas in CSS-px
 */
export function renderPreview(canvas, puzzle, cellSize = 6, maxW = 130, maxH = 130) {
  const [cols, rows] = puzzle.gridSize;
  const dpr = window.devicePixelRatio || 1;

  // Effektive Zellgröße so wählen, dass das Bild in maxW × maxH passt
  const fitCell = Math.max(1, Math.floor(Math.min(maxW / cols, maxH / rows)));
  const cs = Math.min(cellSize, fitCell);

  const cssW = cols * cs;
  const cssH = rows * cs;
  canvas.width        = cssW * dpr;
  canvas.height       = cssH * dpr;
  canvas.style.width  = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const colorId = puzzle.pixels[row][col];
      if (colorId === 0) {
        ctx.fillStyle = '#1e1e3a';
      } else {
        const color = puzzle.palette.find(p => p.id === colorId);
        ctx.fillStyle = color ? color.hex : '#333';
      }
      ctx.fillRect(col * cs, row * cs, cs, cs);
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------
// Interne Hilfsfunktionen
// ------------------------------------------------------------------

export function calcGridSize(imgW, imgH, maxDim) {
  if (imgW >= imgH) {
    return { cols: maxDim, rows: Math.max(1, Math.round(maxDim * imgH / imgW)) };
  }
  return { cols: Math.max(1, Math.round(maxDim * imgW / imgH)), rows: maxDim };
}

// --- k-means Farb-Quantisierung ---

function kMeansQuantize(rgbPixels, k) {
  if (rgbPixels.length === 0) return Array.from({ length: k }, () => '#808080');

  // Größeres Sample für bessere Startpunkte
  const sample    = subsample(rgbPixels, 1500);
  let centroids   = kMeansPlusPlus(sample, k);

  for (let iter = 0; iter < 50; iter++) {
    const sums   = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Array(k).fill(0);

    for (const px of rgbPixels) {
      const i = nearestIdx(px, centroids);
      sums[i][0] += px[0];
      sums[i][1] += px[1];
      sums[i][2] += px[2];
      counts[i]++;
    }

    let moved = false;
    for (let i = 0; i < k; i++) {
      if (counts[i] === 0) continue;
      const nr = Math.round(sums[i][0] / counts[i]);
      const ng = Math.round(sums[i][1] / counts[i]);
      const nb = Math.round(sums[i][2] / counts[i]);
      if (nr !== centroids[i][0] || ng !== centroids[i][1] || nb !== centroids[i][2]) {
        centroids[i] = [nr, ng, nb];
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Sättigungs-Boost + Kontrast-Optimierung
  const boosted   = centroids.map(c => boostSaturation(c, 1.5));
  const contrasted = enforceContrast(boosted, 28);
  return contrasted.map(rgbToHex);
}

/** k-means++ Initialisierung für bessere Startzentroiden */
function kMeansPlusPlus(pixels, k) {
  const centroids = [pixels[Math.floor(Math.random() * pixels.length)]];

  for (let c = 1; c < k; c++) {
    const dists = pixels.map(px =>
      Math.min(...centroids.map(ct => colorDistSq(px, ct)))
    );
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let chosen = pixels[pixels.length - 1];
    for (let i = 0; i < pixels.length; i++) {
      r -= dists[i];
      if (r <= 0) { chosen = pixels[i]; break; }
    }
    centroids.push(chosen);
  }
  return centroids.map(c => [...c]);
}

function nearestIdx(rgb, centroids) {
  let minD = Infinity, minI = 0;
  for (let i = 0; i < centroids.length; i++) {
    const d = colorDistPerceptual(rgb, centroids[i]);
    if (d < minD) { minD = d; minI = i; }
  }
  return minI;
}

/**
 * Perceptuell gewichtete Farbdistanz (Approximation nach Compuphase).
 * Grün hat mehr Gewicht als Rot, Blau am wenigsten.
 */
function colorDistPerceptual(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  const rm = (a[0] + b[0]) / 2;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

function colorDistSq(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/**
 * Sättigung einer RGB-Farbe erhöhen (Faktor > 1 = satter).
 * Arbeitet im HSL-Raum.
 */
function boostSaturation([r, g, b], factor) {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  if (max === min) return [r, g, b]; // grau – nichts zu boosten

  let s = max - min;
  s = l > 0.5 ? s / (2 - max - min) : s / (max + min);
  let h;
  if (max === rf)      h = (gf - bf) / (max - min) + (gf < bf ? 6 : 0);
  else if (max === gf) h = (bf - rf) / (max - min) + 2;
  else                 h = (rf - gf) / (max - min) + 4;
  h /= 6;

  const sNew = Math.min(1, s * factor);

  const q = l < 0.5 ? l * (1 + sNew) : l + sNew - l * sNew;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h)       * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}

function subsample(arr, max) {
  if (arr.length <= max) return arr;
  const step = Math.floor(arr.length / max);
  return arr.filter((_, i) => i % step === 0);
}

/**
 * Stellt sicher, dass alle Palettenfarben einen Mindestabstand (deltaE)
 * zueinander haben. Zu ähnliche Farben werden im HSL-Raum auseinandergedrängt.
 */
function enforceContrast(palette, minDeltaE = 28) {
  const result = palette.map(c => [...c]);
  const iters  = 6;

  for (let iter = 0; iter < iters; iter++) {
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const de = deltaE(result[i], result[j]);
        if (de < minDeltaE) {
          // Hues auseinanderschieben
          const [hi, si, li] = rgbToHsl(result[i]);
          const [hj, sj, lj] = rgbToHsl(result[j]);
          const hueDiff = ((hj - hi + 540) % 360) - 180;
          const push = (minDeltaE - de) / minDeltaE * 15;

          result[i] = hslToRgb((hi - Math.sign(hueDiff) * push + 360) % 360, Math.min(1, si * 1.1), Math.max(0.1, Math.min(0.85, li)));
          result[j] = hslToRgb((hj + Math.sign(hueDiff) * push + 360) % 360, Math.min(1, sj * 1.1), Math.max(0.1, Math.min(0.85, lj)));
        }
      }
    }
  }
  return result;
}

/** Einfaches Delta-E (CIE76-Näherung im RGB-Raum, reicht für Kontrastzwecke) */
function deltaE([r1, g1, b1], [r2, g2, b2]) {
  return Math.sqrt(
    2 * (r1 - r2) ** 2 +
    4 * (g1 - g2) ** 2 +
    3 * (b1 - b2) ** 2
  ) / 3;
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r)      h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else                h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h, s, l) {
  h /= 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h)       * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

function rgbToHex([r, g, b]) {
  return '#' + [r, g, b]
    .map(v => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0'))
    .join('');
}

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
