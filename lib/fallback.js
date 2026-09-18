// Подмена источников, недоступных с сервера, данными, которые уже публикует GitHub.
//
// С VPS valuta.kg отдаёт заглушку (Cloudflare режет по IP), а bynex.io не
// открывает соединение. С серверов GitHub и с компьютера казначейства оба
// доступны, и их сбор уже лежит в открытом виде: ветка rates (push-rates.js)
// и rates.json на GitHub Pages (pages.yml, раз в ~10 минут). Здесь — чистая
// функция: живой сбор плюс список таких JSON → живой сбор, где каждый
// упавший источник заменён тем же источником из самого свежего JSON.
//
// Заменяем только то, что упало, и только если JSON не старше MAX_AGE_MS:
// иначе на сайте молча висел бы вчерашний курс. У подменённой строки в
// подписи — откуда и когда, чтобы было видно, что курс не с этого сервера.

const MAX_AGE_MS = 30 * 60 * 1000;

const isMissing = x => !Array.isArray(x) || x.length === 0;

const needsFallback = live =>
  isMissing(live.members) || ['crypto', 'usdrub'].some(k => (live[k] || []).some(x => x.error));

const stamp = iso => new Date(iso).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }) + ' МСК';

/**
 * @param {object} live         результат fetchAllRates на этом сервере
 * @param {{label: string, data: object}[]} fallbacks  скачанные JSON; label — «с сайта», «с компьютера»
 * @param {number} now
 */
function mergeRates(live, fallbacks, now = Date.now()) {
  const usable = fallbacks
    .filter(f => f && f.data && f.data.updatedAt && now - Date.parse(f.data.updatedAt) < MAX_AGE_MS)
    .sort((a, b) => Date.parse(b.data.updatedAt) - Date.parse(a.data.updatedAt));
  if (!usable.length || !needsFallback(live)) return live;

  const out = { ...live };
  const filled = [];

  if (isMissing(live.members)) {
    const f = usable.find(x => !isMissing(x.data.members));
    if (f) { out.members = f.data.members; filled.push({ what: 'members', from: f.label, updatedAt: f.data.updatedAt }); }
  }

  for (const key of ['crypto', 'usdrub']) {
    out[key] = (live[key] || []).map(item => {
      if (!item.error) return item;
      for (const f of usable) {
        const alt = (f.data[key] || []).find(x => x.name === item.name && !x.error);
        if (!alt) continue;
        filled.push({ what: item.name, from: f.label, updatedAt: f.data.updatedAt });
        const origin = `${f.label}, ${stamp(f.data.updatedAt)}`;
        // crypto показывает note под названием, usdrub — time
        return key === 'crypto'
          ? { ...alt, note: [alt.note, origin].filter(Boolean).join(' · ') }
          : { ...alt, time: [alt.time, origin].filter(Boolean).join(' · ') };
      }
      return item;
    });
  }

  if (filled.length) out.fallback = filled;
  return out;
}

module.exports = { mergeRates, needsFallback, MAX_AGE_MS };
