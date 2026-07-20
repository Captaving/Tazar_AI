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
  screenCategories: document.getElementById("screen-categories"),
  screenModels: document.getElementById("screen-models"),
  screenGenerate: document.getElementById("screen-generate"),
  categoryGrid: document.getElementById("category-grid"),
  modelsHeading: document.getElementById("models-heading"),
  generateHeading: document.getElementById("generate-heading"),
  generateSub: document.getElementById("generate-sub"),
  modelPicker: document.getElementById("model-picker"),
  imageRow: document.getElementById("image-row"),
  imageInput: document.getElementById("image-input"),
  imagePreview: document.getElementById("image-preview"),
  promptRow: document.getElementById("prompt-row"),
  promptInput: document.getElementById("prompt-input"),
  generateBtn: document.getElementById("generate-btn"),
  generateHint: document.getElementById("generate-hint"),
  gallery: document.getElementById("gallery"),
  clearGallery: document.getElementById("clear-gallery"),
  clearHistory: document.getElementById("clear-history"),
  adminStats: document.getElementById("admin-stats"),
  lookupUser: document.getElementById("lookup-user"),
  lookupBtn: document.getElementById("lookup-btn"),
  lookupResult: document.getElementById("lookup-result"),
  usersList: document.getElementById("users-list"),
  broadcastText: document.getElementById("broadcast-text"),
  broadcastBtn: document.getElementById("broadcast-btn"),
  broadcastHint: document.getElementById("broadcast-hint"),
};

const state = {
  userId: null,
  settings: { language: "ru", theme: "system", text_model: "grok" },
  models: [],
  mediaCategories: [],
  mediaModels: [],
  activeCategory: null,
  activeModel: null,
  uploadedImage: null,
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
      if (btn.dataset.tab === "models") loadGallery();
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

    const del = document.createElement("button");
    del.className = "del-btn";
    del.textContent = "✕";
    del.title = t("gen.delete");
    del.addEventListener("click", async () => {
      del.disabled = true;
      try {
        await api(`/api/download/${item.id}`, { method: "DELETE" });
        row.remove();
        if (!el.history.children.length) renderHistory([]);
      } catch {
        del.disabled = false;
      }
    });

    body.append(title, meta);
    row.append(icon, body, del);
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
  if (patch.language) {
    renderCategories();
    if (state.activeCategory) renderModelPicker();
  }

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

/* ---------- Модели АИ ---------- */

let isGenerating = false;

/** Три экрана: категории -> модели -> форма генерации. */
function showScreen(name) {
  el.screenCategories.hidden = name !== "categories";
  el.screenModels.hidden = name !== "models";
  el.screenGenerate.hidden = name !== "generate";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function catName(cat) {
  return state.settings.language === "en" ? cat.name_en : cat.name_ru;
}

function renderCategories() {
  el.categoryGrid.textContent = "";

  for (const cat of state.mediaCategories) {
    const card = document.createElement("button");
    card.className = "cat-card";

    const icon = document.createElement("span");
    icon.className = "cat-icon";
    icon.textContent = cat.icon;

    const name = document.createElement("b");
    name.textContent = catName(cat);

    const count = document.createElement("span");
    count.className = "cat-count";
    const n = state.mediaModels.filter((m) => m.category === cat.key).length;
    count.textContent = n;

    card.append(icon, name, count);
    card.addEventListener("click", () => openCategory(cat));
    el.categoryGrid.appendChild(card);
  }
}

function openCategory(cat) {
  state.activeCategory = cat.key;
  state.activeModel = null;
  el.modelsHeading.textContent = catName(cat);
  renderModelPicker();
  showScreen("models");
}

function renderModelPicker() {
  el.modelPicker.textContent = "";

  const models = state.mediaModels.filter((m) => m.category === state.activeCategory);
  for (const model of models) {
    const card = document.createElement("button");
    card.className = "model-card";

    const head = document.createElement("div");
    head.className = "model-head";

    const name = document.createElement("b");
    name.textContent = model.name;

    const price = document.createElement("span");
    price.className = "badge";
    price.textContent = `${model.cost} 🪙`;

    head.append(name, price);

    const desc = document.createElement("p");
    desc.className = "model-desc";
    desc.textContent = state.settings.language === "en" ? model.desc_en : model.desc_ru;

    card.append(head, desc);
    card.addEventListener("click", () => openModel(model));
    el.modelPicker.appendChild(card);
  }
}

function openModel(model) {
  state.activeModel = model;
  state.uploadedImage = null;

  el.generateHeading.textContent = model.name;
  el.generateSub.textContent =
    state.settings.language === "en" ? model.desc_en : model.desc_ru;

  // Загрузка картинки нужна только редактору и «фото → видео».
  // Для генерации с нуля этого поля быть не должно.
  el.imageRow.hidden = !model.needs_image;
  el.imageInput.value = "";
  el.imagePreview.hidden = true;
  el.imagePreview.removeAttribute("src");

  el.promptRow.hidden = !!model.no_prompt;
  el.promptInput.value = "";
  el.promptInput.placeholder = t("gen.promptPh");

  el.generateBtn.textContent = `${t("gen.button")} · ${model.cost} 🪙`;
  setHint(el.generateHint, "");
  showScreen("generate");
}

function initClearButtons() {
  el.clearGallery.addEventListener("click", async () => {
    if (!confirm(t("gen.confirmClear"))) return;
    try {
      await api("/api/media/gallery", { method: "DELETE" });
      renderGallery([]);
    } catch (err) {
      setHint(el.generateHint, err.message, "error");
    }
  });

  el.clearHistory.addEventListener("click", async () => {
    if (!confirm(t("gen.confirmClear"))) return;
    try {
      await api("/api/history", { method: "DELETE" });
      renderHistory([]);
    } catch (err) {
      setHint(el.hint, err.message, "error");
    }
  });
}


function initModelNavigation() {
  document.querySelectorAll(".back-btn").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.back));
  });
}

