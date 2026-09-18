const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../lib/calc');

const dec2 = () => 2;

test('parseNum: пробелы, запятая, точка, мусор', () => {
  assert.equal(Calc.parseNum('10 000 000'), 1e7);
  assert.equal(Calc.parseNum('1,0314'), 1.0314);
  assert.equal(Calc.parseNum('1.0314'), 1.0314);
  assert.equal(Calc.parseNum('1 000'), 1000);
  assert.ok(Number.isNaN(Calc.parseNum('')));
  assert.ok(Number.isNaN(Calc.parseNum('abc')));
  assert.ok(Number.isNaN(Calc.parseNum(',')));
});

test('roundTo: без ошибок плавающей точки', () => {
  assert.equal(Calc.roundTo(1.005, 2), 1.01);
  assert.equal(Calc.roundTo(0.123456789, 8), 0.12345679);
  assert.equal(Calc.roundTo(1e7 * 1.0314, 2), 10314000);
  assert.equal(Calc.roundTo(1e-7, 8), 1e-7);
});

test('groupDigits: разряды пробелами, ведущие нули, один разделитель', () => {
  assert.equal(Calc.groupDigits('100000000'), '100 000 000');
  assert.equal(Calc.groupDigits('001000000,5'), '1 000 000,5');
  assert.equal(Calc.groupDigits('60000,12345'), '60 000,12345');
  assert.equal(Calc.groupDigits('60000,123,45a'), '60 000,12345');
  assert.equal(Calc.groupDigits('0,975'), '0,975');
  assert.equal(Calc.groupDigits(''), '');
});

test('invertRate: обратный переворот возвращает исходное число', () => {
  const inv = Calc.parseNum(Calc.invertRate(1.0314));
  assert.equal(Calc.parseNum(Calc.invertRate(inv)), 1.0314);
});

test('computeChain: один этап RUB → KGS', () => {
  const r = Calc.computeChain({ volume: '10 000 000', currencies: ['RUB', 'KGS'], legs: [{ rs: '1,0314', rc: '1,025', inverse: false }] }, dec2);
  assert.equal(r.ok, true);
  assert.equal(r.supplier, 10314000);
  assert.equal(r.client, 10250000);
  assert.equal(r.profit, 64000);
  assert.equal(r.steps[0].profit, 64000);
});

test('computeChain: обратная котировка делит', () => {
  const r = Calc.computeChain({ volume: '1 000 000', currencies: ['KGS', 'RUB'], legs: [{ rs: '1,06', rc: '', inverse: true }] }, dec2);
  assert.equal(r.ok, false);
  assert.equal(r.supplier, 943396.23);
  assert.equal(r.client, null);
  assert.equal(r.profit, null);
});

test('computeChain: сумма прибыли по этапам равна итоговой', () => {
  const r = Calc.computeChain({
    volume: '1 300 000', currencies: ['KGS', 'RUB', 'USDT'],
    legs: [{ rs: '1,3', rc: '1,4', inverse: true }, { rs: '85', rc: '86', inverse: true }],
  }, dec2);
  assert.equal(r.profit, 967.37);
  assert.equal(r.steps[0].profit, 71428.57);
  assert.equal(r.steps[0].profitFinal, 840.34);
  assert.equal(r.steps[1].profit, 127.03);
  assert.equal(r.steps[1].profitFinal, 127.03);
  assert.equal(Calc.roundTo(r.steps[0].profitFinal + r.steps[1].profitFinal, 2), r.profit);
});

test('computeChain: соседние одинаковые валюты — расчёта нет', () => {
  assert.equal(Calc.hasAdjacentDuplicates(['RUB', 'RUB']), true);
  assert.equal(Calc.hasAdjacentDuplicates(['RUB', 'USDT', 'RUB']), false);
  const r = Calc.computeChain({ volume: '100', currencies: ['RUB', 'RUB'], legs: [{ rs: '1', rc: '1', inverse: false }] }, dec2);
  assert.equal(r.ok, false);
  assert.equal(r.supplier, null);
});
