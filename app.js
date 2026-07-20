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
  qualityList: document.getElementById("quality-list"),
  languageGroup: document.getElementById("language-group"),
  themeGroup: document.getElementById("theme-group"),
  modelList: document.getElementById("model-list"),
  adminPanel: document.getElementById("admin-panel"),
  grantUser: document.getElementById("grant-user"),
  grantAmount: document.getElementById("grant-amount"),
  grantBtn: document.getElementById("grant-btn"),
  grantSelf: document.getElementById("grant-self"),
  grantHint: document.getElementById("grant-hint"),
};

const state = {
  userId: null,
  settings: { language: "ru", theme: "system", text_model: "grok" },
  models: [],
};

/* ---------- Утилиты ---------- */

function setHint(node, text, kind = "") {
  node.textContent = text;
  node.className = kind ? `hint ${kind}` : "hint";
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

/* ---------- Тема ---------- */

function applyTheme(theme) {
  // system — отдаём управление переменным Telegram, они уже совпадают с темой клиента
  document.documentElement.dataset.theme = theme === "system" ? "" : theme;
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
  const locale = state.settings.language === "en" ? "en-GB" : "ru-RU";
  return new Date(unixSeconds * 1000).toLocaleString(locale, {
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
  el.history.textContent = "";

  if (!items.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = t("dl.empty");
    el.history.appendChild(p);
    return;
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "history-item";

    const icon = document.createElement("div");
    icon.className = "history-icon";
    icon.textContent =
      item.status === "failed" ? "⚠️" : item.status === "pending" ? "⏳" : KIND_ICON[item.kind] || "📄";

    const body = document.createElement("div");
    body.className = "history-body";

    const title = document.createElement("div");
    title.className = "history-title";
    // textContent, а не innerHTML: заголовки приходят с чужих сайтов
    title.textContent = item.title || shortenUrl(item.url);

    const meta = document.createElement("div");
    if (item.status === "failed") {
      meta.className = "history-meta error";
      meta.textContent = item.error || t("dl.failed");
    } else if (item.status === "pending") {
      meta.className = "history-meta";
      meta.textContent = t("dl.pending");
    } else {
      meta.className = "history-meta";
      meta.textContent = formatDate(item.created_at) + (item.cost ? ` · −${item.cost} 🪙` : "");
    }

    body.append(title, meta);
    row.append(icon, body);
    el.history.appendChild(row);
  }
}

async function loadHistory() {
  try {
    const data = await api("/api/history");
    renderHistory(data.items || []);
  } catch (err) {
    el.history.textContent = `${t("dl.historyError")}: ${err.message}`;
  }
}

/* ---------- Скачивание ---------- */

let isDownloading = false;

function hideQualities() {
  el.qualityList.hidden = true;
  el.qualityList.textContent = "";
}

function formatSize(bytes) {
  if (!bytes) return "";
  return ` · ~${Math.round(bytes / 1024 / 1024)} МБ`;
}

/** Шаг 1: узнаём доступные качества, ничего не скачивая. */
async function checkQualities() {
  const url = el.urlInput.value.trim();
  if (!url) {
    setHint(el.hint, t("dl.noUrl"), "error");
    return;
  }

  hideQualities();
  el.downloadBtn.disabled = true;
  el.downloadBtn.textContent = t("dl.button.checking");
  setHint(el.hint, "");

  try {
    const data = await api("/api/formats", { method: "POST", body: JSON.stringify({ url }) });
    const options = data.options || [];

    // единственный вариант — не мучаем выбором, качаем сразу
    if (options.length <= 1) {
      await startDownload(options[0]?.id || "best");
      return;
    }

    renderQualities(options);
    setHint(el.hint, t("dl.pickQuality"));
  } catch (err) {
    setHint(el.hint, err.message, "error");
  } finally {
    el.downloadBtn.disabled = false;
    el.downloadBtn.textContent = t("dl.button");
  }
}

function renderQualities(options) {
  el.qualityList.textContent = "";

  for (const opt of options) {
    const btn = document.createElement("button");
    btn.className = "quality-btn";
    btn.textContent = opt.label + formatSize(opt.size);
    btn.addEventListener("click", () => {
      if (!isDownloading) startDownload(opt.id);
    });
    el.qualityList.appendChild(btn);
  }

  el.qualityList.hidden = false;
}

/** Шаг 2: ставим скачивание в очередь на бэкенде. */
async function startDownload(quality) {
  const url = el.urlInput.value.trim();
  if (!url) {
    setHint(el.hint, t("dl.noUrl"), "error");
    return;
  }

  isDownloading = true;
  hideQualities();
  el.downloadBtn.disabled = true;
  el.downloadBtn.textContent = t("dl.button.busy");
  setHint(el.hint, t("dl.queued"));

  try {
    const job = await api("/api/download", {
      method: "POST",
      body: JSON.stringify({ url, quality }),
    });
    setHint(el.hint, t("dl.working"));
    loadHistory();
    await pollJob(job.id);
  } catch (err) {
    setHint(el.hint, err.message, "error");
  } finally {
    isDownloading = false;
    el.downloadBtn.disabled = false;
    el.downloadBtn.textContent = t("dl.button");
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
      setHint(el.hint, t("dl.done"), "ok");
      el.urlInput.value = "";
      tg?.HapticFeedback?.notificationOccurred?.("success");
    } else {
      setHint(el.hint, job.error || t("dl.failed"), "error");
      tg?.HapticFeedback?.notificationOccurred?.("error");
    }
    return;
  }

  setHint(el.hint, t("dl.slow"));
}

/* ---------- Настройки ---------- */

function markSegmented(group, value) {
  group.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.value === value);
  });
}

