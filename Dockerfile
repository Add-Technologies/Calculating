# Калькулятор — статика (index.html, sw.js, icons) плюс крошечный Node-сервер,
# который отдаёт её и собирает курсы на /api/rates. Зависимостей из npm нет
# вообще (только встроенные модули Node 22), поэтому ни package.json, ни
# npm ci здесь нет — образ это просто исходники поверх node:22-alpine.
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
# HOST по умолчанию в server.js — 127.0.0.1, то есть «только этот компьютер».
# В контейнере это значит «только изнутри контейнера»: проброс порта с хоста
# упирался бы в connection refused при полностью рабочем приложении.
ENV HOST=0.0.0.0

# Investing.com целиком закрыт Cloudflare Bot Fight Mode: любой не-браузерный
# клиент получает 403 по TLS-отпечатку ещё до заголовков (проверены сайт,
# api.investing.com, мобильный API, tvc-бэкенды графиков и ssltools-виджеты).
# Поэтому источник читается настоящим браузером через DevTools Protocol
# (lib/browser.js), а в образе стоит chromium (+750 МБ). Путь передаётся через
# CHROME_PATH, иначе findBrowser() ищет google-chrome и не находит. Без chromium
# контейнер не ломается — каждый источник в fetchAllRates независим, — но эта
# котировка молча пропадала бы из /api/rates.
# nss/freetype/harfbuzz/ttf-freefont — без них headless chromium не стартует.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV CHROME_PATH=/usr/bin/chromium

COPY server.js sw.js index.html manifest.webmanifest ./
COPY lib ./lib
COPY icons ./icons

# Chromium отказывается работать от root без --no-sandbox; флаг в lib/browser.js
# для linux уже проставлен, но запускать сервер не от root всё равно правильнее.
# Пользователь node есть в базовом образе.
USER node

EXPOSE 8080

CMD ["node", "server.js"]
