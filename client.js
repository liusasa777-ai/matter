const storageKey = "matter.notes.v1";

const noteStyles = [
  { id: "paper", className: "style-paper", texture: "texture-soft", tape: "tape-top", border: "" },
  { id: "apricot-grid", className: "style-apricot texture-grid border-thin", texture: "grid", tape: "tape-left", border: "thin" },
  { id: "pink-lined", className: "style-pink texture-lined border-pink", texture: "lined", tape: "tape-top", border: "pink-line" },
  { id: "blue-paper", className: "style-blue border-thin", texture: "soft-paper", tape: "", border: "thin" },
  { id: "yellow-lined", className: "style-yellow texture-lined", texture: "lined", tape: "tape-left", border: "" },
  { id: "sage-grid", className: "style-sage texture-grid border-thin", texture: "grid", tape: "tape-top", border: "thin" }
];

const seedNotes = [];

let notes = loadNotes();
let draft = null;
let activeTag = "全部";

const elements = {
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  moodInput: document.querySelector("#mood-input"),
  generateButton: document.querySelector("#generate-note"),
  generateStatus: document.querySelector("#generate-status"),
  previewTime: document.querySelector("#preview-time"),
  previewContent: document.querySelector("#preview-content"),
  previewDate: document.querySelector("#preview-date"),
  previewClock: document.querySelector("#preview-clock"),
  previewTags: document.querySelector("#preview-tags"),
  saveButton: document.querySelector("#save-note"),
  saveStatus: document.querySelector("#save-status"),
  searchInput: document.querySelector("#search-input"),
  tagFilters: document.querySelector("#tag-filters"),
  notesGrid: document.querySelector("#notes-grid"),
  notesEmpty: document.querySelector("#notes-empty"),
  template: document.querySelector("#note-template"),
  weekCount: document.querySelector("#week-count"),
  weekList: document.querySelector("#week-list"),
  analyzeButton: document.querySelector("#analyze-week"),
  analysisStatus: document.querySelector("#analysis-status"),
  summaryGrid: document.querySelector("#summary-grid"),
  analysisCopy: document.querySelector("#analysis-copy")
};

bindEvents();
setView(getInitialView(), false);
renderAll();

function bindEvents() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  });

  elements.generateButton.addEventListener("click", generateNote);
  elements.saveButton.addEventListener("click", saveDraft);
  elements.searchInput.addEventListener("input", renderNotes);
  elements.analyzeButton.addEventListener("click", analyzeWeek);
}

function setView(viewName, updateHash = true) {
  elements.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewName));
  elements.views.forEach((view) => view.classList.remove("active"));
  document.querySelector(`#${viewName}-view`).classList.add("active");
  if (updateHash) history.replaceState(null, "", `#${viewName}`);
  if (viewName === "notes") renderNotes();
  if (viewName === "week") renderWeek();
}

function getInitialView() {
  const hashView = location.hash.replace("#", "");
  return ["mood", "notes", "week"].includes(hashView) ? hashView : "mood";
}

async function generateNote() {
  const inputText = elements.moodInput.value.trim();
  if (!inputText) {
    setStatus(elements.generateStatus, "写一点也可以", true);
    return;
  }

  setStatus(elements.generateStatus, "正在轻轻整理...");
  elements.generateButton.disabled = true;

  try {
    const result = await postJson("/api/ai/generate-note", { inputText, sourceType: "text" });
    const now = new Date();
    draft = {
      content: result.diary,
      originalInput: inputText,
      inputType: "text",
      generationMode: "ai_rewrite",
      date: formatDate(now),
      time: formatTime(now),
      tags: result.tags,
      styleId: randomStyleId()
    };
    renderPreview();
    setStatus(elements.generateStatus, "整理好了，可以再改一改");
  } catch (error) {
    setStatus(elements.generateStatus, error.message || "刚刚没整理好，再试一次", true);
  } finally {
    elements.generateButton.disabled = false;
  }
}

function renderPreview() {
  if (!draft) return;
  const style = getStyle(draft.styleId);
  elements.previewContent.value = draft.content;
  elements.previewDate.textContent = draft.date;
  elements.previewClock.textContent = draft.time;
  elements.previewTime.textContent = `${draft.date} ${draft.time}`;
  renderTags(elements.previewTags, draft.tags);
  elements.saveButton.disabled = false;

  const card = document.querySelector("#preview-card");
  card.className = `note-card preview-card ${style.className}`;
  const tape = card.querySelector(".tape");
  tape.className = `tape ${style.tape || "hidden-tape"}`;
}

function saveDraft() {
  if (!draft) return;
  const now = new Date();
  const saved = {
    id: crypto.randomUUID(),
    ...draft,
    content: elements.previewContent.value.trim() || draft.content,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  notes = [saved, ...notes];
  saveNotes();
  draft = null;
  elements.saveButton.disabled = true;
  elements.saveStatus.textContent = "已经放进碎碎念";
  elements.moodInput.value = "";
  renderAll();
}

function renderAll() {
  renderTagFilters();
  renderNotes();
  renderWeek();
}

function renderTagFilters() {
  const tags = ["全部", ...topTags(notes)];
  elements.tagFilters.innerHTML = "";
  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.className = `filter-chip ${tag === activeTag ? "active" : ""}`;
    button.textContent = tag;
    button.addEventListener("click", () => {
      activeTag = tag;
      renderTagFilters();
      renderNotes();
    });
    elements.tagFilters.append(button);
  });
}

