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
const STORAGE_KEY_GLITTER   = 'pixelguru_glitter';

export class PuzzleStore {
  constructor() {
    /** @type {Map<string, boolean[][]>} puzzleId → progress-Matrix */
    this._progressCache = new Map();
    /** @type {Set<string>} IDs fertig gemalter Puzzles */
    this._completed = new Set(this._loadCompleted());
    /** Debounce-Timer für localStorage-Schreibzugriff */
    this._saveTimer = null;
    /** Gecachter Total-Count (opake Pixel) pro puzzleId */
    this._totalCache = new Map();
    /** Gecachter Filled-Count pro puzzleId */
    this._doneCache  = new Map();
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
    if (puzzle.glitter) this.setGlitter(puzzle.id, true);
  }

  /** Importiertes Puzzle + gespeicherten Fortschritt löschen */
  deleteImportedPuzzle(puzzleId) {
    const list = this._loadImportedPuzzles().filter(p => p.id !== puzzleId);
    localStorage.setItem(STORAGE_KEY_IMPORTED, JSON.stringify(list));
    localStorage.removeItem(`${STORAGE_KEY_PROGRESS}_${puzzleId}`);
    this._progressCache.delete(puzzleId);
    this._completed.delete(puzzleId);
    this.setGlitter(puzzleId, false);
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
      progress = Array.from({ length: puzzle.gridSize[1] },
        () => new Array(puzzle.gridSize[0]).fill(false));
    }

    this._progressCache.set(puzzle.id, progress);

    // Total- und Done-Counter beim ersten Laden berechnen
    const total = puzzle.pixels.flat().filter(v => v > 0).length;
    this._totalCache.set(puzzle.id, total);
    this._doneCache.set(puzzle.id, progress.flat().filter(Boolean).length);

