/**
 * dsh-phone-ru — host half.
 *
 * Поднимает свой HTTP-сервер на 0.0.0.0 (виден в локальной сети) с русской
 * PIN-страницей и проксирует авторизованные запросы в локальный веб-сервер
 * DSH (127.0.0.1). Аутентификация DSH проходит на стороне сервера: плагин
 * берёт launch-токен через ctx.connection.authenticatedUrl(), обменивает его
 * на cookie и подставляет её в каждый проксируемый запрос (HTTP и WebSocket).
 * Телефон знает только наш PIN — токен и cookie DSH никогда не уходят в сеть.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import z from "@deepseek-ai/schemastery";
import QRCode from "qrcode";

const name = "phone-ru";
const inject = ["connection"];

const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  /** Порт нашего LAN-сервера. */
  port: z.number().default(19390),
});

/** Куда проксировать: локальный веб-сервер DSH. */
function dshBase() {
  return process.env.DSH_WEB_URL ?? "http://127.0.0.1:19387";
}

/** Первый непетлевой IPv4 — адрес компа в локальной сети. */
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list ?? []) {
      if (item && item.family === "IPv4" && !item.internal) return item.address;
    }
  }
  return "127.0.0.1";
}

/** PIN живёт в $DSH_HOME/dsh-phone-ru.json; создаётся один раз. */
function loadOrCreatePin() {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), ".dsh");
  const file = path.join(home, "dsh-phone-ru.json");
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof data.pin === "string" && data.pin.length >= 4) return data.pin;
  } catch { /* создадим новый */ }
  const pin = String(crypto.randomInt(100000, 999999));
  try {
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ pin }, null, 2), "utf8");
  } catch { /* без сохранения — PIN будет новым при каждом запуске */ }
  return pin;
}

const LOGIN_PAGE = (error) => `<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>DSH — вход с телефона</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    font:16px/1.5 system-ui, sans-serif; background:#0f1117; color:#e8e8ec; }
  .card { background:#1a1d27; padding:32px 28px; border-radius:16px; width:min(90vw,340px);
    box-shadow:0 12px 40px rgba(0,0,0,.5); text-align:center; }
  h1 { font-size:20px; margin:0 0 8px; }
  p { color:#9aa0ae; font-size:14px; margin:0 0 20px; }
  input { width:100%; box-sizing:border-box; padding:14px; font-size:22px; text-align:center;
    letter-spacing:6px; border-radius:10px; border:1px solid #333a4d; background:#12141c;
    color:#fff; outline:none; }
  input:focus { border-color:#2f6feb; }
  button { width:100%; margin-top:14px; padding:14px; font-size:17px; border:0; border-radius:10px;
    background:#2f6feb; color:#fff; cursor:pointer; }
  .err { color:#ff8a8a; font-size:13px; margin-top:12px; min-height:18px; }
</style></head><body>
<form class="card" method="post" action="/login">
  <h1>📱 DeepSeek Harness</h1>
  <p>Введите PIN-код.<br>Он показан в DSH: кнопка «📱 Телефон» в поле ввода.</p>
  <input name="pin" inputmode="numeric" autocomplete="off" autofocus maxlength="12" placeholder="••••••">
  <button type="submit">Войти</button>
  <div class="err">${error ? "Неверный PIN, попробуйте ещё раз" : ""}</div>
</form></body></html>`;

