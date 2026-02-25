// ─── Fallback ─────────────────────────────────────────────────────────────────
// Shown if all three APIs fail. A guaranteed public-domain Monet from AIC.

const FALLBACK = {
  title:    'Water Lilies',
  artist:   'Claude Monet',
  year:     '1906',
  imageUrl: 'https://www.artic.edu/iiif/2/3c27b499-af56-f0d5-93b5-a7f2f1ad5813/full/1686,/0/default.jpg',
  source:   'Art Institute of Chicago',
};

// ─── Entry point ──────────────────────────────────────────────────────────────

// A fresh artwork is fetched on every new tab open
window.addEventListener('DOMContentLoaded', async () => {
  const artwork = await fetchRandomArtwork();
  renderArtwork(artwork ?? FALLBACK);
});

// ─── Fetch orchestrator ───────────────────────────────────────────────────────

async function fetchRandomArtwork() {
  // Shuffle sources and try each in turn until one succeeds
  const sources = ['met', 'aic', 'vam'].sort(() => Math.random() - 0.5);

  for (const source of sources) {
    try {
      const artwork =
        source === 'met' ? await fetchFromMet() :
        source === 'aic' ? await fetchFromAIC() :
                           await fetchFromVAM();
      if (artwork) return artwork;
    } catch (err) {
      console.warn(`[Daily Impressionist] ${source} failed:`, err);
    }
  }
  return null; // triggers FALLBACK
}

// ─── Museum APIs ──────────────────────────────────────────────────────────────

/**
 * The Metropolitan Museum of Art (New York)
 * API docs: https://metmuseum.github.io — no key required
 *
 * Step 1: search `q=impressionism` in department 11 (European Paintings)
 *         with `hasImages=true` to get a list of matching objectIDs.
 * Step 2: pick one at random and fetch its full record for the image URL.
 * This two-step pattern is the correct way to use the Met API.
 */
async function fetchFromMet() {
  // Step 1 — get matching object IDs
  const searchRes = await fetch(
    'https://collectionapi.metmuseum.org/public/collection/v1/search' +
    '?q=impressionism&hasImages=true&departmentId=11'
  );
  const { objectIDs } = await searchRes.json();
  if (!objectIDs?.length) return null;

  // Step 2 — try up to 6 random picks until one has a valid image URL
  for (let i = 0; i < 6; i++) {
    const id     = objectIDs[Math.floor(Math.random() * objectIDs.length)];
    const objRes = await fetch(
      `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`
    );
    const obj      = await objRes.json();
    const imageUrl = obj.primaryImageSmall || obj.primaryImage;
    if (!imageUrl) continue;

    return {
      title:  obj.title             || 'Untitled',
      artist: obj.artistDisplayName || 'Unknown Artist',
      year:   obj.objectDate        || '',
      imageUrl,
      source: 'The Metropolitan Museum of Art',
    };
  }
  return null;
}

/**
 * Art Institute of Chicago
 * API docs: https://api.artic.edu/docs — no key required
 *
 * Searches `q=impressionism` and also requests the `style_title` field,
 * then filters client-side to records explicitly tagged "Impressionism".
 * This double check (keyword + style tag) ensures only genuine works pass.
 */
async function fetchFromAIC() {
  const page = Math.floor(Math.random() * 20) + 1;

  const res = await fetch(
    'https://api.artic.edu/api/v1/artworks/search' +
    `?q=impressionism&fields=id,title,artist_display,date_display,image_id,style_title` +
    `&limit=50&page=${page}`
  );
  const { data } = await res.json();

  // Only keep records with a confirmed Impressionism style tag and a valid image
  const verified = (data || []).filter(
    a => a.image_id && a.style_title?.toLowerCase().includes('impressioni')
  );

  if (!verified.length) return null;

  const art = verified[Math.floor(Math.random() * verified.length)];
  return {
    title:    art.title          || 'Untitled',
    artist:   art.artist_display || 'Unknown Artist',
    year:     art.date_display   || '',
    imageUrl: `https://www.artic.edu/iiif/2/${art.image_id}/full/1686,/0/default.jpg`,
    source:   'Art Institute of Chicago',
  };
}

/**
 * Victoria and Albert Museum (London)
 * API docs: https://developers.vam.ac.uk — no key required
 *
 * Searches `q=impressionism` with `images_exist=1` to restrict to works
 * that have at least one photograph. Results are filtered to those with
 * a usable thumbnail URL before a random pick is made.
 */
async function fetchFromVAM() {
  const res = await fetch(
    'https://api.vam.ac.uk/v2/objects/search' +
    '?q=impressionism&images_exist=1&page_size=50'
  );
  const { records } = await res.json();

  const withImages = (records || []).filter(r => r._images?._primary_thumbnail);
  if (!withImages.length) return null;

  const record   = withImages[Math.floor(Math.random() * withImages.length)];
  // Upgrade thumbnail to a larger image via V&A's IIIF endpoint
  const imageUrl = record._images._primary_thumbnail.replace(
    /\/full\/![^/]+\//,
    '/full/!1200,1200/'
  );

  return {
    title:    record._primaryTitle       || 'Untitled',
    artist:   record._primaryMaker?.name || 'Unknown Artist',
    year:     record._primaryDate        || '',
    imageUrl,
    source:   'Victoria and Albert Museum',
  };
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderArtwork(artwork) {
  const bg   = document.getElementById('bg');
  const card = document.getElementById('info-card');

  // Preload image before revealing — avoids flash of empty background
  const img = new Image();

  img.onload = () => {
    bg.style.backgroundImage = `url('${artwork.imageUrl}')`;
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

  img.src = artwork.imageUrl;
}

function showError() {
  document.getElementById('loader').classList.add('hidden');
  document.getElementById('error-msg').classList.remove('hidden');
}