    return progress;
  }

  /**
   * Fortschritt speichern – schreibt SOFORT in den Cache,
   * localStorage-Schreibzugriff wird auf 150 ms debounced.
   */
  saveProgress(puzzleId, progress) {
    this._progressCache.set(puzzleId, progress);
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try {
        localStorage.setItem(`${STORAGE_KEY_PROGRESS}_${puzzleId}`, JSON.stringify(progress));
      } catch (e) {
        console.warn('Fortschritt konnte nicht gespeichert werden:', e);
      }
    }, 150);
  }

  /** Sofortiges Flush des debounced Saves (z.B. vor App-Wechsel) */
  flushProgress(puzzleId) {
    if (!this._saveTimer) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    const progress = this._progressCache.get(puzzleId);
    if (progress) {
      try {
        localStorage.setItem(`${STORAGE_KEY_PROGRESS}_${puzzleId}`, JSON.stringify(progress));
      } catch (e) {
        console.warn('Fortschritt konnte nicht gespeichert werden:', e);
      }
    }
  }

  /** Inkrementell: doneCount +1 beim Malen einer Zelle */
  incrementDone(puzzleId) {
    this._doneCache.set(puzzleId, (this._doneCache.get(puzzleId) ?? 0) + 1);
  }

  /** Fortschritt vollständig zurücksetzen */
  resetProgress(puzzle) {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    const empty = Array.from({ length: puzzle.gridSize[1] },
      () => new Array(puzzle.gridSize[0]).fill(false));
    this._progressCache.set(puzzle.id, empty);
    this._doneCache.set(puzzle.id, 0);
    localStorage.removeItem(`${STORAGE_KEY_PROGRESS}_${puzzle.id}`);
    this._completed.delete(puzzle.id);
    this._saveCompleted();
  }

  _saveCompleted() {
    localStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify([...this._completed]));
  }

  /** Fortschritt in Prozent (0–100) – O(1) dank gecachter Counter */
  calcPercent(puzzle) {
    const total = this._totalCache.get(puzzle.id) ?? 0;
    if (total === 0) return 0;
    const done  = this._doneCache.get(puzzle.id)  ?? 0;
    return Math.round((done / total) * 100);
  }

  isCompleted(puzzleId) {
    return this._completed.has(puzzleId);
  }

  markCompleted(puzzleId) {
    this._completed.add(puzzleId);
    this._saveCompleted();
  }

  // ── Glitzer-Modus ─────────────────────────────────────────────

  isGlitter(puzzleId) {
    return this._loadGlitterSet().has(puzzleId);
  }

  setGlitter(puzzleId, enabled) {
    const set = this._loadGlitterSet();
    enabled ? set.add(puzzleId) : set.delete(puzzleId);
    localStorage.setItem(STORAGE_KEY_GLITTER, JSON.stringify([...set]));
  }

  toggleGlitter(puzzleId) {
    this.setGlitter(puzzleId, !this.isGlitter(puzzleId));
  }

  _loadGlitterSet() {
    try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_GLITTER) || '[]')); }
    catch { return new Set(); }
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
    id: 'demo-unicorn',
    title: 'Einhorn',
    previewUrl: null,
    gridSize: [14, 16],
    palette: [
      { id: 1, hex: '#f5c6ea', label: 'Rosa' },
      { id: 2, hex: '#ffffff', label: 'Weiß' },
      { id: 3, hex: '#ffd700', label: 'Gold' },
      { id: 4, hex: '#a29bfe', label: 'Lila' },
      { id: 5, hex: '#fd79a8', label: 'Pink' },
      { id: 6, hex: '#1a1a2e', label: 'Dunkel' },
    ],
    pixels: (() => {
      const _=0, W=2, R=1, G=3, L=4, P=5, D=6;
      return [
        [_,_,_,_,_,_,G,_,_,_,_,_,_,_],
        [_,_,_,_,_,G,G,G,_,_,_,_,_,_],
        [_,_,_,_,G,L,G,L,G,_,_,_,_,_],
        [_,_,_,W,W,W,W,W,W,W,_,_,_,_],
        [_,_,W,W,W,W,W,W,W,W,W,_,_,_],
        [_,W,W,W,D,W,W,W,W,D,W,W,_,_],
        [_,W,W,W,W,W,W,W,W,W,W,W,_,_],
        [_,W,W,R,R,W,W,W,R,R,W,W,_,_],
        [_,W,W,W,W,P,W,W,W,W,W,W,_,_],
        [_,_,W,W,W,W,W,W,W,W,W,_,_,_],
        [_,_,W,R,W,W,W,W,W,R,W,_,_,_],
        [_,_,_,W,W,W,W,W,W,W,_,_,_,_],
        [_,_,_,W,_,W,_,_,W,_,W,_,_,_],
        [_,_,_,W,_,W,_,_,W,_,W,_,_,_],
        [_,_,G,L,P,G,_,_,G,L,P,G,_,_],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      ];
    })(),
  },
  {
    id: 'demo-butterfly',
    title: 'Schmetterling',
    previewUrl: null,
    gridSize: [16, 14],
    palette: [
      { id: 1, hex: '#fd79a8', label: 'Pink' },
      { id: 2, hex: '#fdcb6e', label: 'Gelb' },
      { id: 3, hex: '#6c5ce7', label: 'Lila' },
      { id: 4, hex: '#1a1a2e', label: 'Dunkel' },
      { id: 5, hex: '#ffffff', label: 'Weiß' },
    ],
    pixels: (() => {
      const _=0, P=1, Y=2, L=3, D=4, W=5;
      return [
        [_,_,_,P,P,_,_,_,_,_,_,L,L,_,_,_],
        [_,_,P,P,P,P,_,_,_,_,L,L,L,L,_,_],
        [_,P,P,Y,Y,P,P,D,D,L,L,L,Y,L,L,_],
        [P,P,P,Y,W,Y,P,D,D,L,Y,W,Y,L,L,L],
        [P,P,P,P,Y,P,P,D,D,L,L,Y,L,L,L,L],
        [P,P,P,P,P,P,D,D,_,_,D,D,L,L,L,L],
        [_,P,P,P,P,D,D,_,_,_,_,D,D,L,L,_],
        [_,P,P,P,P,D,D,_,_,_,_,D,D,L,L,_],
        [P,P,P,P,P,P,D,D,_,_,D,D,L,L,L,L],
        [P,P,P,P,Y,P,P,D,D,L,L,Y,L,L,L,L],
        [P,P,P,Y,W,Y,P,D,D,L,Y,W,Y,L,L,L],
        [_,P,P,Y,Y,P,P,D,D,L,L,L,Y,L,L,_],
        [_,_,P,P,P,P,_,_,_,_,L,L,L,L,_,_],
        [_,_,_,P,P,_,_,_,_,_,_,L,L,_,_,_],
      ];
    })(),
  },
  {
    id: 'demo-cat',
    title: 'Katze',
    previewUrl: null,
    gridSize: [12, 14],
    palette: [
      { id: 1, hex: '#fab1a0', label: 'Orange' },
      { id: 2, hex: '#fdcb6e', label: 'Hell' },
      { id: 3, hex: '#1a1a2e', label: 'Dunkel' },
      { id: 4, hex: '#55efc4', label: 'Grün' },
      { id: 5, hex: '#fd79a8', label: 'Rosa' },
    ],
    pixels: (() => {
      const _=0, O=1, L=2, D=3, G=4, P=5;
      return [
        [O,O,_,_,_,_,_,_,_,_,O,O],
        [O,O,O,_,_,_,_,_,_,O,O,O],
        [O,O,O,O,O,O,O,O,O,O,O,O],
        [O,O,O,O,O,O,O,O,O,O,O,O],
        [O,O,D,O,O,O,O,O,O,D,O,O],
        [O,G,G,G,O,O,O,G,G,G,O,O],
        [O,O,O,O,O,O,O,O,O,O,O,O],
        [O,O,O,O,P,P,P,P,O,O,O,O],
        [O,O,O,L,L,L,L,L,L,O,O,O],
        [_,O,O,O,L,L,L,L,O,O,O,_],
        [_,O,O,O,O,O,O,O,O,O,O,_],
        [_,O,O,_,_,O,O,_,_,O,O,_],
        [_,O,O,_,_,O,O,_,_,O,O,_],
        [_,_,_,_,_,_,_,_,_,_,_,_],
      ];
    })(),
  },
  {
    id: 'demo-rainbow',
    title: 'Regenbogen',
    previewUrl: null,
    gridSize: [16, 12],
    palette: [
      { id: 1, hex: '#ff6b6b', label: 'Rot' },
      { id: 2, hex: '#fdcb6e', label: 'Orange' },
      { id: 3, hex: '#ffd700', label: 'Gelb' },
      { id: 4, hex: '#55efc4', label: 'Grün' },
      { id: 5, hex: '#74b9ff', label: 'Blau' },
      { id: 6, hex: '#a29bfe', label: 'Lila' },
      { id: 7, hex: '#ffffff', label: 'Weiß' },
    ],
    pixels: (() => {
      const _=0, R=1, O=2, Y=3, G=4, B=5, L=6, W=7;
      return [
        [_,_,_,_,_,R,R,R,R,R,R,_,_,_,_,_],
        [_,_,_,_,R,R,O,O,O,O,R,R,_,_,_,_],
        [_,_,_,R,R,O,O,Y,Y,O,O,R,R,_,_,_],
        [_,_,R,R,O,O,Y,Y,G,Y,O,O,R,R,_,_],
        [_,R,R,O,O,Y,Y,G,G,Y,Y,O,O,R,R,_],
        [R,R,O,O,Y,Y,G,G,B,G,Y,Y,O,O,R,R],
        [_,_,_,_,_,_,_,W,W,_,_,_,_,_,_,_],
        [_,_,_,_,_,_,W,W,W,W,_,_,_,_,_,_],
        [_,_,_,_,_,W,W,W,W,W,W,_,_,_,_,_],
        [W,W,_,_,_,_,_,_,_,_,_,_,_,_,W,W],
        [W,W,W,_,_,_,_,_,_,_,_,_,_,W,W,W],
        [_,W,W,W,W,W,W,W,W,W,W,W,W,W,W,_],
      ];
    })(),
  },
  {
    id: 'demo-house',
    title: 'Häuschen',
    previewUrl: null,
    gridSize: [14, 14],
    palette: [
      { id: 1, hex: '#e17055', label: 'Ziegel' },
      { id: 2, hex: '#fdcb6e', label: 'Wand' },
      { id: 3, hex: '#74b9ff', label: 'Himmel' },
      { id: 4, hex: '#55efc4', label: 'Gras' },
      { id: 5, hex: '#81ecec', label: 'Fenster' },
      { id: 6, hex: '#a29bfe', label: 'Tür' },
    ],
    pixels: (() => {
      const _=0, R=1, W=2, S=3, G=4, F=5, D=6;
      return [
        [S,S,S,S,S,S,R,R,S,S,S,S,S,S],
        [S,S,S,S,S,R,R,R,R,S,S,S,S,S],
        [S,S,S,S,R,R,R,R,R,R,S,S,S,S],
        [S,S,S,R,R,R,R,R,R,R,R,S,S,S],
        [S,S,R,R,R,R,R,R,R,R,R,R,S,S],
        [S,R,R,W,W,W,W,W,W,W,W,R,R,S],
        [R,R,W,W,F,F,W,W,F,F,W,W,R,R],
        [S,S,W,W,F,F,W,W,F,F,W,W,S,S],
        [S,S,W,W,W,W,W,W,W,W,W,W,S,S],
        [S,S,W,W,W,W,D,D,W,W,W,W,S,S],
        [S,S,W,W,W,W,D,D,W,W,W,W,S,S],
        [S,S,W,W,W,W,D,D,W,W,W,W,S,S],
        [G,G,G,G,G,G,G,G,G,G,G,G,G,G],
        [G,G,G,G,G,G,G,G,G,G,G,G,G,G],
      ];
    })(),
  },
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
  {
    id: 'demo-partyhorn',
    title: 'Partyhorn',
    previewUrl: null,
    gridSize: [30, 22],
    palette: [
      { id: 1,  hex: '#ffd700', label: 'Gold' },
      { id: 2,  hex: '#e91e8c', label: 'Magenta' },
      { id: 3,  hex: '#ff6d00', label: 'Orange' },
      { id: 4,  hex: '#ffe000', label: 'Gelb' },
      { id: 5,  hex: '#00c853', label: 'Grün' },
      { id: 6,  hex: '#2979ff', label: 'Blau' },
      { id: 7,  hex: '#7c4dff', label: 'Lila' },
      { id: 8,  hex: '#1a1a2e', label: 'Dunkel' },
      { id: 9,  hex: '#ffffff', label: 'Weiß' },
      { id: 10, hex: '#ff80ab', label: 'Hellrosa' },
      { id: 11, hex: '#82b1ff', label: 'Hellblau' },
      { id: 12, hex: '#b9f6ca', label: 'Hellgrün' },
    ],
    pixels: (() => {
      const rows = 22, cols = 30;
      const _ = 0;
      const Au=1, M=2, Or=3, Y=4, G=5, B=6, P=7, D=8, W=9, Pi=10, Lb=11, Lg=12;
      const grid = Array.from({length: rows}, () => new Array(cols).fill(_));

      const stripe = c => {
        if (c <  7) return M;
        if (c < 11) return Or;
        if (c < 15) return Y;
        if (c < 19) return G;
        if (c < 23) return B;
        return P;
      };

      // Mundstück cols 0-1
      for (let r = 3; r <= 18; r++) {
        grid[r][0] = (r === 3 || r === 18) ? D : Au;
        grid[r][1] = (r === 3 || r === 18) ? D : Au;
      }

      // Hornkörper cols 2–26 (konisch zulaufend)
      for (let c = 2; c <= 26; c++) {
        const sh  = Math.floor((c - 2) * 6 / 24);
        const top = 3 + sh, bot = 18 - sh;
        if (top > bot) continue;
        for (let r = top; r <= bot; r++) {
          if (r === top || r === bot) grid[r][c] = D;
          else if (r === top + 1)     grid[r][c] = W;
          else                        grid[r][c] = stripe(c);
        }
      }

      // Kräuselpapier-Spitze (cols 27-29)
      [[27,8,P],[27,9,M],[27,10,M],[27,11,Or],[27,12,P],
       [28,9,M],[28,10,W],[28,11,M],
       [29,10,P]
      ].forEach(([c,r,col]) => { if (r < rows && c < cols) grid[r][c] = col; });

      // Konfetti rund ums Horn
      [[0,3,Pi],[0,9,Lb],[0,18,Pi],[0,24,Lg],
       [1,6,Lg],[1,14,Pi],[1,21,Lb],[1,27,Pi],
       [20,4,Lb],[20,11,Pi],[20,17,Lg],[20,25,Pi],
       [21,7,Pi],[21,15,Lb],[21,22,Lg],[21,28,Pi],
       [2,28,Lb],[19,29,Lg],
      ].forEach(([r,c,col]) => { if (r < rows && c < cols) grid[r][c] = col; });

      return grid;
    })(),
  },
];
