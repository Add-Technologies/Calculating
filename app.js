'use strict';
const $ = id => document.getElementById(id);

// ---- Общие помощники ----
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  children.forEach(c => node.append(c));
  return node;
};

const td = (content, props = {}) => el('td', props, [content]);

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

const DEALS_KEY = 'treasury-deals';
// Раньше форма сохранялась между открытиями — теперь старт всегда одинаковый
try { localStorage.removeItem('treasury-state'); } catch {}

// usd — примерная стоимость единицы в долларах. Нужна только чтобы
// по умолчанию выбрать привычное направление котировки (1 USD = 87 KGS, а не 1 KGS = 0,0115 USD).
const CURRENCIES = [
  { code: 'RUB',  name: 'Российский рубль',     usd: 0.0118,  dec: 2 },
  { code: 'KGS',  name: 'Кыргызский сом',       usd: 0.0114,  dec: 2 },
  { code: 'USD',  name: 'Доллар США',           usd: 1,       dec: 2 },
  { code: 'EUR',  name: 'Евро',                 usd: 1.1,     dec: 2 },
  { code: 'KZT',  name: 'Казахстанский тенге',  usd: 0.002,   dec: 2 },
  { code: 'UZS',  name: 'Узбекский сум',        usd: 0.00008, dec: 2 },
  { code: 'TJS',  name: 'Таджикский сомони',    usd: 0.09,    dec: 2 },
  { code: 'CNY',  name: 'Китайский юань',       usd: 0.14,    dec: 2 },
  { code: 'TRY',  name: 'Турецкая лира',        usd: 0.025,   dec: 2 },
  { code: 'AED',  name: 'Дирхам ОАЭ',           usd: 0.27,    dec: 2 },
  { code: 'GBP',  name: 'Фунт стерлингов',      usd: 1.3,     dec: 2 },
  { code: 'USDT', name: 'Tether',               usd: 1,       dec: 2, crypto: true },
  { code: 'USDC', name: 'USD Coin',             usd: 1,       dec: 2, crypto: true },
  { code: 'BTC',  name: 'Bitcoin',              usd: 60000,   dec: 8, crypto: true },
  { code: 'ETH',  name: 'Ethereum',             usd: 3000,    dec: 8, crypto: true },
  { code: 'BNB',  name: 'BNB',                  usd: 600,     dec: 8, crypto: true },
  { code: 'SOL',  name: 'Solana',               usd: 150,     dec: 8, crypto: true },
  { code: 'LTC',  name: 'Litecoin',             usd: 80,      dec: 8, crypto: true },
  { code: 'TON',  name: 'Toncoin',              usd: 3,       dec: 8, crypto: true },
  { code: 'XRP',  name: 'XRP',                  usd: 1,       dec: 6, crypto: true },
  { code: 'TRX',  name: 'TRON',                 usd: 0.15,    dec: 6, crypto: true },
];
// Валюты, добавленные пользователем
const CUSTOM_KEY = 'treasury-custom-currencies';
let customCurrencies = [];
try { customCurrencies = JSON.parse(localStorage.getItem(CUSTOM_KEY)) || []; } catch {}
const saveCustom = () => { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customCurrencies)); } catch {} };

let CUR = {};
const allCurrencies = () => [...CURRENCIES, ...customCurrencies];
const rebuildCur = () => { CUR = Object.fromEntries(allCurrencies().map(c => [c.code, c])); };
rebuildCur();

// Как валюта называется в пояснениях: «продаёт рубли за сомы»; для остальных — тикер
const PLURAL = {
  RUB: 'рубли', KGS: 'сомы', USD: 'доллары', EUR: 'евро', KZT: 'тенге', UZS: 'сумы', TJS: 'сомони',
  CNY: 'юани', TRY: 'лиры', AED: 'дирхамы', GBP: 'фунты',
};
const plOf = code => PLURAL[code] || code || '?';

// Незнакомый тикер считаем криптой: 8 знаков после запятой
const decOf = code => CUR[code] ? CUR[code].dec : 8;
const usdOf = code => CUR[code]?.usd ?? 1;
const defaultInverse = (from, to) => usdOf(to) > usdOf(from);

// ---- Выбор валюты ----
const picker = $('picker'), pickerSearch = $('pickerSearch'), pickerList = $('pickerList');
let pickerState = null; // { anchor, current, onPick, exclude }

// exclude — соседние валюты маршрута: подряд одна и та же валюта недопустима
// swap — { code, onSwap }: валюта с другого конца этапа; её выбор меняет валюты этапа местами
function openPicker(anchor, current, onPick, exclude = [], swap = null) {
  if (pickerState?.anchor === anchor) return closePicker();
  closePicker();
  pickerState = { anchor, current, onPick, exclude: exclude.filter(Boolean), swap };
  anchor.classList.add('open');
  picker.hidden = false;
  pickerSearch.value = '';
  renderPicker();
  positionPicker();
  // На телефоне не открываем клавиатуру сразу — список и так виден
  if (matchMedia('(pointer: fine)').matches) pickerSearch.focus();
}

function closePicker() {
  if (!pickerState) return;
  pickerState.anchor.classList.remove('open');
  pickerState = null;
  picker.hidden = true;
}

