// Чистые функции калькулятора: разбор и форматирование чисел, расчёт цепочки конвертаций.
// Без DOM — используется и страницей (window.Calc), и тестами (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Принимает "10 000 000", "1,0314", "1.0314"
  function parseNum(str) {
    const s = String(str ?? '').replace(/[\s ]/g, '').replace(',', '.');
    if (s === '' || !/^-?\d*\.?\d*$/.test(s) || s === '.' || s === '-') return NaN;
    return parseFloat(s);
  }

  // Точное округление до d знаков (без ошибок плавающей точки вида 1.005 → 1.00)
  function roundTo(x, d) {
    if (!isFinite(x)) return x;
    const s = String(x);
    if (s.includes('e')) { const f = 10 ** d; return Math.round(x * f) / f; }
    return Number(Math.round(Number(s + 'e' + d)) + 'e-' + d);
  }

  // "001000000,5" → "1 000 000,5": лишние символы и ведущие нули убираются, остаётся один десятичный знак
  function groupDigits(value) {
    const raw = String(value ?? '').replace(/[^\d.,]/g, '');
    const sep = raw.search(/[.,]/);
    const int = (sep < 0 ? raw : raw.slice(0, sep)).replace(/^0+(?=\d)/, '');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return sep < 0 ? grouped : grouped + raw[sep] + raw.slice(sep + 1).replace(/[.,]/g, '');
  }

  // 1 ÷ курс с 10 значащими цифрами: при обратном перевороте получается исходное число
  const invertRate = x => Number((1 / x).toPrecision(10))
    .toLocaleString('ru-RU', { useGrouping: false, maximumFractionDigits: 15 });

  const hasAdjacentDuplicates = currencies => currencies.some((c, i) => i && c && c === currencies[i - 1]);

  // Расчёт цепочки. state = { volume, currencies: [A, B, C…], legs: [{ rs, rc, inverse }…] },
  // decOf(code) — знаков после запятой для валюты.
  // Каждый этап: сумма_в_следующей_валюте = сумма × курс (или ÷ курс, если котировка обратная).
  // Поставщик и клиент считаются по своим курсам независимо, прибыль — разница в итоговой валюте.
  function computeChain(state, decOf) {
    const { currencies, legs } = state;
    const volume = parseNum(state.volume);
    const steps = [];
    const base = isFinite(volume) && volume > 0 && !hasAdjacentDuplicates(currencies);
    // Один участник может быть уже посчитан, пока у другого нет курса
    let sup = base ? volume : null, cli = base ? volume : null;
    const conv = (x, leg, rate) => leg.inverse ? x / rate : x * rate;
    legs.forEach((leg, i) => {
      const rs = parseNum(leg.rs), rc = parseNum(leg.rc);
      const d = decOf(currencies[i + 1]);
      // Прибыль этапа: сумму клиента на входе этапа меняем по курсу поставщика и по курсу клиента,
      // разница — заработок именно на этом этапе (в валюте этапа)
      const legProfit = cli != null && rs > 0 && rc > 0
        ? roundTo(conv(cli, leg, rs) - conv(cli, leg, rc), d) : null;
      sup = sup != null && rs > 0 ? roundTo(conv(sup, leg, rs), d) : null;
      cli = cli != null && rc > 0 ? roundTo(conv(cli, leg, rc), d) : null;
      steps.push({ sup, cli, rs, rc, profit: legProfit });
    });
    // Прибыль этапа в итоговой валюте — через курсы поставщика следующих этапов.
    // Сумма по этапам равна итоговой прибыли (разница курсов раскладывается по этапам без остатка).
    const end = currencies[currencies.length - 1];
    steps.forEach((st, i) => {
      let v = st.profit;
      for (let j = i + 1; j < legs.length && v != null; j++) {
        v = steps[j].rs > 0 ? conv(v, legs[j], steps[j].rs) : null;
      }
      st.profitFinal = v != null ? roundTo(v, decOf(end)) : null;
    });
    const ok = sup != null && cli != null;
    return {
      ok, steps, volume, supplier: sup, client: cli,
      profit: ok ? roundTo(sup - cli, decOf(end)) : null,
    };
  }

  return { parseNum, roundTo, groupDigits, invertRate, hasAdjacentDuplicates, computeChain };
});
