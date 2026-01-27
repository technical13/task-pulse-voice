# todo-state v2 (voice experiment)

Локальная v2-ветка для эксперимента с озвучкой сообщений в чате через SpeechCoreAI.
Токен хранится на сервере (proxy), в браузер не попадает.

## Запуск

1) Установить зависимости:

```bash
npm install
```

2) Создать `.env.local` в корне проекта (скопировать из `.env.local.example`). Если dev-сервер уже запущен, перезапустить `npm run dev`.
   SPEECHCORE_AUTH_PREFIX можно указывать как `Bearer` без пробела — пробел добавляется кодом.

## Переменные окружения (Vercel)

Все ключи и токены задаются только через env, без секретов в репозитории.

- `VITE_CONVEX_URL` — URL Convex backend для клиента.
- `SPEECHCORE_API_TOKEN` — токен SpeechCore для serverless `/api/stt`.
- `SPEECHCORE_AUTH_HEADER` — имя заголовка авторизации (по умолчанию `Authorization`).
- `SPEECHCORE_AUTH_PREFIX` — префикс авторизации (по умолчанию `Bearer`).

3) Запуск serverless (рекомендуется):

```bash
npm run dev:vercel
```

Локальный server (опционально, если нужно прогнать старый proxy):

```bash
npm run dev:server
npm run dev
```
