// ─── Entry point ──────────────────────────────────────────────────────────────

// A fresh artwork is fetched on every new tab open
window.addEventListener('DOMContentLoaded', async () => {
  const artwork = await fetchRandomArtwork();
  if (artwork) {
    renderArtwork(artwork);
  } else {
    showError();
  }
});

// ─── Fetch orchestrator ───────────────────────────────────────────────────────

async function fetchRandomArtwork() {
  // Shuffle the three museum sources and try each in turn
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
  return null; // all sources exhausted
}

// ─── Museum APIs ──────────────────────────────────────────────────────────────

/**
 * The Metropolitan Museum of Art (New York)
 * API docs: https://metmuseum.github.io — no key required
 * We search department 11 (European Paintings) for "impressionist" works.
 */
async function fetchFromMet() {
  const res  = await fetch(
    'https://collectionapi.metmuseum.org/public/collection/v1/search' +
    '?q=impressionist&hasImages=true&departmentId=11'
  );
  const { objectIDs } = await res.json();
  if (!objectIDs?.length) return null;

  // Try up to 6 random picks until we land on one with an image URL
  for (let i = 0; i < 6; i++) {
    const id     = objectIDs[Math.floor(Math.random() * objectIDs.length)];
    const objRes = await fetch(
      `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`
    );
    const obj = await objRes.json();
    const imageUrl = obj.primaryImageSmall || obj.primaryImage;
    if (!imageUrl) continue;

    return {
      title:    obj.title            || 'Untitled',
      artist:   obj.artistDisplayName || 'Unknown Artist',
      year:     obj.objectDate        || '',
      imageUrl,
      source:   'The Metropolitan Museum of Art',
    };
  }
  return null;
}

/**
 * Art Institute of Chicago
 * API docs: https://api.artic.edu/docs — no key required
 * Picks a random page of impressionist results to maximise variety.
 */
async function fetchFromAIC() {
  const page = Math.floor(Math.random() * 15) + 1; // pages 1–15
  const res  = await fetch(
    'https://api.artic.edu/api/v1/artworks/search' +
    `?q=impressionist&fields=id,title,artist_display,date_display,image_id&limit=20&page=${page}`
  );
  const { data } = await res.json();

  // Filter to records that have an image
  const withImages = (data || []).filter(a => a.image_id);
  if (!withImages.length) return null;

  const art = withImages[Math.floor(Math.random() * withImages.length)];
  return {
    title:    art.title          || 'Untitled',
    artist:   art.artist_display || 'Unknown Artist',
    year:     art.date_display   || '',
    // IIIF image URL — 1686 px wide is a good full-screen size
    imageUrl: `https://www.artic.edu/iiif/2/${art.image_id}/full/1686,/0/default.jpg`,
    source:   'Art Institute of Chicago',
  };
}

/**
 * Victoria and Albert Museum (London)
 * API docs: https://developers.vam.ac.uk — no key required
 * Searches for impressionism works that have images.
 */
async function fetchFromVAM() {
  const res     = await fetch(
    'https://api.vam.ac.uk/v2/objects/search?q=impressionism&images_exist=1&page_size=50'
  );
  const { records } = await res.json();

  const withImages = (records || []).filter(r => r._images?._primary_thumbnail);
  if (!withImages.length) return null;

  const record   = withImages[Math.floor(Math.random() * withImages.length)];
  // Upgrade the thumbnail URL to a larger image using the V&A IIIF endpoint
  const imageUrl = record._images._primary_thumbnail.replace(
    /\/full\/![^/]+\//,
    '/full/!1200,1200/'
  );

  return {
    title:    record._primaryTitle        || 'Untitled',
    artist:   record._primaryMaker?.name  || 'Unknown Artist',
    year:     record._primaryDate         || '',
    imageUrl,
    source:   'Victoria and Albert Museum',
  };
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderArtwork(artwork) {
  const bg   = document.getElementById('bg');
  const card = document.getElementById('info-card');

  // Preload the image before revealing it (avoids flash of empty background)
  const img  = new Image();

  img.onload = () => {
    // Set background and fade everything in
    bg.style.backgroundImage = `url('${CSS.escape ? artwork.imageUrl : artwork.imageUrl}')`;
    bg.classList.add('loaded');

    // Populate the info card
    document.getElementById('artwork-title').textContent  = artwork.title;
    document.getElementById('artwork-artist').textContent = artwork.artist;
    document.getElementById('artwork-year').textContent   = artwork.year;
    document.getElementById('artwork-source').textContent = artwork.source;

    // Hide loader, reveal card
    document.getElementById('loader').classList.add('hidden');
    card.classList.remove('hidden');
    // Small rAF delay so the CSS transition fires correctly after display change
    requestAnimationFrame(() => card.classList.add('visible'));
  };

  img.onerror = () => {
    showError();
  };

  img.src = artwork.imageUrl;
}

function showError() {
  document.getElementById('loader').classList.add('hidden');
  document.getElementById('error-msg').classList.remove('hidden');
}
