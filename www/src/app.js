/**
 * app.js – Haupt-Controller von PixelGuru
 *
 * Koordiniert Navigation, Puzzle-Auswahl, Spiel-Loop und Galerie.
 */

import { PuzzleStore }       from './data/puzzleStore.js';
import { Renderer }          from './canvas/renderer.js';
import { Interaction }       from './canvas/interaction.js';
import { Viewport }          from './canvas/viewport.js';
import { ColorBar }          from './ui/colorbar.js';
import { Gallery }           from './ui/gallery.js';
import { saveCanvasAsImage } from './data/storage.js';
import { ConverterDialog }   from './ui/converterDialog.js';
import { checkForUpdate }    from './ui/updateBanner.js';

const APP_VERSION = '1.0.0';

// ── DOM-Referenzen ──────────────────────────────────────────────
const navBtns      = document.querySelectorAll('.nav-btn');
const views        = document.querySelectorAll('.view');
const puzzleSelect = document.getElementById('puzzle-select');
const puzzleGame   = document.getElementById('puzzle-game');
const puzzleList   = document.getElementById('puzzle-list');
const canvas        = document.getElementById('pixel-canvas');
const canvasWrapper = document.getElementById('canvas-wrapper');
const colorBarEl   = document.getElementById('color-bar');
const btnBack      = document.getElementById('btn-back');
const gameTitle    = document.getElementById('game-title');
const gameProgress    = document.getElementById('game-progress-num');
const galleryGrid  = document.getElementById('gallery-grid');
const galleryEmpty = document.getElementById('gallery-empty');
const btnImport    = document.getElementById('btn-import');
const importOverlay = document.getElementById('import-overlay');
const puzzleListBuiltin  = document.getElementById('puzzle-list-builtin');
const puzzleListImported = document.getElementById('puzzle-list-imported');
const importedEmpty      = document.getElementById('imported-empty');

// ── App-State ──────────────────────────────────────────────────
const store       = new PuzzleStore();
const gallery     = new Gallery(galleryGrid, galleryEmpty);
const converter   = new ConverterDialog(importOverlay, onPuzzleImported);

let renderer     = null;
let interaction  = null;
let viewport     = null;
let colorBar     = null;
let activePuzzle   = null;
let activeProgress = null;
// Memoisation: welche Farb-IDs sind bereits komplett abgehakt
let _colorsDone  = new Set();

// ── Navigation ─────────────────────────────────────────────────
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.view;
    navBtns.forEach(b => b.classList.toggle('active', b === btn));
    views.forEach(v  => v.classList.toggle('active', v.id === `view-${target}`));

    if (target === 'gallery') gallery.refresh();
  });
});

// ── Pixel-Vorschau rendern ────────────────────────────────────
function renderPuzzleThumb(puzzle, canvasEl, progress) {
  const [cols, rows] = puzzle.gridSize;
  canvasEl.width  = cols;
  canvasEl.height = rows;
  const ctx = canvasEl.getContext('2d');

  const colorMap = new Map();
  const grayMap  = new Map();
  puzzle.palette.forEach(color => {
    colorMap.set(color.id, color.hex);
    const hex = color.hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const v = Math.round(70 + lum * 150);
    const hx = v.toString(16).padStart(2, '0');
    grayMap.set(color.id, `#${hx}${hx}${hx}`);
  });

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cId    = puzzle.pixels[row][col];
      const filled = progress?.[row]?.[col];
      ctx.fillStyle = cId > 0
        ? (filled ? (colorMap.get(cId) ?? '#ccc') : (grayMap.get(cId) ?? '#ccc'))
        : '#ffffff';
      ctx.fillRect(col, row, 1, 1);
    }
  }
}

// ── Sub-Tab-Switching ──────────────────────────────────────────
document.querySelectorAll('.image-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.image-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.tab-panel').forEach(p =>
      p.classList.toggle('hidden', p.id !== `tab-panel-${tab.dataset.tab}`)
    );
  });
});

// ── Puzzle-Liste laden ─────────────────────────────────────────
async function initPuzzleList() {
  const puzzles = await store.fetchPuzzles();
  puzzleListBuiltin.innerHTML  = '';
  puzzleListImported.innerHTML = '';

  const builtinPuzzles  = puzzles.filter(p => !p.id.startsWith('imported_'));
  const importedPuzzles = puzzles.filter(p =>  p.id.startsWith('imported_'));

  importedEmpty.style.display = importedPuzzles.length === 0 ? 'block' : 'none';

  for (const puzzle of builtinPuzzles) {
    puzzleListBuiltin.appendChild(buildPuzzleCard(puzzle));
  }
  for (const puzzle of importedPuzzles) {
    puzzleListImported.appendChild(buildPuzzleCard(puzzle));
  }
}

