const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeRates, needsFallback, MAX_AGE_MS } = require('../lib/fallback');

const NOW = Date.parse('2026-09-18T10:31:00Z');
const iso = agoMs => new Date(NOW - agoMs).toISOString();

const live = () => ({
  updatedAt: iso(0),
  nbkr: { rates: [{ code: 'USD', rate: 87.45 }] },
  members: { error: 'valuta.kg: нет таблицы курсов (34 байт)' },
  crypto: [
    { name: 'Rapira', bid: 88.03, ask: 88.04 },
    { name: 'Bynex', url: 'https://bynex.io/', error: 'fetch failed (UND_ERR_CONNECT_TIMEOUT)' },
  ],
  usdrub: [{ name: 'Profinance', bid: 84.1, ask: 84.2, time: '13:30 МСК' }],
});

const site = (agoMs = 5 * 60 * 1000) => ({
  label: 'с сайта',
  data: {
    updatedAt: iso(agoMs),
    members: [{ name: 'ОАО "БАКАЙ БАНК"', rates: { RUB: { buy: 0.98, sell: 1 } } }],
    crypto: [{ name: 'Rapira', bid: 1, ask: 2 }, { name: 'Bynex', url: 'https://bynex.io/', bid: 88.24, ask: 90 }],
    usdrub: [{ name: 'Profinance', bid: 1, ask: 2 }],
  },
});

test('needsFallback: только когда что-то упало', () => {
  assert.equal(needsFallback(live()), true);
  assert.equal(needsFallback({ members: [{}], crypto: [{ name: 'a', bid: 1 }], usdrub: [] }), false);
  assert.equal(needsFallback({ members: [], crypto: [], usdrub: [] }), true, 'пустой список участников — тоже отсутствие');
});

test('подменяются только упавшие источники, живые остаются', () => {
  const out = mergeRates(live(), [site()], NOW);
  assert.equal(out.members.length, 1);
  assert.equal(out.crypto[0].bid, 88.03, 'Rapira живой — не трогаем');
  assert.equal(out.crypto[1].bid, 88.24);
  assert.equal(out.crypto[1].error, undefined);
  assert.match(out.crypto[1].note, /^с сайта, \d{2}:\d{2} МСК$/);
  assert.equal(out.usdrub[0].bid, 84.1);
  assert.deepEqual(out.fallback.map(f => f.what), ['members', 'Bynex']);
  assert.equal(out.updatedAt, live().updatedAt, 'время сбора — живое');
});

test('устаревший JSON не используется', () => {
  const out = mergeRates(live(), [site(MAX_AGE_MS + 1000)], NOW);
  assert.equal(out.members.error, live().members.error);
  assert.equal(out.crypto[1].error, live().crypto[1].error);
  assert.equal(out.fallback, undefined);
});

test('из нескольких JSON берётся самый свежий, где источник есть', () => {
  const computer = { label: 'с компьютера', data: { ...site(60 * 1000).data, crypto: [{ name: 'Bynex', bid: 77, ask: 78 }], members: [] } };
  const out = mergeRates(live(), [site(), computer], NOW);
  assert.equal(out.crypto[1].bid, 77, 'Bynex — из более свежего компьютера');
  assert.match(out.crypto[1].note, /^с компьютера/);
  assert.equal(out.members.length, 1, 'участников на компьютере нет — берём с сайта');
});

test('без упавших источников — объект не меняется', () => {
  const ok = { ...live(), members: [{}], crypto: [{ name: 'Bynex', bid: 1 }] };
  assert.equal(mergeRates(ok, [site()], NOW), ok);
});

test('битый или пустой JSON игнорируется', () => {
  const out = mergeRates(live(), [null, { label: 'x', data: {} }, { label: 'y', data: { updatedAt: 'garbage' } }], NOW);
  assert.equal(out.fallback, undefined);
});
