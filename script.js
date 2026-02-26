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

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

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

  // Boot the widget (stock + note) independently of the painting pipeline.
  initWidget();

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


// =============================================================================
//  Stock Widget (Pro)
//  US stocks via Polygon.io; HK stocks via Yahoo Finance / RapidAPI.
//  API keys are read from window.EXTENSION_CONFIG (config.js, gitignored).
//  Without keys the widget is still interactive but shows "—" for quotes.
// =============================================================================

const POLYGON_KEY = window.EXTENSION_CONFIG?.POLYGON_KEY ?? '';

// ─── Storage key ──────────────────────────────────────────────────────────────

const STOCK_STORE_KEY = 'stockWidgets';
const NOTE_KEY        = 'noteContent';

async function loadSavedTickers() {
  const { stockWidgets } = await chrome.storage.local.get(STOCK_STORE_KEY);
  return Array.isArray(stockWidgets) ? stockWidgets : [];
}

async function saveTickerList(list) {
  await chrome.storage.local.set({ [STOCK_STORE_KEY]: list });
}

// ─── Ticker helpers ────────────────────────────────────────────────────────────

function isHKTicker(raw) {
  return /^\d{1,5}(\.HK)?$/i.test(raw.trim());
}

function normalizeHkTicker(raw) {
  const digits = raw.trim().replace(/\.HK$/i, '').replace(/^0+/, '') || '0';
  return digits.padStart(4, '0') + '.HK';
}

function normalizeTicker(raw) {
  return isHKTicker(raw) ? normalizeHkTicker(raw) : raw.trim().toUpperCase();
}

// ─── API calls ─────────────────────────────────────────────────────────────────
// Primary: Yahoo Finance public API — free, no key, works for US + HK tickers.
// Optional upgrade: Polygon.io (US) for real-time last-trade price.

async function fetchViaYahoo(ticker) {
  // v8/finance/chart is more reliable than v7/finance/quote (no crumb/consent required)
  const res  = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`
  );
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) return null;

  const price     = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose;
  if (price == null) return null;

  const change    = prevClose != null ? ((price - prevClose) / prevClose) * 100 : null;
  const timestamp = meta.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  // shortName is used to show company name for HK tickers in the widget
  const shortName = meta.shortName || meta.longName || null;
  return { ticker, price, change, timestamp, shortName };
}

async function fetchViaPolygon(ticker) {
  if (!POLYGON_KEY) return null;

  const [tradeRes, prevRes] = await Promise.all([
    fetch(`https://api.polygon.io/v2/last/trade/${ticker}?apiKey=${POLYGON_KEY}`),
    fetch(`https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_KEY}`),
  ]);
  const tradeJson = await tradeRes.json();
  const prevJson  = await prevRes.json();

  const price     = tradeJson?.results?.p;
  const prevClose = prevJson?.results?.[0]?.c;
  if (price == null) return null;

  const change    = prevClose != null ? ((price - prevClose) / prevClose) * 100 : null;
  const timestamp = tradeJson?.results?.t
    ? new Date(tradeJson.results.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return { ticker, price, change, timestamp };
}

async function fetchStockQuote(ticker) {
  try {
    // US tickers: try Polygon first (real-time) then Yahoo as fallback
    if (!isHKTicker(ticker) && POLYGON_KEY) {
      const result = await fetchViaPolygon(ticker);
      if (result) return result;
    }
    // Yahoo Finance works for both US and HK tickers
    return await fetchViaYahoo(ticker);
  } catch {
    return null;
  }
}

// ─── Card DOM helpers ──────────────────────────────────────────────────────────

function formatPrice(price) {
  if (price == null) return '—';
  return price >= 100
    ? price.toFixed(2)
    : price.toFixed(3);
}

