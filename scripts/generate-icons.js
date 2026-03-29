/**
 * generate-icons.js
 * Erzeugt alle App-Icons und Store-Assets für PixelGuru.
 *
 * Design: 7×7 Pixel-Grid mit konzentrischen Farbringen
 *   (außen grau/ungefärbt = Paint-by-Numbers-Konzept)
 *
 * Ausführen:  node scripts/generate-icons.js
 */

const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

// ── Icon-SVG (512×512) ──────────────────────────────────────────
function buildIconSvg() {
  const cellSize = 50;
  const gap      = 6;
  const step     = cellSize + gap;
  const offset   = 63;          // (512 − 386) / 2
  const rx       = 10;

  // Farben je nach Chebyshev-Distanz zum Zentrum (Gittermitte = 3,3)
  const colorMap = {
    0: '#ffd93d',   // gelbes Zentrum
    1: '#ff6b6b',   // korallenroter Ring
    2: '#4ecdc4',   // türkiser Ring
    3: '#2e2e52',   // ungefärbt (dunkelgrau-blau)
  };

  const rects  = [];
  const texts  = [];
  const shadow = [];

  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const dist = Math.max(Math.abs(col - 3), Math.abs(row - 3));
      const x  = offset + col * step;
      const y  = offset + row * step;
      const cx = x + cellSize / 2;
      const cy = y + cellSize / 2;
      const fill = colorMap[dist];

      // Schatten nur für farbige Zellen
      if (dist < 3) {
        shadow.push(
          `<rect x="${x + 2}" y="${y + 4}" width="${cellSize}" height="${cellSize}" rx="${rx}" fill="#000" opacity="0.25"/>`
        );
      }

      rects.push(
        `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="${rx}" fill="${fill}"/>`
      );

      // Highlight (Glanzeffekt) auf farbigen Zellen
      if (dist < 3) {
        rects.push(
          `<rect x="${x + 6}" y="${y + 5}" width="${cellSize - 18}" height="10" rx="5" fill="#fff" opacity="0.18"/>`
        );
      }

      // Nummer auf ungefärbten Rand-Zellen
      if (dist === 3) {
        texts.push(
          `<text x="${cx}" y="${cy}" font-family="monospace" font-size="19" font-weight="bold" fill="#5a5a8a" text-anchor="middle" dominant-baseline="central">3</text>`
        );
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <!-- Hintergrund -->
  <rect width="512" height="512" rx="90" fill="#1a1a2e"/>

  <!-- Schatten -->
  ${shadow.join('\n  ')}

  <!-- Zellen -->
  ${rects.join('\n  ')}

  <!-- Nummern auf ungefärbten Zellen -->
  ${texts.join('\n  ')}
</svg>`;
}

// ── Feature-Grafik-SVG (1024×500) ──────────────────────────────
function buildFeatureSvg() {
  // Kleines 5×5 Pixel-Grid rechts (gleiche Farblogik, kleiner)
  const cellSize = 52;
  const gap      = 5;
  const step     = cellSize + gap;
  const offsetX  = 620;
  const offsetY  = 80;
  const rx       = 8;

  const colorMap = {
    0: '#ffd93d',
    1: '#ff6b6b',
    2: '#4ecdc4',
    3: '#2e2e52',
    4: '#252548',   // äußerste Randzeile (transparent wirken)
  };

  const rects = [];
  const texts = [];

  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const dist = Math.max(Math.abs(col - 3), Math.abs(row - 3));
      const x  = offsetX + col * step;
      const y  = offsetY + row * step;
      const cx = x + cellSize / 2;
      const cy = y + cellSize / 2;
      const fill = colorMap[Math.min(dist, 4)];

      if (x + cellSize > 1014 || y + cellSize > 490) continue;

      rects.push(
        `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="${rx}" fill="${fill}" opacity="${dist >= 3 ? 1 : 1}"/>`
      );

      if (dist === 3) {
        rects.push(
          `<rect x="${x + 5}" y="${y + 4}" width="${cellSize - 16}" height="9" rx="4" fill="#fff" opacity="0.08"/>`
        );
        texts.push(
          `<text x="${cx}" y="${cy}" font-family="monospace" font-size="16" font-weight="bold" fill="#5a5a8a" text-anchor="middle" dominant-baseline="central">3</text>`
        );
      } else {
        rects.push(
          `<rect x="${x + 6}" y="${y + 5}" width="${cellSize - 18}" height="9" rx="4" fill="#fff" opacity="0.18"/>`
        );
      }
    }
  }

  // Farbige Punkte als Dekoration links
  const dots = [
    { x: 60,  y: 80,  r: 28, c: '#ffd93d' },
    { x: 110, y: 130, r: 18, c: '#ff6b6b' },
    { x: 180, y: 90,  r: 14, c: '#4ecdc4' },
    { x: 80,  y: 380, r: 20, c: '#6bcb77' },
    { x: 160, y: 400, r: 12, c: '#ff9ff3' },
    { x: 50,  y: 240, r: 8,  c: '#ffd93d' },
  ].map(d =>
    `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="${d.c}" opacity="0.25"/>`
  ).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <!-- Hintergrund -->
  <rect width="1024" height="500" fill="#1a1a2e"/>

  <!-- Dekorative Punkte -->
  ${dots}

  <!-- Trennlinie -->
  <line x1="540" y1="40" x2="540" y2="460" stroke="#2a2a4e" stroke-width="1"/>

  <!-- App-Name -->
  <text x="270" y="190" font-family="Arial, sans-serif" font-size="72" font-weight="bold"
    fill="#ffffff" text-anchor="middle">PixelGuru</text>

  <!-- Tagline -->
  <text x="270" y="255" font-family="Arial, sans-serif" font-size="28"
    fill="#8888cc" text-anchor="middle">Pixel-Malen · Entspannen · Kreieren</text>

  <!-- Farbige Streifen unter dem Titel -->
  <rect x="75" y="278" width="40" height="8" rx="4" fill="#ffd93d"/>
  <rect x="123" y="278" width="40" height="8" rx="4" fill="#ff6b6b"/>
  <rect x="171" y="278" width="40" height="8" rx="4" fill="#4ecdc4"/>
  <rect x="219" y="278" width="40" height="8" rx="4" fill="#6bcb77"/>
  <rect x="267" y="278" width="40" height="8" rx="4" fill="#ff9ff3"/>
  <rect x="315" y="278" width="40" height="8" rx="4" fill="#ffd93d"/>
  <rect x="363" y="278" width="40" height="8" rx="4" fill="#ff6b6b"/>

  <!-- Pixel-Grid (rechts) -->
  ${rects.join('\n  ')}
  ${texts.join('\n  ')}
</svg>`;
}

// ── Ausgabe-Konfiguration ───────────────────────────────────────
const RES_DIR   = path.join(__dirname, '../android/app/src/main/res');
const STORE_DIR = path.join(__dirname, '../store-assets');

const ANDROID_SIZES = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

// ── Generierung ─────────────────────────────────────────────────
async function generate() {
  fs.mkdirSync(STORE_DIR, { recursive: true });

  const iconSvg    = Buffer.from(buildIconSvg());
  const featureSvg = Buffer.from(buildFeatureSvg());

  // Android Launcher-Icons
  for (const { dir, size } of ANDROID_SIZES) {
    const outDir = path.join(RES_DIR, dir);
    const base   = sharp(iconSvg).resize(size, size).png();

    await base.clone().toFile(path.join(outDir, 'ic_launcher.png'));
    await base.clone().toFile(path.join(outDir, 'ic_launcher_round.png'));
    console.log(`✓ ${dir}: ${size}×${size}px`);
  }

  // Play Store Icon 512×512
  await sharp(iconSvg)
    .resize(512, 512)
    .png()
    .toFile(path.join(STORE_DIR, 'icon-512x512.png'));
  console.log('✓ store-assets/icon-512x512.png');

  // Feature-Grafik 1024×500
  await sharp(featureSvg)
    .resize(1024, 500)
    .png()
    .toFile(path.join(STORE_DIR, 'feature-graphic-1024x500.png'));
  console.log('✓ store-assets/feature-graphic-1024x500.png');

  console.log('\nAlle Icons generiert!');
  console.log('Play-Store Assets → store-assets/');
}

generate().catch(err => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
