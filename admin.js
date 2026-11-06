const statusLine = document.querySelector('#admin-status');
const gate = document.querySelector('#admin-gate');
const gateMessage = document.querySelector('#admin-gate-message');
const content = document.querySelector('#admin-content');
const liveBadge = document.querySelector('#admin-live-badge');
const ownerEmail = document.querySelector('#admin-owner-name');
const ownerAvatar = document.querySelector('#admin-owner-avatar');
const heroAvatar = document.querySelector('#admin-hero-avatar');
const eventRun = document.querySelector('#admin-event-run');
const eventWeekly = document.querySelector('#admin-event-weekly');
const eventDuration = document.querySelector('#admin-event-duration');
const eventEffect = document.querySelector('#admin-event-effect');
let ownerEvent = null;
let ownerSettings = null;
let aiConfig = null;

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || `La solicitud falló (HTTP ${response.status}).`);
  return data;
}
function note(id, message, isError = false) {
  const node = document.querySelector(`#${id}`);
  if (!node) return;
  node.textContent = message;
  node.dataset.state = isError ? 'error' : 'ready';
}
document.querySelector('#admin-login-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const status = document.querySelector('#admin-login-status');
  const fields = new FormData(form);
  button.disabled = true;
  status.textContent = 'Verificando la cuenta…';
  status.dataset.state = 'ready';
  try {
    const result = await requestJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fields.get('email'), password: fields.get('password'), otp: fields.get('otp') }),
    });
    if (result.twoFactorRequired || result.emailCodeRequired) {
      const codeRow = document.querySelector('#admin-login-code-row');
      const codeInput = form.querySelector('[name="otp"]');
      codeRow.hidden = false;
      codeInput.required = true;
      status.textContent = result.emailCodeRequired
        ? result.emailCodeSent ? 'Te envié un código de 6 dígitos al correo de OWNER. Revisa también Spam.' : 'Ya envié el código. Revisa tu correo y escribe los 6 dígitos.'
        : 'Escribe el código de 6 dígitos de tu aplicación de autenticación.';
      codeInput.focus();
      return;
    }
    if (result.role !== 'owner') {
      status.textContent = 'Esta cuenta es de jugador. El panel solo acepta la cuenta OWNER.';
      status.dataset.state = 'error';
      return;
    }
    status.textContent = 'Acceso OWNER confirmado. Abriendo el panel…';
    window.location.reload();
  } catch (error) {
    status.textContent = error.message || 'No pude iniciar sesión. Comprueba la conexión y vuelve a intentar.';
    status.dataset.state = 'error';
  } finally {
    button.disabled = false;
  }
});
async function requireOwner() {
  const auth = await requestJson('/api/auth/status');
  if (auth.role !== 'owner') {
    gate.hidden = false;
    content.hidden = true;
    statusLine.textContent = 'Acceso denegado: esta cuenta no es OWNER.';
    document.querySelector('#admin-top-status').textContent = auth.signedIn ? 'SIN PERMISOS' : 'ACCESO OWNER';
    liveBadge.dataset.state = 'locked';
    gateMessage.textContent = auth.signedIn ? 'Solo la única cuenta OWNER puede entrar a este panel.' : 'Inicia sesión con la única cuenta propietaria de FUNVERSE.';
    return false;
  }
  ownerEmail.textContent = auth.displayName || 'DANZOK';
  ownerAvatar.src = auth.avatar || '/assets/danzok-avatar.png';
  heroAvatar.src = auth.avatar || '/assets/danzok-avatar.png';
  gate.hidden = true;
  content.hidden = false;
  statusLine.textContent = 'La cuenta propietaria está activa. Los cambios se aplican a esta instalación.';
  liveBadge.dataset.state = 'checking';
  document.querySelector('#admin-top-status').textContent = 'COMPROBANDO';
  return true;
}
async function loadEventSettings() {
  ownerEvent = await requestJson('/api/admin/events');
  eventDuration.value = String(ownerEvent.durationMinutes || 60);
  eventEffect.value = ownerEvent.effect || 'confetti';
  eventRun.textContent = ownerEvent.manualActive ? 'Terminar ahora' : 'Iniciar ahora ✦';
  eventWeekly.textContent = ownerEvent.weeklyEnabled ? 'Pausar horario semanal' : 'Activar horario semanal';
  note('admin-event-status', ownerEvent.eventState?.active ? `Evento activo · ${ownerEvent.eventState.source === 'manual' ? 'iniciado manualmente' : 'sesión semanal'}.` : ownerEvent.weeklyEnabled ? 'Siguiente sesión: sábado a las 12:00 · Ciudad de México.' : 'Horario semanal pausado. Puedes iniciar una sesión manual.');
  note('admin-announcement-status', ownerEvent.announcement ? 'Hay un mensaje global activo.' : 'No hay un mensaje global activo.');
  const active = Boolean(ownerEvent.eventState?.active);
  document.querySelector('#admin-event-badge').textContent = active ? 'EN CURSO' : 'EN ESPERA';
  document.querySelector('#admin-event-badge').dataset.state = active ? 'active' : 'idle';
  document.querySelector('#admin-active-event-description').textContent = active ? `Efecto activo: ${eventEffectLabel(ownerEvent.eventState.effect)}. Puedes terminar la sesión desde aquí.` : 'Lanza una sesión cuando quieras desde la sección Eventos.';
}
function eventEffectLabel(effect) {
  const option = [...eventEffect.options].find((item) => item.value === effect);
  return option?.textContent || 'fiesta galáctica';
}
async function saveEvent(changes) {
  eventRun.disabled = true; eventWeekly.disabled = true;
  try {
    await requestJson('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ durationMinutes: Number(eventDuration.value), effect: eventEffect.value, ...changes }) });
    await loadEventSettings();
    note('admin-event-status', changes.action === 'start' ? 'Evento iniciado; el aviso de DANZOK aparecerá durante 10 segundos.' : changes.action === 'stop' ? 'Sesión manual detenida.' : 'Horario y ajustes guardados.');
  } catch (error) { note('admin-event-status', error.message, true); }
  finally { eventRun.disabled = false; eventWeekly.disabled = false; }
}
eventRun.addEventListener('click', () => saveEvent({ action: ownerEvent?.manualActive ? 'stop' : 'start' }));
eventWeekly.addEventListener('click', () => saveEvent({ weeklyEnabled: !ownerEvent?.weeklyEnabled }));

document.querySelector('#admin-announcement-publish').addEventListener('click', async () => {
  const body = document.querySelector('#admin-announcement-body').value.trim();
  try {
    await requestJson('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'announce', title: 'DANZOK', body }) });
    note('admin-announcement-status', 'Publicado por DANZOK. Desaparecerá en 10 segundos.'); await loadEventSettings();
  } catch (error) { note('admin-announcement-status', error.message, true); }
});
document.querySelector('#admin-announcement-clear').addEventListener('click', async () => {
  try { await requestJson('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear-announcement' }) }); note('admin-announcement-status', 'Aviso retirado.'); await loadEventSettings(); }
  catch (error) { note('admin-announcement-status', error.message, true); }
});