function formatChange(change) {
  if (change == null) return '—';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

function buildStockCard(ticker) {
  const card = document.createElement('div');
  card.className  = 'stock-row';
  card.dataset.ticker = ticker;

  const tickerEl = document.createElement('span');
  tickerEl.className   = 'stock-ticker';
  tickerEl.textContent = ticker;

  const priceEl = document.createElement('span');
  priceEl.className   = 'stock-price';
  priceEl.textContent = '…';

  const changeEl = document.createElement('span');
  changeEl.className   = 'stock-change neutral';
  changeEl.textContent = '…';

  const removeBtn = document.createElement('button');
  removeBtn.className   = 'stock-remove';
  removeBtn.textContent = '✕';
  removeBtn.title       = 'Remove';
  removeBtn.addEventListener('click', () => removeTicker(ticker));

  card.append(tickerEl, priceEl, changeEl, removeBtn);
  return card;
}

function upsertCard(ticker, data) {
  const list = document.getElementById('stock-list');
  let card   = list.querySelector(`[data-ticker="${CSS.escape(ticker)}"]`);

  if (!card) {
    card = buildStockCard(ticker);
    list.appendChild(card);
  }

  const priceEl  = card.querySelector('.stock-price');
  const changeEl = card.querySelector('.stock-change');

  // HK tickers: replace the numeric code with the company name once we have it
  if (data?.shortName && isHKTicker(ticker)) {
    const tickerEl = card.querySelector('.stock-ticker');
    tickerEl.textContent = data.shortName;
    tickerEl.classList.add('company-name');
  }

  if (!data) {
    priceEl.textContent  = '—';
    changeEl.textContent = '—';
    changeEl.className   = 'stock-change neutral';
    return;
  }

  priceEl.textContent  = formatPrice(data.price);
  changeEl.textContent = formatChange(data.change);
  changeEl.className   = 'stock-change ' + (
    data.change == null ? 'neutral' :
    data.change >  0    ? 'positive' : 'negative'
  );
}

// ─── Ticker add/remove ─────────────────────────────────────────────────────────

async function addTicker(raw) {
  const ticker  = normalizeTicker(raw);
  if (!ticker)  return;

  const list = await loadSavedTickers();
  if (list.includes(ticker)) return;    // already tracked

  list.push(ticker);
  await saveTickerList(list);

  upsertCard(ticker, null);
  const data = await fetchStockQuote(ticker);
  upsertCard(ticker, data);
}

async function removeTicker(ticker) {
  const list = await loadSavedTickers();
  const updated = list.filter(t => t !== ticker);
  await saveTickerList(updated);

  const card = document.getElementById('stock-list')
    .querySelector(`[data-ticker="${CSS.escape(ticker)}"]`);
  card?.remove();
}

async function refreshAllTickers() {
  const list = await loadSavedTickers();
  await Promise.all(list.map(async ticker => {
    const data = await fetchStockQuote(ticker);
    upsertCard(ticker, data);
  }));
}

// ─── Note helpers ──────────────────────────────────────────────────────────────

async function loadNoteHtml() {
  const { noteContent } = await chrome.storage.local.get(NOTE_KEY);
  return noteContent || null;
}

async function _saveNote() {
  const editor = document.getElementById('note-editor');
  // Sync checkbox checked state → HTML attribute so innerHTML serialises correctly
  editor.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    if (cb.checked) cb.setAttribute('checked', '');
    else            cb.removeAttribute('checked');
  });
  await chrome.storage.local.set({ [NOTE_KEY]: editor.innerHTML });
}

const debouncedSaveNote = debounce(_saveNote, 600);

// Returns the block-level div the cursor is currently in
function getCaretBlock() {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  let node = sel.getRangeAt(0).startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  const editor = document.getElementById('note-editor');
  while (node && node.parentElement !== editor) node = node.parentElement;
  return (node instanceof HTMLElement && node !== editor) ? node : null;
}

