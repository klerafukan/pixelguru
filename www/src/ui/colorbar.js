/**
 * colorbar.js
 * Rendert die untere Farbleiste als 2×5-Grid mit Seitennavigation.
 */

const PAGE_SIZE = 10; // 2 Zeilen × 5 Spalten

export class ColorBar {
  constructor(container, palette, onSelect) {
    this.container  = container;
    this.palette    = palette;
    this.onSelect   = onSelect;
    this.selectedId = null;
    this._swatches  = new Map();
    this._page      = 0;
    this._pages     = Math.ceil(palette.length / PAGE_SIZE);
  }

  render() {
    this.container.innerHTML = '';
    this._swatches.clear();

    const grid = document.createElement('div');
    grid.className = 'color-grid';

    const dotsRow = document.createElement('div');
    dotsRow.className = 'color-dots';

    this._grid = grid;
    this._dotsRow = dotsRow;

    this.container.appendChild(grid);
    if (this._pages > 1) this.container.appendChild(dotsRow);

    // Alle Swatches erstellen (seitenübergreifend)
    for (const color of this.palette) {
      const el = document.createElement('button');
      el.className = 'color-swatch';
      el.style.backgroundColor = color.hex;
      el.dataset.colorId = color.id;
      el.setAttribute('aria-label', color.label);

      // Kontrastfarbe für Zahl
      const hex = color.hex.replace('#', '');
      const r = parseInt(hex.substring(0,2), 16) / 255;
      const g = parseInt(hex.substring(2,4), 16) / 255;
      const b = parseInt(hex.substring(4,6), 16) / 255;
      const lum = 0.2126*r + 0.7152*g + 0.0722*b;
      const numColor = lum > 0.45 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)';

      const num = document.createElement('span');
      num.className = 'swatch-num';
      num.textContent = color.id;
      num.style.color = numColor;

      el.appendChild(num);
      el.addEventListener('click', () => this._select(color.id));
      this._swatches.set(color.id, el);
    }

    // Touch-Swipe für Seitenumblättern
    let touchStartX = 0;
    grid.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    grid.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) this._goPage(dx < 0 ? 1 : -1);
    }, { passive: true });

    this._renderPage();
  }

  _renderPage() {
    this._grid.innerHTML = '';
    const start = this._page * PAGE_SIZE;
    const slice = this.palette.slice(start, start + PAGE_SIZE);

    for (const color of slice) {
      this._grid.appendChild(this._swatches.get(color.id));
    }

    // Dots aktualisieren
    if (this._pages > 1) {
      this._dotsRow.innerHTML = '';
      for (let i = 0; i < this._pages; i++) {
        const dot = document.createElement('span');
        dot.className = 'color-dot' + (i === this._page ? ' active' : '');
        dot.addEventListener('click', () => this._goPage(i - this._page));
        this._dotsRow.appendChild(dot);
      }
    }
  }

  _goPage(delta) {
    this._page = Math.max(0, Math.min(this._pages - 1, this._page + delta));
    this._renderPage();
  }

  _select(colorId) {
    if (this.selectedId === colorId) {
      this._setActive(null);
      this.onSelect(null);
      return;
    }
    // Zur Seite springen, die diese Farbe enthält
    const idx = this.palette.findIndex(c => c.id === colorId);
    if (idx >= 0) {
      const targetPage = Math.floor(idx / PAGE_SIZE);
      if (targetPage !== this._page) { this._page = targetPage; this._renderPage(); }
    }
    this._setActive(colorId);
    this.onSelect(colorId);
  }

  _setActive(colorId) {
    for (const [id, el] of this._swatches) {
      el.classList.toggle('active', id === colorId);
    }
    this.selectedId = colorId;
  }

  markColorDone(colorId) {
    const el = this._swatches.get(colorId);
    if (!el) return;
    el.classList.add('completed');
    el.disabled = true;
    // Falls diese Farbe gerade aktiv ist, Auswahl aufheben
    if (this.selectedId === colorId) {
      this._setActive(null);
      this.onSelect(null);
    }
  }

  reset() {
    this.selectedId = null;
    this._page = 0;
    for (const el of this._swatches.values()) {
      el.classList.remove('active', 'completed');
    }
  }
}
