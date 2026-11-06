const byId = (id) => document.getElementById(id);
const chatLogin = byId('chat-login');
const chatLayout = byId('chat-layout');
const chatAccount = byId('chat-account-name');
const friendForm = byId('friend-form');
const friendEmail = byId('friend-email');
const friendStatus = byId('friend-status');
const friendList = byId('friend-list');
const friendRequests = byId('friend-requests');
const outgoingRequests = byId('outgoing-requests');
const friendSearch = byId('friend-search');
const chatEmpty = byId('chat-empty');
const chatRoom = byId('chat-room');
const chatMessages = byId('chat-messages');
const messageForm = byId('message-form');
const messageText = byId('message-text');
const messageStatus = byId('message-status');
const reportDialog = byId('report-dialog');
const reportForm = byId('report-form');
let signedInEmail = '';
let activeFriend = null;
let latestMessageId = '';
let friendRefreshTimer = 0;
let messageRefreshTimer = 0;

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || `La solicitud falló (HTTP ${response.status}).`);
  return data;
}

function showStatus(node, message, error = false) {
  node.textContent = message;
  node.dataset.state = error ? 'error' : 'ready';
}

function avatarImage(src, alt = '') {
  const image = document.createElement('img');
  image.src = src || '/assets/funverse-astronaut.svg';
  image.alt = alt;
  image.loading = 'lazy';
  image.addEventListener('error', () => { image.src = '/assets/funverse-astronaut.svg'; }, { once: true });
  return image;
}

function personLabel(account) { return account?.displayName || account?.email?.split('@')[0] || 'Amigo'; }

async function bootChat() {
  try {
    const auth = await api('/api/auth/status');
    if (!auth.signedIn) {
      chatAccount.textContent = 'Invitado';
      chatLogin.hidden = false;
      chatLayout.hidden = true;
      return;
    }
    signedInEmail = auth.email;
    chatAccount.textContent = auth.displayName || auth.email;
    byId('chat-logout').hidden = false;
    chatLogin.hidden = true;
    chatLayout.hidden = false;
    await loadFriends();
    friendRefreshTimer = window.setInterval(() => { void loadFriends(); }, 12_000);
  } catch (error) {
    chatAccount.textContent = 'Sin conexión';
    chatLogin.hidden = false;
    chatLayout.hidden = true;
    chatLogin.querySelector('p').textContent = error.message || 'No pude conectar con FUNVERSE. Recarga la página.';
  }
}

friendForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = friendEmail.value.trim().toLowerCase();
  const button = friendForm.querySelector('button');
  button.disabled = true;
  try {
    const result = await api('/api/friends', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request', email }) });
    showStatus(friendStatus, result.message || 'Solicitud enviada.');
    friendEmail.value = '';
    await loadFriends();
  } catch (error) { showStatus(friendStatus, error.message, true); }
  finally { button.disabled = false; }
});

friendRequests.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-request-action]');
  if (!button) return;
  button.disabled = true;
  try {
    await api('/api/friends', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: button.dataset.requestAction, id: button.dataset.requestId }) });
    await loadFriends();
  } catch (error) { showStatus(friendStatus, error.message, true); button.disabled = false; }
});

function renderRequests(incoming, outgoing) {
  friendRequests.replaceChildren();
  byId('request-count').textContent = String(incoming.length);
  if (!incoming.length) {
    const empty = document.createElement('p'); empty.className = 'chat-list-empty'; empty.textContent = 'No hay solicitudes nuevas.'; friendRequests.append(empty);
  }
  for (const request of incoming) {
    const card = document.createElement('article'); card.className = 'chat-request-card';
    card.append(avatarImage(request.account.avatar));
    const name = document.createElement('b'); name.textContent = personLabel(request.account);
    const actions = document.createElement('div'); actions.className = 'chat-request-actions';
    for (const [action, label] of [['accept', 'Aceptar'], ['decline', 'Ahora no']]) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.requestAction = action; button.dataset.requestId = request.id; button.textContent = label;
      actions.append(button);
    }
    card.append(name, actions); friendRequests.append(card);
  }
  outgoingRequests.replaceChildren();
  outgoingRequests.hidden = outgoing.length === 0;
  if (outgoing.length) {
    const title = document.createElement('b'); title.textContent = 'Pendientes de respuesta'; outgoingRequests.append(title);
    for (const request of outgoing) {
      const line = document.createElement('small'); line.textContent = personLabel(request.account); outgoingRequests.append(line);
    }
  }
}

function renderFriends(friends) {
  friendList.replaceChildren();
  byId('friend-count').textContent = String(friends.length);
  const query = friendSearch.value.trim().toLocaleLowerCase();
  const filtered = friends.filter((friend) => `${personLabel(friend)} ${friend.email}`.toLocaleLowerCase().includes(query));
  if (!filtered.length) {
    const empty = document.createElement('p'); empty.className = 'chat-list-empty'; empty.textContent = friends.length ? 'No encontré coincidencias.' : 'Agrega un amigo para empezar.'; friendList.append(empty);
    return;
  }
  for (const friend of filtered) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'chat-friend-button';
    if (activeFriend?.email === friend.email) button.classList.add('is-active');
    button.append(avatarImage(friend.avatar));
    const copy = document.createElement('span'); copy.className = 'chat-friend-copy';
    const name = document.createElement('b'); name.textContent = personLabel(friend);
    const email = document.createElement('small'); email.textContent = friend.email;
    copy.append(name, email); button.append(copy);
    button.addEventListener('click', () => openConversation(friend));
    friendList.append(button);
  }
}