function initImageUpload() {
  el.imageInput.addEventListener("change", () => {
    const file = el.imageInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      state.uploadedImage = reader.result;
      el.imagePreview.src = reader.result;
      el.imagePreview.hidden = false;
    };
    reader.onerror = () => setHint(el.generateHint, t("gen.needImage"), "error");
    reader.readAsDataURL(file);
  });
}

async function startGeneration() {
  const model = state.activeModel;
  if (!model) return;

  const prompt = el.promptInput.value.trim();
  if (!prompt && !model.no_prompt) {
    setHint(el.generateHint, t("gen.needPrompt"), "error");
    return;
  }
  if (model.needs_image && !state.uploadedImage) {
    setHint(el.generateHint, t("gen.needImage"), "error");
    return;
  }

  isGenerating = true;
  el.generateBtn.disabled = true;
  el.generateBtn.textContent = t("gen.button.busy");
  setHint(el.generateHint, t("gen.queued"));

  try {
    const job = await api("/api/media/generate", {
      method: "POST",
      body: JSON.stringify({
        model: model.key,
        prompt,
        image: state.uploadedImage || undefined,
      }),
    });
    setHint(el.generateHint, t("gen.working"));
    loadGallery();
    await pollGeneration(job.id);
  } catch (err) {
    setHint(el.generateHint, err.message, "error");
  } finally {
    isGenerating = false;
    el.generateBtn.disabled = false;
    el.generateBtn.textContent = `${t("gen.button")} · ${model.cost} 🪙`;
  }
}

async function pollGeneration(id) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    let job;
    try {
      job = await api(`/api/media/job/${id}`);
    } catch {
      continue; // один неудачный опрос — не повод бросать задачу
    }

    if (job.status === "pending") continue;

    setBalance(job.balance);
    loadGallery();

    if (job.status === "done") {
      setHint(el.generateHint, t("gen.done"), "ok");
      tg?.HapticFeedback?.notificationOccurred?.("success");
    } else {
      setHint(el.generateHint, job.error || t("gen.failed"), "error");
      tg?.HapticFeedback?.notificationOccurred?.("error");
    }
    return;
  }

  setHint(el.generateHint, t("gen.slow"));
}