function positionPicker() {
  const r = pickerState.anchor.getBoundingClientRect();
  const w = picker.offsetWidth, h = picker.offsetHeight;
  const left = Math.max(16, Math.min(r.left, window.innerWidth - w - 16));
  const below = r.bottom + 4 + h <= window.innerHeight;
  picker.style.left = left + 'px';
  picker.style.top = (below ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + 'px';
}

function choose(code) {
  if (pickerState.swap && code === pickerState.swap.code) {
    const onSwap = pickerState.swap.onSwap;
    closePicker();
    onSwap();
    return;
  }
  if (pickerState.exclude.includes(code)) {
    toast(`${code} уже стоит рядом в маршруте — выберите другую валюту`);
    return;
  }
  const cb = pickerState.onPick;
  closePicker();
  cb(code);
}

function renderPicker() {
  const raw = pickerSearch.value.trim();
  const Q = raw.toUpperCase(), ql = raw.toLowerCase();
  const match = c => !raw || c.code.includes(Q) || c.name.toLowerCase().includes(ql);
  pickerList.innerHTML = '';

  const groups = [
    ['Фиат', allCurrencies().filter(c => !c.crypto && match(c))],
    ['Криптовалюты', allCurrencies().filter(c => c.crypto && match(c))],
  ];
  let first = true;
  groups.forEach(([title, list]) => {
    if (!list.length) return;
    const g = document.createElement('div');
    g.className = 'picker-group';
    g.textContent = title;
    pickerList.appendChild(g);
    list.forEach(c => {
      const b = document.createElement('button');
      const blocked = pickerState.exclude.includes(c.code);
      b.className = 'pick-item' + (c.code === pickerState.current ? ' current' : '')
        + (blocked ? ' blocked' : '') + (raw && first && !blocked ? ' active' : '');
      b.dataset.code = c.code;
      if (!blocked) first = false;
      b.innerHTML = '<b></b><span></span>';
      b.querySelector('b').textContent = c.code;
      const swapHere = !blocked && pickerState.swap?.code === c.code;
      b.querySelector('span').textContent = blocked ? 'уже соседняя в маршруте'
        : swapHere ? `${c.name} · поменять местами ⇄` : c.name;
      if (blocked) b.title = 'Соседние валюты в маршруте должны быть разными';
      if (c.custom) {
        const rm = document.createElement('i');
        rm.className = 'rm';
        rm.textContent = '✕';
        rm.title = 'Удалить из списка';
        rm.onclick = e => {
          e.stopPropagation();
          customCurrencies = customCurrencies.filter(x => x.code !== c.code);
          saveCustom(); rebuildCur(); renderPicker();
        };
        b.appendChild(rm);
      }
      b.onclick = () => choose(c.code);
      pickerList.appendChild(b);
    });
  });

  const validTicker = /^[A-Z0-9]{2,10}$/.test(Q);
  if (!pickerList.children.length && !validTicker) {
    pickerList.innerHTML = '<div class="picker-empty">Ничего не найдено</div>';
  }
  if (validTicker && !CUR[Q]) {
    const add = document.createElement('div');
    add.className = 'picker-add';
    add.innerHTML = '<div>Добавить новую валюту <b></b>:</div><div class="row"><button data-t="fiat">Фиат (2 знака)</button><button data-t="crypto">Крипто (8 знаков)</button></div>';
    add.querySelector('b').textContent = Q;
    add.querySelectorAll('button').forEach(btn => btn.onclick = () => {
      const crypto = btn.dataset.t === 'crypto';
      customCurrencies.push({ code: Q, name: 'Добавлена вручную', dec: crypto ? 8 : 2, crypto, custom: true });
      saveCustom(); rebuildCur(); choose(Q);
    });
    pickerList.appendChild(add);
  }
}

pickerSearch.addEventListener('input', renderPicker);
pickerSearch.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closePicker(); return; }
  if (e.key !== 'Enter') return;
  const active = pickerList.querySelector('.pick-item.active');
  if (active) choose(active.dataset.code);
});
document.addEventListener('mousedown', e => {
  if (pickerState && !picker.contains(e.target) && !pickerState.anchor.contains(e.target)) closePicker();
});
window.addEventListener('resize', closePicker);
window.addEventListener('scroll', () => pickerState && positionPicker(), true);

// ---- Числа ----
const { parseNum, roundTo, groupDigits, invertRate } = Calc;
const fmtNum = (x, d) => x.toLocaleString('ru-RU', { maximumFractionDigits: d });
const fmtAmt = (x, code) => fmtNum(x, decOf(code)) + ' ' + code;
function fmtRate(x) {
  if (!x) return '0';
  const mag = Math.floor(Math.log10(Math.abs(x)));
  return x.toLocaleString('ru-RU', { maximumFractionDigits: Math.min(12, Math.max(4, 5 - mag)) });
}
// Для CSV: без разделителей тысяч и без экспоненты, запятая как десятичный знак
const csvNum = x => x.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 12 }).replace('.', ',');

// ---- Состояние формы ----
// При каждом открытии — одинаковый старт: RUB → KGS, 1 000 000, прямой курс «1 RUB = x KGS».
// Курс поставщика подставляется из курсов Бакай Банка, когда они загрузятся; курс клиента пустой.
const S = {
  volume: '1 000 000',
  currencies: ['RUB', 'KGS'],
  legs: [{ rs: '', rc: '', inverse: false }],
};

// ---- Расчёт цепочки (lib/calc.js) ----
const hasAdjacentDuplicates = () => Calc.hasAdjacentDuplicates(S.currencies);
const compute = () => Calc.computeChain(S, decOf);

const signed = (v, code) => (v > 0 ? '+' : '') + fmtAmt(v, code);

// Кросс-курс в привычном направлении: "1 USD = 90,5 RUB"
function crossText(finalAmount, volume, from, to) {
  const perFrom = finalAmount / volume;
  return defaultInverse(from, to)
    ? { value: 1 / perFrom, text: `1 ${to} = ${fmtRate(1 / perFrom)} ${from}` }
    : { value: perFrom, text: `1 ${from} = ${fmtRate(perFrom)} ${to}` };
}

// ---- Отрисовка этапов ----
const legsEl = $('legs');

function buildLegs() {
  legsEl.innerHTML = '';
  S.legs.forEach((leg, i) => {
    const el = document.createElement('div');
    el.className = 'leg';
    el.innerHTML = `
      <div class="leg-head">
        <span class="step">Этап ${i + 1}</span>
        <span class="from"></span><span class="arrow">→</span>
        <button class="cur-btn cur" aria-label="Валюта назначения"></button>
        <button class="flip" title="Сменить направление котировки"></button>
        <button class="del" title="Удалить этап">✕</button>
      </div>
      <div class="leg-grid">
        <div><label>Курс поставщика</label><input class="rs" inputmode="decimal"><div class="hint q"></div></div>
        <div><label>Курс клиента</label><input class="rc" inputmode="decimal"><div class="hint q"></div></div>
        <div class="leg-out">
          <div class="side"><span class="ws"></span><b class="os">—</b></div>
          <div class="side"><span class="wc"></span><b class="oc">—</b></div>
          <div class="side leg-profit"><span>Прибыль этапа</span><b class="op">—</b></div>
        </div>
      </div>
      <div class="rule"></div>`;
    const q = sel => el.querySelector(sel);
    q('.rs').value = leg.rs = groupDigits(leg.rs);
    q('.rc').value = leg.rc = groupDigits(leg.rc);
    q('.del').style.display = S.legs.length > 1 ? '' : 'none';

    q('.cur').addEventListener('click', e => {
      // В первом этапе исходную валюту можно выбрать и здесь — тогда валюты этапа меняются местами
      const swap = i === 0 ? firstLegSwap(S.currencies[0]) : null;
      openPicker(e.currentTarget, S.currencies[i + 1], code => {
        S.currencies[i + 1] = code;
        autoOrient(i);
        update();
      }, swap ? [S.currencies[i + 2]] : [S.currencies[i], S.currencies[i + 2]], swap);
    });
    // Переворот котировки: курсы пересчитываются в 1 ÷ курс, итог сделки не меняется
    q('.flip').addEventListener('click', () => {
      leg.inverse = !leg.inverse;
      for (const key of ['rs', 'rc']) {
        const v = parseNum(leg[key]);
        if (v > 0) q('.' + key).value = leg[key] = groupDigits(invertRate(v));
      }
      update();
    });
    q('.rs').addEventListener('input', e => { leg.rs = e.target.value; update(); });
    q('.rc').addEventListener('input', e => { leg.rc = e.target.value; update(); });
    q('.del').addEventListener('click', () => removeLeg(i));
    legsEl.appendChild(el);
  });
  update();
}