function buildPuzzleCard(puzzle) {
  const progress   = store.loadProgress(puzzle);
  const pct        = store.calcPercent(puzzle);
  const done       = store.isCompleted(puzzle.id);
  const isImported = puzzle.id.startsWith('imported_');

  const card = document.createElement('div');
  card.className = 'puzzle-card';
  card.tabIndex  = 0;

  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'card-thumb';
  const thumbCanvas = document.createElement('canvas');
  renderPuzzleThumb(puzzle, thumbCanvas, progress);
  thumbWrap.appendChild(thumbCanvas);

  const titleEl = document.createElement('div');
  titleEl.className   = 'card-title';
  titleEl.textContent = puzzle.title + (done ? ' ✅' : '');

  const progressEl = document.createElement('div');
  progressEl.className   = 'card-progress';
  progressEl.textContent = `${pct}% fertig`;

  card.appendChild(thumbWrap);
  card.appendChild(titleEl);
  card.appendChild(progressEl);

  // Reset-Button (für alle Puzzles mit Fortschritt)
  if (pct > 0 || done) {
    const resetBtn = document.createElement('button');
    resetBtn.className = 'card-reset';
    resetBtn.title     = 'Fortschritt zurücksetzen';
    resetBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>';
    resetBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`Fortschritt von „${puzzle.title}" wirklich zurücksetzen?`)) return;
      store.resetProgress(puzzle);
      initPuzzleList();
    });
    card.appendChild(resetBtn);
  }

  // Löschen-Button nur für importierte Puzzles
  if (isImported) {
    const delBtn = document.createElement('button');
    delBtn.className   = 'card-delete';
    delBtn.textContent = '✕';
    delBtn.title       = 'Löschen';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`„${puzzle.title}" und den gesamten Fortschritt löschen?`)) return;
      store.deleteImportedPuzzle(puzzle.id);
      card.remove();
      const remaining = puzzleListImported.querySelectorAll('.puzzle-card');
      if (remaining.length === 0) importedEmpty.style.display = 'block';
    });
    card.appendChild(delBtn);
  }

  // Glitzer-Toggle (für alle Puzzles)
  const glitterBtn = document.createElement('button');
  glitterBtn.className = 'card-glitter';
  glitterBtn.title     = 'Dauerglitzer umschalten';
  glitterBtn.textContent = '✨';
  glitterBtn.classList.toggle('active', store.isGlitter(puzzle.id) || !!puzzle.glitter);
  glitterBtn.addEventListener('click', e => {
    e.stopPropagation();
    store.toggleGlitter(puzzle.id);
    glitterBtn.classList.toggle('active', store.isGlitter(puzzle.id));
  });
  card.appendChild(glitterBtn);

  card.addEventListener('click',   () => startPuzzle(puzzle));
  card.addEventListener('keydown', e => e.key === 'Enter' && startPuzzle(puzzle));
  return card;
}

// ── Puzzle starten ─────────────────────────────────────────────
async function startPuzzle(puzzle) {
  activePuzzle   = { ...puzzle, glitter: store.isGlitter(puzzle.id) || !!puzzle.glitter };
  activeProgress = store.loadProgress(puzzle);
  _colorsDone    = new Set(); // Reset bei neuem Puzzle

  // Alten Zustand aufräumen
  if (interaction) { interaction.destroy(); interaction = null; }
  if (renderer)    { renderer.destroy();    renderer    = null; }
  colorBarEl.innerHTML = '';

  // Game-View ZUERST zeigen, damit wrapper.clientWidth verfügbar ist
  document.getElementById('bottom-nav').classList.add('hidden');
  gameTitle.textContent = puzzle.title;
  puzzleSelect.classList.add('hidden');
  puzzleGame.classList.remove('hidden');

  // Renderer (setzt Canvas-Größe)
  renderer = new Renderer(canvas, activePuzzle, activeProgress);

  // Viewport (braucht sichtbaren Wrapper + Canvas-Größe)
  viewport = new Viewport(canvasWrapper, canvas);

  // Interaktion
  interaction = new Interaction(canvas, canvasWrapper, renderer, viewport, (col, row) => {
    onCellTap(col, row);
  });

  // Initiales Scale an Renderer weitergeben (Zahlen ab Mindest-Zoomstufe)
  renderer.setViewScale(viewport.scale);

  // Farbleiste
  colorBar = new ColorBar(colorBarEl, puzzle.palette, (colorId) => {
    renderer.setSelectedColor(colorId);
    checkCompletedColors();
  });
  colorBar.render();
  checkCompletedColors(null); // Bereits abgeschlossene Farben sofort sperren

  updateProgressDisplay();
  renderer.draw();
}

