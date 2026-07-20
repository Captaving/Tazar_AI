// Домен бэкенда — proxy_pass на VPS до miniapp_api.py (см. miniapp/README.md про nginx).
// Поменяй на свой, если домен/путь другие.
const API_BASE = "https://captaving.duckdns.org/miniapp-api";

const tg = window.Telegram?.WebApp;

const greetingEl = document.getElementById("greeting");
const statusEl = document.getElementById("status");
const balanceRow = document.getElementById("balance-row");
const balanceValue = document.getElementById("balance-value");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

async function init() {
  if (!tg) {
    greetingEl.textContent = "Открой через Telegram";
    setStatus("Эта страница работает только внутри Telegram-бота.", true);
    return;
  }

  tg.ready();
  tg.expand();

  if (!tg.initData) {
    greetingEl.textContent = "Нет данных от Telegram";
    setStatus("Открой мини-апп заново из бота (кнопка /app).", true);
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/api/me`, {
      headers: { Authorization: `tma ${tg.initData}` },
    });
    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }

    greetingEl.textContent = `Привет, ${data.first_name || "друг"}!`;
    balanceValue.textContent = data.balance;
    balanceRow.hidden = false;
    setStatus("Связь с сервером есть ✅");
  } catch (err) {
    greetingEl.textContent = "Не получилось подключиться";
    setStatus(err.message || "Ошибка сети", true);
  }
}

init();