async function loadUsers() {
  const list = document.querySelector('#admin-users-list');
  const data = await requestJson('/api/admin/users');
  list.replaceChildren();
  document.querySelector('#admin-users-count').textContent = String(data.users.length);
  document.querySelector('#admin-banned-count').textContent = String(data.users.filter((user) => user.banned).length);
  document.querySelector('#admin-player-section-count').textContent = `${data.users.length} cuentas`;
  if (!data.users.length) { const empty = document.createElement('p'); empty.className = 'admin-empty'; empty.textContent = 'Aún no hay cuentas de jugadores.'; list.append(empty); return; }
  for (const user of data.users) {
    const row = document.createElement('div'); row.className = 'admin-user-row'; row.dataset.search = `${user.displayName} ${user.email}`.toLocaleLowerCase();
    const avatar = document.createElement('img'); avatar.src = user.avatar || '/assets/funverse-astronaut.svg'; avatar.alt = '';
    const identity = document.createElement('span'); identity.className = 'admin-user-identity';
    const name = document.createElement('b'); name.textContent = user.displayName || user.email.split('@')[0];
    const email = document.createElement('small'); email.textContent = user.email;
    const role = document.createElement('small'); role.className = 'admin-user-role'; role.textContent = user.role === 'parent' ? 'ADULTO RESPONSABLE' : 'CUENTA PERSONAL';
    const state = document.createElement('small'); state.className = user.banned ? 'admin-user-banned' : 'admin-user-active'; state.textContent = user.banned ? 'SUSPENDIDA' : 'ACTIVA';
    identity.append(name, email, role, state);
    const button = document.createElement('button'); button.type = 'button'; button.className = user.banned ? 'admin-secondary-button' : 'admin-ban-button'; button.dataset.userEmail = user.email; button.dataset.userAction = user.banned ? 'unban' : 'ban'; button.textContent = user.banned ? 'Reactivar' : 'Suspender';
    row.append(avatar, identity, button); list.append(row);
  }
}
document.querySelector('#admin-users-list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-user-action]'); if (!button) return;
  button.disabled = true;
  try { const action = button.dataset.userAction; await requestJson('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: button.dataset.userEmail, action }) }); note('admin-users-status', action === 'ban' ? 'Cuenta suspendida y sesión cerrada.' : 'Cuenta reactivada.'); await loadUsers(); }
  catch (error) { note('admin-users-status', error.message, true); button.disabled = false; }
});