async function loadFriends() {
  if (!signedInEmail) return;
  try {
    const data = await api('/api/friends');
    renderRequests(data.incoming || [], data.outgoing || []);
    renderFriends(data.friends || []);
    if (activeFriend && !(data.friends || []).some((friend) => friend.email === activeFriend.email)) closeConversation();
  } catch (error) { showStatus(friendStatus, error.message, true); }
}

function openConversation(friend) {
  activeFriend = friend;
  latestMessageId = '';
  chatEmpty.hidden = true;
  chatRoom.hidden = false;
  byId('room-avatar').src = friend.avatar || '/assets/funverse-astronaut.svg';
  byId('room-name').textContent = personLabel(friend);
  byId('room-email').textContent = friend.email;
  byId('report-target-label').textContent = `Tu denuncia sobre ${personLabel(friend)} será privada y llegará al panel de moderación.`;
  renderFriendsFromCurrentSearch();
  void loadMessages(true);
  if (messageRefreshTimer) window.clearInterval(messageRefreshTimer);
  messageRefreshTimer = window.setInterval(() => { void loadMessages(false); }, 3_000);
  messageText.focus();
}

function renderFriendsFromCurrentSearch() { void loadFriends(); }

function closeConversation() {
  activeFriend = null;
  chatRoom.hidden = true;
  chatEmpty.hidden = false;
  if (messageRefreshTimer) window.clearInterval(messageRefreshTimer);
  messageRefreshTimer = 0;
  renderFriendsFromCurrentSearch();
}

function renderMessages(messages, initial) {
  const lastId = messages.at(-1)?.id || '';
  if (!initial && lastId === latestMessageId) return;
  chatMessages.replaceChildren();
  let lastDay = '';
  for (const message of messages) {
    const date = new Date(message.createdAt);
    const day = date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    if (day !== lastDay) {
      const separator = document.createElement('div'); separator.className = 'chat-day-separator'; separator.textContent = day; chatMessages.append(separator); lastDay = day;
    }
    const row = document.createElement('div'); row.className = `chat-message-row${message.from === signedInEmail ? ' is-mine' : ''}`;
    const bubble = document.createElement('p'); bubble.className = 'chat-message-bubble'; bubble.textContent = message.text;
    const time = document.createElement('time'); time.dateTime = date.toISOString(); time.textContent = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    row.append(bubble, time); chatMessages.append(row);
  }
  if (!messages.length) {
    const empty = document.createElement('p'); empty.className = 'chat-empty-messages'; empty.textContent = 'Aún no hay mensajes. ¡Saluda para empezar!'; chatMessages.append(empty);
  }
  latestMessageId = lastId;
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadMessages(initial) {
  if (!activeFriend) return;
  try {
    const data = await api(`/api/chat?with=${encodeURIComponent(activeFriend.email)}`);
    renderMessages(data.messages || [], initial);
    if (messageStatus.dataset.state === 'error') showStatus(messageStatus, 'Mensajes actualizados.');
  } catch (error) { showStatus(messageStatus, error.message, true); }
}

messageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activeFriend) return;
  const text = messageText.value.trim();
  if (!text) return;
  const button = messageForm.querySelector('button');
  button.disabled = true;
  try {
    await api('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: activeFriend.email, text }) });
    messageText.value = '';
    showStatus(messageStatus, 'Enviado.');
    await loadMessages(false);
  } catch (error) { showStatus(messageStatus, error.message, true); }
  finally { button.disabled = false; messageText.focus(); }
});

friendSearch.addEventListener('input', () => { void loadFriends(); });
byId('report-open').addEventListener('click', () => { if (activeFriend) reportDialog.showModal(); });
byId('report-close').addEventListener('click', () => reportDialog.close());
reportDialog.addEventListener('click', (event) => { if (event.target === reportDialog) reportDialog.close(); });
reportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activeFriend) return;
  const button = reportForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await api('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: activeFriend.email, reason: byId('report-reason').value, details: byId('report-details').value.trim() }) });
    showStatus(byId('report-status'), 'Denuncia enviada al panel de moderación.');
    reportForm.reset();
    window.setTimeout(() => reportDialog.close(), 900);
  } catch (error) { showStatus(byId('report-status'), error.message, true); }
  finally { button.disabled = false; }
});

byId('chat-logout').addEventListener('click', async () => {
  const button = byId('chat-logout'); button.disabled = true;
  try { await api('/api/auth/logout', { method: 'POST' }); window.location.reload(); }
  catch (error) { chatAccount.textContent = error.message; button.disabled = false; }
});

window.addEventListener('pagehide', () => {
  if (friendRefreshTimer) window.clearInterval(friendRefreshTimer);
  if (messageRefreshTimer) window.clearInterval(messageRefreshTimer);
});

void bootChat();