function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function apply(ctx, config) {
  if (!config.enabled) return;
  const pin = loadOrCreatePin();
  const port = config.port;
  const base = dshBase();
  const baseUrl = new URL(base);

  /** Активные телефонные сессии: token → true. */
  const phoneSessions = new Map();
  /** Cookie DSH, полученная обменом launch-токена (держим на сервере). */
  let dshCookie = null;

  /** Обменять launch-токен на cookie DSH (запрос идёт с loopback, всё честно). */
  async function acquireDshCookie() {
    const authUrl = ctx.connection.authenticatedUrl(base + "/");
    const res = await fetch(authUrl, { redirect: "manual" });
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) throw new Error(`DSH не выдал cookie (HTTP ${res.status})`);
    dshCookie = setCookie.split(";")[0];
  }

  async function ensureCookie() {
    if (dshCookie === null) await acquireDshCookie();
  }

  /** Проксирование обычного HTTP-запроса в DSH. */
  async function proxyHttp(req, res) {
    await ensureCookie();
    const headers = { ...req.headers };
    headers.host = baseUrl.host;
    headers.cookie = dshCookie;
    headers["accept-encoding"] = "identity";
    delete headers.origin;
    delete headers.referer;
    delete headers["sec-fetch-site"];

    const init = { method: req.method, headers, redirect: "manual" };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = req;
      init.duplex = "half";
    }
    let upstream = await fetch(base + req.url, init);
    // Cookie протухла (перезапуск ядра) — один раз обновляем и повторяем.
    if (upstream.status === 401) {
      await acquireDshCookie();
      headers.cookie = dshCookie;
      upstream = await fetch(base + req.url, init);
    }
    const resHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (!["content-encoding", "content-length", "set-cookie", "transfer-encoding", "connection"].includes(key)) {
        resHeaders[key] = value;
      }
    });
    res.writeHead(upstream.status, resHeaders);
    if (upstream.body) {
      for await (const chunk of upstream.body) res.write(chunk);
    }
    res.end();
  }

  /** Проксирование WebSocket-апгрейда: голый TCP-конвейер с подменой заголовков. */
  function proxyUpgrade(req, socket, head) {
    const run = () => {
      const upstream = net.connect(Number(baseUrl.port), baseUrl.hostname, () => {
        const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
        for (const [key, value] of Object.entries(req.headers)) {
          if (["host", "cookie", "origin", "referer"].includes(key)) continue;
          lines.push(`${key}: ${value}`);
        }
        lines.push(`host: ${baseUrl.host}`);
        lines.push(`cookie: ${dshCookie}`);
        upstream.write(lines.join("\r\n") + "\r\n\r\n");
        if (head && head.length > 0) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
      });
      upstream.on("error", () => socket.destroy());
      socket.on("error", () => upstream.destroy());
    };
    ensureCookie().then(run, () => socket.destroy());
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const cookies = parseCookies(req.headers.cookie);
    const authed = cookies.phone_ru !== undefined && phoneSessions.has(cookies.phone_ru);

    if (url.pathname === "/login" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 4096) req.destroy(); });
      req.on("end", () => {
        const given = new URLSearchParams(body).get("pin") ?? "";
        if (given === pin) {
          const token = crypto.randomBytes(24).toString("hex");
          phoneSessions.set(token, true);
          res.writeHead(303, {
            location: "/",
            "set-cookie": `phone_ru=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`,
          });
          res.end();
        } else {
          res.writeHead(401, { "content-type": "text/html; charset=utf-8" });
          res.end(LOGIN_PAGE(true));
        }
      });
      return;
    }

    if (!authed) {
      if (req.method === "GET" && (url.pathname === "/" || !url.pathname.startsWith("/api"))) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(LOGIN_PAGE(false));
      } else {
        res.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
        res.end("Нужен PIN");
      }
      return;
    }

    proxyHttp(req, res).catch((error) => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end(`DSH недоступен: ${String(error?.message ?? error)}`);
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.phone_ru === undefined || !phoneSessions.has(cookies.phone_ru)) {
      socket.destroy();
      return;
    }
    proxyUpgrade(req, socket, head);
  });

  const state = { url: `http://${lanAddress()}:${port}`, pin };

  // Ошибка listen (порт занят и т.п.) не должна ронять весь DSH.
  server.on("error", (error) => {
    ctx.logger?.warn?.(`dsh-phone-ru: сервер не поднялся: ${String(error?.message ?? error)}`);
  });

  server.listen(port, "0.0.0.0", () => {
    ctx.logger?.info?.(`dsh-phone-ru: телефонный доступ: ${state.url} (PIN ${pin})`);
  });

  // Кнопка в GUI: отдать QR/ссылку/PIN веб-половине.
  ctx.connection.fetch.register({
    path: "/api/phone-ru/info",
    methods: ["GET"],
    requestBody: "buffered",
    fetch: async () => {
      const qr = await QRCode.toString(state.url, { type: "svg", margin: 1, width: 320 });
      return new Response(JSON.stringify({ url: state.url, pin: state.pin, qr }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    },
  });

  return () => {
    server.close();
    for (const socket of server.connections ?? []) socket.destroy?.();
  };
}

const meta = {
  title: { ru: "Доступ с телефона", en: "Phone access" },
  description: {
    ru: "Весь интерфейс DSH в браузере телефона по локальной сети: QR-код, PIN, без облаков.",
    en: "Full DSH interface in a phone browser over LAN: QR code, PIN, no cloud.",
  },
};

export { Config, apply, inject, meta, name };