// Направление котировки подбираем автоматически, только пока курсы не введены
function autoOrient(i) {
  const leg = S.legs[i];
  if (leg && !leg.rs && !leg.rc) leg.inverse = defaultInverse(S.currencies[i], S.currencies[i + 1]);
}

function removeLeg(i) {
  S.legs.splice(i, 1);
  S.currencies.splice(i + 1, 1);
  // Следующий этап теперь начинается с другой валюты — старые курсы к нему не подходят
  if (i < S.legs.length) {
    S.legs[i].rs = S.legs[i].rc = '';
    autoOrient(i);
  }
  buildLegs();
}

$('addLeg').addEventListener('click', () => {
  const from = S.currencies[S.currencies.length - 1];
  const to = from === 'USD' ? 'USDT' : 'USD';
  S.currencies.push(to);
  S.legs.push({ rs: '', rc: '', inverse: defaultInverse(from, to) });
  buildLegs();
  legsEl.lastElementChild.querySelector('.cur').click();
});

// ---- Разделение разрядов пробелами прямо при вводе: 100000 → 100 000 ----
const NUM_FIELDS = '#volume, .rs, .rc';

// Переформатировать поле, сохранив позицию курсора относительно цифр
function groupInput(input) {
  const { value, selectionStart } = input;
  const out = groupDigits(value);
  if (out === value) return;
  const isSig = ch => /[\d.,]/.test(ch);
  let before = 0;
  for (let i = 0; i < selectionStart; i++) if (isSig(value[i])) before++;
  // Убранные ведущие нули, стоявшие перед курсором, не считаются
  const digits = value.replace(/[^\d.,]/g, '');
  const zeros = digits.length - digits.replace(/^0+(?=\d)/, '').length;
  before = Math.max(0, before - Math.min(zeros, before));
  let pos = 0;
  for (let seen = 0; pos < out.length && seen < before; pos++) if (isSig(out[pos])) seen++;
  input.value = out;
  input.setSelectionRange(pos, pos);
}

// Фаза перехвата: поле отформатировано до того, как значение прочитают обработчики расчёта
document.addEventListener('input', e => {
  if (e.target.matches?.(NUM_FIELDS)) groupInput(e.target);
}, true);

// Backspace/Delete рядом с пробелом удаляют цифру, а не разделитель
document.addEventListener('keydown', e => {
  const input = e.target;
  if (!input.matches?.(NUM_FIELDS) || input.selectionStart !== input.selectionEnd) return;
  const pos = input.selectionStart;
  if (e.key === 'Backspace' && input.value[pos - 1] === ' ') input.setSelectionRange(pos - 1, pos - 1);
  if (e.key === 'Delete' && input.value[pos] === ' ') input.setSelectionRange(pos + 1, pos + 1);
}, true);

$('volume').value = S.volume = groupDigits(S.volume);
$('volume').addEventListener('input', e => { S.volume = e.target.value; update(); });
// Первый этап A → B становится B → A. Котировка («1 RUB = x KGS») и введённые курсы сохраняются,
// поэтому инвертируется только направление расчёта (× ↔ ÷).
const canSwapFirstLeg = () => S.currencies[2] !== S.currencies[0];
function swapFirstLeg() {
  if (!canSwapFirstLeg()) { toast('Нельзя поменять местами: валюты второго этапа совпадут'); return; }
  [S.currencies[0], S.currencies[1]] = [S.currencies[1], S.currencies[0]];
  S.legs[0].inverse = !S.legs[0].inverse;
  update();
  toast(`Этап 1: ${S.currencies[0]} → ${S.currencies[1]}, курсы сохранены`);
}
// Код, выбор которого означает перестановку: в списке исходной валюты — валюта назначения, и наоборот
const firstLegSwap = code => canSwapFirstLeg() ? { code, onSwap: swapFirstLeg } : null;

$('startCur').addEventListener('click', e => openPicker(e.currentTarget, S.currencies[0], code => {
  S.currencies[0] = code;
  autoOrient(0);
  update();
}, canSwapFirstLeg() ? [] : [S.currencies[1]], firstLegSwap(S.currencies[1])));

