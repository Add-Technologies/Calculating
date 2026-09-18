const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseNbkrXml, parseValutaMembers } = require('../lib/rates');
const { compactRates, appendHistory, historyFile } = require('../lib/history');

test('parseNbkrXml: дата, номинал, запятая в числе', () => {
  const xml = `<?xml version="1.0" encoding="windows-1251" ?>
<CurrencyRates Name="Daily Exchange Rates" Date="18.09.2026">
<Currency ISOCode="USD"><Nominal>1</Nominal><Value>87,4500</Value></Currency>
<Currency ISOCode="JPY"><Nominal>10</Nominal><ValidFor>7</ValidFor><Value>5,6749</Value></Currency>
</CurrencyRates>`;
  const r = parseNbkrXml(xml);
  assert.equal(r.date, '18.09.2026');
  assert.deepEqual(r.rates, [
    { code: 'USD', nominal: 1, rate: 87.45 },
    { code: 'JPY', nominal: 10, rate: 5.6749 },
  ]);
});

// Фрагмент главной страницы valuta.kg: заголовок таблицы с валютами и одна строка банка
const VALUTA_HTML = `
<div class="rate-list active" id="rate-list">
<table class="vl-list table"><thead><tr>
<th data-sorter="false">Название</th>
<th class="td-rate-head"><div class="td-relative"><div class="rate-name -with-icon -usd">usd</div></div><div class="th-inner">покупка</div></th>
<th class="td-rate-head"><div class="th-inner">продажа</div></th>
<th class="td-rate-head"><div class="td-relative"><div class="rate-name -with-icon -rub">rub</div></div><div class="th-inner">покупка</div></th>
<th class="td-rate-head"><div class="th-inner">продажа</div></th>
</tr></thead><tbody>
<tr id="js-member-bakaibank" class="js-member-bakaibank">
<td><div class="td-member"><div class="td-member__info"><h4>
<a href="https://valuta.kg/view/bakaibank.html">ОАО &quot;БАКАЙ БАНК&quot;</a>
<span class="extra pull-right">Наличный курс</span></h4>
<p><span class="min-width-80"><span class="fa fa-bank"></span> Банк</span>
<span class="fa fa-phone"></span> (312) 610061</p></div></div></td>
<td class="td-rate td-rate--even"><div class="td-rate__wrp">87.30<div class="td-rate__calc" data-rate-name="usd" data-rate='87.30'></div></div></td>
<td class="td-rate td-rate--even -last-in-group"><div class="td-rate__wrp">87.80<div class="td-rate__calc" data-rate-name="usd" data-rate='87.80'></div></div></td>
<td class="td-rate"><div class="td-rate__wrp">0.97<div class="td-rate__calc" data-rate-name="rub" data-rate='0.97'></div></div></td>
<td class="td-rate -last-in-group"><div class="td-rate__wrp">1.06<div class="td-rate__calc" data-rate-name="rub" data-rate='1.06'></div></div></td>
<td class="td-date" data-sort-value='09:10'><span class="text-success" title="Курс актуален.<br>Установлен в 09:10, 17.09.">18:35</span></td>
</tr>
<tr id="js-member-mcs" class="js-member-mcs">
<td><div class="td-member"><div class="td-member__info"><h4><a href="https://valuta.kg/view/mcs.html">MCS</a></h4>
<p><span class="min-width-80"><b>Обменное бюро</b></span></p></div></div></td>
<td class="td-rate td-rate--even"><div class="td-rate__wrp">87.50<div class="td-rate__calc" data-rate-name="usd" data-rate='87.50'></div></div></td>
<td class="td-rate td-rate--even -last-in-group"><div class="td-rate__wrp">87.80<div class="td-rate__calc" data-rate-name="usd" data-rate='87.80'></div></div></td>
<td class="td-rate"><div class="td-rate__wrp"><div class="td-rate__calc" data-rate-name="rub" data-rate=''></div></div></td>
<td class="td-rate -last-in-group"><div class="td-rate__wrp"><div class="td-rate__calc" data-rate-name="rub" data-rate=''></div></div></td>
<td class="td-date" data-sort-value='15:21'><span class="text-muted" title="Курс устарел.<br>Установлен в 15:21, 16.09.">15:21</span></td>
</tr>
</tbody></table></div>
<div class="rate-list " id="rate-carousel"><table><tr id="js-member-bakaibank"></tr></table></div>`;

test('parseValutaMembers: банк и обменка, курсы, свежесть', () => {
  const m = parseValutaMembers(VALUTA_HTML);
  assert.equal(m.length, 2);
  assert.equal(m[0].name, 'ОАО "БАКАЙ БАНК"');
  assert.equal(m[0].url, 'https://valuta.kg/view/bakaibank.html');
  assert.equal(m[0].type, 'Банк');
  assert.equal(m[0].note, 'Наличный курс');
  assert.equal(m[0].fresh, true);
  assert.equal(m[0].updated, '09:10, 17.09');
  assert.deepEqual(m[0].rates, { USD: { buy: 87.3, sell: 87.8 }, RUB: { buy: 0.97, sell: 1.06 } });
  assert.equal(m[1].type, 'Обменка');
  assert.equal(m[1].fresh, false);
  assert.deepEqual(m[1].rates.RUB, { buy: null, sell: null });
});

const SAMPLE = {
  updatedAt: '2026-09-18T08:00:00.000Z',
  crypto: [{ name: 'Rapira', bid: 87.95, ask: 87.96 }, { name: 'Bynex', error: 'fetch failed' }],
  usdrub: [{ name: 'ЦБ РФ', official: 84.17 }, { name: 'Profinance', bid: 84.3, ask: 84.4 }],
  nbkr: { rates: [{ code: 'USD', nominal: 1, rate: 87.45, weekly: false }, { code: 'JPY', nominal: 10, rate: 5.6, weekly: true }] },
  members: [{ name: 'Банк', url: 'u', rates: { USD: { buy: 87.3, sell: 87.8 }, KZT: { buy: null, sell: null } } }],
};

test('compactRates: только числа, ошибки и еженедельные не попадают', () => {
  const c = compactRates(SAMPLE);
  assert.deepEqual(c, {
    t: SAMPLE.updatedAt,
    usdt: { Rapira: [87.95, 87.96] },
    usd: { 'ЦБ РФ': [84.17], Profinance: [84.3, 84.4] },
    nbkr: { USD: 87.45 },
    banks: { 'Банк': { USD: [87.3, 87.8] } },
  });
});

test('appendHistory: файл по дате, без дублей', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hist-'));
  const first = appendHistory(root, SAMPLE);
  assert.equal(first.added, true);
  assert.equal(first.file, historyFile(root, SAMPLE.updatedAt));
  assert.match(first.file.replace(/\\/g, '/'), /history\/2026\/09\/18\.jsonl$/);
  assert.equal(appendHistory(root, SAMPLE).added, false);
  assert.equal(fs.readFileSync(first.file, 'utf8').trim().split('\n').length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});
