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
const gameProgress = document.getElementById('game-progress');
const galleryGrid  = document.getElementById('gallery-grid');
const galleryEmpty = document.getElementById('gallery-empty');
const btnImport    = document.getElementById('btn-import');
const importOverlay = document.getElementById('import-overlay');

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

// ── Navigation ─────────────────────────────────────────────────
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.view;
    navBtns.forEach(b => b.classList.toggle('active', b === btn));
    views.forEach(v  => v.classList.toggle('active', v.id === `view-${target}`));

    if (target === 'gallery') gallery.refresh();
  });
});

// ── Puzzle-Liste laden ─────────────────────────────────────────
async function initPuzzleList() {
  const puzzles = await store.fetchPuzzles();
  puzzleList.innerHTML = '';

  for (const puzzle of puzzles) {
    const progress   = store.loadProgress(puzzle);
    const pct        = store.calcPercent(puzzle, progress);
    const done       = store.isCompleted(puzzle.id);
    const isImported = puzzle.id.startsWith('imported_');

    const card = document.createElement('div');
    card.className = 'puzzle-card';
    card.tabIndex  = 0;

    const thumb = document.createElement('div');
    thumb.className = 'card-thumb';
    thumb.style.cssText = `background:${puzzle.palette[0]?.hex ?? '#333'};display:flex;align-items:center;justify-content:center;font-size:2rem;`;
    thumb.textContent = '🎨';

    const titleEl = document.createElement('div');
    titleEl.className   = 'card-title';
    titleEl.textContent = puzzle.title + (done ? ' ✅' : '');

    const progressEl = document.createElement('div');
    progressEl.className   = 'card-progress';
    progressEl.textContent = `${pct}% fertig`;

    card.appendChild(thumb);
    card.appendChild(titleEl);
    card.appendChild(progressEl);

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
      });
      card.appendChild(delBtn);
    }

    card.addEventListener('click',   () => startPuzzle(puzzle));
    card.addEventListener('keydown', e => e.key === 'Enter' && startPuzzle(puzzle));
    puzzleList.appendChild(card);
  }
}

// ── Puzzle starten ─────────────────────────────────────────────
async function startPuzzle(puzzle) {
  activePuzzle   = puzzle;
  activeProgress = store.loadProgress(puzzle);

  // Alten Zustand aufräumen
  if (interaction) { interaction.destroy(); interaction = null; }
  colorBarEl.innerHTML = '';

  // Game-View ZUERST zeigen, damit wrapper.clientWidth verfügbar ist
  gameTitle.textContent = puzzle.title;
  puzzleSelect.classList.add('hidden');
  puzzleGame.classList.remove('hidden');

  // Renderer (setzt Canvas-Größe)
  renderer = new Renderer(canvas, puzzle, activeProgress);

  // Viewport (braucht sichtbaren Wrapper + Canvas-Größe)
  viewport = new Viewport(canvasWrapper, canvas);

  // Interaktion
  interaction = new Interaction(canvas, canvasWrapper, renderer, viewport, (col, row) => {
    onCellTap(col, row);
  });

  // Farbleiste
  colorBar = new ColorBar(colorBarEl, puzzle.palette, (colorId) => {
    renderer.setSelectedColor(colorId);
    checkCompletedColors();
  });
  colorBar.render();

  updateProgressDisplay();
  renderer.draw();
}

// ── Zelle antippen ────────────────────────────────────────────
function onCellTap(col, row) {
  if (!colorBar || colorBar.selectedId === null) return;

  const colorId = colorBar.selectedId;
  const expected = activePuzzle.pixels[row][col];

  // Nur färben wenn die richtige Farbe gewählt ist
  if (expected !== colorId) return;
  // Schon gefärbt? Nichts tun
  if (activeProgress[row][col]) return;

  activeProgress[row][col] = true;
  store.saveProgress(activePuzzle.id, activeProgress);
  renderer.updateProgress(activeProgress);
  updateProgressDisplay();
  checkCompletedColors();
  checkFinished();
}

// ── Fortschrittsanzeige ───────────────────────────────────────
function updateProgressDisplay() {
  const pct = store.calcPercent(activePuzzle, activeProgress);
  gameProgress.textContent = `${pct}%`;
}

// ── Farbe vollständig? ────────────────────────────────────────
function checkCompletedColors() {
  if (!activePuzzle || !colorBar) return;

  for (const color of activePuzzle.palette) {
    const allDone = activePuzzle.pixels.every((rowArr, r) =>
      rowArr.every((cId, c) => cId !== color.id || activeProgress[r][c])
    );
    if (allDone) colorBar.markColorDone(color.id);
  }
}

// ── Puzzle fertig? ────────────────────────────────────────────
async function checkFinished() {
  const pct = store.calcPercent(activePuzzle, activeProgress);
  if (pct < 100) return;

  store.markCompleted(activePuzzle.id);

  // Bild speichern
  try {
    await saveCanvasAsImage(canvas, activePuzzle.id);
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
}

// ── Zurück-Button ─────────────────────────────────────────────
btnBack.addEventListener('click', () => {
  if (interaction) { interaction.destroy(); interaction = null; }
  puzzleGame.classList.add('hidden');
  puzzleSelect.classList.remove('hidden');
  initPuzzleList(); // Fortschritt aktualisieren
});

// ── Start ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initPuzzleList();
  gallery.refresh();
});
