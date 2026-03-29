/**
 * colorbar.js
 * Rendert die untere Farbleiste und gibt Farbwechsel-Events weiter.
 */

export class ColorBar {
  /**
   * @param {HTMLElement} container  – #color-bar Element
   * @param {Array<{id: number, hex: string, label: string}>} palette
   * @param {(colorId: number) => void} onSelect
   */
  constructor(container, palette, onSelect) {
    this.container  = container;
    this.palette    = palette;
    this.onSelect   = onSelect;
    this.selectedId = null;
    this._swatches  = new Map(); // colorId → HTMLElement
  }

  render() {
    this.container.innerHTML = '';
    this._swatches.clear();

    for (const color of this.palette) {
      const el = document.createElement('button');
      el.className = 'color-swatch';
      el.style.backgroundColor = color.hex;
      el.title   = color.label;
      el.dataset.colorId = color.id;
      el.setAttribute('aria-label', color.label);

      el.addEventListener('click', () => this._select(color.id));

      this.container.appendChild(el);
      this._swatches.set(color.id, el);
    }
  }

  _select(colorId) {
    // Gleiche Farbe nochmal tippen → Auswahl aufheben
    if (this.selectedId === colorId) {
      this._setActive(null);
      this.onSelect(null);
      return;
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

  /** Farbe als "vollständig" markieren (alle Zellen dieser Farbe eingefärbt) */
  markColorDone(colorId) {
    const el = this._swatches.get(colorId);
    if (el) el.classList.add('completed');
  }

  reset() {
    this.selectedId = null;
    for (const el of this._swatches.values()) {
      el.classList.remove('active', 'completed');
    }
  }
}