function update() {
  const cur = S.currencies;
  const start = cur[0], end = cur[cur.length - 1];

  // Маршрут
  const route = $('route');
  route.innerHTML = '';
  cur.forEach((c, i) => {
    if (i) { const a = document.createElement('span'); a.className = 'arr'; a.textContent = '→'; route.appendChild(a); }
    const chip = document.createElement('span');
    chip.className = 'chip' + (CUR[c] ? (CUR[c].crypto ? ' crypto' : '') : (c ? ' crypto' : ''));
    chip.textContent = c || '?';
    route.appendChild(chip);
  });
  $('volumeLabel').textContent = `Объём, ${start || '?'}`;
  $('startCur').textContent = start || 'Выбрать';

  const r = compute();

  // Этапы
  [...legsEl.children].forEach((el, i) => {
    const leg = S.legs[i], from = cur[i] || '?', to = cur[i + 1] || '?';
    const [base, quote] = leg.inverse ? [to, from] : [from, to];
    el.querySelector('.from').textContent = from;
    el.querySelector('.cur').textContent = cur[i + 1] || 'Выбрать';
    el.querySelector('.flip').textContent = `1 ${base} = x ${quote} ⇄`;
    el.querySelectorAll('.q').forEach(h => h.textContent = `${quote} за 1 ${base}`);

    // Подсказка: какой курс должен быть больше, чтобы компания была в плюсе
    const rule = el.querySelector('.rule');
    const need = leg.inverse ? 'меньше' : 'больше';
    const rs = parseNum(leg.rs), rc = parseNum(leg.rc);
    rule.className = 'rule';
    if (rs > 0 && rc > 0) {
      const good = leg.inverse ? rs < rc : rs > rc;
      rule.classList.add(rs === rc ? 'neg' : good ? 'pos' : 'neg');
      rule.textContent = rs === rc
        ? `⚠ Курсы равны — на этом этапе прибыли нет. Для прибыли курс поставщика должен быть ${need} курса клиента.`
        : good
          ? `✓ Курс поставщика ${need} курса клиента — этап в плюсе.`
          : `⚠ Для прибыли курс поставщика должен быть ${need} курса клиента — сейчас этап в минусе.`;
    } else {
      rule.textContent = `Для прибыли курс поставщика должен быть ${need} курса клиента.`;
    }
    const st = r.steps[i];
    // Поставщик отдаёт валюту назначения и получает исходную; клиент — наоборот
    const prevSup = i === 0 ? r.volume : r.steps[i - 1]?.sup;
    const prevCli = i === 0 ? r.volume : r.steps[i - 1]?.cli;
    el.querySelector('.ws').textContent = `Поставщик продаёт ${plOf(to)} за ${plOf(from)}`;
    el.querySelector('.wc').textContent = `Клиент продаёт ${plOf(from)} за ${plOf(to)}`;
    el.querySelector('.os').textContent = st?.sup != null ? `${fmtAmt(st.sup, to)} за ${fmtAmt(prevSup, from)}` : '—';
    el.querySelector('.oc').textContent = st?.cli != null ? `${fmtAmt(prevCli, from)} за ${fmtAmt(st.cli, to)}` : '—';
    const op = el.querySelector('.op');
    const end = cur[cur.length - 1];
    if (st?.profit != null) {
      const inFinal = i < S.legs.length - 1 && st.profitFinal != null ? ` ≈ ${signed(st.profitFinal, end)}` : '';
      op.textContent = signed(st.profit, to) + inFinal;
      op.className = 'op ' + (st.profit > 0 ? 'pos' : st.profit < 0 ? 'neg' : '');
    } else {
      op.textContent = '—';
      op.className = 'op';
    }
  });

  // Итоги
  const warns = [];
  if (cur.some(c => !c)) warns.push('Укажите валюту на каждом этапе.');
  if (hasAdjacentDuplicates()) warns.push('Соседние валюты в маршруте совпадают — выберите разные валюты, иначе расчёт невозможен.');

  // Итог одной стороны: показывается, как только посчитан, даже если у другой стороны нет курса
  const single = S.legs.length === 1;
  const sideText = (amount, key) => {
    if (amount == null) return ['—', ''];
    const formula = single
      ? `${fmtNum(r.volume, decOf(start))} ${S.legs[0].inverse ? '÷' : '×'} ${fmtRate(r.steps[0][key])}`
      : crossText(amount, r.volume, start, end).text;
    return [fmtAmt(amount, end), formula];
  };
  [$('sumSupplier').textContent, $('fSupplier').textContent] = sideText(r.supplier, 'rs');
  [$('sumClient').textContent, $('fClient').textContent] = sideText(r.client, 'rc');

  if (!r.ok) {
    ['profit', 'margin', 'profitStart'].forEach(id => $(id).textContent = '—');
    $('fProfit').textContent = '';
    $('profit').className = 'v';
  } else {
    $('profit').textContent = fmtAmt(r.profit, end);
    $('profit').className = 'v ' + (r.profit >= 0 ? 'pos' : 'neg');
    $('fProfit').textContent = `${fmtNum(r.supplier, decOf(end))} − ${fmtNum(r.client, decOf(end))}`;
    $('margin').textContent = fmtNum(r.supplier ? r.profit / r.supplier * 100 : 0, 3) + ' %';
    $('profitStartLabel').textContent = `Прибыль в ${start} (по кросс-курсу клиента)`;
    $('profitStart').textContent = fmtAmt(roundTo(r.profit * r.volume / r.client, decOf(start)), start);
    if (r.profit < 0) warns.push('Итог клиента больше итога поставщика — сделка убыточна.');
  }
  $('warn').innerHTML = '';
  warns.forEach(w => { const d = document.createElement('div'); d.textContent = w; $('warn').appendChild(d); });
}

// ---- Журнал ----
function loadDeals() {
  try {
    const deals = JSON.parse(localStorage.getItem(DEALS_KEY)) || [];
    // Записи старой версии (только RUB → KGS)
    return deals.map(d => d.route ? d : {
      date: d.date, note: d.note, route: ['RUB', 'KGS'], volume: d.volume,
      legs: [{ rs: d.rs, rc: d.rc, inverse: false }],
      supplier: d.supplier, client: d.client, profit: d.profit,
    });
  } catch { return []; }
}
const saveDeals = () => { try { localStorage.setItem(DEALS_KEY, JSON.stringify(deals)); } catch {} };
let deals = loadDeals();

const endOf = d => d.route[d.route.length - 1];

// Фильтр журнала по датам и группировка итогов
const JOURNAL_UI_KEY = 'treasury-journal-ui';
const journal = { from: '', to: '', group: 'none' };
try { journal.group = JSON.parse(localStorage.getItem(JOURNAL_UI_KEY))?.group || 'none'; } catch {}
const isoDate = d => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
function visibleDeals() {
  const from = journal.from ? new Date(journal.from + 'T00:00:00').getTime() : -Infinity;
  const to = journal.to ? new Date(journal.to + 'T23:59:59.999').getTime() : Infinity;
  return deals.map((d, i) => ({ d, i })).filter(({ d }) => d.date >= from && d.date <= to);
}
const QUICK = [
  ['today', 'Сегодня', () => { const t = isoDate(Date.now()); return [t, t]; }],
  ['week', '7 дней', () => [isoDate(Date.now() - 6 * 864e5), isoDate(Date.now())]],
  ['month', 'Месяц', () => { const n = new Date(); return [isoDate(new Date(n.getFullYear(), n.getMonth(), 1)), isoDate(n)]; }],
  ['all', 'Все', () => ['', '']],
];
const GROUPS = [['none', 'без итогов'], ['day', 'дням'], ['month', 'месяцам']];
function renderJournalTools() {
  $('dateFrom').value = journal.from;
  $('dateTo').value = journal.to;
  const q = $('quickRange'); q.innerHTML = '';
  QUICK.forEach(([key, label, range]) => {
    const [f, t] = range();
    const b = el('button', { textContent: label, className: journal.from === f && journal.to === t ? 'on' : '' });
    b.onclick = () => { [journal.from, journal.to] = range(); renderDeals(); };
    q.append(b);
  });
  const g = $('groupBy'); g.innerHTML = '';
  GROUPS.forEach(([key, label]) => {
    const b = el('button', { textContent: label, className: journal.group === key ? 'on' : '' });
    b.onclick = () => { journal.group = key; try { localStorage.setItem(JOURNAL_UI_KEY, JSON.stringify({ group: key })); } catch {} renderDeals(); };
    g.append(b);
  });
}
$('dateFrom').addEventListener('change', e => { journal.from = e.target.value; renderDeals(); });
$('dateTo').addEventListener('change', e => { journal.to = e.target.value; renderDeals(); });

// Итоги по дням/месяцам: прибыль отдельно по каждой итоговой валюте
function renderSummary(list) {
  const wrap = $('summaryWrap'), body = $('summaryBody');
  body.innerHTML = '';
  wrap.hidden = journal.group === 'none' || !list.length;
  if (wrap.hidden) return;
  const keyOf = d => {
    const x = new Date(d.date);
    return journal.group === 'day'
      ? [isoDate(x), x.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })]
      : [`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`, x.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })];
  };
  const groups = new Map();
  list.forEach(({ d }) => {
    const [k, label] = keyOf(d);
    const g = groups.get(k) || { label, count: 0, profit: {} };
    g.count++;
    g.profit[endOf(d)] = (g.profit[endOf(d)] || 0) + d.profit;
    groups.set(k, g);
  });
  [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).forEach(([, g]) => {
    const profitCell = el('td', {}, Object.entries(g.profit).map(([code, v]) =>
      el('span', { className: 'sum ' + (v >= 0 ? 'pos' : 'neg'), textContent: signed(roundTo(v, decOf(code)), code) })));
    body.append(el('tr', {}, [td(g.label), td(`${g.count} сд.`), profitCell]));
  });
}
const ratesText = d => d.legs.map((l, i) => {
  const [from, to] = [d.route[i], d.route[i + 1]];
  const pair = l.inverse ? `${to}/${from}` : `${from}/${to}`;
  return `${pair}: ${fmtRate(l.rs)} / ${fmtRate(l.rc)}`;
});

