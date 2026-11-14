
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
let pendingFiles = [];
let displayName = localStorage.getItem("gloopnext_display_name") || "";

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

  const ordered = chats.filter(chat => !chat.temporary).sort((a, b) =>
    Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
    b.createdAt - a.createdAt
  );

  container.innerHTML = ordered.map(chat => `
    <div class="history-row ${chat.id === activeChatId ? "selected" : ""}">
      <button class="history-open"
        data-action="select-chat"
        data-id="${escapeHTML(chat.id)}">
        ${escapeHTML(chat.title)}
      </button>

      <button class="history-pin"
        data-action="pin-chat"
        data-id="${escapeHTML(chat.id)}">
        ${chat.pinned ? "★" : "☆"}
      </button>

      <button class="history-more"
        data-action="chat-menu"
        data-id="${escapeHTML(chat.id)}">
        •••
      </button>
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
  const container = $("projectList");
  if (!container) return;

  container.innerHTML = projects.map(project => `
    <div class="project-row">
      <button class="project-item">
        ${escapeHTML(project.name)}
      </button>
      <button class="project-more"
        data-action="delete-project"
        data-id="${escapeHTML(project.id)}">
        ×
      </button>
    </div>
  `).join("");
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

  const button = $("send");

  if (button) {
    button.disabled = value;
    button.textContent = value ? "…" : "➤";
  }

  const stopButton = $("stopButton");
  if (stopButton) stopButton.hidden = !value;
}


async function streamLocalChat(prompt, attachments = []) {
  if (!API_BASE) {
    throw new Error("Cloud backend is not configured. Check config.js.");
  }

  const chat = getActiveChat();

  if (!chat) {
    throw new Error("No active chat found.");
  }

  addMessage("Thinking...", "assistant");

  const assistantMessage = chat.messages[chat.messages.length - 1];

  const container = $("messages");
  const bubble = container?.lastElementChild;
  const content = bubble?.querySelector(".message-content");
  let displayed = "";
try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: prompt,
        language: $("voiceLang")?.value || "en-US",
        attachments
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

    assistantMessage.content = "";

    if (content) {
      content.textContent = "";
      content.classList.add("typing-cursor");
    }

   

    for (let i = 0; i < reply.length; i += 3) {
      if (activeChatController?.signal.aborted) {
        throw new DOMException("Stopped", "AbortError");
      }

      displayed += reply.slice(i, i + 3);

      if (content) {
        content.textContent = displayed;
      }

      assistantMessage.content = displayed;

      container.scrollTop = container.scrollHeight;

      await new Promise(resolve => setTimeout(resolve, 12));
    }

    assistantMessage.content = reply;

  } catch (error) {
    if (error.name === "AbortError") {
      assistantMessage.content = displayed + "\n\nResponse stopped.";
    } else {
      assistantMessage.content =
        "GloopNext couldn't complete that request: " + error.message;
    }
  }

  saveChats();
  renderMessages();
  renderChatHistory();
}




async function sendMessage() {
  const input = $("chatInput");

  if (!input || isGenerating) return;

  const prompt = input.value.trim();
  const files = [...pendingFiles];

  if (!prompt && files.length === 0) return;

  if (!getActiveChat()) {
    createChat();
  }

  input.value = "";

  $("welcome")?.classList.add("hidden");

  const fileNames = files.map(file => file.name);
  addMessage([prompt, ...fileNames.map(name => "📎 " + name)].filter(Boolean).join("\n"), "user");

  activeChatController = new AbortController();

  setGenerating(true);

  try {
    const attachments = await Promise.all(files.map(async file => {
      if (file.size > 10 * 1024 * 1024) throw new Error(file.name + " is larger than 10 MB.");
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("Could not read " + file.name));
        reader.readAsDataURL(file);
      });
      return { name: file.name, type: file.type || "application/octet-stream", size: file.size, data };
    }));
    await streamLocalChat(prompt, attachments);
    pendingFiles = [];
    const preview = $("attachmentPreview");
    if (preview) { preview.innerHTML = ""; preview.classList.add("hidden"); }
    const picker = $("filePicker");
    if (picker) picker.value = "";
  } catch (error) {
    addMessage(
      "Something went wrong: " + error.message,
      "assistant"
    );
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
  document.body.dataset.theme = theme;
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
  $("settingsModal")?.classList.remove("hidden");
}

function closeSettings() {
  $("settingsModal")?.classList.add("hidden");
}



function showOwnerAccess() {
  $("ownerModal")?.classList.remove("hidden");
}

function hideOwnerAccess() {
  $("ownerModal")?.classList.add("hidden");
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
  
  // Chat controls
  $("send")?.addEventListener("click", sendMessage);
  $("stopButton")?.addEventListener("click", stopGeneration);
  $("chatInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  $("newChat")?.addEventListener("click", newChat);

  $("newTemporaryChat")?.addEventListener("click", temporaryChat);

  $("newProject")?.addEventListener("click", addProject);

  $("settingsOpen")?.addEventListener("click", openSettings);

  $("ownerOpen")?.addEventListener("click", showOwnerAccess);

  $("signOutButton")?.addEventListener("click", signOut);

  // Chat history actions
  $("chatHistory")?.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    if (action === "select-chat") selectChat(id);

    if (action === "pin-chat") togglePin(id);

    if (action === "chat-menu") {
      const choice = prompt("Type rename or delete:");

      if (choice?.toLowerCase() === "rename") renameChat(id);

      if (choice?.toLowerCase() === "delete") deleteChat(id);
    }
  });

  // Project actions
  $("projectList")?.addEventListener("click", event => {
    const button = event.target.closest('[data-action="delete-project"]');

    if (button) deleteProject(button.dataset.id);
  });

  // Attach files and keep them queued until the message is sent.
  $("attachButton")?.addEventListener("click", () => $("filePicker")?.click());

  $("filePicker")?.addEventListener("change", event => {
    pendingFiles = [...pendingFiles, ...event.target.files];
    const preview = $("attachmentPreview");
    if (!preview) return;
    preview.classList.toggle("hidden", pendingFiles.length === 0);
    preview.innerHTML = pendingFiles.map((file, index) => `
      <div class="attachment-chip"><span>${escapeHTML(file.name)}</span>
      <button type="button" data-remove-file="${index}" aria-label="Remove file">×</button></div>
    `).join("");
    event.target.value = "";
  });

  $("attachmentPreview")?.addEventListener("click", event => {
    const remove = event.target.closest("[data-remove-file]");
    if (!remove) return;
    pendingFiles.splice(Number(remove.dataset.removeFile), 1);
    const preview = $("attachmentPreview");
    preview.classList.toggle("hidden", pendingFiles.length === 0);
    preview.innerHTML = pendingFiles.map((file, index) => `
      <div class="attachment-chip"><span>${escapeHTML(file.name)}</span>
      <button type="button" data-remove-file="${index}">×</button></div>
    `).join("");
  });

  $("saveDisplayName")?.addEventListener("click", () => {
    const value = $("displayNameInput")?.value.trim() || "";
    if (!value) { alert("Please enter a display name."); return; }
    displayName = value;
    localStorage.setItem("gloopnext_display_name", displayName);
    alert("Name saved on this device.");
  });

  $("saveSettings")?.addEventListener("click", () => {
    const theme = $("themeSelect")?.value || "dark";
    const language = $("uiLanguage")?.value || "English";
    changeTheme(theme);
    changeLanguage(language);
    $("settingsModal")?.classList.add("hidden");
    alert("Preferences saved on this device.");
  });

  // Mobile sidebar
  $("mobile")?.addEventListener("click", () => {
    $("sidebar")?.classList.toggle("open");
  });

  // Modal closing
  document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", () => {
      $(button.dataset.close)?.classList.add("hidden");
    });
  });

  // Theme and language
  $("themeQuick")?.addEventListener("change", event => changeTheme(event.target.value));
  $("themeSelect")?.addEventListener("change", event => changeTheme(event.target.value));

  $("uiLanguage")?.addEventListener("change", event => {
    changeLanguage(event.target.value);
  });

  // Plan buttons
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
  if ($("themeSelect")) $("themeSelect").value = savedTheme;
  if ($("displayNameInput")) $("displayNameInput").value = displayName;

  const savedLanguage = localStorage.getItem(STORAGE_KEYS.language);
  if (savedLanguage && $("uiLanguage")) {
  $("uiLanguage").value = savedLanguage;
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
