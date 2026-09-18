// История курсов: сжатая запись одного сбора для архива (history/ГГГГ/ММ/ДД.jsonl в ветке rates).
//   node lib/history.js rates.json <папка ветки rates>   — дописать строку

const fs = require('fs');
const path = require('path');

const pair = x => x.official != null ? [x.official] : [x.bid ?? null, x.ask ?? null];

// Только числа, без названий и ссылок: ~2–3 КБ на запись
function compactRates(data) {
  const out = { t: data.updatedAt };
  out.usdt = Object.fromEntries((data.crypto || []).filter(x => !x.error).map(x => [x.name, pair(x)]));
  out.usd = Object.fromEntries((data.usdrub || []).filter(x => !x.error).map(x => [x.name, pair(x)]));
  const nbkr = Array.isArray(data.nbkr?.rates) ? data.nbkr.rates : [];
  out.nbkr = Object.fromEntries(nbkr.filter(x => !x.weekly).map(x => [x.code, x.rate / (x.nominal || 1)]));
  const members = Array.isArray(data.members) ? data.members : [];
  out.banks = Object.fromEntries(members.map(m => [m.name, Object.fromEntries(
    Object.entries(m.rates || {}).filter(([, v]) => v.buy || v.sell).map(([c, v]) => [c, [v.buy ?? null, v.sell ?? null]]),
  )]));
  return out;
}

// Путь файла по дате записи: history/2026/09/18.jsonl
function historyFile(root, isoTime) {
  const d = new Date(isoTime);
  const p = n => String(n).padStart(2, '0');
  return path.join(root, 'history', String(d.getUTCFullYear()), p(d.getUTCMonth() + 1), `${p(d.getUTCDate())}.jsonl`);
}

// Дописывает запись; повторный запуск с теми же данными ничего не добавляет
function appendHistory(root, data) {
  const line = compactRates(data);
  const file = historyFile(root, line.t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (existing.split('\n').some(l => l.startsWith(`{"t":"${line.t}"`))) return { file, added: false };
  fs.appendFileSync(file, JSON.stringify(line) + '\n');
  return { file, added: true };
}

module.exports = { compactRates, historyFile, appendHistory };

if (require.main === module) {
  const [src, root] = process.argv.slice(2);
  if (!src || !root) { console.error('usage: node lib/history.js rates.json <rates-branch-dir>'); process.exit(1); }
  const res = appendHistory(root, JSON.parse(fs.readFileSync(src, 'utf8')));
  console.log(res.added ? `история: добавлена запись в ${res.file}` : 'история: запись уже есть');
}
