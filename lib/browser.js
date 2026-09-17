// Открывает страницу в установленном Chrome/Edge без окна и выполняет в ней скрипт.
// Нужен для сайтов за защитой Cloudflare (Investing.com), которые не отдают данные обычному запросу.
// Работает через DevTools Protocol, без npm-зависимостей (нужен Node 22+ со встроенным WebSocket).

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CANDIDATES = {
  win32: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
};

function findBrowser() {
  const list = [process.env.CHROME_PATH, ...(CANDIDATES[process.platform] || [])].filter(Boolean);
  return list.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
}

/**
 * @param {string} url
 * @param {string} expression JS-выражение; страница опрашивается, пока оно не вернёт не-null
 * @param {number} timeoutMs
 */
async function evaluateInPage(url, expression, timeoutMs = 30000) {
  const exe = findBrowser();
  if (!exe) throw new Error('не найден Chrome/Edge (укажите CHROME_PATH)');
  if (typeof WebSocket === 'undefined') throw new Error('нужен Node.js 22+');

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'treasury-browser-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--window-size=1280,900',
    ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
    'about:blank',
  ];
  const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let ws;

  // Закрыть браузер, дождаться выхода и удалить временный профиль
  const cleanup = async () => {
    try { ws?.close(); } catch {}
    if (proc.exitCode === null) {
      const exited = new Promise(r => proc.once('exit', r));
      try { proc.kill(); } catch {}
      await Promise.race([exited, new Promise(r => setTimeout(r, 3000))]);
    }
    await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  };

  const deadline = Date.now() + timeoutMs;
  try {
    const wsUrl = await new Promise((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(() => reject(new Error('браузер не запустился')), 15000);
      proc.stderr.on('data', d => {
        buf += d;
        const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) { clearTimeout(timer); resolve(m[1]); }
      });
      proc.on('error', e => { clearTimeout(timer); reject(e); });
      proc.on('exit', code => { clearTimeout(timer); reject(new Error(`браузер завершился (${code})`)); });
    });

    ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('нет связи с браузером')); });
    let seq = 0;
    const pending = new Map();
    ws.onmessage = m => {
      const msg = JSON.parse(m.data);
      const cb = pending.get(msg.id);
      if (cb) { pending.delete(msg.id); msg.error ? cb.reject(new Error(msg.error.message)) : cb.resolve(msg.result); }
    };
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

    // Без «HeadlessChrome» в User-Agent — иначе защита сайта сразу отказывает
    const { userAgent } = await send('Browser.getVersion');
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Network.setUserAgentOverride', { userAgent: userAgent.replace('HeadlessChrome', 'Chrome') }, sessionId);
    await send('Page.navigate', { url }, sessionId);

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 700));
      const res = await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId).catch(() => null);
      const value = res?.result?.value;
      if (value != null) return value;
    }
    throw new Error('страница не загрузилась вовремя');
  } finally {
    await cleanup();
  }
}

module.exports = { evaluateInPage, findBrowser };
