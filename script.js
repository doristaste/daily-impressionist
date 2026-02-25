// =============================================================================
//  Daily Impressionist — script.js
//  Cache-first architecture:
//    1. Open tab  → display cached painting instantly from chrome.storage.local
//    2. Background → fetch + encode next painting, overwrite cache for next tab
//    3. First ever → show loader while fetching, then warm the cache
// =============================================================================

// ─── Fallback ─────────────────────────────────────────────────────────────────
// Shown only when every source fails. A guaranteed public-domain Monet (AIC).

const FALLBACK = {
  title:    'Water Lilies',
  artist:   'Claude Monet',
  year:     '1906',
  imageUrl: 'https://www.artic.edu/iiif/2/3c27b499-af56-f0d5-93b5-a7f2f1ad5813/full/1686,/0/default.jpg',
  source:   'Art Institute of Chicago',
};

// ─── Master Impressionist Artist List ─────────────────────────────────────────
// Every API call is anchored to one of these names, or filtered against them.

const IMPRESSIONISTS = [
  'Monet',         'Renoir',            'Pissarro',     'Sisley',      'Degas',
  'Morisot',       'Cassatt',           'Caillebotte',  'Manet',       'Bazille',
  'Guillaumin',    'Cézanne',           'Gauguin',      'van Gogh',    'Seurat',
  'Signac',        'Toulouse-Lautrec',  'Redon',        'Rousseau',    'Bonnard',
  'Vuillard',      'Gonzalès',          'Bracquemond',  'Jongkind',    'Boudin',
  'Fantin-Latour', 'Lepine',            'Hassam',       'Sargent',     'Chase',
  'Twachtman',     'Metcalf',           'Tarbell',      'Benson',      'Dewis',
  'Vonnoh',        'Sorolla',
];


// ─── Shared Utilities ─────────────────────────────────────────────────────────

const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)];
const pickArtist = ()  => pickRandom(IMPRESSIONISTS);
const stripHtml  = s   => String(s ?? '').replace(/<[^>]*>/g, '').trim();

// Returns true if the string contains any artist on the master list
function matchesArtist(str) {
  const lower = stripHtml(str).toLowerCase();
  return IMPRESSIONISTS.some(a => lower.includes(a.toLowerCase()));
}

// Returns true if the raw date string falls within the Impressionist era
function inImpressionistEra(raw) {
  if (!raw) return true;                      // unknown date → keep
  const m = String(raw).match(/\d{4}/);
  if (!m) return true;                        // unparseable  → keep
  const y = +m[0];
  return y >= 1860 && y <= 1910;
}


// ─── Gallery Background ───────────────────────────────────────────────────────

// Converts RGB (0–255 each) to HSL (0–1 each).
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

// Converts HSL (0–1 each) to a CSS hex string.
function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const v = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Downsamples the image onto an 80×80 canvas, averages the chromatic pixels
// (skipping near-white, near-black, and near-grey), and sets --bg-color to a
// desaturated gallery-neutral tint of the dominant hue.
function applyGalleryBackground(imgEl) {
  try {
    const SIZE = 80;
    const canvas = document.createElement('canvas');
    canvas.width  = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(imgEl, 0, 0, SIZE, SIZE);
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      if (s < 0.12 || l > 0.90 || l < 0.10) continue; // skip achromatic pixels
      rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; count++;
    }
    if (count === 0) return; // fully achromatic painting — keep default

    const [h] = rgbToHsl(rSum / count, gSum / count, bSum / count);
    document.documentElement.style.setProperty('--bg-color', hslToHex(h, 0.17, 0.13));
  } catch {
    // Color extraction failed — keep default background, never break painting display
  }
}


// ─── Cache Utilities ──────────────────────────────────────────────────────────

