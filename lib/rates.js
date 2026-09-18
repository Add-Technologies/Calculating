// Сбор курсов: valuta.kg (НБКР, банки и обменки)
// и USDT/RUB с криптобирж. Каждый источник независим: ошибка одного не ломает остальные.
//
//   node lib/rates.js            → печатает JSON
//   node lib/rates.js rates.json → сохраняет в файл

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const TIMEOUT_MS = 15000;

async function get(url, { json = false, headers = {}, method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    body,
    headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/html', ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return json ? res.json() : res.text();
}

const num = s => {
  const n = parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) && n > 0 ? n : null;
};

const decode = s => s
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

const stripTags = s => decode(s.replace(/<[^>]+>/g, ' '));

// ---------- valuta.kg ----------

async function fetchValutaHome() {
  return { members: parseValutaMembers(await get('https://valuta.kg/')) };
}

// Список банков и обменок с главной страницы valuta.kg
function parseValutaMembers(html) {
  // Список участников (без дублирующей карусели ниже)
  const listStart = html.indexOf('id="rate-list"');
  const listEnd = html.indexOf('id="rate-carousel"');
  const list = html.slice(listStart, listEnd > 0 ? listEnd : undefined);
  const thead = list.slice(0, list.indexOf('</thead>'));
  const cols = [...thead.matchAll(/class="rate-name[^"]*">([a-z]{3})</g)].map(m => m[1].toUpperCase());

  const members = list.split('<tr id="js-member-').slice(1).map(chunk => {
    const row = chunk.slice(0, chunk.indexOf('</tr>'));
    const link = row.match(/<h4>\s*<a href="([^"]+)">([\s\S]*?)<\/a>/);
    const typeCell = row.match(/class="min-width-80">([\s\S]*?)<\/span>\s*<span class="fa fa-phone|class="min-width-80">([\s\S]*?<\/span>[^<]*)/);
    const typeText = typeCell ? stripTags(typeCell[1] || typeCell[2]) : '';
    const type = typeText ? [null, /банк/i.test(typeText) && !/бюро/i.test(typeText) ? 'Банк' : /МФК|микро/i.test(typeText) ? 'МФК' : 'Обменка'] : null;
    const note = row.match(/class="extra pull-right">([^<]*)</);
    const timeCell = row.match(/class="td-date"[\s\S]*?<span class="text-(\w+)"[^>]*title="([^"]*)"/);
    const rates = {};
    row.split('<td class="td-rate').slice(1).forEach((cell, k) => {
      const code = cols[Math.floor(k / 2)];
      if (!code) return;
      const val = num((cell.match(/data-rate='([^']*)'/) || [])[1]);
      rates[code] ??= { buy: null, sell: null };
      rates[code][k % 2 ? 'sell' : 'buy'] = val;
    });
    const set = timeCell ? decode(timeCell[2].replace(/<br\s*\/?>/g, ' ')) : '';
    return {
      name: link ? decode(link[2]) : '?',
      url: link ? link[1] : null,
      type: type ? type[1] : '',
      note: note ? decode(note[1]) : '',
      updated: (set.match(/(\d{1,2}:\d{2}, \d{1,2}\.\d{1,2})/) || [])[1] || '',
      fresh: timeCell ? timeCell[1] === 'success' : false,
      rates,
    };
  });
  return members;
}

// ---------- НБКР: официальные XML нацбанка ----------
// daily.xml — ежедневные курсы USD, EUR, RUB, KZT, CNY; weekly.xml — еженедельные курсы остальных валют.
// https://www.nbkr.kg/index1.jsp?item=1562&lang=RUS

const NBKR_DAILY_ORDER = ['USD', 'EUR', 'RUB', 'KZT', 'CNY'];

async function getNbkrXml(name) {
  const res = await fetch(`https://www.nbkr.kg/XML/${name}.xml`, {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${name}.xml: HTTP ${res.status}`);
  return parseNbkrXml(new TextDecoder('windows-1251').decode(await res.arrayBuffer()));
}

function parseNbkrXml(xml) {
  const date = (xml.match(/<CurrencyRates[^>]*Date="([^"]+)"/) || [])[1] || null;
  const rates = [...xml.matchAll(/<Currency ISOCode="([A-Z]{3})">([\s\S]*?)<\/Currency>/g)].map(m => ({
    code: m[1],
    nominal: Number((m[2].match(/<Nominal>(\d+)<\/Nominal>/) || [])[1] || 1),
    rate: num((m[2].match(/<Value>([\d.,]+)<\/Value>/) || [])[1]),
  })).filter(r => r.rate);
  return { date, rates };
}

// Сайт нацбанка иногда рвёт соединение — одна повторная попытка
const withRetry = async fn => { try { return await fn(); } catch { await new Promise(r => setTimeout(r, 800)); return fn(); } };

async function fetchNbkr() {
  const [daily, weekly] = await Promise.allSettled([
    withRetry(() => getNbkrXml('daily')), withRetry(() => getNbkrXml('weekly')),
  ]);
  if (daily.status === 'rejected' && weekly.status === 'rejected') throw daily.reason;
  const d = daily.status === 'fulfilled' ? daily.value : { date: null, rates: [] };
  const w = weekly.status === 'fulfilled' ? weekly.value : { date: null, rates: [] };
  const rank = code => { const i = NBKR_DAILY_ORDER.indexOf(code); return i < 0 ? 99 : i; };
  const dailyCodes = new Set(d.rates.map(r => r.code));
  const why = r => r.status === 'rejected' ? `${r.reason?.message}${r.reason?.cause?.code ? ` (${r.reason.cause.code})` : ''}` : undefined;
  return {
    date: d.date,
    weeklyDate: w.date,
    dailyError: why(daily),
    weeklyError: why(weekly),
    rates: [
      ...d.rates.sort((a, b) => rank(a.code) - rank(b.code)).map(r => ({ ...r, weekly: false })),
      ...w.rates.filter(r => !dailyCodes.has(r.code)).sort((a, b) => a.code.localeCompare(b.code)).map(r => ({ ...r, weekly: true })),
    ],
  };
}

// ---------- Криптобиржи: USDT/RUB ----------
// bid — по этой цене биржа покупает USDT (вы продаёте), ask — продаёт (вы покупаете). RUB за 1 USDT.

const EXCHANGES = [
  {
    name: 'Rapira',
    url: 'https://rapira.net/ru/',
    async fetch() {
      const data = await get('https://api.rapira.net/open/market/rates', { json: true });
      const t = (data.data || []).find(x => x.symbol === 'USDT/RUB');
      if (!t) throw new Error('пара USDT/RUB не найдена');
      return { bid: num(t.bidPrice), ask: num(t.askPrice), last: num(t.close) };
    },
  },
  {
    name: 'ABCEX',
    url: 'https://abcex.io/ru/',
    async fetch() {
      // Тикер ABCEX путает bid/ask местами — берём вершину стакана
      const book = await get('https://hub.abcex.io/api/v2/exchange/public/orderbook/depth?instrumentCode=USDTRUB', { json: true });
      return bookTop(book.bid, book.ask);
    },
  },
  {
    name: 'Bitbanker',
    url: 'https://bitbanker.org/ru',
    note: 'пара USDT/RUBR',
    async fetch() {
      const markets = await get('https://api.bitbanker.org/latest/public/markets', { json: true });
      const market = markets.find(m => m.name === 'USDT/RUBR');
      if (!market) throw new Error('пара USDT/RUBR не найдена');
      const book = await get(`https://api.bitbanker.org/latest/public/orderbook?market=${market.id}&depth=5`, { json: true });
      return bookTop(book.bids, book.asks);
    },
  },
  {
    name: 'Bynex',
    url: 'https://bynex.io/',
    async fetch() {
      const book = await get('https://bynex.io/trading/ru/api/symbolOrderBook/pair/USDT-RUB', { json: true });
      return bookTop(book.bids, book.asks);
    },
  },
  {
    name: 'Tokenspot',
    url: 'https://tokenspot.com/ru/trade/spot/usdtrub',
    async fetch() {
      const data = await get('https://tokenspot.com/graphql', {
        json: true,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query T($id: ID!){ exchange { market(id: $id) { ticker { ask bid lastPrice } } } }',
          variables: { id: 'usdtrub' },
        }),
      });
      if (data.errors) throw new Error(data.errors[0]?.message || 'ошибка GraphQL');
      const t = data.data?.exchange?.market?.ticker;
      if (!t) throw new Error('пара USDT/RUB не найдена');
      return { bid: num(t.bid), ask: num(t.ask), last: num(t.lastPrice) };
    },
  },
];

