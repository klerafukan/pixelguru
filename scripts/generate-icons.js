/**
 * generate-icons.js
 * Erzeugt alle App-Icons und Store-Assets für PixelGuru.
 * Design: süßer Pixel-Art-Esel (angelehnt ans App-Maskottchen)
 * Ausführen:  node scripts/generate-icons.js
 */

const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

// ── Esel Pixel-Art (16×18 Grid) ─────────────────────────────────
// 0=transparent  1=grau Körper  2=dunkler Umriss  3=rosa Ohr/innen
// 4=Auge/Nüstern dunkel  5=Glanzpunkt weiß  6=Mähne lila  7=Maul beige
const DONKEY = [
  [0,0,0,2,0,0,0,0,0,0,0,0,2,0,0,0],  //  0  Ohrenspitzen
  [0,0,2,1,2,0,0,0,0,0,0,2,1,2,0,0],  //  1  Ohren schmal
  [0,0,2,3,2,0,0,0,0,0,0,2,3,2,0,0],  //  2  Ohren rosa innen
  [0,0,2,3,2,0,0,0,0,0,0,2,3,2,0,0],  //  3  Ohren rosa innen
  [0,2,1,3,1,2,6,6,6,6,2,1,3,1,2,0],  //  4  Ohrenbasis + Mähne
  [0,0,2,1,1,1,6,1,1,6,1,1,1,2,0,0],  //  5  Stirn + Mähnenseiten
  [0,2,1,1,1,1,1,1,1,1,1,1,1,1,2,0],  //  6  breite Stirn
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],  //  7  breiteste Stelle
  [2,1,1,1,4,1,1,1,1,1,1,4,1,1,1,2],  //  8  Augen
  [2,1,1,1,5,1,1,1,1,1,1,5,1,1,1,2],  //  9  Augenglanz
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],  // 10  Wangen
  [0,2,1,1,1,1,1,1,1,1,1,1,1,1,2,0],  // 11  untere Wangen
  [0,2,1,1,1,1,1,1,1,1,1,1,1,1,2,0],  // 12  unteres Gesicht
  [0,0,2,1,7,7,7,7,7,7,7,7,1,2,0,0],  // 13  Maul oben
  [0,0,2,7,7,7,7,7,7,7,7,7,7,2,0,0],  // 14  Maul
  [0,0,2,7,7,4,4,7,7,4,4,7,7,2,0,0],  // 15  Nüstern
  [0,0,2,7,7,7,7,7,7,7,7,7,7,2,0,0],  // 16  Maul unten
  [0,0,0,2,1,1,1,1,1,1,1,1,2,0,0,0],  // 17  Kinn
];

const DONKEY_COLORS = [
  null,       // 0 transparent
  '#9898b2',  // 1 Körper grau-lila
  '#252540',  // 2 Umriss dunkel
  '#f4a8b8',  // 3 Rosa
  '#151525',  // 4 Auge / Nüstern dunkel
  '#fffff5',  // 5 Glanzpunkt
  '#7e3a98',  // 6 Mähne lila
  '#e8d090',  // 7 Maul beige
];

// Rendert den Esel als Array von SVG-<rect>-Strings
function donkeyRects(offsetX, offsetY, cellSize) {
  const out = [];
  for (let r = 0; r < DONKEY.length; r++) {
    for (let c = 0; c < DONKEY[r].length; c++) {
      const color = DONKEY_COLORS[DONKEY[r][c]];
      if (!color) continue;
      out.push(`<rect x="${offsetX + c * cellSize}" y="${offsetY + r * cellSize}" width="${cellSize}" height="${cellSize}" fill="${color}"/>`);
    }
  }
  return out;
}

// Kleine Kreuz-Sparkle an Position x,y
function sparkle(x, y, color) {
  return [
    `<rect x="${x - 1}" y="${y - 5}" width="2" height="10" fill="${color}" opacity="0.85"/>`,
    `<rect x="${x - 5}" y="${y - 1}" width="10" height="2" fill="${color}" opacity="0.85"/>`,
    `<rect x="${x - 1}" y="${y - 1}" width="3" height="3" fill="${color}"/>`,
  ].join('');
}

// ── Icon-SVG (512×512) ──────────────────────────────────────────
function buildIconSvg() {
  const cellSize = 26;
  const cols = 16, rows = 18;
  const offsetX = Math.floor((512 - cols * cellSize) / 2); // 48
  const offsetY = Math.floor((512 - rows * cellSize) / 2); // 22

  const rects = donkeyRects(offsetX, offsetY, cellSize);

  // Glitzer-Sparkles in den Ecken
  rects.push(sparkle(35,  40,  '#ffd700'));
  rects.push(sparkle(480, 55,  '#a29bfe'));
  rects.push(sparkle(60,  455, '#fd79a8'));
  rects.push(sparkle(478, 445, '#55efc4'));
  rects.push(sparkle(490, 200, '#ffeaa7'));
  rects.push(sparkle(28,  270, '#74b9ff'));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1a1a2e"/>
  ${rects.join('\n  ')}
</svg>`;
}

// ── Feature-Grafik-SVG (1024×500) ──────────────────────────────
function buildFeatureSvg() {
  const cellSize = 20;
  const cols = 16, rows = 18;
  const offsetX = 1024 - cols * cellSize - 80; // 624
  const offsetY = Math.floor((500 - rows * cellSize) / 2); // 70

  const rects = donkeyRects(offsetX, offsetY, cellSize);

  // Sparkles rechts vom Esel
  rects.push(sparkle(980, 40,  '#ffd700'));
  rects.push(sparkle(600, 460, '#fd79a8'));
  rects.push(sparkle(960, 460, '#a29bfe'));
  rects.push(sparkle(615, 40,  '#55efc4'));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <rect width="1024" height="500" fill="#1a1a2e"/>
  <line x1="550" y1="40" x2="550" y2="460" stroke="#2a2a4e" stroke-width="1"/>
  <text x="275" y="185" font-family="Arial, sans-serif" font-size="80" font-weight="bold" fill="#ffffff" text-anchor="middle">PixelGuru</text>
  <text x="275" y="245" font-family="Arial, sans-serif" font-size="26" fill="#8888cc" text-anchor="middle">Pixel-Malen · Entspannen · Kreieren</text>
  <rect x="80"  y="268" width="35" height="7" rx="3" fill="#ffd93d"/>
  <rect x="123" y="268" width="35" height="7" rx="3" fill="#ff6b6b"/>
  <rect x="166" y="268" width="35" height="7" rx="3" fill="#4ecdc4"/>
  <rect x="209" y="268" width="35" height="7" rx="3" fill="#a29bfe"/>
  <rect x="252" y="268" width="35" height="7" rx="3" fill="#fd79a8"/>
  <rect x="295" y="268" width="35" height="7" rx="3" fill="#55efc4"/>
  <rect x="338" y="268" width="35" height="7" rx="3" fill="#ffd93d"/>
  ${rects.join('\n  ')}
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