function renderDeals() {
  const tbody = $('tbody'), tfoot = $('tfoot');
  tbody.innerHTML = '';
  tfoot.innerHTML = '';
  renderJournalTools();
  const list = visibleDeals();
  renderSummary(list);
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty">${deals.length ? 'За выбранный период сделок нет' : 'Сделок пока нет'}</td></tr>`;
    return;
  }
  list.forEach(({ d, i }) => {
    const tr = document.createElement('tr');
    const end = endOf(d);
    const cells = [
      new Date(d.date).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }),
      d.note,
      d.route.join(' → '),
      fmtAmt(d.volume, d.route[0]),
      ratesText(d).join('\n'),
      fmtAmt(d.supplier, end),
      fmtAmt(d.client, end),
      fmtAmt(d.profit, end),
    ];
    cells.forEach((c, j) => {
      const td = document.createElement('td');
      td.textContent = c;
      if (j === 4) { td.className = 'rates'; td.style.whiteSpace = 'pre'; }
      if (j === 7) td.className = d.profit >= 0 ? 'pos' : 'neg';
      tr.appendChild(td);
    });
    const td = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'del';
    btn.textContent = '✕';
    btn.title = 'Удалить';
    btn.onclick = () => { deals.splice(i, 1); saveDeals(); renderDeals(); };
    td.appendChild(btn);
    tr.appendChild(td);
    tbody.appendChild(tr);
  });

  // Прибыль суммируем отдельно по каждой итоговой валюте
  const shown = list.map(x => x.d);
  const totals = {};
  shown.forEach(d => { const c = endOf(d); totals[c] = (totals[c] || 0) + d.profit; });
  Object.entries(totals).forEach(([code, sum], k) => {
    const tr = document.createElement('tr');
    const v = roundTo(sum, decOf(code));
    tr.innerHTML = `<td>${k ? '' : 'Итого прибыль'}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>`;
    tr.children[1].textContent = `${shown.filter(d => endOf(d) === code).length} сд.`;
    tr.children[7].textContent = fmtAmt(v, code);
    tr.children[7].className = v >= 0 ? 'pos' : 'neg';
    tfoot.appendChild(tr);
  });
}

$('addBtn').onclick = () => {
  const r = compute();
  if (hasAdjacentDuplicates()) { alert('Соседние валюты в маршруте должны быть разными'); return; }
  if (!r.ok || S.currencies.some(c => !c)) { alert('Проверьте объём, валюты и курсы'); return; }
  deals.push({
    date: Date.now(),
    note: $('note').value.trim(),
    route: [...S.currencies],
    volume: r.volume,
    legs: S.legs.map((l, i) => ({ rs: r.steps[i].rs, rc: r.steps[i].rc, inverse: l.inverse })),
    supplier: r.supplier, client: r.client, profit: r.profit,
  });
  saveDeals();
  $('note').value = '';
  renderDeals();
};

// Текст расчёта для отправки коллеге (Telegram, WhatsApp, почта)
function summaryText() {
  const r = compute();
  const cur = S.currencies, end = cur[cur.length - 1];
  const lines = [];
  const note = $('note').value.trim();
  if (note) lines.push(note);
  lines.push(`Расчёт ${cur.join(' → ')}, объём ${fmtAmt(r.volume, cur[0])}`);
  S.legs.forEach((leg, i) => {
    const st = r.steps[i], from = cur[i], to = cur[i + 1];
    const [b, q] = leg.inverse ? [to, from] : [from, to];
    const rate = v => v > 0 ? fmtRate(v) : '—';
    lines.push(`Этап ${i + 1} ${from} → ${to}: поставщик ${rate(st.rs)}, клиент ${rate(st.rc)} (${q} за 1 ${b})`
      + (st.profit != null ? ` — ${signed(st.profit, to)}` : ''));
  });
  lines.push(`Поставщик: ${fmtAmt(r.supplier, end)} · Клиент: ${fmtAmt(r.client, end)}`);
  lines.push(`Прибыль: ${signed(r.profit, end)} (маржа ${fmtNum(r.supplier ? r.profit / r.supplier * 100 : 0, 3)} %)`);
  return lines.join('\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Без HTTPS/разрешения: через скрытое поле
    const ta = el('textarea', { value: text, style: 'position:fixed;opacity:0' });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

$('copyBtn').onclick = async () => {
  const r = compute();
  if (!r.ok || hasAdjacentDuplicates() || S.currencies.some(c => !c)) { toast('Заполните объём, валюты и оба курса'); return; }
  await copyText(summaryText());
  toast('Расчёт скопирован — вставьте в Telegram или WhatsApp');
};

$('note').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('addBtn').click(); } });

$('clearBtn').onclick = () => {
  if (deals.length && confirm('Удалить все сделки из журнала?')) { deals = []; saveDeals(); renderDeals(); }
};