function renderNotes() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const filtered = notes.filter((note) => {
    const matchesTag = activeTag === "全部" || note.tags.includes(activeTag);
    const haystack = `${note.content} ${note.tags.join(" ")}`.toLowerCase();
    return matchesTag && (!query || haystack.includes(query));
  });

  elements.notesGrid.innerHTML = "";
  filtered.forEach((note) => {
    elements.notesGrid.append(createNoteCard(note, query));
  });

  elements.notesEmpty.classList.toggle("show", filtered.length === 0);
}

function createNoteCard(note, query = "") {
  const node = elements.template.content.firstElementChild.cloneNode(true);
  const style = getStyle(note.styleId);
  node.className = `note-card ${style.className}`;

  const tape = node.querySelector(".tape");
  tape.className = `tape ${style.tape || "hidden-tape"}`;

  node.querySelector(".note-content").innerHTML = highlight(note.content, query);
  node.querySelector(".note-meta").innerHTML = `<span>${note.date}</span><span>${note.time}</span>`;
  renderTags(node.querySelector(".tag-row"), note.tags, query);

  node.querySelector('[data-action="edit"]').addEventListener("click", () => editNote(note.id));
  node.querySelector('[data-action="delete"]').addEventListener("click", () => deleteNote(note.id));
  return node;
}

function editNote(id) {
  const note = notes.find((item) => item.id === id);
  if (!note) return;
  const nextContent = window.prompt("编辑便笺正文", note.content);
  if (nextContent === null) return;
  note.content = nextContent.trim() || note.content;
  note.updatedAt = new Date().toISOString();
  saveNotes();
  renderAll();
}

function deleteNote(id) {
  if (!window.confirm("确定删除这张便笺吗？")) return;
  notes = notes.filter((note) => note.id !== id);
  saveNotes();
  renderAll();
}

function renderWeek() {
  const recent = recentWeekNotes();
  elements.weekCount.textContent = `${recent.length} 条便笺`;
  elements.weekList.innerHTML = "";

  if (recent.length === 0) {
    elements.weekList.innerHTML = '<div class="empty-state show">最近 7 天还没有便笺。</div>';
    return;
  }

  const grouped = groupBy(recent, (note) => note.date);
  Object.entries(grouped).forEach(([date, items]) => {
    const group = document.createElement("section");
    group.className = "date-group";
    group.innerHTML = `<h3>${date}</h3>`;
    items.forEach((note) => {
      const item = document.createElement("article");
      item.className = "week-item";
      item.innerHTML = `<p>${escapeHtml(note.content)}</p><span>${note.time} · ${note.tags.join(" / ")}</span>`;
      group.append(item);
    });
    elements.weekList.append(group);
  });
}

async function analyzeWeek() {
  const recent = recentWeekNotes();
  if (recent.length < 3) {
    setStatus(elements.analysisStatus, "最近 7 天至少需要 3 条便笺，才能生成本周回顾", true);
    return;
  }

  elements.analyzeButton.disabled = true;
  setStatus(elements.analysisStatus, "正在回看这一周...");

  try {
    const result = await postJson("/api/ai/analyze-notes", {
      range: "week",
      notes: recent.map(({ date, time, content }) => ({ date, time, content }))
    });
    renderSummary(result.summary);
    elements.analysisCopy.textContent = result.fullAnalysis;
    setStatus(elements.analysisStatus, "生成好了");
  } catch (error) {
    setStatus(elements.analysisStatus, error.message || "刚刚没分析好，再试一次", true);
  } finally {
    elements.analyzeButton.disabled = false;
  }
}

function renderSummary(summary) {
  const items = [
    ["学习", summary.study],
    ["生活", summary.life],
    ["情绪", summary.emotion]
  ];
  elements.summaryGrid.innerHTML = "";
  items.forEach(([title, copy]) => {
    const card = document.createElement("section");
    card.className = "summary-card";
    card.innerHTML = `<strong>${title}</strong><p>${escapeHtml(copy)}</p>`;
    elements.summaryGrid.append(card);
  });
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function setStatus(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle("error", isError);
}

function renderTags(container, tags, query = "") {
  container.innerHTML = "";
  tags.forEach((tag) => {
    const span = document.createElement("span");
    span.className = "tag";
    span.innerHTML = highlight(tag, query);
    container.append(span);
  });
}

function topTags(items) {
  const counts = new Map();
  items.forEach((note) => note.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, 12)
    .map(([tag]) => tag);
}

function recentWeekNotes() {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return notes.filter((note) => new Date(note.createdAt).getTime() >= weekAgo);
}

function groupBy(items, getter) {
  return items.reduce((acc, item) => {
    const key = getter(item);
    acc[key] ||= [];
    acc[key].push(item);
    return acc;
  }, {});
}

function randomStyleId() {
  return noteStyles[Math.floor(Math.random() * noteStyles.length)].id;
}

function getStyle(styleId) {
  return noteStyles.find((style) => style.id === styleId) || noteStyles[0];
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function loadNotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(saved) ? saved : seedNotes;
  } catch {
    return seedNotes;
  }
}

function saveNotes() {
  localStorage.setItem(storageKey, JSON.stringify(notes));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}

function highlight(value, query) {
  const escaped = escapeHtml(value);
  if (!query) return escaped;
  const safeQuery = escapeRegExp(query);
  return escaped.replace(new RegExp(`(${safeQuery})`, "gi"), "<mark>$1</mark>");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