// ── Zelle antippen ────────────────────────────────────────────
function onCellTap(col, row) {
  if (!colorBar || colorBar.selectedId === null) return;

  const colorId = colorBar.selectedId;
  const expected = activePuzzle.pixels[row][col];

  if (expected !== colorId) return;
  if (activeProgress[row][col]) return;

  activeProgress[row][col] = true;
  store.incrementDone(activePuzzle.id);           // O(1) Counter
  store.saveProgress(activePuzzle.id, activeProgress); // debounced
  renderer.updateProgress(activeProgress, col, row);
  updateProgressDisplay();
  checkCompletedColors(colorId); // nur gerade gemalte Farbe prüfen
  checkFinished();
}

// ── Fortschrittsanzeige ───────────────────────────────────────
function updateProgressDisplay() {
  const pct = store.calcPercent(activePuzzle); // O(1)
  gameProgress.textContent = pct;
}

/**
 * checkCompletedColors: prüft ob eine bestimmte Farbe komplett gemalt ist.
 * @param {number|null} changedColorId  – null = alle prüfen (beim Start)
 */
function checkCompletedColors(changedColorId) {
  if (!activePuzzle || !colorBar) return;

  const toCheck = changedColorId === null
    ? activePuzzle.palette                         // Startprüfung: alle
    : activePuzzle.palette.filter(c => c.id === changedColorId); // nur eine

  for (const color of toCheck) {
    if (_colorsDone.has(color.id)) continue;       // bereits bekannt
    const allDone = activePuzzle.pixels.every((rowArr, r) =>
      rowArr.every((cId, c) => cId !== color.id || activeProgress[r][c])
    );
    if (allDone) {
      _colorsDone.add(color.id);
      colorBar.markColorDone(color.id);
    }
  }
}

// ── Kompakten Gallery-Canvas rendern (max. 400px, kein DPR) ──
function buildGalleryCanvas(puzzle, progress) {
  const [cols, rows] = puzzle.gridSize;
  const cs = Math.max(1, Math.floor(Math.min(400 / cols, 400 / rows)));
  const can = document.createElement('canvas');
  can.width  = cols * cs;
  can.height = rows * cs;
  const ctx = can.getContext('2d');
  const colorMap = new Map(puzzle.palette.map(c => [c.id, c.hex]));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cId = puzzle.pixels[row][col];
      ctx.fillStyle = (cId > 0 && progress[row][col])
        ? (colorMap.get(cId) ?? '#888')
        : '#ffffff';
      ctx.fillRect(col * cs, row * cs, cs, cs);
    }
  }
  return can;
}

// ── Puzzle fertig? ────────────────────────────────────────────
async function checkFinished() {
  const pct = store.calcPercent(activePuzzle); // O(1)
  if (pct < 100) return;
  if (store.isCompleted(activePuzzle.id)) return; // kein Doppelspeichern

  store.markCompleted(activePuzzle.id);

  // Kompakten Gallery-Canvas speichern (nicht den riesigen DPR-Canvas)
  try {
    const galleryCanvas = buildGalleryCanvas(activePuzzle, activeProgress);
    await saveCanvasAsImage(galleryCanvas, activePuzzle.id);
  } catch (err) {
    console.warn('Bild konnte nicht gespeichert werden:', err);
  }

  setTimeout(() => {
    alert(`🎉 „${activePuzzle.title}" ist fertig! Bild wurde in der Galerie gespeichert.`);
  }, 200);
}

// ── Import-Button ─────────────────────────────────────────────
btnImport.addEventListener('click', () => converter.open());

function onPuzzleImported(puzzle) {
  store.saveImportedPuzzle(puzzle);
  initPuzzleList();
  // Nach Import direkt zum "Eigene"-Tab wechseln
  document.querySelectorAll('.image-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === 'imported')
  );
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('hidden', p.id !== 'tab-panel-imported')
  );
}

// ── Zurück-Button ─────────────────────────────────────────────
btnBack.addEventListener('click', () => {
  if (activePuzzle) store.flushProgress(activePuzzle.id); // debounced Save sofort schreiben
  if (interaction) { interaction.destroy(); interaction = null; }
  document.getElementById('bottom-nav').classList.remove('hidden');
  puzzleGame.classList.add('hidden');
  puzzleSelect.classList.remove('hidden');
  initPuzzleList(); // Fortschritt aktualisieren
});

// ── Start ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initPuzzleList();
  checkForUpdate(APP_VERSION);
});