$('csvBtn').onclick = () => {
  const shown = visibleDeals().map(x => x.d);
  if (!shown.length) { toast('Нет сделок для экспорта'); return; }
  const esc = s => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [
    ['Дата', 'Комментарий', 'Маршрут', 'Объём', 'Валюта объёма', 'Курсы (поставщик / клиент)',
     'Поставщик', 'Клиент', 'Прибыль', 'Валюта прибыли'].join(';'),
    ...shown.map(d => [
      esc(new Date(d.date).toLocaleString('ru-RU')), esc(d.note), esc(d.route.join(' → ')),
      csvNum(d.volume), d.route[0], esc(ratesText(d).join('; ')),
      csvNum(d.supplier), csvNum(d.client), csvNum(d.profit), endOf(d),
    ].join(';')),
  ];
  // BOM, чтобы Excel правильно открыл кириллицу
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `сделки_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

buildLegs();
renderDeals();

// ---- Курсы (панель справа) ----
const RATES_UI_KEY = 'treasury-rates-ui';
const RATES_REFRESH_MS = 60 * 1000;
const RATES_STALE_MIN = 30;
let ratesData = null, ratesSource = null;
const ratesUi = { cur: 'USD', type: 'all', sort: 'buy', defaultBank: 'https://valuta.kg/view/bakaibank.html' };
try { Object.assign(ratesUi, JSON.parse(localStorage.getItem(RATES_UI_KEY)) || {}); } catch {}
const saveRatesUi = () => { try { localStorage.setItem(RATES_UI_KEY, JSON.stringify(ratesUi)); } catch {} };

// Поле курса, в которое подставляется значение из панели: последнее, где стоял курсор
let rateTarget = null; // { leg, key: 'rs' | 'rc' }
const rememberRateTarget = e => {
  const input = e.target.closest?.('.rs, .rc');
  if (!input) return;
  rateTarget = {
    leg: [...legsEl.children].indexOf(input.closest('.leg')),
    key: input.classList.contains('rs') ? 'rs' : 'rc',
  };
};
legsEl.addEventListener('focusin', rememberRateTarget);
legsEl.addEventListener('pointerdown', rememberRateTarget);

// Подсказка «нажмите на поле курса…» показывается, пока курс не подставили хоть раз
const TIP_KEY = 'treasury-tip-done';
try { if (localStorage.getItem(TIP_KEY) === '1') document.querySelector('.rates-tip').hidden = true; } catch {}
function tipDone() {
  document.querySelector('.rates-tip').hidden = true;
  try { localStorage.setItem(TIP_KEY, '1'); } catch {}
}

// Телефон и планшет: калькулятор и курсы — вкладками
const viewTabs = $('viewTabs');
const isMobileLayout = () => matchMedia('(max-width: 1100px)').matches;
function setView(v) {
  document.body.dataset.view = v;
  viewTabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
}
viewTabs.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) { setView(b.dataset.view); window.scrollTo(0, 0); }
});
setView('calc');

// value — сколько quote за 1 base
function insertRate(value, base, quote) {
  // На телефоне поле калькулятора не видно за вкладкой — по умолчанию курс поставщика первого этапа
  if (!rateTarget && isMobileLayout()) rateTarget = { leg: 0, key: 'rs' };
  if (!rateTarget || rateTarget.leg < 0 || rateTarget.leg >= S.legs.length) {
    toast('Сначала нажмите на поле «Курс поставщика» или «Курс клиента» в калькуляторе');
    return;
  }
  const i = rateTarget.leg, leg = S.legs[i];
  const from = S.currencies[i], to = S.currencies[i + 1];
  const [lb, lq] = leg.inverse ? [to, from] : [from, to];
  let text = value.toLocaleString('ru-RU', { useGrouping: false, maximumFractionDigits: 12 });
  const who = rateTarget.key === 'rs' ? 'поставщика' : 'клиента';
  let msg = `Этап ${i + 1}, курс ${who}: ${text} ${lq} за 1 ${lb}`;
  if (base === lq && quote === lb) {
    text = invertRate(value);
    msg = `Этап ${i + 1}, курс ${who}: ${text} ${lq} за 1 ${lb} (пересчитан из ${quote} за 1 ${base})`;
  } else if (!(base === lb && quote === lq)) {
    msg = `⚠ Подставлен курс ${quote} за 1 ${base}, а в этапе ${i + 1} нужен ${lq} за 1 ${lb}. Проверьте валюты.`;
  }
  const input = legsEl.children[i].querySelector('.' + rateTarget.key);
  input.value = leg[rateTarget.key] = groupDigits(text);
  input.classList.remove('flash');
  void input.offsetWidth;
  input.classList.add('flash');
  update();
  toast(msg);
  tipDone();
  if (isMobileLayout()) { setView('calc'); input.scrollIntoView({ block: 'center' }); }
}

// Предыдущие курсы — для стрелок ▲▼ рядом со значениями
const RATES_LAST_KEY = 'treasury-rates-last', RATES_PREV_KEY = 'treasury-rates-prev';
let prevRates = null;
function rememberRates(data) {
  try {
    const last = JSON.parse(localStorage.getItem(RATES_LAST_KEY));
    if (last && last.updatedAt !== data.updatedAt) {
      prevRates = last;
      localStorage.setItem(RATES_PREV_KEY, JSON.stringify(last));
    } else if (!prevRates) {
      prevRates = JSON.parse(localStorage.getItem(RATES_PREV_KEY));
    }
    localStorage.setItem(RATES_LAST_KEY, JSON.stringify(data));
  } catch {}
}
const prevCrypto = name => prevRates?.crypto?.find?.(x => x.name === name);
const prevUsd = name => prevRates?.usdrub?.find?.(x => x.name === name);
const prevNbkr = code => prevRates?.nbkr?.rates?.find?.(r => r.code === code)?.rate;
const prevMember = (m, cur) => prevRates?.members?.find?.(x => (m.url && x.url === m.url) || x.name === m.name)?.rates?.[cur];

// Кнопка с курсом: нажатие подставляет его в калькулятор. prev — прошлое значение для стрелки ▲▼
function rateBtn(value, base, quote, { best = false, per = 1, prev = null } = {}) {
  if (value == null) return '—';
  const b = el('button', {
    className: 'rv' + (best ? ' best' : ''),
    textContent: value.toLocaleString('ru-RU', { maximumFractionDigits: 6 }),
    title: `Подставить: ${quote} за 1 ${base}`,
  });
  b.onclick = () => insertRate(value / per, base, quote);
  if (prev == null || prev === value) return b;
  const up = value > prev;
  const arrow = el('i', {
    className: 'dlt ' + (up ? 'up' : 'down'),
    textContent: up ? '▲' : '▼',
    title: `Было ${prev.toLocaleString('ru-RU', { maximumFractionDigits: 6 })}`,
  });
  return el('span', { className: 'rv-wrap' }, [b, arrow]);
}

function rtable(headers, rows) {
  const thead = el('thead', {}, [el('tr', {}, headers.map(h => typeof h === 'string' ? el('th', { textContent: h }) : h))]);
  const tbody = el('tbody', {}, rows);
  return el('table', { className: 'rt' }, [thead, tbody]);
}
const errRow = (cols, text) => el('tr', {}, [el('td', { className: 'err', colSpan: cols, textContent: text })]);

function renderCrypto() {
  const body = $('cryptoBody');
  body.innerHTML = '';
  const list = ratesData.crypto || [];
  const bids = list.map(x => x.bid).filter(Boolean), asks = list.map(x => x.ask).filter(Boolean);
  const maxBid = Math.max(...bids), minAsk = Math.min(...asks);
  const rows = list.map(x => {
    const name = el('td', { className: 'name' }, [
      el('a', { href: x.url, target: '_blank', rel: 'noopener', textContent: x.name }),
      ...(x.note ? [el('small', { textContent: x.note })] : []),
    ]);
    if (x.error) return el('tr', {}, [name, el('td', { className: 'err', colSpan: 2, textContent: 'нет данных', title: x.error })]);
    return el('tr', {}, [
      name,
      td(rateBtn(x.bid, 'USDT', 'RUB', { best: bids.length > 1 && x.bid === maxBid, prev: prevCrypto(x.name)?.bid })),
      td(rateBtn(x.ask, 'USDT', 'RUB', { best: asks.length > 1 && x.ask === minAsk, prev: prevCrypto(x.name)?.ask })),
    ]);
  });
  body.append(rtable([
    'Биржа',
    el('th', { textContent: 'Bid', title: 'Биржа покупает USDT — по этой цене можно продать' }),
    el('th', { textContent: 'Ask', title: 'Биржа продаёт USDT — по этой цене можно купить' }),
  ], rows.length ? rows : [errRow(3, 'нет данных')]));
}

function renderUsdRub() {
  const body = $('usdBody');
  body.innerHTML = '';
  const list = ratesData.usdrub || [];
  const rows = list.map(x => {
    const details = [];
    if (x.time) details.push(x.time);
    if (x.updatedAt) details.push(new Date(x.updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) + ' МСК');
    if (x.last) details.push('последняя ' + x.last.toLocaleString('ru-RU', { maximumFractionDigits: 6 }));
    const name = el('td', { className: 'name' }, [
      el('a', { href: x.url, target: '_blank', rel: 'noopener', textContent: x.name }),
      ...(details.length ? [el('small', { textContent: details.join(' · ') })] : []),
    ]);
    if (x.error) return el('tr', {}, [name, el('td', { className: 'err', colSpan: 2, textContent: 'нет данных', title: x.error })]);
    // У ЦБ один официальный курс — на обе колонки
    const p = prevUsd(x.name);
    if (x.official) return el('tr', {}, [name, td(rateBtn(x.official, 'USD', 'RUB', { prev: p?.official }), { colSpan: 2, style: 'text-align:center' })]);
    return el('tr', {}, [name, td(rateBtn(x.bid, 'USD', 'RUB', { prev: p?.bid })), td(rateBtn(x.ask, 'USD', 'RUB', { prev: p?.ask }))]);
  });
  body.append(rtable(['Источник', 'Bid', 'Ask'], rows.length ? rows : [errRow(3, 'нет данных')]));
}

function renderNbkr() {
  const nb = ratesData.nbkr || {};
  const row = r => el('tr', {}, [
    td(r.nominal > 1 ? `${r.code} (за ${r.nominal})` : r.code),
    td(rateBtn(r.rate, r.code, 'KGS', { per: r.nominal, prev: prevNbkr(r.code) })),
  ]);
  // Ежедневные (USD, EUR, RUB, KZT, CNY) и еженедельные (остальные валюты) — отдельными блоками
  const fill = (bodyId, dateId, list, date) => {
    const body = $(bodyId);
    body.innerHTML = '';
    $(dateId).textContent = date ? `сом · на ${date}` : 'сом';
    body.append(rtable(['Валюта', 'Сом'], list.length ? list.map(row) : [errRow(2, 'нет данных')]));
  };
  const rates = nb.error || !nb.rates ? [] : nb.rates;
  fill('nbkrBody', 'nbkrDate', rates.filter(r => !r.weekly), nb.date);
  fill('nbkrWeeklyBody', 'nbkrWeeklyDate', rates.filter(r => r.weekly), nb.weeklyDate);
}

function renderMembers() {
  const body = $('membersBody'), members = ratesData.members;
  body.innerHTML = '';
  $('memCur').innerHTML = '';
  $('memType').innerHTML = '';
  if (!Array.isArray(members)) { body.append(rtable(['Название'], [errRow(3, 'нет данных')])); return; }

  const curs = [...new Set(members.flatMap(m => Object.keys(m.rates)))];
  if (!curs.includes(ratesUi.cur)) ratesUi.cur = curs[0];
  const TYPES = [['all', 'Все'], ['Банк', 'Банки'], ['Обменка', 'Обменки'], ['МФК', 'МФК']]
    .filter(([t]) => t === 'all' || members.some(m => m.type === t));
  if (!TYPES.some(([t]) => t === ratesUi.type)) ratesUi.type = 'all';

  const seg = (container, items, current, onPick) => items.forEach(([value, label]) => {
    const b = el('button', { textContent: label, className: value === current ? 'on' : '' });
    b.onclick = () => { onPick(value); saveRatesUi(); renderMembers(); };
    container.append(b);
  });
  seg($('memCur'), curs.map(c => [c, c]), ratesUi.cur, v => { ratesUi.cur = v; });
  seg($('memType'), TYPES, ratesUi.type, v => { ratesUi.type = v; });
  renderDefaultBankSelect(members);

  const cur = ratesUi.cur;
  const list = members
    .filter(m => ratesUi.type === 'all' || m.type === ratesUi.type)
    .filter(m => m.rates[cur] && (m.rates[cur].buy || m.rates[cur].sell));
  const sorters = {
    buy: (a, b) => (b.rates[cur].buy ?? -Infinity) - (a.rates[cur].buy ?? -Infinity),
    sell: (a, b) => (a.rates[cur].sell ?? Infinity) - (b.rates[cur].sell ?? Infinity),
    name: (a, b) => a.name.localeCompare(b.name, 'ru'),
  };
  list.sort(sorters[ratesUi.sort] || sorters.buy);

  const buys = list.map(m => m.rates[cur].buy).filter(Boolean);
  const sells = list.map(m => m.rates[cur].sell).filter(Boolean);
  const maxBuy = Math.max(...buys), minSell = Math.min(...sells);

  const th = (label, key, title) => {
    const h = el('th', { className: 'sortable', textContent: label + (ratesUi.sort === key ? (key === 'buy' ? ' ↓' : ' ↑') : ''), title });
    h.onclick = () => { ratesUi.sort = key; saveRatesUi(); renderMembers(); };
    return h;
  };
  const rows = list.map(m => {
    const r = m.rates[cur];
    const nameCell = el('td', { className: 'name' }, [
      m.url ? el('a', { href: m.url, target: '_blank', rel: 'noopener', textContent: m.name }) : m.name,
      el('small', { textContent: [m.type, m.note, m.updated && `уст. ${m.updated}`].filter(Boolean).join(' · ') }),
    ]);
    return el('tr', { className: m.fresh ? '' : 'stale', title: m.fresh ? '' : 'Курс давно не обновлялся' }, [
      nameCell,
      td(rateBtn(r.buy, cur, 'KGS', { best: r.buy === maxBuy, prev: prevMember(m, cur)?.buy })),
      td(rateBtn(r.sell, cur, 'KGS', { best: r.sell === minSell, prev: prevMember(m, cur)?.sell })),
    ]);
  });
  body.append(rtable([
    th('Название', 'name'),
    th('Покупка', 'buy', 'Банк покупает валюту. Лучший — самый высокий'),
    th('Продажа', 'sell', 'Банк продаёт валюту. Лучший — самый низкий'),
  ], rows.length ? rows : [errRow(3, 'нет данных')]));
}

function renderRatesStatus() {
  const status = $('ratesStatus');
  if (!ratesData) return;
  const at = new Date(ratesData.updatedAt);
  const min = Math.round((Date.now() - at) / 60000);
  const ago = min < 1 ? 'только что' : min < 60 ? `${min} мин назад` : at.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  const src = SOURCE_LABEL[ratesSource] || ratesSource;
  status.textContent = `Обновлено ${ago} (${at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}) · ${src}`;
  status.classList.toggle('stale', min > RATES_STALE_MIN);
  if (min > RATES_STALE_MIN) status.textContent += ' · данные устарели';
}

function renderRates() {
  renderRatesStatus();
  renderCrypto();
  renderUsdRub();
  renderNbkr();
  renderMembers();
}

// Банк по умолчанию: чей курс покупки RUB подставлять поставщику при открытии
const memberKey = m => m.url || m.name;
function renderDefaultBankSelect(members) {
  const sel = $('defaultBank');
  sel.innerHTML = '';
  sel.append(el('option', { value: '', textContent: '— не подставлять —' }));
  [...members].filter(m => m.rates?.RUB?.buy).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .forEach(m => sel.append(el('option', { value: memberKey(m), textContent: `${m.name} · ${m.rates.RUB.buy}` })));
  sel.value = [...sel.options].some(o => o.value === ratesUi.defaultBank) ? ratesUi.defaultBank : '';
  sel.onchange = () => {
    ratesUi.defaultBank = sel.value;
    saveRatesUi();
    defaultRateApplied = false;
    applyDefaultSupplierRate();
    toast(sel.value ? 'Банк по умолчанию сохранён' : 'Курс по умолчанию отключён');
  };
}

// Курс поставщика по умолчанию: выбранный банк покупает RUB (отдаёт сомы за рубли).
// Один раз после открытия и только если пользователь ещё не менял этап RUB → KGS
// (или в поле стоит прошлое значение по умолчанию).
let defaultRateApplied = false, appliedDefaultRs = null;
function applyDefaultSupplierRate() {
  if (defaultRateApplied) return;
  const members = Array.isArray(ratesData?.members) ? ratesData.members : [];
  const bank = members.find(m => memberKey(m) === ratesUi.defaultBank);
  const rate = bank?.rates?.RUB?.buy;
  const leg = S.legs[0];
  const untouched = S.legs.length === 1 && S.currencies[0] === 'RUB' && S.currencies[1] === 'KGS'
    && !leg.inverse && (!leg.rs || leg.rs === appliedDefaultRs);
  if (!untouched) return;
  defaultRateApplied = true;
  const input = legsEl.children[0]?.querySelector('.rs');
  if (!rate) {
    if (leg.rs && leg.rs === appliedDefaultRs) { leg.rs = ''; if (input) input.value = ''; update(); }
    return;
  }
  leg.rs = appliedDefaultRs = groupDigits(rate.toLocaleString('ru-RU', { useGrouping: false, maximumFractionDigits: 12 }));
  if (input) input.value = leg.rs;
  update();
}

// Курсы с компьютера казначейства лежат в ветке rates того же репозитория (push-rates.js)
const REPO = (() => {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const seg = location.pathname.split('/').filter(Boolean)[0];
  return m && seg ? { owner: m[1], repo: seg } : { owner: 'Chiksan-01', repo: 'Calculating' };
})();
const COMPUTER_RATES_URL = `https://raw.githubusercontent.com/${REPO.owner}/${REPO.repo}/rates/rates.json`;
const SOURCE_LABEL = { live: 'онлайн', computer: 'с компьютера казначейства', file: 'автообновление на сайте' };

async function fetchRates(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.updatedAt) throw new Error('нет updatedAt');
  return data;
}