function renderGallery(items) {
  el.gallery.textContent = "";

  if (!items.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = t("gen.empty");
    el.gallery.appendChild(p);
    return;
  }

  for (const item of items) {
    const card = document.createElement("div");
    card.className = "gallery-item";

    if (item.status === "done" && item.output_url) {
      if (item.output_kind === "video") {
        const video = document.createElement("video");
        video.src = item.output_url;
        video.controls = true;
        video.playsInline = true;
        card.appendChild(video);
      } else {
        const img = document.createElement("img");
        img.src = item.output_url;
        img.loading = "lazy";
        card.appendChild(img);
      }
    }

    const meta = document.createElement("div");
    meta.className = item.status === "failed" ? "gallery-meta error" : "gallery-meta";
    if (item.status === "failed") {
      meta.textContent = item.error || t("gen.failed");
    } else if (item.status === "pending") {
      meta.textContent = t("gen.pending");
    } else {
      // промпт приходит от пользователя — только textContent
      meta.textContent = item.prompt || "";
    }

    const del = document.createElement("button");
    del.className = "del-btn";
    del.textContent = "✕";
    del.title = t("gen.delete");
    del.addEventListener("click", async () => {
      del.disabled = true;
      try {
        await api(`/api/media/job/${item.id}`, { method: "DELETE" });
        card.remove();
        if (!el.gallery.children.length) renderGallery([]);
      } catch {
        del.disabled = false;
      }
    });

    card.append(meta, del);
    el.gallery.appendChild(card);
  }
}

async function loadGallery() {
  try {
    const data = await api("/api/media/gallery");
    renderGallery(data.items || []);
  } catch {
    el.gallery.textContent = "";
  }
}

async function loadMediaCatalog() {
  const data = await api("/api/media/models");
  state.mediaCategories = data.categories || [];
  state.mediaModels = data.items || [];
  renderCategories();
}

/* ---------- Админка: статистика, поиск, рассылка ---------- */

function statCard(labelKey, value) {
  const box = document.createElement("div");
  box.className = "stat-card";

  const num = document.createElement("b");
  num.textContent = value ?? 0;

  const label = document.createElement("span");
  label.textContent = t(labelKey);

  box.append(num, label);
  return box;
}

async function loadAdminStats() {
  try {
    const s = await api("/api/admin/stats");
    el.adminStats.textContent = "";

    el.adminStats.append(
      statCard("admin.stats.users", s.users_total),
      statCard("admin.stats.active", s.active_today),
      statCard("admin.stats.downloads", s.downloads_total),
      statCard("admin.stats.generations", s.generations_total),
      statCard("admin.stats.stars", s.stars_total),
      statCard("admin.stats.balance", s.balance_total),
      statCard("admin.stats.failed", s.downloads_failed + s.generations_failed),
    );

    if (s.top_models?.length) {
      const title = document.createElement("p");
      title.className = "muted stat-title";
      title.textContent = t("admin.topModels");
      el.adminStats.appendChild(title);

      for (const m of s.top_models) {
        const row = document.createElement("p");
        row.className = "muted stat-row";
        row.textContent = `${m.key} — ${m.count}`;
        el.adminStats.appendChild(row);
      }
    }
  } catch {
    el.adminStats.textContent = "";
  }
}

function userTitle(u) {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
  return name || `ID ${u.user_id}`;
}

/** Кнопка перехода в профиль. По @username ссылка открывается всегда,
 *  без него остаётся tg://user?id=... — он срабатывает не во всех клиентах. */
function profileButton(u) {
  const btn = document.createElement("button");
  btn.className = "link-btn";

  if (u.username) {
    btn.textContent = `@${u.username}`;
    btn.addEventListener("click", () => {
      const link = `https://t.me/${u.username}`;
      if (tg?.openTelegramLink) tg.openTelegramLink(link);
      else window.open(link, "_blank");
    });
  } else {
    btn.textContent = t("admin.openProfile");
    btn.addEventListener("click", () => {
      if (tg?.openTelegramLink) tg.openTelegramLink(`tg://user?id=${u.user_id}`);
      else window.open(`tg://user?id=${u.user_id}`, "_blank");
    });
  }

  return btn;
}

