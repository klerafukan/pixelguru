/**
 * storage.js
 * Speichert fertige Puzzle-Bilder im App-eigenen Dateisystem
 * via Capacitor Filesystem API.
 * Fällt im Browser auf localStorage/Blob-URL zurück.
 */

const DIR = 'pixelguru_gallery';

function isNative() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform());
}

/**
 * Speichert einen Canvas als PNG-Datei.
 * @param {HTMLCanvasElement} canvas
 * @param {string} puzzleId
 * @returns {Promise<string>} gespeicherter Dateiname
 */
export async function saveCanvasAsImage(canvas, puzzleId) {
  const filename = `${puzzleId}_${Date.now()}.png`;
  const dataUrl  = canvas.toDataURL('image/png');
  const base64   = dataUrl.split(',')[1];

  if (isNative()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    await Filesystem.writeFile({
      path:      `${DIR}/${filename}`,
      data:      base64,
      directory: 'DATA',
      recursive: true,
    });
  } else {
    // Browser-Fallback: in localStorage (nur für Entwicklung)
    const saved = await loadSavedImages();
    saved.push({ filename, dataUrl });
    localStorage.setItem('pixelguru_saved_images', JSON.stringify(saved));
  }

  return filename;
}

/**
 * Löscht ein gespeichertes Bild anhand des Dateinamens.
 * @param {string} filename
 */
export async function deleteImage(filename) {
  if (isNative()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    await Filesystem.deleteFile({
      path:      `${DIR}/${filename}`,
      directory: 'DATA',
    });
  } else {
    const saved = await loadSavedImages();
    const filtered = saved.filter(img => img.filename !== filename);
    localStorage.setItem('pixelguru_saved_images', JSON.stringify(filtered));
  }
}

/**
 * Gibt alle gespeicherten Bildeinträge zurück.
 * @returns {Promise<Array<{filename: string, dataUrl: string}>>}
 */
export async function loadSavedImages() {
  if (isNative()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    try {
      const result = await Filesystem.readdir({
        path:      DIR,
        directory: 'DATA',
      });
      const images = await Promise.all(
        result.files
          .filter(f => f.name.endsWith('.png'))
          .map(async f => {
            const file = await Filesystem.readFile({
              path:      `${DIR}/${f.name}`,
              directory: 'DATA',
            });
            return { filename: f.name, dataUrl: `data:image/png;base64,${file.data}` };
          })
      );
      return images;
    } catch {
      return [];
    }
  } else {
    try {
      return JSON.parse(localStorage.getItem('pixelguru_saved_images') || '[]');
    } catch { return []; }
  }
}