let ratesLoading = false;
async function loadRates(manual = false) {
  if (ratesLoading) return;
  ratesLoading = true;
  $('ratesRefresh').disabled = true;
  // 1) локальный сервер — живые курсы; 2) иначе компьютер казначейства и сайт — берём что свежее
  let best = null;
  try { best = { data: await fetchRates('api/rates'), src: 'live' }; } catch {}
  if (!best) {
    const results = await Promise.allSettled([
      fetchRates(COMPUTER_RATES_URL + '?t=' + Date.now()).then(data => ({ data, src: 'computer' })),
      fetchRates('rates.json').then(data => ({ data, src: 'file' })),
    ]);
    // С компьютера — полный набор источников (в т.ч. Investing), поэтому он в приоритете,
    // пока не старше 5 минут; иначе берём что свежее
    const [computer, site] = results.map(r => r.status === 'fulfilled' ? r.value : null);
    const age = x => Date.now() - new Date(x.data.updatedAt);
    if (computer && age(computer) < 5 * 60 * 1000) best = computer;
    else best = [computer, site].filter(Boolean).sort((x, y) => age(x) - age(y))[0] || null;
  }
  if (best) {
    ratesData = best.data;
    ratesSource = best.src;
    rememberRates(ratesData);
    applyDefaultSupplierRate();
    renderRates();
    if (manual) toast('Курсы обновлены');
  }
  if (!ratesData) {
    $('ratesStatus').textContent = location.protocol === 'file:'
      ? 'Курсы не загрузились: нужен интернет или запуск через node server.js.'
      : 'Не удалось загрузить курсы. Проверьте интернет.';
  } else if (manual && ratesSource) {
    renderRatesStatus();
  }
  ratesLoading = false;
  $('ratesRefresh').disabled = false;
}

