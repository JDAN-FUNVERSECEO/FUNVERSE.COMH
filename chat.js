const chatHistoryKey = 'funverse-chat-history-v1';
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');
const chatSend = document.querySelector('#chat-send');
const chatTranscript = document.querySelector('#chat-transcript');
const chatMode = document.querySelector('#chat-mode');
const chatStatus = document.querySelector('#chat-status');
const chatSuggestions = document.querySelector('#chat-suggestions');
let chatHistory = [];
let chatBusy = false;
let chatNotice = '';
let announcementTimer = 0;
let displayedAnnouncementId = '';

try {
  const coderPro = chatMode.querySelector('option[value="coder-pro"]');
  const lessons = Math.min(4, Math.max(0, Number(localStorage.getItem('funverse-coding-lessons-v1')) || 0));
  coderPro.disabled = lessons < 4;
  coderPro.textContent = lessons === 4 ? 'FUN-CODER 3.8 ASTRA · desbloqueado' : 'FUN-CODER 3.8 ASTRA · Bloqueado';
} catch {}

try {
  const saved = JSON.parse(localStorage.getItem(chatHistoryKey) || '[]');
  if (Array.isArray(saved)) chatHistory = saved.filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-12);
} catch { chatHistory = []; }

function saveChatHistory() {
  try { localStorage.setItem(chatHistoryKey, JSON.stringify(chatHistory.slice(-12))); }
  catch { chatNotice = 'El navegador no pudo guardar el historial local.'; }
}

function addChatBubble(role, content, extraClass = '') {
  const bubble = document.createElement('article');
  bubble.className = `chat-message chat-message-${role} ${extraClass}`.trim();
  const label = document.createElement('span');
  label.className = 'chat-message-label';
  label.textContent = role === 'user' ? 'TÚ' : 'FUNSISTANT';
  const text = document.createElement('p');
  text.textContent = content;
  bubble.append(label, text);
  return bubble;
}

function renderChat() {
  const fragment = document.createDocumentFragment();
  fragment.append(addChatBubble('assistant', '¡Hola! Soy FUNSISTANT. Estoy aquí para pensar contigo. ¿Qué hacemos hoy? ✨', 'chat-welcome'));
  chatHistory.forEach((message) => fragment.append(addChatBubble(message.role, message.content)));
  if (chatBusy) fragment.append(addChatBubble('assistant', 'Estoy pensando…', 'chat-thinking'));
  if (chatNotice) fragment.append(addChatBubble('assistant', chatNotice, 'chat-warning'));
  chatTranscript.replaceChildren(fragment);
  chatTranscript.scrollTop = chatTranscript.scrollHeight;
  chatSuggestions.hidden = chatHistory.some((message) => message.role === 'user');
}

async function sendChatMessage(rawMessage) {
  const content = rawMessage.trim();
  if (!content || chatBusy) return;
  chatNotice = '';
  chatHistory.push({ role: 'user', content });
  chatHistory = chatHistory.slice(-12);
  saveChatHistory();
  chatBusy = true;
  chatSend.disabled = true;
  renderChat();
  try {
    const response = await fetch('/api/funsistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: chatMode.value, messages: chatHistory }),
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error('El servidor respondió con un formato inesperado.'); }
    if (!response.ok) throw new Error(data.error || 'FUNSISTANT no pudo responder en este momento.');
    if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('FUNSISTANT no recibió una respuesta. Inténtalo otra vez.');
    chatHistory.push({ role: 'assistant', content: data.reply.trim() });
    chatHistory = chatHistory.slice(-12);
    saveChatHistory();
    chatStatus.textContent = 'Conectada y lista · FUN 2.1 UNIVERSE';
  } catch (error) {
    chatNotice = error instanceof TypeError ? 'No encuentro el servidor local. Abre start-funverse.bat y vuelve a intentarlo.' : error.message;
    chatStatus.textContent = 'FUNSISTANT no está disponible ahora.';
  } finally {
    chatBusy = false;
    chatSend.disabled = false;
    renderChat();
    chatInput.focus();
  }
}

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = chatInput.value;
  chatInput.value = '';
  sendChatMessage(value);
});

chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

chatSuggestions.addEventListener('click', (event) => {
  const button = event.target.closest('[data-prompt]');
  if (button) sendChatMessage(button.dataset.prompt);
});

document.querySelector('#chat-clear').addEventListener('click', () => {
  chatHistory = [];
  chatNotice = '';
  saveChatHistory();
  renderChat();
  chatInput.focus();
});

function renderChatAnnouncement(announcement) {
  const banner = document.querySelector('#chat-announcement');
  const body = document.querySelector('#chat-announcement-body');
  const visible = Boolean(announcement && typeof announcement.body === 'string' && Date.parse(announcement.expiresAt) > Date.now());
  if (!visible) {
    banner.hidden = true;
    displayedAnnouncementId = '';
    window.clearTimeout(announcementTimer);
    return;
  }
  const id = announcement.publishedAt || announcement.expiresAt;
  if (id === displayedAnnouncementId) return;
  displayedAnnouncementId = id;
  body.textContent = announcement.body;
  banner.hidden = false;
  banner.classList.add('announcement-show');
  window.clearTimeout(announcementTimer);
  announcementTimer = window.setTimeout(() => {
    if (displayedAnnouncementId !== id) return;
    banner.hidden = true;
    banner.classList.remove('announcement-show');
    displayedAnnouncementId = '';
  }, Math.max(0, Date.parse(announcement.expiresAt) - Date.now()));
}

async function refreshChatEvents() {
  try {
    const [eventResponse, announcementResponse] = await Promise.all([fetch('/api/events/status'), fetch('/api/announcement')]);
    if (eventResponse.ok) {
      const { weeklyEvent } = await eventResponse.json();
      const live = document.querySelector('#chat-event-live');
      live.hidden = !weeklyEvent?.active;
      const effectNames = { confetti: 'LLUVIA DE CONFETI', rainbow: 'MUNDO ARCOÍRIS', 'big-head': 'CABEZAS GRANDES', spotlight: 'LUZ DE FIESTA', 'low-gravity': 'GRAVEDAD LUNAR', 'super-speed': 'SUPERVELOCIDAD', giant: 'MODO GIGANTE', mini: 'MODO MINI', meteor: 'LLUVIA DE METEOROS', bouncy: 'MUNDO SALTARÍN', ufo: 'VISITA OVNI', 'pet-parade': 'DESFILE DE MASCOTAS', 'reverse-gravity': 'GRAVEDAD INVERTIDA', 'party-chaos': 'CAOS DE FIESTA', 'points-rain': 'LLUVIA DE PUNTOS' };
      const eventText = document.querySelector('#chat-event-text');
      if (eventText) eventText.textContent = `ADMIN ABUSE EN VIVO · ${effectNames[weeklyEvent?.effect] || 'FIESTA'}`;
    }
    if (announcementResponse.ok) renderChatAnnouncement((await announcementResponse.json()).announcement);
  } catch { /* La conversación sigue disponible aunque fallen los avisos en vivo. */ }
}

renderChat();
void refreshChatEvents();
window.setInterval(refreshChatEvents, 1_000);
window.setInterval(async () => {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error('offline');
    const status = await response.json();
    chatStatus.textContent = status.modelReady ? `Conectada y lista · ${status.model}` : status.busy ? `FUNSISTANT está respondiendo · ${status.model}` : `${status.detail || 'FUNSISTANT está iniciando…'} · ${status.model}`;
  } catch { chatStatus.textContent = 'No encuentro el servidor. Abre start-funverse.bat para conectar.'; }
}, 20_000);
