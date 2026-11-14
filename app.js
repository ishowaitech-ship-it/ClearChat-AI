
// GloopNext frontend: local chat history + server-verified owner access.
const $ = id => document.getElementById(id);
const CONFIG = window.CLEARCHAT_CONFIG || {};
const API_BASE = (CONFIG.API_BASE_URL || "").replace(/\/$/, "");
const PLAN_LIMITS = {
  free: { image: 30, video: 10, browser: 10, code: 50, music: 20 },
  go: { image: 50, video: 20, browser: 50, code: 100, music: 30 },
  plus: { image: 70, video: 50, browser: 70, code: 150, music: 40 },
  pro: { image: 100, video: 100, browser: 150, code: 200, music: 100 },
  ultra: { image: Infinity, video: Infinity, browser: Infinity, code: Infinity, music: Infinity }
};

const PLAN_PRICES = {
  free: 0,
  go: 3,
  plus: 10,
  pro: 30,
  ultra: 50
};

const STORAGE_KEYS = {
  chats: "gloopnext_chats",
  activeChat: "gloopnext_active_chat",
  plan: "gloopnext_plan",
  usage: "gloopnext_usage",
  theme: "gloopnext_theme",
  language: "gloopnext_language",
  projects: "gloopnext_projects"
};

let chats = [];
let activeChatId = null;
let activeChatController = null;
let currentPlan = "free";
let usage = {};
let projects = [];
let currentUser = null;
let supabaseClient = null;
let isGenerating = false;

function loadStorage() {
  try {
    chats = JSON.parse(localStorage.getItem(STORAGE_KEYS.chats) || "[]");
    projects = JSON.parse(localStorage.getItem(STORAGE_KEYS.projects) || "[]");
    usage = JSON.parse(localStorage.getItem(STORAGE_KEYS.usage) || "{}");
    currentPlan = localStorage.getItem(STORAGE_KEYS.plan) || "free";
    activeChatId = localStorage.getItem(STORAGE_KEYS.activeChat);

    if (!Array.isArray(chats)) chats = [];
    if (!Array.isArray(projects)) projects = [];
    if (!usage || typeof usage !== "object") usage = {};
  } catch {
    chats = [];
    projects = [];
    usage = {};
    currentPlan = "free";
  }
}

function saveChats() {
  localStorage.setItem(STORAGE_KEYS.chats, JSON.stringify(chats));
}

function saveProjects() {
  localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(projects));
}

function saveUsage() {
  localStorage.setItem(STORAGE_KEYS.usage, JSON.stringify(usage));
}

function savePlan() {
  localStorage.setItem(STORAGE_KEYS.plan, currentPlan);
}

function getActiveChat() {
  return chats.find(chat => chat.id === activeChatId);
}

function createChat(title = "New chat", temporary = false) {
  const chat = {
    id: crypto.randomUUID(),
    title,
    messages: [],
    temporary,
    pinned: false,
    createdAt: Date.now()
  };

  chats.unshift(chat);
  activeChatId = chat.id;

  if (!temporary) {
    saveChats();
    localStorage.setItem(STORAGE_KEYS.activeChat, activeChatId);
  }

  renderAll();
  return chat;
}

function selectChat(id) {
  activeChatId = id;
  localStorage.setItem(STORAGE_KEYS.activeChat, id);
  renderAll();
}

function deleteChat(id) {
  chats = chats.filter(chat => chat.id !== id);

  if (activeChatId === id) {
    activeChatId = chats[0]?.id || null;
  }

  saveChats();
  localStorage.setItem(STORAGE_KEYS.activeChat, activeChatId || "");
  renderAll();
}

function renameChat(id) {
  const chat = chats.find(item => item.id === id);
  if (!chat) return;

  const name = prompt("Enter a new chat name:", chat.title);
  if (name && name.trim()) {
    chat.title = name.trim();
    saveChats();
    renderAll();
  }
}

function togglePin(id) {
  const chat = chats.find(item => item.id === id);
  if (!chat) return;

  chat.pinned = !chat.pinned;
  saveChats();
  renderAll();
}

