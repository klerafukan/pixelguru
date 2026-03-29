/**
 * gallery.js
 * Rendert die private Galerie mit gespeicherten Bildern.
 */

import { loadSavedImages, deleteImage } from '../data/storage.js';

export class Gallery {
  /** @param {HTMLElement} gridEl – #gallery-grid */
  constructor(gridEl, emptyEl) {
    this.gridEl  = gridEl;
    this.emptyEl = emptyEl;
  }

  async refresh() {
    const images = await loadSavedImages();
    this.gridEl.innerHTML = '';

    if (images.length === 0) {
      this.emptyEl.style.display = 'block';
      return;
    }

    this.emptyEl.style.display = 'none';

    for (const img of images) {
      const div = document.createElement('div');
      div.className = 'gallery-thumb';

      const imgEl = document.createElement('img');
      imgEl.src     = img.dataUrl;
      imgEl.alt     = img.filename;
      imgEl.loading = 'lazy';

      const delBtn = document.createElement('button');
      delBtn.className   = 'gallery-delete';
      delBtn.textContent = '✕';
      delBtn.title       = 'Löschen';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Bild löschen?')) return;
        await deleteImage(img.filename);
        div.remove();
        const remaining = this.gridEl.querySelectorAll('.gallery-thumb');
        if (remaining.length === 0) this.emptyEl.style.display = 'block';
      });

      div.appendChild(imgEl);
      div.appendChild(delBtn);
      this.gridEl.appendChild(div);
    }
  }
}
