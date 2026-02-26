// =============================================================================
//  Daily Impressionist Pro — Unit Tests
//  Run with: node test.js
// =============================================================================

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓  ${message}`);
    passed++;
  } else {
    console.error(`  ✗  ${message}`);
    failed++;
  }
}

function test(name, fn) {
  console.log(`\n${name}`);
  try { fn(); } catch (e) { console.error(`  ✗  threw: ${e.message}`); failed++; }
}

// ── Paste the pure functions under test (must stay in sync with script.js) ──

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

function formatPrice(price) {
  if (price == null) return '—';
  return price >= 100 ? price.toFixed(2) : price.toFixed(3);
}

function formatChange(change) {
  if (change == null) return '—';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

function inImpressionistEra(raw) {
  if (!raw) return true;
  const m = String(raw).match(/\d{4}/);
  if (!m) return true;
  const y = +m[0];
  return y >= 1860 && y <= 1910;
}

const IMPRESSIONISTS = [
  'Monet', 'Renoir', 'Pissarro', 'Sisley', 'Degas',
  'Morisot', 'Cassatt', 'Caillebotte', 'Manet', 'Bazille',
  'Guillaumin', 'Cézanne', 'Gauguin', 'van Gogh', 'Seurat',
  'Signac', 'Toulouse-Lautrec', 'Redon', 'Rousseau', 'Bonnard',
  'Vuillard', 'Gonzalès', 'Bracquemond', 'Jongkind', 'Boudin',
  'Fantin-Latour', 'Lepine', 'Hassam', 'Sargent', 'Chase',
  'Twachtman', 'Metcalf', 'Tarbell', 'Benson', 'Dewis',
  'Vonnoh', 'Sorolla',
];

const stripHtml = s => String(s ?? '').replace(/<[^>]*>/g, '').trim();

function matchesArtist(str) {
  const lower = stripHtml(str).toLowerCase();
  return IMPRESSIONISTS.some(a => lower.includes(a.toLowerCase()));
}

// Yahoo Finance v8 chart response parser (must match fetchViaYahoo in script.js)
function parseYahooV8(ticker, json) {
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const price     = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose;
  if (price == null) return null;
  const change    = prevClose != null ? ((price - prevClose) / prevClose) * 100 : null;
  const timestamp = meta.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  return { ticker, price, change, timestamp };
}


// =============================================================================
//  Tests
// =============================================================================

test('isHKTicker — positive cases', () => {
  assert(isHKTicker('0700'),     '0700 is HK');
  assert(isHKTicker('0700.HK'), '0700.HK is HK');
  assert(isHKTicker('700'),     '700 is HK (leading-zero-less)');
  assert(isHKTicker('9988'),    '9988 is HK');
  assert(isHKTicker('9988.hk'), '9988.hk is HK (lowercase)');
  assert(isHKTicker('1'),       '1-digit is HK');
  assert(isHKTicker('12345'),   '5-digit is HK (max)');
});

test('isHKTicker — negative cases', () => {
  assert(!isHKTicker('NVDA'),   'NVDA is not HK');
  assert(!isHKTicker('AAPL'),   'AAPL is not HK');
  assert(!isHKTicker(''),       'empty string is not HK');
  assert(!isHKTicker('123456'), '6-digit is not HK (too long)');
  assert(!isHKTicker('0700.US'),'0700.US is not HK');
  assert(!isHKTicker('abc'),    'letters are not HK');
});

test('normalizeHkTicker', () => {
  assert(normalizeHkTicker('700')     === '0700.HK', '700 → 0700.HK');
  assert(normalizeHkTicker('0700')    === '0700.HK', '0700 → 0700.HK');
  assert(normalizeHkTicker('0700.HK') === '0700.HK', '0700.HK → 0700.HK (idempotent)');
  assert(normalizeHkTicker('9988')    === '9988.HK', '9988 → 9988.HK');
  assert(normalizeHkTicker('1')       === '0001.HK', '1 → 0001.HK');
  assert(normalizeHkTicker('0')       === '0000.HK', '0 → 0000.HK (edge)');
  assert(normalizeHkTicker('9988.hk') === '9988.HK', 'lowercase .hk is normalized');
});

test('normalizeTicker', () => {
  assert(normalizeTicker('nvda')    === 'NVDA',    'nvda → NVDA');
  assert(normalizeTicker('AAPL')   === 'AAPL',    'AAPL → AAPL');
  assert(normalizeTicker(' tsla ') === 'TSLA',    'trims whitespace');
  assert(normalizeTicker('700')    === '0700.HK', '700 → 0700.HK');
  assert(normalizeTicker('0700.HK')=== '0700.HK', '0700.HK → 0700.HK');
  assert(normalizeTicker('')       === '',         'empty → empty');
});

test('formatPrice', () => {
  assert(formatPrice(null)   === '—',       'null → —');
  assert(formatPrice(undefined) === '—',    'undefined → —');
  assert(formatPrice(875.39) === '875.39',  '875.39 → 875.39 (2dp)');
  assert(formatPrice(100)    === '100.00',  '100 → 100.00 (boundary)');
  assert(formatPrice(99.9)   === '99.900',  '99.9 → 99.900 (3dp)');
  assert(formatPrice(0.5)    === '0.500',   '0.5 → 0.500');
  assert(formatPrice(1200)   === '1200.00', '1200 → 1200.00');
});

test('formatChange', () => {
  assert(formatChange(null)  === '—',        'null → —');
  assert(formatChange(2.34)  === '+2.34%',   'positive gets + sign');
  assert(formatChange(-1.5)  === '-1.50%',   'negative gets - sign');
  assert(formatChange(0)     === '+0.00%',   'zero gets + sign');
  assert(formatChange(0.001) === '+0.00%',   'tiny positive rounds to +0.00%');
  assert(formatChange(100)   === '+100.00%', 'large % works');
});

test('inImpressionistEra', () => {
  assert(inImpressionistEra('1860')       === true,  '1860 in era (lower bound)');
  assert(inImpressionistEra('1910')       === true,  '1910 in era (upper bound)');
  assert(inImpressionistEra('1885')       === true,  '1885 in era');
  assert(inImpressionistEra('1859')       === false, '1859 before era');
  assert(inImpressionistEra('1911')       === false, '1911 after era');
  assert(inImpressionistEra(null)         === true,  'null → keep (unknown date)');
  assert(inImpressionistEra('')           === true,  'empty → keep');
  assert(inImpressionistEra('circa 1885') === true,  '"circa 1885" extracts year');
  assert(inImpressionistEra('c. 1900-05') === true,  '"c. 1900-05" extracts 1900');
  assert(inImpressionistEra('no date')    === true,  'unparseable → keep');
  assert(inImpressionistEra('1750')       === false, '1750 too early');
});

test('matchesArtist', () => {
  assert(matchesArtist('Claude Monet (French, 1840–1926)') === true,  'Monet matches');
  assert(matchesArtist('Pierre-Auguste Renoir')            === true,  'Renoir matches');
  assert(matchesArtist('Vincent van Gogh')                 === true,  'van Gogh matches');
  assert(matchesArtist('Paul Cézanne')                     === true,  'Cézanne matches');
  assert(matchesArtist('Pablo Picasso')                    === false, 'Picasso not in list');
  assert(matchesArtist('Rembrandt van Rijn')               === false, 'Rembrandt not in list');
  assert(matchesArtist('')                                 === false, 'empty string → false');
  assert(matchesArtist('<b>Monet</b>')                     === true,  'strips HTML before matching');
});

test('parseYahooV8 — correct response shape', () => {
  const json = {
    chart: {
      result: [{
        meta: {
          regularMarketPrice: 875.39,
          chartPreviousClose: 850.00,
          regularMarketTime: 1700000000,
        }
      }],
      error: null,
    }
  };
  const result = parseYahooV8('NVDA', json);
  assert(result !== null,            'result is not null');
  assert(result.ticker === 'NVDA',   'ticker preserved');
  assert(result.price  === 875.39,   'price correct');
  // change = (875.39 - 850) / 850 * 100 = 2.987...
  assert(Math.abs(result.change - 2.987) < 0.01, 'change% calculated correctly');
  assert(typeof result.timestamp === 'string',    'timestamp is string');
});

test('parseYahooV8 — missing/error response', () => {
  assert(parseYahooV8('NVDA', null)                   === null, 'null json → null');
  assert(parseYahooV8('NVDA', {})                     === null, 'empty object → null');
  assert(parseYahooV8('NVDA', { chart: { error: 'Not found', result: null } }) === null,
    'error response → null');
  assert(parseYahooV8('NVDA', { chart: { result: [{ meta: {} }] } }) === null,
    'missing price → null');
});

test('parseYahooV8 — no prevClose (new listing)', () => {
  const json = {
    chart: {
      result: [{ meta: { regularMarketPrice: 50.00, regularMarketTime: 1700000000 } }],
      error: null,
    }
  };
  const result = parseYahooV8('NEW', json);
  assert(result !== null,         'still returns a result');
  assert(result.price === 50.00,  'price correct');
  assert(result.change === null,  'change is null when no prevClose');
  assert(formatChange(result.change) === '—', 'formatChange handles null change');
});


// =============================================================================
//  Note widget helpers (pure logic extracted from script.js)
// =============================================================================

function classForLine(text) {
  // Check longer prefixes first — '### ' would falsely match '# ' otherwise
  if (text.startsWith('#### ')) return 'note-h4';
  if (text.startsWith('### '))  return 'note-h3';
  if (text.startsWith('## '))   return 'note-h2';
  if (text.startsWith('# '))    return 'note-h1';
  if (text.startsWith('- '))    return 'note-bullet';
  return '';
}

function isTodoLine(text) {
  return /^\/todo(\s|$)/i.test(text.trim());
}

function extractTodoText(raw) {
  return raw.replace(/^\/todo\s*/i, '').trim();
}

test('classForLine (note markdown)', () => {
  assert(classForLine('# Hello')      === 'note-h1',     '# → h1');
  assert(classForLine('## World')     === 'note-h2',     '## → h2');
  assert(classForLine('### Section')  === 'note-h3',     '### → h3');
  assert(classForLine('#### Sub')     === 'note-h4',     '#### → h4');
  assert(classForLine('- item')       === 'note-bullet', '- → bullet');
  assert(classForLine('normal')       === '',             'plain → no class');
  assert(classForLine('#nospace')     === '',             '#nospace → not a heading (no space)');
  assert(classForLine('##nospace')    === '',             '##nospace → not h2');
  assert(classForLine('###nospace')   === '',             '###nospace → not h3');
  assert(classForLine('## ')          === 'note-h2',     '## alone → h2');
  assert(classForLine('### ')         === 'note-h3',     '### alone → h3');
  assert(classForLine('#### ')        === 'note-h4',     '#### alone → h4');
  assert(classForLine('- ')           === 'note-bullet', '- alone → bullet');
  assert(classForLine('  # indent')   === '',             'indented # → not heading');
  // Prefix ordering: ### must not match # or ##
  assert(classForLine('### Title')    === 'note-h3',     '### not confused with #');
  assert(classForLine('#### Title')   === 'note-h4',     '#### not confused with ##');
});

test('isTodoLine', () => {
  assert(isTodoLine('/todo task')    === true,  '/todo with text');
  assert(isTodoLine('/todo')         === true,  '/todo alone');
  assert(isTodoLine('/TODO Task')    === true,  'case insensitive');
  assert(isTodoLine('/todo  spaces') === true,  '/todo with extra space');
  assert(isTodoLine('  /todo task')  === true,  'leading whitespace trimmed');
  assert(isTodoLine('do something')  === false, 'regular text');
  assert(isTodoLine('todo task')     === false, 'missing slash');
  assert(isTodoLine('/todox')        === false, '/todox not a todo command');
  assert(isTodoLine('')              === false, 'empty string');
});

test('extractTodoText', () => {
  assert(extractTodoText('/todo buy milk')  === 'buy milk', 'extracts text');
  assert(extractTodoText('/todo  spaced')   === 'spaced',   'trims extra space');
  assert(extractTodoText('/todo')           === '',         'empty todo');
  assert(extractTodoText('/TODO Call mom')  === 'Call mom', 'case insensitive');
});

// =============================================================================
//  Summary
// =============================================================================

console.log(`\n${'─'.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
