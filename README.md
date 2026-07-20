# Downloader Bot — мини-апп, шаг 1: скелет

Проверочный экран: открывается из бота, подтверждает подпись Telegram (`initData`) на бэкенде и показывает баланс жетонов. Каталог моделей Replicate — следующим шагом поверх этого скелета.

## Архитектура

- **Фронтенд** (эта папка) — статика (HTML/CSS/JS), без единого секрета внутри. Живёт в своём GitHub-репозитории, хостится GitHub Pages.
- **Бэкенд** (`miniapp_api.py` в корне проекта бота) — отдельный процесс на твоём VPS, рядом с ботом. Здесь и только здесь — токен бота, обращения к Replicate, баланс жетонов. GitHub Pages сервер-сайд код не поддерживает, поэтому это не может жить в репозитории фронтенда.

```
Telegram → открывает GitHub Pages URL → фронтенд шлёт initData → бэкенд на VPS проверяет подпись → отдаёт баланс
```

## Деплой фронтенда на GitHub Pages

1. Создать **публичный** репозиторий (на бесплатном личном плане GitHub Pages работает только с public-репозиториями; приватные — только с Pro/Team/Enterprise). Секретов во фронтенде нет, так что это ок.
2. Запушить содержимое этой папки:
   ```bash
   cd miniapp
   git init
   git add .
   git commit -m "miniapp: skeleton screen"
   git branch -M main
   git remote add origin https://github.com/<твой-юзернейм>/<repo>.git
   git push -u origin main
   ```
3. В репозитории: Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / `/(root)`.
4. Через минуту-две сайт появится на `https://<твой-юзернейм>.github.io/<repo>/`.
5. Этот URL — в `.env` бота как `MINIAPP_URL`.

## Бэкенд на VPS

```bash
# в той же папке, что и bot.py
pip install -r requirements.txt   # aiohttp там уже есть
python3 miniapp_api.py            # слушает 127.0.0.1:8081 (порт — config.MINIAPP_API_PORT)
```

Продакшн — вторым процессом в PM2, рядом с ботом:
```bash
pm2 start miniapp_api.py --interpreter python3 --name downloader-miniapp-api
```

### Nginx: прокинуть путь на бэкенд

В существующий серверный блок (`captaving.duckdns.org` или какой используется) добавить:

```nginx
location /miniapp-api/ {
    proxy_pass http://127.0.0.1:8081/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Слэш на конце `proxy_pass http://127.0.0.1:8081/` важен — он срезает префикс `/miniapp-api`, и бэкенд видит путь `/api/me` как есть.

Если домен/путь будут другими — поправить `API_BASE` в `app.js`.

## .env бота

```
MINIAPP_URL=https://<твой-юзернейм>.github.io/<repo>/
MINIAPP_ALLOWED_ORIGINS=https://<твой-юзернейм>.github.io
```

`MINIAPP_ALLOWED_ORIGINS` — это CORS-фильтр на бэкенде: без него в проде лучше не оставлять (сейчас, если переменная пустая, бэкенд разрешает любой origin — удобно для локальной разработки, но перед продакшном стоит проставить).

## Как проверить, что всё работает

1. В боте: `/app` → кнопка "Открыть мини-апп"
2. Мини-апп открывается, должно появиться "Привет, <имя>!" и баланс жетонов
3. Если видишь ошибку — проверить: бэкенд запущен? nginx проксирует? `MINIAPP_URL`/`MINIAPP_ALLOWED_ORIGINS` совпадают с реальным адресом GitHub Pages?

## Дальше

Этот экран — только проверка связи. Каталог моделей Replicate по категориям, карточки с параметрами генерации, полинг результата — следующими шагами поверх этого же бэкенда (`miniapp_api.py` обрастёт эндпоинтами).