async function saveSettings(patch) {
  const previous = { ...state.settings };
  state.settings = { ...state.settings, ...patch };

  if (patch.language) applyLanguage(patch.language);
  if (patch.theme) applyTheme(patch.theme);
  if (patch.text_model) renderModels();

  try {
    state.settings = await api("/api/settings", {
      method: "POST",
      body: JSON.stringify(patch),
    });
    tg?.HapticFeedback?.selectionChanged?.();
  } catch (err) {
    // откатываем интерфейс, чтобы он не расходился с сервером
    state.settings = previous;
    applyLanguage(previous.language);
    applyTheme(previous.theme);
    markSegmented(el.languageGroup, previous.language);
    markSegmented(el.themeGroup, previous.theme);
    renderModels();
    setHint(el.grantHint, `${t("set.saveError")}: ${err.message}`, "error");
  }
}

function renderModels() {
  el.modelList.textContent = "";

  for (const model of state.models) {
    const card = document.createElement("button");
    card.className = "model-card";
    card.classList.toggle("is-active", model.key === state.settings.text_model);

    const head = document.createElement("div");
    head.className = "model-head";

    const name = document.createElement("b");
    name.textContent = model.name;

    const price = document.createElement("span");
    price.className = model.cost === 0 ? "badge free" : "badge";
    price.textContent = model.cost === 0 ? t("set.free") : `${model.cost} 🪙 ${t("set.perQuery")}`;

    head.append(name, price);

    const desc = document.createElement("p");
    desc.className = "model-desc";
    desc.textContent = state.settings.language === "en" ? model.desc_en : model.desc_ru;

    card.append(head, desc);
    card.addEventListener("click", () => saveSettings({ text_model: model.key }));
    el.modelList.appendChild(card);
  }
}

function initSettingsControls() {
  el.languageGroup.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      markSegmented(el.languageGroup, btn.dataset.value);
      saveSettings({ language: btn.dataset.value });
    });
  });

  el.themeGroup.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      markSegmented(el.themeGroup, btn.dataset.value);
      saveSettings({ theme: btn.dataset.value });
    });
  });
}

/* ---------- Админка ---------- */

function initAdmin() {
  el.grantSelf.addEventListener("click", () => {
    el.grantUser.value = state.userId ?? "";
  });

  el.grantBtn.addEventListener("click", async () => {
    const userId = parseInt(el.grantUser.value, 10);
    const amount = parseInt(el.grantAmount.value, 10);

    if (!Number.isFinite(userId) || !Number.isFinite(amount)) {
      setHint(el.grantHint, t("admin.needFields"), "error");
      return;
    }

    el.grantBtn.disabled = true;
    try {
      const res = await api("/api/admin/grant", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, amount }),
      });
      setHint(el.grantHint, `${t("admin.granted")} ${res.balance}`, "ok");
      el.grantAmount.value = "";
      if (res.user_id === state.userId) setBalance(res.balance);
      tg?.HapticFeedback?.notificationOccurred?.("success");
    } catch (err) {
      setHint(el.grantHint, err.message, "error");
    } finally {
      el.grantBtn.disabled = false;
    }
  });
}

/* ---------- Старт ---------- */

async function init() {
  initTabs();
  initSettingsControls();
  initAdmin();
  applyLanguage(state.settings.language);
  setHint(el.hint, t("dl.hint"));

  if (!tg) {
    setHint(el.hint, t("err.telegramOnly"), "error");
    el.downloadBtn.disabled = true;
    return;
  }

  tg.ready();
  tg.expand();

  if (!tg.initData) {
    setHint(el.hint, t("err.noInitData"), "error");
    el.downloadBtn.disabled = true;
    return;
  }

  el.downloadBtn.addEventListener("click", () => {
    if (!isDownloading) checkQualities();
  });
  el.urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !isDownloading) checkQualities();
  });
  // новая ссылка — старые варианты качества уже неактуальны
  el.urlInput.addEventListener("input", hideQualities);

  try {
    const me = await api("/api/me");
    state.userId = me.user_id;
    state.settings = me.settings;

    el.greeting.textContent = `${me.first_name || "…"}`;
    setBalance(me.balance);
    applyLanguage(me.settings.language);
    applyTheme(me.settings.theme);
    markSegmented(el.languageGroup, me.settings.language);
    markSegmented(el.themeGroup, me.settings.theme);
    setHint(el.hint, t("dl.hint"));

    if (me.is_admin) el.adminPanel.hidden = false;

    const models = await api("/api/models");
    state.models = models.items || [];
    renderModels();

    loadHistory();
  } catch (err) {
    setHint(el.hint, `${t("err.noServer")}: ${err.message}`, "error");
    el.downloadBtn.disabled = true;
  }
}

init();
