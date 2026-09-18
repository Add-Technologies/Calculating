// Локальный сервер калькулятора.
//   node server.js                 → только этот компьютер: http://localhost:8080
//   HOST=0.0.0.0 node server.js    → доступ с телефонов в той же Wi‑Fi сети
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fetchAllRates } = require('./lib/rates');

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Курсы: не чаще раза в минуту, параллельные запросы ждут один и тот же сбор
// Файлы и папки, которые отдаём по HTTP. Тот же список копирует Dockerfile и
// собирает pages.yml — при добавлении клиентского файла обновить все три места.
const PUBLIC_FILES = new Set(['index.html', 'styles.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'lib/calc.js']);
const PUBLIC_DIRS = ['icons/'];
const isPublic = rel => PUBLIC_FILES.has(rel) || PUBLIC_DIRS.some(d => rel.startsWith(d) && !rel.slice(d.length).includes('/') && !rel.includes('..'));

const RATES_TTL_MS = 60 * 1000;
let ratesCache = null, ratesAt = 0, ratesPending = null;
function getRates() {
  if (ratesCache && Date.now() - ratesAt < RATES_TTL_MS) return Promise.resolve(ratesCache);
  ratesPending ??= fetchAllRates()
    .then(data => { ratesCache = data; ratesAt = Date.now(); return data; })
    .finally(() => { ratesPending = null; });
  return ratesPending;
}

http.createServer((req, res) => {
  // decodeURIComponent бросает URIError на битом %-экранировании («/%»), а
  // исключение в обработчике запроса — это падение всего процесса.
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch { res.writeHead(400); return res.end('Bad request'); }
  if (urlPath === '/api/rates') {
    return getRates()
      .then(data => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(data));
      })
      .catch(e => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message }));
      });
  }
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  // Наружу только то, что нужно странице (см. PUBLIC). Всё остальное —
  // server.js, lib/rates.js, push-rates.js, тесты — по HTTP не отдаём, даже
  // если файл лежит рядом. Список вместо запрета: новый серверный файл не
  // утечёт по забывчивости, а новый клиентский надо добавить сюда и в Dockerfile.
  if (!isPublic(rel)) {
    res.writeHead(403);
    return res.end();
  }
  const file = path.join(ROOT, rel);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' };
    if (path.basename(file) === 'sw.js') headers['Cache-Control'] = 'no-cache';
    res.writeHead(200, headers);
    res.end(data);
  });
}).listen(PORT, HOST, () => {
  console.log(`Калькулятор: http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') {
    Object.values(os.networkInterfaces()).flat()
      .filter(i => i.family === 'IPv4' && !i.internal)
      .forEach(i => console.log(`В локальной сети: http://${i.address}:${PORT}`));
  }
});