$('ratesRefresh').onclick = () => loadRates(true);
loadRates();
setInterval(() => { if (document.visibilityState === 'visible') loadRates(); }, RATES_REFRESH_MS);
setInterval(renderRatesStatus, 30 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadRates();
});

// ---- Тема: светлая / тёмная ----
const THEME_KEY = 'treasury-theme';
const ICONS = {
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
};
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const currentTheme = () => document.documentElement.getAttribute('data-theme') || (systemDark.matches ? 'dark' : 'light');
function renderThemeBtn() {
  const dark = currentTheme() === 'dark';
  $('themeBtn').innerHTML = dark ? ICONS.sun : ICONS.moon;
  $('themeBtn').title = dark ? 'Светлая тема' : 'Тёмная тема';
}
$('themeBtn').onclick = () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(THEME_KEY, next); } catch {}
  renderThemeBtn();
};
systemDark.addEventListener('change', renderThemeBtn);
renderThemeBtn();

// ---- Установка на телефон (PWA) ----
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

(function installBanner() {
  const HIDE_KEY = 'treasury-install-hidden';
  const bar = $('installBar'), text = $('installText'), btn = $('installBtn');
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let hidden = false;
  try { hidden = localStorage.getItem(HIDE_KEY) === '1'; } catch {}
  if (installed || hidden) return;

  $('installClose').onclick = () => {
    bar.hidden = true;
    try { localStorage.setItem(HIDE_KEY, '1'); } catch {}
  };

  // Android / Chrome / Edge: системное окно установки
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    text.textContent = 'Установите калькулятор как приложение — он будет открываться с главного экрана и работать без интернета.';
    btn.hidden = false;
    bar.hidden = false;
  });
  btn.onclick = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    bar.hidden = true;
  };
  window.addEventListener('appinstalled', () => { bar.hidden = true; });

  // iPhone / iPad: установка только вручную через Safari
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) {
    text.textContent = 'Чтобы установить на iPhone: откройте в Safari, нажмите «Поделиться» (квадрат со стрелкой) → «На экран «Домой»».';
    bar.hidden = false;
  }
})();