// Called from 'input' event after Space has already been inserted by the browser.
// If the block text (trimmed) is exactly a markdown prefix, convert it.
function tryConvertMarkdown() {
  const block = getCaretBlock();
  if (!block || block.classList.contains('note-todo')) return;
  // Skip blocks already carrying a markdown class (already converted)
  if (['note-h1','note-h2','note-h3','note-h4','note-bullet']
        .some(c => block.classList.contains(c))) return;

  const raw     = block.textContent;
  const trimmed = raw.trim();

  // Only act when the last inserted character was a Space
  if (!raw.endsWith(' ') && !raw.endsWith('\u00A0')) return;

  // /todo + Space → immediate checkbox, no "todo" text visible
  if (/^\/todo$/i.test(trimmed)) {
    convertToTodo(block);
    return;
  }

  // Heading / bullet prefix + Space → styled empty block
  let cls = null;
  if      (trimmed === '####') cls = 'note-h4';
  else if (trimmed === '###')  cls = 'note-h3';
  else if (trimmed === '##')   cls = 'note-h2';
  else if (trimmed === '#')    cls = 'note-h1';
  else if (trimmed === '-')    cls = 'note-bullet';
  if (!cls) return;

  block.className = cls;
  block.innerHTML = '<br>';
  const range = document.createRange();
  range.setStart(block, 0);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}

// Backspace on an empty markdown block → reset to plain body text
function tryResetMarkdown(e) {
  const block = getCaretBlock();
  if (!block) return;
  if (!['note-h1','note-h2','note-h3','note-h4','note-bullet']
        .some(c => block.classList.contains(c))) return;
  if (block.textContent.trim()) return; // still has content → normal backspace

  e.preventDefault();
  block.className = '';
  block.innerHTML = '<br>';
  const range = document.createRange();
  range.setStart(block, 0);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  debouncedSaveNote();
}

function attachTodoListener(wrap) {
  const cb = wrap.querySelector('input[type="checkbox"]');
  if (!cb) return;
  cb.addEventListener('change', () => {
    wrap.classList.toggle('note-done', cb.checked);
    debouncedSaveNote();
  });
}

