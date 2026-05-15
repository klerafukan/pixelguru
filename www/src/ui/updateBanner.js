/**
 * updateBanner.js – Prüft beim Start ob eine neue App-Version verfügbar ist
 * und zeigt ggf. einen wegwischbaren Banner am oberen Bildschirmrand.
 *
 * Remote-Quelle: www/version.json im GitHub-Repo (raw.githubusercontent.com)
 */

const REMOTE_VERSION_URL =
  'https://raw.githubusercontent.com/klerafukan/pixelguru/main/www/version.json';

const STORAGE_KEY = 'pg_update_dismissed';

/**
 * Vergleicht zwei Semver-Strings (major.minor.patch).
 * Gibt true zurück wenn remoteVersion > localVersion.
 */
function isNewer(localVersion, remoteVersion) {
  const toNum = v => v.split('.').map(Number);
  const [lM, lm, lp] = toNum(localVersion);
  const [rM, rm, rp] = toNum(remoteVersion);
  if (rM !== lM) return rM > lM;
  if (rm !== lm) return rm > lm;
  return rp > lp;
}

/**
 * Ruft die Remote-Version ab und zeigt bei Bedarf den Banner.
 * @param {string} localVersion  – aktuelle App-Version (z. B. "1.0.0")
 */
export async function checkForUpdate(localVersion) {
  // Wurde der Banner für diese Version bereits weggeklickt?
  const dismissed = sessionStorage.getItem(STORAGE_KEY);
  if (dismissed === localVersion) return;

  let remoteData;
  try {
    const resp = await fetch(REMOTE_VERSION_URL, { cache: 'no-store' });
    if (!resp.ok) return;
    remoteData = await resp.json();
  } catch {
    return; // Kein Netz oder Fehler → kein Banner
  }

  if (!remoteData?.version) return;
  if (!isNewer(localVersion, remoteData.version)) return;

  showBanner(localVersion, remoteData.version, remoteData.storeUrl);
}

function showBanner(localVersion, newVersion, storeUrl) {
  if (document.getElementById('update-banner')) return; // bereits sichtbar

  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.setAttribute('role', 'alert');

  const msg = document.createElement('span');
  msg.className = 'update-banner-msg';
  msg.textContent = `🆕 Version ${newVersion} verfügbar!`;

  const updateBtn = document.createElement('a');
  updateBtn.className = 'update-banner-btn';
  updateBtn.textContent = 'Update';
  updateBtn.href = storeUrl || '#';
  updateBtn.target = '_blank';
  updateBtn.rel = 'noopener noreferrer';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'update-banner-close';
  closeBtn.setAttribute('aria-label', 'Banner schließen');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => {
    banner.classList.add('update-banner--hiding');
    banner.addEventListener('animationend', () => banner.remove(), { once: true });
    sessionStorage.setItem(STORAGE_KEY, localVersion);
  });

  banner.appendChild(msg);
  if (storeUrl) banner.appendChild(updateBtn);
  banner.appendChild(closeBtn);

  document.body.prepend(banner);
}
