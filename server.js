// Локальный сервер калькулятора.
//   node server.js                 → только этот компьютер: http://localhost:8080
//   HOST=0.0.0.0 node server.js    → доступ с телефонов в той же Wi‑Fi сети
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(ROOT + path.sep) || path.basename(file) === 'server.js') {
    res.writeHead(403);
    return res.end();
  }
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
