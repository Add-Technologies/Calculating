// Отправляет свежие курсы с этого компьютера на GitHub — в ветку rates, файл rates.json.
// Сайт берёт их оттуда, если они свежее курсов с серверов GitHub (там недоступны Investing и часть бирж).
//
//   node push-rates.js          — раз в минуту, пока окно не закрыть
//   node push-rates.js --once   — один раз
//
// Токен GitHub: переменная GITHUB_TOKEN, иначе сохранённый вход git (тот же, что для git push).

const { execFileSync } = require('child_process');
const { fetchAllRates } = require('./lib/rates');

const REPO = process.env.RATES_REPO || 'Chiksan-01/Calculating';
const BRANCH = 'rates';
const FILE = 'rates.json';
const INTERVAL_MS = Number(process.env.RATES_INTERVAL_SEC || 60) * 1000;
const API = 'https://api.github.com';

function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const out = execFileSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
  const m = out.match(/^password=(.+)$/m);
  if (!m) throw new Error('Нет токена GitHub: задайте GITHUB_TOKEN или войдите через git push');
  return m[1].trim();
}
const TOKEN = getToken();

async function gh(method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json',
      'User-Agent': 'treasury-calculator', 'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Ветка rates без общей истории с main: один файл rates.json
async function ensureBranch() {
  if (await gh('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`)) return;
  console.log(`Создаю ветку ${BRANCH}…`);
  const blob = await gh('POST', `/repos/${REPO}/git/blobs`, { content: '{}', encoding: 'utf-8' });
  const tree = await gh('POST', `/repos/${REPO}/git/trees`, { tree: [{ path: FILE, mode: '100644', type: 'blob', sha: blob.sha }] });
  const commit = await gh('POST', `/repos/${REPO}/git/commits`, { message: 'Ветка для курсов с компьютера казначейства', tree: tree.sha, parents: [] });
  await gh('POST', `/repos/${REPO}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
}

const stamp = () => new Date().toLocaleTimeString('ru-RU');

async function pushOnce() {
  const data = await fetchAllRates();
  const current = await gh('GET', `/repos/${REPO}/contents/${FILE}?ref=${BRANCH}`);
  await gh('PUT', `/repos/${REPO}/contents/${FILE}`, {
    message: `Курсы ${data.updatedAt}`,
    content: Buffer.from(JSON.stringify(data)).toString('base64'),
    branch: BRANCH,
    sha: current?.sha,
  });
  const ok = list => list.filter(x => !x.error).length + '/' + list.length;
  const members = Array.isArray(data.members) ? data.members.length : 'нет';
  console.log(`${stamp()} отправлено · биржи ${ok(data.crypto)} · USD/RUB ${ok(data.usdrub)} · банки ${members} · НБКР ${data.nbkr.rates?.length ?? 'нет'}`);
}

(async () => {
  await ensureBranch();
  const once = process.argv.includes('--once');
  for (;;) {
    try { await pushOnce(); } catch (e) { console.error(`${stamp()} ошибка: ${e.message}`); }
    if (once) break;
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
})();