async function loadAdminUsers() {
  try {
    const data = await api("/api/admin/users");
    el.usersList.textContent = "";

    for (const u of data.items || []) {
      const row = document.createElement("div");
      row.className = "user-row";

      const info = document.createElement("div");
      info.className = "user-info";

      const name = document.createElement("b");
      name.textContent = userTitle(u);

      const sub = document.createElement("span");
      sub.textContent = `ID ${u.user_id} · ${u.balance} 🪙`;

      info.append(name, sub);
      row.append(info, profileButton(u));

      // тап по строке — подставить id в поля выдачи и поиска
      info.addEventListener("click", () => {
        el.grantUser.value = u.user_id;
        el.lookupUser.value = u.user_id;
        el.lookupBtn.click();
      });

      el.usersList.appendChild(row);
    }
  } catch {
    el.usersList.textContent = "";
  }
}

function initAdminTools() {
  el.lookupBtn.addEventListener("click", async () => {
    const id = parseInt(el.lookupUser.value, 10);
    if (!Number.isFinite(id)) return;

    el.lookupResult.textContent = "";
    try {
      const card = await api(`/api/admin/user/${id}`);

      const head = document.createElement("div");
      head.className = "user-row";
      const info = document.createElement("div");
      info.className = "user-info";
      const name = document.createElement("b");
      name.textContent = userTitle(card);
      const sub = document.createElement("span");
      sub.textContent = card.username ? `@${card.username}` : t("admin.noUsername");
      info.append(name, sub);
      head.append(info, profileButton(card));
      el.lookupResult.appendChild(head);

      const rows = [
        [t("admin.card.balance"), card.balance],
        [t("admin.card.downloads"), card.downloads],
        [t("admin.card.generations"), card.generations],
        [t("admin.card.stars"), card.stars_paid],
      ];
      for (const [label, value] of rows) {
        const p = document.createElement("p");
        p.className = "muted stat-row";
        p.textContent = `${label}: ${value}`;
        el.lookupResult.appendChild(p);
      }
    } catch (err) {
      const p = document.createElement("p");
      p.className = "hint error";
      p.textContent = err.message || t("admin.notFound");
      el.lookupResult.appendChild(p);
    }
  });

  el.broadcastBtn.addEventListener("click", async () => {
    const text = el.broadcastText.value.trim();
    if (!text) {
      setHint(el.broadcastHint, t("admin.broadcastEmpty"), "error");
      return;
    }

    el.broadcastBtn.disabled = true;
    setHint(el.broadcastHint, t("admin.broadcastSending"));

    try {
      const job = await api("/api/admin/broadcast", {
        method: "POST",
        body: JSON.stringify({ text }),
      });

      while (true) {
        await new Promise((r) => setTimeout(r, 1000));
        const pr = await api(`/api/admin/broadcast/${job.id}`);
        setHint(el.broadcastHint, `${pr.sent} / ${pr.total}`);
        if (pr.done) {
          setHint(
            el.broadcastHint,
            `${t("admin.broadcastDone")} ${pr.sent}, ${t("admin.broadcastFailed")} ${pr.failed}`,
            "ok",
          );
          el.broadcastText.value = "";
          break;
        }
      }
    } catch (err) {
      setHint(el.broadcastHint, err.message, "error");
    } finally {
      el.broadcastBtn.disabled = false;
    }
  });
}

/* ---------- Старт ---------- */

async function init() {
  initTabs();
  initSettingsControls();
  initAdmin();
  initImageUpload();
  initModelNavigation();
  initClearButtons();
  initAdminTools();
  el.generateBtn.addEventListener("click", () => {
    if (!isGenerating) startGeneration();
  });
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

    if (me.is_admin) {
      el.adminPanel.hidden = false;
      loadAdminStats();
      loadAdminUsers();
    }

    const models = await api("/api/models");
    state.models = models.items || [];
    renderModels();

    await loadMediaCatalog();
    loadGallery();
    loadHistory();
  } catch (err) {
    setHint(el.hint, `${t("err.noServer")}: ${err.message}`, "error");
    el.downloadBtn.disabled = true;
  }
}

init();