async function loadSiteSettings() {
  ownerSettings = await requestJson('/api/site-settings');
  document.querySelector('#admin-season-month').value = ownerSettings.seasonMonth;
  document.querySelector('#admin-hero-title').value = ownerSettings.heroTitle;
  document.querySelector('#admin-hero-tagline').value = ownerSettings.heroTagline;
  document.querySelector('#admin-parental-enabled').checked = ownerSettings.parentalEnabled;
  document.querySelector('#admin-daily-limit').value = String(ownerSettings.dailyLimitMinutes || 60);
}
document.querySelector('#admin-site-save').addEventListener('click', async () => {
  const button = document.querySelector('#admin-site-save'); button.disabled = true;
  try {
    ownerSettings = await requestJson('/api/site-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seasonMonth: document.querySelector('#admin-season-month').value, heroTitle: document.querySelector('#admin-hero-title').value, heroTagline: document.querySelector('#admin-hero-tagline').value, parentalEnabled: document.querySelector('#admin-parental-enabled').checked, dailyLimitMinutes: Number(document.querySelector('#admin-daily-limit').value) }) });
    note('admin-site-status', 'Apariencia y controles guardados. Recarga la página principal para verlos.');
  } catch (error) { note('admin-site-status', error.message, true); }
  finally { button.disabled = false; }
});

document.querySelectorAll('[data-admin-jump]').forEach((button) => button.addEventListener('click', () => {
  const target = document.getElementById(button.dataset.adminJump); target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelectorAll('.admin-nav button').forEach((item) => item.classList.toggle('is-active', item === button));
}));
document.querySelector('#admin-search').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLocaleLowerCase();
  document.querySelectorAll('.admin-user-row').forEach((row) => { row.hidden = Boolean(query) && !row.dataset.search.includes(query); });
});

