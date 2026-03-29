/**
 * puzzleStore.js
 * Verwaltet Puzzle-Daten und den lokalen Fortschritt.
 *
 * Datenformat eines Puzzles:
 * {
 *   id: string,
 *   title: string,
 *   gridSize: [cols, rows],
 *   palette: [{ id: number, hex: string, label: string }],
 *   pixels: number[][],   // 2D-Array, Wert = Farb-ID (0 = leer/transparent)
 *   previewUrl: string    // Vorschaubild-URL
 * }
 *
 * Fortschritt wird als boolean[][] gespeichert:
 *   progress[row][col] === true bedeutet: Zelle korrekt eingefärbt
 */

const STORAGE_KEY_PROGRESS  = 'pixelguru_progress';
const STORAGE_KEY_COMPLETED = 'pixelguru_completed';
const STORAGE_KEY_IMPORTED  = 'pixelguru_imported';

export class PuzzleStore {
  constructor() {
    /** @type {Map<string, boolean[][]>} puzzleId → progress-Matrix */
    this._progressCache = new Map();
    /** @type {Set<string>} IDs fertig gemalter Puzzles */
    this._completed = new Set(this._loadCompleted());
  }

  // ----------------------------------------------------------------
  // Puzzle-Quellen  (Phase 1: lokale Demo-Daten; Phase 3: API)
  // ----------------------------------------------------------------

  /** Gibt alle verfügbaren Puzzles zurück: importierte zuerst, dann Demo-Daten */
  async fetchPuzzles() {
    return [...this._loadImportedPuzzles(), ...DEMO_PUZZLES];
  }

  /** Einzelnes Puzzle anhand ID */
  async fetchPuzzle(id) {
    const all = await this.fetchPuzzles();
    return all.find(p => p.id === id) ?? null;
  }

  /** Importiertes Puzzle dauerhaft in localStorage speichern */
  saveImportedPuzzle(puzzle) {
    const list = this._loadImportedPuzzles();
    list.unshift(puzzle); // neueste zuerst
    try {
      localStorage.setItem(STORAGE_KEY_IMPORTED, JSON.stringify(list));
    } catch (e) {
      console.warn('Puzzle konnte nicht gespeichert werden (localStorage voll?):', e);
    }
  }

  /** Importiertes Puzzle + gespeicherten Fortschritt löschen */
  deleteImportedPuzzle(puzzleId) {
    const list = this._loadImportedPuzzles().filter(p => p.id !== puzzleId);
    localStorage.setItem(STORAGE_KEY_IMPORTED, JSON.stringify(list));
    localStorage.removeItem(`${STORAGE_KEY_PROGRESS}_${puzzleId}`);
    this._progressCache.delete(puzzleId);
    this._completed.delete(puzzleId);
  }

  _loadImportedPuzzles() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_IMPORTED) || '[]');
    } catch { return []; }
  }

  // ----------------------------------------------------------------
  // Fortschritt
  // ----------------------------------------------------------------

  /** Fortschritt für ein Puzzle laden (aus localStorage) */
  loadProgress(puzzle) {
    if (this._progressCache.has(puzzle.id)) {
      return this._progressCache.get(puzzle.id);
    }

    const raw = localStorage.getItem(`${STORAGE_KEY_PROGRESS}_${puzzle.id}`);
    let progress;

    if (raw) {
      try { progress = JSON.parse(raw); } catch { progress = null; }
    }

    if (!progress || progress.length !== puzzle.gridSize[1]) {
      // Leere Matrix anlegen
      progress = Array.from({ length: puzzle.gridSize[1] },
        () => new Array(puzzle.gridSize[0]).fill(false));
    }

    this._progressCache.set(puzzle.id, progress);
    return progress;
  }

  /** Fortschritt speichern */
  saveProgress(puzzleId, progress) {
    this._progressCache.set(puzzleId, progress);
    localStorage.setItem(`${STORAGE_KEY_PROGRESS}_${puzzleId}`, JSON.stringify(progress));
  }

  /** Fortschritt in Prozent (0–100) */
  calcPercent(puzzle, progress) {
    const total = puzzle.pixels.flat().filter(v => v > 0).length;
    if (total === 0) return 0;
    const done = progress.flat().filter(Boolean).length;
    return Math.round((done / total) * 100);
  }

  isCompleted(puzzleId) {
    return this._completed.has(puzzleId);
  }

  markCompleted(puzzleId) {
    this._completed.add(puzzleId);
    localStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify([...this._completed]));
  }

  // ----------------------------------------------------------------
  // Intern
  // ----------------------------------------------------------------

  _loadCompleted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_COMPLETED);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
}