function addMessage(content, role = "assistant") {
  const chat = getActiveChat();
  if (!chat) return;

  chat.messages.push({
    role,
    content,
    timestamp: Date.now()
  });

  if (role === "user" && chat.messages.length === 1) {
    chat.title = content.slice(0, 35);
  }

  if (!chat.temporary) saveChats();
  renderMessages();
  renderChatHistory();
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatMessage(text) {
  let result = escapeHTML(text);

  result = result.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code}</code></pre>`
  );

  result = result.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*(.*?)\*/g, "<em>$1</em>");
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  result = result.replace(/\n/g, "<br>");

  return result;
}

function renderMessages() {
  const container = $("messages");
  if (!container) return;

  const chat = getActiveChat();
  if (!chat) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = chat.messages.map(message => `
    <div class="message ${message.role}">
      <div class="message-content">${formatMessage(message.content)}</div>
    </div>
  `).join("");

  container.scrollTop = container.scrollHeight;
}

function renderChatHistory() {
  const container = $("chatHistory");
  if (!container) return;

  const ordered = [...chats].sort((a, b) =>
    Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
    b.createdAt - a.createdAt
  );

  container.innerHTML = ordered.map(chat => `
    <div class="chat-history-item ${chat.id === activeChatId ? "active" : ""}"
         data-chat-id="${escapeHTML(chat.id)}">
      <button class="chat-title" data-action="select-chat"
              data-id="${escapeHTML(chat.id)}">
        ${escapeHTML(chat.title)}
      </button>
      <button data-action="pin-chat" data-id="${escapeHTML(chat.id)}"
              title="Pin chat">${chat.pinned ? "★" : "☆"}</button>
      <button data-action="chat-menu" data-id="${escapeHTML(chat.id)}"
              title="Chat options">•••</button>
    </div>
  `).join("");
}

function renderPlan() {
  const planName = $("planName");
  if (planName) planName.textContent = currentPlan.toUpperCase();

  const limits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;

  for (const [type, limit] of Object.entries(limits)) {
    const count = Number(usage[type] || 0);
    const value = limit === Infinity ? "Unlimited" : `${count} / ${limit}`;

    const element = $(`${type}Usage`);
    if (element) element.textContent = value;

    const bar = $(`${type}Progress`);
    if (bar) {
      const percent = limit === Infinity ? 0 : Math.min(100, count / limit * 100);
      bar.style.width = `${percent}%`;
    }
  }
}

function renderProjects() {
  const container = $("projectsList");
  if (!container) return;

  container.innerHTML = projects.length
    ? projects.map(project => `
      <div class="project-item">
        <span>${escapeHTML(project.name)}</span>
        <button data-action="delete-project"
                data-id="${escapeHTML(project.id)}">×</button>
      </div>
    `).join("")
    : "<p>No projects</p>";
}

function renderAll() {
  renderChatHistory();
  renderMessages();
  renderPlan();
  renderProjects();
}

async function api(endpoint, body = {}, signal) {
  if (!API_BASE) {
    throw new Error("The API address is not configured.");
  }

  const response = await fetch(`${API_BASE}/api/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`);
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }

  return data;
}


function setGenerating(value) {
  isGenerating = value;

  const button = $("sendButton");
  if (button) {
    button.disabled = value;
    button.textContent = value ? "…" : "➤";
  }

  const stopButton = $("stopButton");
  if (stopButton) stopButton.hidden = !value;
}

async function streamLocalChat(prompt) {
  if (!API_BASE) {
    throw new Error("Cloud backend is not configured. Check config.js.");
  }

  const chat = getActiveChat();
  if (!chat) return;

  addMessage("Thinking...", "assistant");

  const assistantMessage = chat.messages[chat.messages.length - 1];

  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: prompt,
        language: $("languageSelect")?.value || "English"
      }),
      signal: activeChatController?.signal
    });

    const data = await response.json();

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || "The AI request failed.");
    }

    const reply = data.reply || data.message || "";

    if (!reply.trim()) {
      throw new Error("The AI returned an empty response.");
    }

    assistantMessage.content = reply;

  } catch (error) {
    if (error.name === "AbortError") {
      assistantMessage.content = "Response stopped.";
    } else {
      assistantMessage.content =
        "GloopNext couldn't complete that request: " + error.message;
    }
  }

  chat.messages[chat.messages.length - 1] = assistantMessage;
  saveChats();
  renderMessages();
  renderChatHistory();
}

async function sendMessage() {
  const input = $("messageInput");

  if (!input || isGenerating) return;

  const prompt = input.value.trim();
  if (!prompt) return;

  if (!getActiveChat()) createChat();

  input.value = "";
  addMessage(prompt, "user");

  activeChatController = new AbortController();
  setGenerating(true);

  try {
    await streamLocalChat(prompt);
  } catch (error) {
    addMessage("Something went wrong: " + error.message, "assistant");
  } finally {
    activeChatController = null;
    setGenerating(false);
  }
}


function stopGeneration() {
  if (activeChatController) {
    activeChatController.abort();
    activeChatController = null;
  }

  setGenerating(false);
}

function newChat() {
  createChat();
}

function temporaryChat() {
  createChat("Temporary chat", true);
}

function addProject() {
  const name = prompt("Enter project name:");
  if (!name || !name.trim()) return;

  projects.push({
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: Date.now()
  });

  saveProjects();
  renderProjects();
}

function deleteProject(id) {
  projects = projects.filter(project => project.id !== id);
  saveProjects();
  renderProjects();
}

function changeTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEYS.theme, theme);
}

function changeLanguage(language) {
  localStorage.setItem(STORAGE_KEYS.language, language);
}

function upgradePlan(plan) {
  if (!PLAN_LIMITS[plan]) return;

  alert("Checkout is not connected yet. No payment or plan change has occurred.");
}

function openSettings() {
  const settings = $("settingsModal");
  if (settings) settings.hidden = false;
}

function closeSettings() {
  const settings = $("settingsModal");
  if (settings) settings.hidden = true;
}

function showOwnerAccess() {
  const panel = $("ownerPanel");
  if (panel) panel.hidden = false;
}

function hideOwnerAccess() {
  const panel = $("ownerPanel");
  if (panel) panel.hidden = true;
}

function initializeSupabaseClient() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_PUBLISHABLE_KEY) {
    return;
  }

  if (!window.supabase?.createClient) return;

  supabaseClient = window.supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_PUBLISHABLE_KEY
  );
}

async function checkUser() {
  if (!supabaseClient) return;

  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    currentUser = data.session?.user || null;
  } catch (error) {
    console.error("User check failed:", error);
  }
}
  
async function signInWithEmail(email) {
  if (!supabaseClient) {
    alert("Email sign-in is not configured yet.");
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin
    }
  });

  if (error) {
    alert(error.message);
  } else {
    alert("Check your email for the sign-in link.");
  }
}

async function signOut() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentUser = null;
  location.reload();
}

function initializeEventListeners() {
    // Welcome screen navigation
  function showAuthScreen(screenId) {
    ["authWelcome", "authLocal", "authEmail", "authVerified"].forEach(id => {
      $(id)?.classList.toggle("hidden", id !== screenId);
    });
  }

  $("localChoice")?.addEventListener("click", () => {
    showAuthScreen("authLocal");
  });

  $("emailChoice")?.addEventListener("click", () => {
    showAuthScreen("authEmail");
  });

  document.querySelectorAll("[data-auth-back]").forEach(button => {
    button.addEventListener("click", () => showAuthScreen("authWelcome"));
  });

  $("startLocal")?.addEventListener("click", () => {
    localStorage.setItem("gloopnext_access_mode", "local");
    $("authGate")?.classList.add("hidden");
  });

  $("emailForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("email")?.value.trim();
    if (email) await signInWithEmail(email);
  });

  $("continueVerified")?.addEventListener("click", () => {
    localStorage.setItem("gloopnext_access_mode", "email");
    $("authGate")?.classList.add("hidden");
  });
  $("sendButton")?.addEventListener("click", sendMessage);

  $("messageInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  $("newChatButton")?.addEventListener("click", newChat);
  $("temporaryChatButton")?.addEventListener("click", temporaryChat);
  $("stopButton")?.addEventListener("click", stopGeneration);
  $("addProjectButton")?.addEventListener("click", addProject);
  $("settingsButton")?.addEventListener("click", openSettings);
  $("closeSettingsButton")?.addEventListener("click", closeSettings);
  $("ownerAccessButton")?.addEventListener("click", showOwnerAccess);

  $("chatHistory")?.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    if (action === "select-chat") selectChat(id);
    if (action === "pin-chat") togglePin(id);

    if (action === "chat-menu") {
      const choice = prompt("Type rename or delete:");
      if (choice === "rename") renameChat(id);
      if (choice === "delete") deleteChat(id);
    }
  });

  $("projectsList")?.addEventListener("click", event => {
    const button = event.target.closest('[data-action="delete-project"]');
    if (button) deleteProject(button.dataset.id);
  });

  $("themeSelect")?.addEventListener("change", event => {
    changeTheme(event.target.value);
  });

  $("languageSelect")?.addEventListener("change", event => {
    changeLanguage(event.target.value);
  });

  document.querySelectorAll("[data-upgrade-plan]").forEach(button => {
    button.addEventListener("click", () => {
      upgradePlan(button.dataset.upgradePlan);
    });
  });
}

function initializeApp() {
  loadStorage();
  initializeSupabaseClient();

  if (!activeChatId || !chats.some(chat => chat.id === activeChatId)) {
    if (chats.length) {
      activeChatId = chats[0].id;
    } else {
      createChat();
    }
  }

  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) || "dark";
  changeTheme(savedTheme);

  const savedLanguage = localStorage.getItem(STORAGE_KEYS.language);
  if (savedLanguage && $("languageSelect")) {
    $("languageSelect").value = savedLanguage;
  }

  initializeEventListeners();
  renderAll();
  checkUser();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}
