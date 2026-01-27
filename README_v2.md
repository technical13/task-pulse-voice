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

3) Запустить клиент и сервер:

```bash
npm run dev
```

Отдельно:

```bash
npm run dev:server
npm run dev:client
```