// ================================================================
// Demo-Daten (werden in Phase 3 durch API ersetzt)
// ================================================================
const DEMO_PUZZLES = [
  {
    id: 'demo-sun',
    title: 'Sonne',
    previewUrl: null,
    gridSize: [16, 16],
    palette: [
      { id: 1, hex: '#FFD700', label: 'Gelb' },
      { id: 2, hex: '#FF8C00', label: 'Orange' },
      { id: 3, hex: '#87CEEB', label: 'Himmelblau' },
    ],
    pixels: (() => {
      // 16×16 Sonne: 3 = Himmel, 1 = Sonne, 2 = Strahlen
      const S = 3, Y = 1, O = 2;
      return [
        [S,S,S,S,S,S,O,S,O,S,S,S,S,S,S,S],
        [S,S,S,S,S,S,S,O,S,S,S,S,S,S,S,S],
        [S,S,S,S,S,O,S,S,S,O,S,S,S,S,S,S],
        [S,S,S,S,S,S,Y,Y,Y,S,S,S,S,S,S,S],
        [S,S,S,O,S,Y,Y,Y,Y,Y,S,O,S,S,S,S],
        [S,S,S,S,Y,Y,Y,Y,Y,Y,Y,S,S,S,S,S],
        [O,S,S,Y,Y,Y,Y,Y,Y,Y,Y,Y,S,S,O,S],
        [S,O,S,Y,Y,Y,Y,Y,Y,Y,Y,Y,S,O,S,S],
        [S,S,S,Y,Y,Y,Y,Y,Y,Y,Y,Y,S,S,S,S],
        [O,S,S,S,Y,Y,Y,Y,Y,Y,Y,S,S,S,O,S],
        [S,S,S,O,S,Y,Y,Y,Y,Y,S,O,S,S,S,S],
        [S,S,S,S,S,S,Y,Y,Y,S,S,S,S,S,S,S],
        [S,S,S,S,S,O,S,S,S,O,S,S,S,S,S,S],
        [S,S,S,S,S,S,S,O,S,S,S,S,S,S,S,S],
        [S,S,S,S,S,S,O,S,O,S,S,S,S,S,S,S],
        [S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S],
      ];
    })(),
  },
  {
    id: 'demo-heart',
    title: 'Herz',
    previewUrl: null,
    gridSize: [14, 12],
    palette: [
      { id: 1, hex: '#e94560', label: 'Rot' },
      { id: 2, hex: '#ff8fab', label: 'Rosa' },
      { id: 3, hex: '#1a1a2e', label: 'Dunkel' },
    ],
    pixels: (() => {
      const D=3,R=1,P=2;
      return [
        [D,D,R,R,D,D,D,D,D,D,R,R,D,D],
        [D,R,R,R,R,D,D,D,D,R,R,R,R,D],
        [R,R,P,R,R,R,D,D,R,R,R,P,R,R],
        [R,R,R,R,R,R,R,R,R,R,R,R,R,R],
        [R,R,R,R,R,R,R,R,R,R,R,R,R,R],
        [D,R,R,R,R,R,R,R,R,R,R,R,R,D],
        [D,D,R,R,R,R,R,R,R,R,R,R,D,D],
        [D,D,D,R,R,R,R,R,R,R,R,D,D,D],
        [D,D,D,D,R,R,R,R,R,R,D,D,D,D],
        [D,D,D,D,D,R,R,R,R,D,D,D,D,D],
        [D,D,D,D,D,D,R,R,D,D,D,D,D,D],
        [D,D,D,D,D,D,D,D,D,D,D,D,D,D],
      ];
    })(),
  },
];
