# dsh-phone-ru

**English** | [Русский](#-русский)

Use **DeepSeek Harness from your phone over the local network** — QR code, PIN login, the full DSH web interface in a mobile browser. No cloud, no tunnels, no accounts.

## How to use

1. Install the plugin, restart DSH.
2. A **📱** button appears in the composer toolbar — click it.
3. Point your phone camera at the **QR code** (same Wi-Fi network)
   or type the address into the phone browser manually.
4. Enter the **PIN** shown next to the QR — the whole DSH interface is now on your phone:
   sessions, chats, agent runs, approvals.

## How it works

The plugin starts a small HTTP server on `0.0.0.0:19390` with a Russian PIN login page.
After login it transparently proxies requests (HTTP + WebSocket) to the local DSH web
server (`127.0.0.1:19387`), injecting the session cookie it obtains through a legitimate
launch-token exchange via `ctx.connection.authenticatedUrl()`. The DSH token and cookie
never leave the computer — the phone only ever sees the PIN.

- The PIN is generated once and stored in `$DSH_HOME/dsh-phone-ru.json` — replace it
  with your own if you like.
- LAN traffic is unencrypted (same as DSH itself) — use on your home network,
  not public Wi-Fi.

## Install

Via your profile `package.json`:

```json
{
  "dsh": { "profile": { "bundles": ["dsh-phone-ru"] } },
  "dependencies": { "dsh-phone-ru": "^1.0.0" }
}
```

then restart DSH.

## Requirements

DeepSeek Harness 0.2.0-rc.2 (desktop or web profile). Cross-platform: pure Node, no native code.

---

## 🇷🇺 Русский

Доступ к DeepSeek Harness **с телефона по локальной сети** — по-русски, без облаков и лишних настроек.

### Как пользоваться

1. Поставьте плагин, перезапустите DSH.
2. В поле ввода появится кнопка **«📱»** — нажмите её.
3. Наведите камеру телефона на **QR-код** (телефон в той же Wi-Fi сети)
   или введите адрес вручную в браузере телефона.
4. Введите **PIN-код** (показан рядом с QR) — и весь интерфейс DSH у вас в телефоне:
   сессии, диалоги, запуск агента, подтверждения.

### Как это работает

Плагин поднимает свой мини-сервер на `0.0.0.0:19390` с русской страницей входа по PIN.
После входа он прозрачно проксирует запросы (HTTP + WebSocket) в локальный веб-сервер
DSH (`127.0.0.1:19387`), подставляя служебную cookie, которую получает честным обменом
launch-токена через `ctx.connection.authenticatedUrl()`. Токен и cookie DSH никогда
не покидают компьютер — телефон знает только PIN.

- PIN генерируется один раз и хранится в `$DSH_HOME/dsh-phone-ru.json` —
  замените на свой, если хотите.
- Трафик в локальной сети не шифруется (как и у самого DSH) — используйте дома,
  не в общественных Wi-Fi.

### Установка

Через `package.json` профиля:

```json
{
  "dsh": { "profile": { "bundles": ["dsh-phone-ru"] } },
  "dependencies": { "dsh-phone-ru": "^1.0.0" }
}
```

и перезапуск DSH.

### Требования

DeepSeek Harness 0.2.0-rc.2 (десктоп или web-профиль). Кроссплатформенно: чистый Node, без нативного кода.

## License

MIT © 2026 xzdes