async function loadStatus() {
  const status = await requestJson('/api/status');
  document.querySelector('#admin-top-status').textContent = status.site === 'ok' ? 'WEB EN LÍNEA' : 'WEB DESCONECTADA';
  liveBadge.dataset.state = status.site === 'ok' ? 'online' : 'offline';
  document.querySelector('#admin-site-state').textContent = status.site === 'ok' ? 'EN LÍNEA' : 'DESCONECTADA';
  document.querySelector('#admin-health-dot').dataset.state = status.site === 'ok' ? 'online' : 'offline';
  document.querySelector('#admin-web-detail').textContent = status.site === 'ok' ? `Node · puerto ${location.port || '80'} · local` : 'No disponible';
  document.querySelector('#admin-ai-state').textContent = status.modelReady ? 'LISTO' : status.assistant === 'loading' ? 'INICIANDO' : 'EN ESPERA';
  document.querySelector('#admin-model-name').textContent = status.model || 'FUNSISTANT';
  document.querySelector('#admin-ai-detail').textContent = status.modelReady ? `${status.model} listo` : status.detail || 'El motor se inicia cuando se usa el chat.';
  const coderStatus = document.querySelector('#admin-coder-model-status');
  coderStatus.textContent = typeof status.coderModelInstalled !== 'boolean'
    ? 'FUN-CODER está instalado, pero el servidor abierto necesita reiniciarse para detectarlo.'
    : !status.coderModelInstalled
      ? 'Falta el archivo de pesos independiente de FUN-CODER en assets.'
      : status.coderModelReady
        ? 'FUN-CODER 3.8 ASTRA · modelo independiente cargado en 127.0.0.1:9932.'
        : status.coderAssistant === 'loading'
          ? 'FUN-CODER se está cargando en su servidor separado…'
          : 'Pesos independientes instalados; FUN-CODER se inicia al usar Programación.';
  document.querySelector('#admin-bridge-detail').textContent = status.modelReady ? '127.0.0.1:9931 · conectado' : '127.0.0.1:9931 · apagado hasta abrir el chat';
  document.querySelector('#admin-ai-health-dot').dataset.state = status.modelReady ? 'online' : 'offline';
}
async function loadAiConfig() {
  aiConfig = await requestJson('/api/admin/ai-config');
  const profileSelect = document.querySelector('#admin-ai-profile');
  const modelSelect = document.querySelector('#admin-ai-model-file');
  profileSelect.value = aiConfig.profile;
  modelSelect.replaceChildren();
  if (!aiConfig.models.length) {
    const option = document.createElement('option'); option.value = ''; option.textContent = 'No hay archivos GGUF en assets'; modelSelect.append(option);
  } else {
    aiConfig.models.forEach((model) => {
      const option = document.createElement('option'); option.value = model.file; option.textContent = `${model.file}${model.active ? ' · activo' : ''}`; modelSelect.append(option);
    });
    modelSelect.value = aiConfig.modelFile;
  }
  document.querySelector('#admin-ai-instructions').value = aiConfig.instructions;
  document.querySelector('#admin-ai-config-note').textContent = aiConfig.note;
}
async function saveAiConfig(applyModel) {
  const button = document.querySelector(applyModel ? '#admin-ai-apply' : '#admin-ai-save');
  const status = document.querySelector('#admin-ai-save-status');
  button.disabled = true;
  status.textContent = applyModel ? 'Guardando e iniciando el perfil…' : 'Guardando instrucciones…';
  try {
    const payload = applyModel
      ? { profile: document.querySelector('#admin-ai-profile').value, modelFile: document.querySelector('#admin-ai-model-file').value, instructions: document.querySelector('#admin-ai-instructions').value }
      : { profile: aiConfig.profile, modelFile: aiConfig.modelFile, instructions: document.querySelector('#admin-ai-instructions').value };
    const result = await requestJson('/api/admin/ai-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    status.textContent = result.message;
    await Promise.all([loadAiConfig(), loadStatus()]);
  } catch (error) { status.textContent = error.message; status.dataset.state = 'error'; }
  finally { button.disabled = false; }
}
document.querySelector('#admin-ai-save').addEventListener('click', () => saveAiConfig(false));
document.querySelector('#admin-ai-apply').addEventListener('click', () => saveAiConfig(true));
(async () => {
  try { if (!await requireOwner()) return; await Promise.all([loadEventSettings(), loadSiteSettings(), loadUsers(), loadStatus(), loadAiConfig()]); }
  catch (error) { gate.hidden = false; content.hidden = true; statusLine.textContent = 'No se pudo validar el acceso.'; gateMessage.textContent = error.message || 'Abre http://127.0.0.1:3000.'; }
})();
