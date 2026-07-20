// Домен бэкенда — proxy_pass на VPS до miniapp_api.py (см. README.md про nginx).
const API_BASE = "https://captaving.duckdns.org/miniapp-api";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000; // страховка: дольше 15 минут не ждём

const tg = window.Telegram?.WebApp;

const el = {
  greeting: document.getElementById("greeting"),
  balance: document.getElementById("balance-value"),
  urlInput: document.getElementById("url-input"),
  downloadBtn: document.getElementById("download-btn"),
  hint: document.getElementById("download-hint"),
  history: document.getElementById("history-list"),
};

const DEFAULT_HINT = "Файл придёт сообщением в чат с ботом. До 500 МБ.";

function setHint(text, kind = "") {
  el.hint.textContent = text;
  el.hint.className = kind ? `hint ${kind}` : "hint";
}

function setBalance(value) {
  if (typeof value === "number") el.balance.textContent = value;
}

async function api(path, options = {}) {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "Content-Type": "application/json",
      Authorization: `tma ${tg.initData}`,
    },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Ошибка ${resp.status}`);
  return data;
}

/* ---------- Табы ---------- */

function initTabs() {
  document.querySelectorAll(".tabbar-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabbar-btn").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll(".tab").forEach((tab) => {
        tab.hidden = tab.id !== `tab-${btn.dataset.tab}`;
      });
      if (btn.dataset.tab === "download") loadHistory();
    });
  });
}

/* ---------- История ---------- */

const KIND_ICON = { video: "🎬", photo: "🖼", audio: "🎵", document: "📄" };

function formatDate(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortenUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + u.pathname;
  } catch {
    return url;
  }
}

function renderHistory(items) {
  if (!items.length) {
    el.history.innerHTML = `<p class="muted">Пока пусто — вставь первую ссылку выше.</p>`;
    return;
  }

  el.history.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "history-item";

    const icon =
      item.status === "failed" ? "⚠️" : item.status === "pending" ? "⏳" : KIND_ICON[item.kind] || "📄";

    let meta;
    if (item.status === "failed") {
      meta = `<div class="history-meta error">${item.error || "Не удалось скачать"}</div>`;
    } else if (item.status === "pending") {
      meta = `<div class="history-meta">Качаю…</div>`;
    } else {
      const cost = item.cost ? ` · −${item.cost} 💠` : "";
      meta = `<div class="history-meta">${formatDate(item.created_at)}${cost}</div>`;
    }

    const title = item.title || shortenUrl(item.url);
    row.innerHTML = `
      <div class="history-icon">${icon}</div>
      <div class="history-body">
        <div class="history-title"></div>
        ${meta}
      </div>`;
    // текст ставим через textContent — заголовки приходят с чужих сайтов
    row.querySelector(".history-title").textContent = title;
    el.history.appendChild(row);
  }
}

async function loadHistory() {
  try {
    const data = await api("/api/history");
    renderHistory(data.items || []);
  } catch (err) {
    el.history.innerHTML = `<p class="muted">Не смог загрузить историю: ${err.message}</p>`;
  }
}

/* ---------- Скачивание ---------- */

let isDownloading = false;

async function startDownload() {
  const url = el.urlInput.value.trim();
  if (!url) {
    setHint("Вставь ссылку", "error");
    return;
  }

  isDownloading = true;
  el.downloadBtn.disabled = true;
  el.downloadBtn.textContent = "Качаю…";
  setHint("Ставлю в очередь…");

  try {
    const job = await api("/api/download", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
    setHint("Качаю — файл придёт в чат с ботом.");
    loadHistory();
    await pollJob(job.id);
  } catch (err) {
    setHint(err.message, "error");
  } finally {
    isDownloading = false;
    el.downloadBtn.disabled = false;
    el.downloadBtn.textContent = "Скачать";
  }
}

async function pollJob(id) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    let job;
    try {
      job = await api(`/api/download/${id}`);
    } catch {
      continue; // разрыв сети на одном опросе — не повод бросать задачу
    }

    if (job.status === "pending") continue;

    setBalance(job.balance);
    loadHistory();

    if (job.status === "done") {
      setHint("Готово — файл отправлен в чат с ботом ✅", "ok");
      el.urlInput.value = "";
      tg?.HapticFeedback?.notificationOccurred?.("success");
    } else {
      setHint(job.error || "Не удалось скачать", "error");
      tg?.HapticFeedback?.notificationOccurred?.("error");
    }
    return;
  }

  setHint("Скачивание идёт дольше обычного — проверь чат с ботом позже.");
}

/* ---------- Старт ---------- */

async function init() {
  initTabs();

  if (!tg) {
    setHint("Эта страница работает только внутри Telegram.", "error");
    el.downloadBtn.disabled = true;
    return;
  }

  tg.ready();
  tg.expand();

  if (!tg.initData) {
    setHint("Открой мини-апп заново из бота (команда /app).", "error");
    el.downloadBtn.disabled = true;
    return;
  }

  el.downloadBtn.addEventListener("click", () => {
    if (!isDownloading) startDownload();
  });
  el.urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !isDownloading) startDownload();
  });

  try {
    const me = await api("/api/me");
    el.greeting.textContent = `Привет, ${me.first_name || "друг"}!`;
    setBalance(me.balance);
    setHint(DEFAULT_HINT);
    loadHistory();
  } catch (err) {
    setHint(`Нет связи с сервером: ${err.message}`, "error");
    el.downloadBtn.disabled = true;
  }
}

init();