// Replace a /todo line with a checkbox; cursor lands inside the span for typing
function convertToTodo(block) {
  const preText = block.textContent.replace(/^\/todo\s*/i, '').trim();

  const wrap = document.createElement('div');
  wrap.className = 'note-todo';
  const cb   = document.createElement('input');
  cb.type    = 'checkbox';
  const span = document.createElement('span');
  // createTextNode ensures an empty text node exists so cursor always lands in span
  span.appendChild(document.createTextNode(preText));
  wrap.append(cb, span);
  attachTodoListener(wrap);

  block.replaceWith(wrap);

  // Cursor at end of any pre-existing text (or start of empty span)
  const range = document.createRange();
  const textNode = span.firstChild;
  range.setStart(textNode, textNode.length);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function initNoteEditor(editor) {
  // Seed block structure so line-level styling works from the first keystroke
  if (!editor.childElementCount) editor.innerHTML = '<div><br></div>';

  // Track IME composition (Chinese, Japanese, Korean input methods).
  // During composition we must not intercept Space or Enter.
  let _composing = false;
  editor.addEventListener('compositionstart', () => { _composing = true;  });
  editor.addEventListener('compositionend',   () => { _composing = false; });

  // input fires AFTER the character is in the DOM — reliable for Space detection
  editor.addEventListener('input', () => {
    if (!_composing) tryConvertMarkdown();
    debouncedSaveNote();
  });

  editor.addEventListener('keydown', e => {
    // Never intercept keys while IME is composing
    if (e.isComposing || _composing) return;

    // Backspace on empty markdown block → strip back to plain text
    if (e.key === 'Backspace') {
      tryResetMarkdown(e);
      return;
    }
    if (e.key !== 'Enter') return;

    const block = getCaretBlock();
    if (!block) return;

    // /todo + Enter → checkbox (handles '/todo 买牛奶' + Enter too)
    if (/^\/todo(\s|$)/i.test(block.textContent.trim())) {
      e.preventDefault();
      convertToTodo(block);
      debouncedSaveNote();
      return;
    }

    // Heading → next line should be normal text (strip class after browser creates div)
    if (['note-h1','note-h2','note-h3','note-h4'].some(c => block.classList.contains(c))) {
      setTimeout(() => {
        const newBlock = getCaretBlock();
        if (newBlock && newBlock !== block) {
          newBlock.classList.remove('note-h1', 'note-h2', 'note-h3', 'note-h4');
        }
      }, 0);
    }
  });
}

// ─── Widget init (stock + note) ────────────────────────────────────────────────

async function initWidget() {
  // ── Stocks ────────────────────────────────────────────────────────────────
  const savedTickers = await loadSavedTickers();
  savedTickers.forEach(t => upsertCard(t, null));
  if (savedTickers.length) refreshAllTickers();
  setInterval(refreshAllTickers, 60_000);

  // ── Note ──────────────────────────────────────────────────────────────────
  const notePad   = document.getElementById('note-pad');
  const editor    = document.getElementById('note-editor');
  const savedNote = await loadNoteHtml();

  if (savedNote) {
    editor.innerHTML = savedNote;
    notePad.classList.remove('hidden');
    editor.querySelectorAll('.note-todo').forEach(attachTodoListener);
  }
  initNoteEditor(editor);

  // − Minimize button — collapse to toolbar only / expand back
  const minimizeBtn = document.getElementById('note-minimize');
  minimizeBtn.addEventListener('click', () => {
    const isNowMinimized = notePad.classList.toggle('minimized');
    minimizeBtn.textContent = isNowMinimized ? '+' : '−';
  });

  // × Close button — hides the pad AND clears content from storage
  document.getElementById('note-close').addEventListener('click', () => {
    editor.innerHTML = '<div><br></div>';
    chrome.storage.local.remove(NOTE_KEY);
    notePad.classList.add('hidden');
    notePad.classList.remove('minimized');
    minimizeBtn.textContent = '−';
  });

  // ⌫ Erase button — clears content but keeps the pad open
  document.getElementById('note-erase').addEventListener('click', () => {
    editor.innerHTML = '<div><br></div>';
    chrome.storage.local.remove(NOTE_KEY);
    editor.focus();
  });

  // ── UI refs ───────────────────────────────────────────────────────────────
  const addBtn    = document.getElementById('stock-add-btn');
  const addMenu   = document.getElementById('add-menu');
  const inputWrap = document.getElementById('stock-input-wrap');
  const input     = document.getElementById('stock-input');

  function closeAll() {
    addMenu.classList.add('hidden');
    inputWrap.classList.add('hidden');
    addBtn.classList.remove('hidden');
  }

  // "+" → show menu
  addBtn.addEventListener('click', e => {
    e.stopPropagation();
    addBtn.classList.add('hidden');
    addMenu.classList.remove('hidden');
  });

  // Menu: Stock
  document.getElementById('menu-stock').addEventListener('click', () => {
    addMenu.classList.add('hidden');
    inputWrap.classList.remove('hidden');
    input.value = '';
    input.focus();
  });

  // Menu: Note — show/expand the pad and focus editor
  document.getElementById('menu-note').addEventListener('click', () => {
    addMenu.classList.add('hidden');
    addBtn.classList.remove('hidden');
    notePad.classList.remove('hidden');
    notePad.classList.remove('minimized');
    minimizeBtn.textContent = '−';
    editor.focus();
    // Place cursor at end of existing content
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });

  // Stock input: Enter to add, Escape to cancel
  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const raw = input.value.trim();
      closeAll();
      if (raw) await addTicker(raw);
    }
    if (e.key === 'Escape') closeAll();
  });

  // Click outside panel → close menu/input (note pad stays open)
  document.addEventListener('click', e => {
    const panel = document.getElementById('stock-panel');
    if (!panel.contains(e.target)) closeAll();
  });
}