// Fetches an image URL and returns it as a base64 data URL for local storage.
async function toDataUrl(imageUrl) {
  const res  = await fetch(imageUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader   = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Fetch a fresh random artwork, encode its image, and write it to the cache.
// Always runs in the background — never awaited by the render path.
async function prefetchAndCache() {
  try {
    const artwork = await fetchRandomArtwork();
    if (!artwork) return;
    const dataUrl = await toDataUrl(artwork.imageUrl);
    await chrome.storage.local.set({ ready: { ...artwork, dataUrl } });
    console.log('[Daily Impressionist] Cached:', artwork.title, '—', artwork.source);
  } catch (err) {
    console.warn('[Daily Impressionist] Prefetch failed:', err);
  }
}


// ─── Entry Point — Cache-First ────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  const { ready } = await chrome.storage.local.get('ready');

  if (ready?.dataUrl) {
    // ── Cache hit: paint instantly from local storage ──────────────────────
    // Remove the entry immediately so the next tab never shows the same painting.
    chrome.storage.local.remove('ready');
    renderArtwork(ready);
    // Fetch + cache the next painting in the background for the tab after this one.
    prefetchAndCache();
  } else {
    // ── First-ever load: show loader, fetch, display, then warm the cache ──
    const artwork = await fetchRandomArtwork();
    renderArtwork(artwork ?? FALLBACK);
    // Warm the cache so every subsequent tab is instant.
    prefetchAndCache();
  }
});


// ─── Source Registry & Orchestrator ──────────────────────────────────────────

const FETCHERS = {
  met:       fetchFromMet,
  aic:       fetchFromAIC,
  vam:       fetchFromVAM,
  cleveland: fetchFromCleveland,
};

async function fetchRandomArtwork() {
  // Shuffle so every fetch rotates through museums unpredictably
  const sources = Object.keys(FETCHERS).sort(() => Math.random() - 0.5);

  for (const src of sources) {
    try {
      const result = await FETCHERS[src]();
      if (result) return result;
    } catch (err) {
      console.warn(`[Daily Impressionist] ${src} failed:`, err);
    }
  }
  return null; // triggers FALLBACK in caller
}


// ─── Source 1: The Metropolitan Museum of Art ─────────────────────────────────
// Free API, no key. Searches by artist name in department 11 (European Paintings).
// Two-step: get matching IDs first, then fetch the chosen object's full record.

async function fetchFromMet() {
  const artist = pickArtist();
  const search = await fetch(
    `https://collectionapi.metmuseum.org/public/collection/v1/search` +
    `?artistOrCulture=true&q=${encodeURIComponent(artist)}&hasImages=true&departmentId=11`
  );
  const { objectIDs } = await search.json();
  if (!objectIDs?.length) return null;

  for (let i = 0; i < 6; i++) {
    const obj = await fetch(
      `https://collectionapi.metmuseum.org/public/collection/v1/objects/${pickRandom(objectIDs)}`
    ).then(r => r.json());

    const imageUrl = obj.primaryImageSmall || obj.primaryImage;
    if (!imageUrl)                             continue;
    if (!matchesArtist(obj.artistDisplayName)) continue;
    if (!inImpressionistEra(obj.objectDate))   continue;

    return {
      title:    obj.title             || 'Untitled',
      artist:   obj.artistDisplayName || artist,
      year:     obj.objectDate        || '',
      imageUrl,
      source:   'The Metropolitan Museum of Art',
    };
  }
  return null;
}


// ─── Source 2: Art Institute of Chicago ───────────────────────────────────────
// Free API, no key. Filters by AIC's own `style_title` field ("Impressionism")
// for maximum accuracy, then cross-checks against the master artist list.

async function fetchFromAIC() {
  const page = Math.floor(Math.random() * 20) + 1;
  const res  = await fetch(
    `https://api.artic.edu/api/v1/artworks/search` +
    `?q=impressionism&fields=id,title,artist_display,date_display,image_id,style_title` +
    `&limit=50&page=${page}`
  );
  const { data } = await res.json();

  const valid = (data || []).filter(a =>
    a.image_id &&
    matchesArtist(a.artist_display) &&
    a.style_title?.toLowerCase().includes('impressioni') &&
    inImpressionistEra(a.date_display)
  );
  if (!valid.length) return null;

  const art = pickRandom(valid);
  return {
    title:    art.title          || 'Untitled',
    artist:   art.artist_display || 'Unknown',
    year:     art.date_display   || '',
    imageUrl: `https://www.artic.edu/iiif/2/${art.image_id}/full/1686,/0/default.jpg`,
    source:   'Art Institute of Chicago',
  };
}