// Лучшие цены стакана: порядок сортировки у бирж разный, поэтому max/min
function bookTop(bids = [], asks = []) {
  const prices = list => list.map(o => num(o.price)).filter(Boolean);
  const b = prices(bids), a = prices(asks);
  if (!b.length && !a.length) throw new Error('стакан пуст');
  return { bid: b.length ? Math.max(...b) : null, ask: a.length ? Math.min(...a) : null };
}

async function fetchCrypto() {
  return Promise.all(EXCHANGES.map(async ex => {
    try {
      return { name: ex.name, url: ex.url, note: ex.note, ...(await ex.fetch()) };
    } catch (e) {
      return { name: ex.name, url: ex.url, note: ex.note, error: e.message };
    }
  }));
}

// ---------- USD/RUB ----------

const INVESTING_TTL_MS = 3 * 60 * 1000; // браузер запускать не чаще раза в 3 минуты
let investingCache = null;

const USDRUB_SOURCES = [
  {
    name: 'ЦБ РФ',
    url: 'https://www.cbr.ru/currency_base/daily/',
    async fetch() {
      const res = await fetch('https://www.cbr.ru/scripts/XML_daily.asp', {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = new TextDecoder('windows-1251').decode(await res.arrayBuffer());
      const date = (xml.match(/<ValCurs Date="([^"]+)"/) || [])[1];
      const usd = xml.match(/<CharCode>USD<\/CharCode>\s*<Nominal>(\d+)<\/Nominal>[\s\S]*?<Value>([\d,]+)<\/Value>/);
      if (!usd) throw new Error('USD не найден');
      return { official: num(usd[2]) / Number(usd[1]), time: date ? `официальный на ${date}` : 'официальный' };
    },
  },
  {
    name: 'Profinance',
    url: 'https://www.profinance.ru/chart/usdrub/',
    async fetch() {
      const html = await get('https://www.profinance.ru/');
      const m = html.match(/href="\/chart\/usdrub\/">USD\/RUB<\/a><\/td><td>([\d.]+)<\/td><td>([\d.]+)<\/td><td>([^<]*)<\/td>/);
      if (!m) throw new Error('котировка USD/RUB не найдена');
      return { bid: num(m[1]), ask: num(m[2]), time: m[3] ? `${m[3]} МСК` : '' };
    },
  },
  {
    name: 'Investing.com',
    url: 'https://ru.investing.com/currencies/usd-rub',
    async fetch() {
      if (process.env.SKIP_BROWSER) throw new Error('пропущено: на сервере нет браузера');
      if (investingCache && Date.now() - investingCache.at < INVESTING_TTL_MS) return investingCache.data;
      const { evaluateInPage } = require('./browser');
      const raw = await evaluateInPage('https://ru.investing.com/currencies/usd-rub', `(() => {
        const nd = document.getElementById('__NEXT_DATA__');
        if (!nd) return null;
        const txt = nd.textContent;
        const bidding = txt.match(/"bidding":\\{"bid":([\\d.]+),"ask":([\\d.]+)\\}/);
        const i = txt.indexOf('"bidding"');
        const priceBlock = txt.slice(txt.lastIndexOf('"price":{', i), i);
        const last = priceBlock.match(/"last":([\\d.]+)/);
        const upd = priceBlock.match(/"lastUpdateTime":"(\\d+)"/);
        if (!bidding && !last) return null;
        return JSON.stringify({ bid: bidding?.[1], ask: bidding?.[2], last: last?.[1], updated: upd?.[1] });
      })()`);
      const d = JSON.parse(raw);
      const data = { bid: num(d.bid), ask: num(d.ask), last: num(d.last), updatedAt: d.updated ? Number(d.updated) : null };
      investingCache = { at: Date.now(), data };
      return data;
    },
  },
];

async function fetchUsdRub() {
  return Promise.all(USDRUB_SOURCES.map(async src => {
    try {
      return { name: src.name, url: src.url, ...(await src.fetch()) };
    } catch (e) {
      return { name: src.name, url: src.url, error: e.message };
    }
  }));
}

// ---------- Всё вместе ----------

const settle = async fn => { try { return await fn(); } catch (e) { return { error: e.message }; } };

async function fetchAllRates() {
  const [home, nbkr, crypto, usdrub] = await Promise.all([
    settle(fetchValutaHome), settle(fetchNbkr), fetchCrypto(), fetchUsdRub(),
  ]);
  return {
    updatedAt: new Date().toISOString(),
    nbkr,
    members: home.error ? { error: home.error } : home.members,
    crypto,
    usdrub,
  };
}

module.exports = { fetchAllRates, parseValutaMembers, parseNbkrXml };

if (require.main === module) {
  fetchAllRates().then(data => {
    const json = JSON.stringify(data, null, 2);
    const out = process.argv[2];
    if (out) require('fs').writeFileSync(out, json);
    else console.log(json);
  });
}
