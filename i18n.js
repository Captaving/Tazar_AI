// Переводы интерфейса. Ключи вида "раздел.элемент" ставятся в HTML через data-i18n.
const I18N = {
  ru: {
    "nav.models": "Модели АИ",
    "nav.download": "Скачивание",
    "nav.settings": "Настройки",

    "models.title": "Модели АИ",
    "models.soon": "Генерация картинок, видео и аудио по категориям появится здесь следующим шагом.",

    "dl.label": "Ссылка на видео или пост",
    "dl.button": "Скачать",
    "dl.button.checking": "Проверяю…",
    "dl.pickQuality": "Выбери качество:",
    "dl.button.busy": "Качаю…",
    "dl.hint": "Файл придёт сообщением в чат с ботом. До 500 МБ.",
    "dl.history": "История",
    "dl.empty": "Пока пусто — вставь первую ссылку выше.",
    "dl.queued": "Ставлю в очередь…",
    "dl.working": "Качаю — файл придёт в чат с ботом.",
    "dl.done": "Готово — файл отправлен в чат с ботом ✅",
    "dl.failed": "Не удалось скачать",
    "dl.slow": "Скачивание идёт дольше обычного — проверь чат с ботом позже.",
    "dl.pending": "Качаю…",
    "dl.noUrl": "Вставь ссылку",
    "dl.historyError": "Не смог загрузить историю",

    "set.language": "Язык",
    "set.theme": "Тема",
    "set.theme.system": "Системная",
    "set.theme.light": "Светлая",
    "set.theme.dark": "Тёмная",
    "set.model": "Модель в чате с ботом",
    "set.free": "бесплатно",
    "set.perQuery": "за вопрос",
    "set.saveError": "Не смог сохранить",

    "admin.title": "Админ-панель",
    "admin.user": "ID пользователя",
    "admin.amount": "Сколько жетонов",
    "admin.grant": "Начислить",
    "admin.self": "Себе",
    "admin.granted": "Начислено. Новый баланс:",
    "admin.needFields": "Заполни ID и сумму",

    "err.telegramOnly": "Эта страница работает только внутри Telegram.",
    "err.noInitData": "Открой мини-апп заново из бота (команда /app).",
    "err.noServer": "Нет связи с сервером",
  },

  en: {
    "nav.models": "AI models",
    "nav.download": "Download",
    "nav.settings": "Settings",

    "models.title": "AI models",
    "models.soon": "Image, video and audio generation by category is coming in the next step.",

    "dl.label": "Link to a video or post",
    "dl.button": "Download",
    "dl.button.checking": "Checking…",
    "dl.pickQuality": "Choose quality:",
    "dl.button.busy": "Downloading…",
    "dl.hint": "The file arrives as a message in your chat with the bot. Up to 500 MB.",
    "dl.history": "History",
    "dl.empty": "Nothing yet — paste your first link above.",
    "dl.queued": "Queueing…",
    "dl.working": "Downloading — the file will arrive in your chat with the bot.",
    "dl.done": "Done — the file was sent to your chat with the bot ✅",
    "dl.failed": "Download failed",
    "dl.slow": "This is taking longer than usual — check your chat with the bot later.",
    "dl.pending": "Downloading…",
    "dl.noUrl": "Paste a link",
    "dl.historyError": "Couldn't load history",

    "set.language": "Language",
    "set.theme": "Theme",
    "set.theme.system": "System",
    "set.theme.light": "Light",
    "set.theme.dark": "Dark",
    "set.model": "Model in the bot chat",
    "set.free": "free",
    "set.perQuery": "per question",
    "set.saveError": "Couldn't save",

    "admin.title": "Admin panel",
    "admin.user": "User ID",
    "admin.amount": "Jetons to grant",
    "admin.grant": "Grant",
    "admin.self": "To myself",
    "admin.granted": "Granted. New balance:",
    "admin.needFields": "Fill in the ID and amount",

    "err.telegramOnly": "This page only works inside Telegram.",
    "err.noInitData": "Open the mini app again from the bot (/app command).",
    "err.noServer": "No connection to the server",
  },
};

let currentLang = "ru";

function t(key) {
  return I18N[currentLang]?.[key] ?? I18N.ru[key] ?? key;
}

function applyLanguage(lang) {
  currentLang = I18N[lang] ? lang : "ru";
  document.documentElement.lang = currentLang;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
}