// ─── Source 3: Victoria and Albert Museum ─────────────────────────────────────
// Free API, no key. Uses `q_actor` to search specifically by artist/maker name.

async function fetchFromVAM() {
  const artist = pickArtist();
  const res    = await fetch(
    `https://api.vam.ac.uk/v2/objects/search` +
    `?q_actor=${encodeURIComponent(artist)}&images_exist=1&page_size=50`
  );
  const { records } = await res.json();

  const valid = (records || []).filter(r =>
    r._images?._primary_thumbnail &&
    matchesArtist(r._primaryMaker?.name ?? '') &&
    inImpressionistEra(r._primaryDate)
  );
  if (!valid.length) return null;

  const rec      = pickRandom(valid);
  const imageUrl = rec._images._primary_thumbnail
    .replace(/\/full\/![^/]+\//, '/full/!1200,1200/');

  return {
    title:    rec._primaryTitle       || 'Untitled',
    artist:   rec._primaryMaker?.name || artist,
    year:     rec._primaryDate        || '',
    imageUrl,
    source:   'Victoria and Albert Museum',
  };
}


// ─── Source 4: Cleveland Museum of Art ────────────────────────────────────────
// Free API, no key. Searches by artist name with built-in date-range filtering.
// Uses the `print` image (highest resolution) with web as fallback.

async function fetchFromCleveland() {
  const artist = pickArtist();
  const res    = await fetch(
    `https://openaccess-api.clevelandart.org/api/artworks/` +
    `?artists=${encodeURIComponent(artist)}&has_image=1&type=Painting` +
    `&created_after=1860&created_before=1910&limit=100`
  );
  const { data } = await res.json();

  const valid = (data || []).filter(a => {
    const imgUrl = a.images?.print?.url || a.images?.web?.url;
    if (!imgUrl) return false;
    const creatorsStr = (a.creators || []).map(c => c.description).join(' ');
    return matchesArtist(creatorsStr);
  });
  if (!valid.length) return null;

  const art     = pickRandom(valid);
  // "Claude Monet (French, 1840–1926)" → extract clean name before the parenthesis
  const rawName = art.creators?.[0]?.description || artist;
  const name    = rawName.split('(')[0].trim() || artist;

  return {
    title:    art.title                                  || 'Untitled',
    artist:   name,
    year:     art.creation_date                          || '',
    imageUrl: art.images?.print?.url || art.images?.web?.url,
    source:   'Cleveland Museum of Art',
  };
}


// ─── Render ───────────────────────────────────────────────────────────────────
// Accepts artwork with either a `dataUrl` (instant, from cache) or a plain
// `imageUrl` (requires a network round-trip). The rest of the function is
// identical either way.

function renderArtwork(artwork) {
  const bg     = document.getElementById('bg');
  const card   = document.getElementById('info-card');
  // Prefer the locally-stored data URL; fall back to the remote image URL.
  const imgSrc = artwork.dataUrl || artwork.imageUrl;

  // Preload image before revealing — avoids flash of empty background
  const img = new Image();

  img.onload = () => {
    applyGalleryBackground(img);
    bg.style.backgroundImage = `url('${imgSrc}')`;
    bg.classList.add('loaded');

    document.getElementById('artwork-title').textContent  = artwork.title;
    document.getElementById('artwork-artist').textContent = artwork.artist;
    document.getElementById('artwork-year').textContent   = artwork.year;
    document.getElementById('artwork-source').textContent = artwork.source;

    document.getElementById('loader').classList.add('hidden');
    card.classList.remove('hidden');
    // rAF ensures the transition fires after display:block takes effect
    requestAnimationFrame(() => card.classList.add('visible'));
  };

  img.onerror = () => {
    // If even the fallback image fails, show the error state
    if (artwork === FALLBACK) {
      showError();
    } else {
      renderArtwork(FALLBACK);
    }
  };

  img.src = imgSrc;
}

function showError() {
  document.getElementById('loader').classList.add('hidden');
  document.getElementById('error-msg').classList.remove('hidden');
}
