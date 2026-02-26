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


// ─── Nippon Colors Palette ────────────────────────────────────────────────────
// 20 low-saturation traditional Japanese colors used as gallery wall tints.
// Source: nipponcolors.com — all deep/muted to let the artwork speak.

const NIPPON_COLORS = [
  '#1C1C1C', // 墨      Sumi          (ink)
  '#2A2420', // 黒橡    Kurotsurubami (dark oak)
  '#3B2F28', // 焦茶    Kogecha       (burnt umber)
  '#4A3C34', // 煤竹    Susutake      (smoked bamboo)
  '#5C4D45', // 煤色    Susuiro       (soot)
  '#6B5B52', // 胡桃    Kurumi        (walnut)
  '#7A6C63', // 鈍色    Nibiiro       (dull grey)
  '#877870', // 丁子鼠  Chojiinezumi  (clove grey)
  '#8C8278', // 利休鼠  Rikyunezumi   (tea-ceremony grey)
  '#9B9490', // 薄墨    Usuzumi       (pale ink)
  '#6E7C78', // 錆鼠    Sabinezumi    (rust grey)
  '#7A8A82', // 青鈍    Aonibi        (indigo dull)
  '#6C7870', // 千歳緑  Chitosemidori (deep pine)
  '#857D7D', // 梅鼠    Umenezumi     (plum grey)
  '#8A7F88', // 紫鼠    Murasakinezumi(purple grey)
  '#7B7368', // 鉄色    Tetsuiro      (iron)
  '#7C6E5A', // 黄枯茶  Kikogecha     (yellow-brown)
  '#6A6058', // 江戸鼠  Edonezumi     (Edo grey)
  '#5A5248', // 消炭色  Keshisumiiro  (charcoal ash)
  '#483E38', // 黒茶    Kurocha       (black tea)
];


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
  // Set a random Nippon gallery tint immediately — before anything else loads.
  document.documentElement.style.setProperty('--bg-color', pickRandom(NIPPON_COLORS));

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
