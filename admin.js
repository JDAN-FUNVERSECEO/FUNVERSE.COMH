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
const eventMusic = document.querySelector('#admin-event-music');
let ownerEvent = null;
let ownerSettings = null;
let panelRole = null;
let panelPresenterName = 'FUNVERSE';

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
    if (!['owner', 'admin'].includes(result.role)) {
      status.textContent = 'Esta cuenta es de usuario. El panel requiere un rol OWNER o ADMIN.';
      status.dataset.state = 'error';
      return;
    }
    status.textContent = `Acceso ${result.role.toUpperCase()} confirmado. Abriendo el panel…`;
    window.location.reload();
  } catch (error) {
    status.textContent = error.message || 'No pude iniciar sesión. Comprueba la conexión y vuelve a intentar.';
    status.dataset.state = 'error';
  } finally {
    button.disabled = false;
  }
});
async function requireAdmin() {
  const auth = await requestJson('/api/auth/status');
  if (!['owner', 'admin'].includes(auth.role)) {
    gate.hidden = false;
    content.hidden = true;
    statusLine.textContent = 'Acceso denegado: hace falta el rol OWNER o ADMIN.';
    document.querySelector('#admin-top-status').textContent = auth.signedIn ? 'SIN PERMISOS' : 'ACCESO OWNER / ADMIN';
    liveBadge.dataset.state = 'locked';
    gateMessage.textContent = auth.signedIn ? 'Esta cuenta no tiene rol ADMIN.' : 'Inicia sesión con tu cuenta OWNER o ADMIN.';
    return false;
  }
  panelRole = auth.role;
  panelPresenterName = auth.displayName || auth.email?.split('@')[0] || 'FUNVERSE';
  ownerEmail.textContent = panelPresenterName;
  const fallbackAvatar = auth.role === 'owner' ? '/assets/danzok-avatar.png' : '/assets/funverse-astronaut.svg';
  ownerAvatar.src = auth.avatar || fallbackAvatar;
  heroAvatar.src = auth.avatar || fallbackAvatar;
  document.querySelector('#admin-role-label').textContent = auth.role === 'owner' ? 'OWNER · PROPIETARIO' : 'ADMINISTRADOR';
  gate.hidden = true;
  content.hidden = false;
  statusLine.textContent = auth.role === 'owner' ? 'Cuenta propietaria activa. Los cambios se aplican a esta instalación.' : 'Cuenta ADMIN activa. Puede gestionar FUNVERSE; OWNER conserva los roles y las suspensiones.';
  liveBadge.dataset.state = 'checking';
  document.querySelector('#admin-top-status').textContent = 'COMPROBANDO';
  return true;
}
async function loadEventSettings() {
  ownerEvent = await requestJson('/api/admin/events');
  eventDuration.value = String(ownerEvent.durationMinutes || 60);
  const activeEffects = Array.isArray(ownerEvent.effects) ? ownerEvent.effects : [ownerEvent.effect || 'confetti'];
  [...eventEffect.options].forEach((option) => { option.selected = activeEffects.includes(option.value); });
  eventMusic.value = ownerEvent.music || 'Chasing_The_Spotlight.mp3';
  eventRun.textContent = ownerEvent.manualActive ? 'Terminar ahora' : 'Iniciar ahora ✦';
  eventWeekly.textContent = ownerEvent.weeklyEnabled ? 'Pausar horario semanal' : 'Activar horario semanal';
  note('admin-event-status', ownerEvent.eventState?.active ? `Evento activo · ${ownerEvent.eventState.source === 'manual' ? 'iniciado manualmente' : 'sesión semanal'}.` : ownerEvent.weeklyEnabled ? 'Siguiente sesión: sábado a las 12:00 · Ciudad de México.' : 'Horario semanal pausado. Puedes iniciar una sesión manual.');
  note('admin-announcement-status', ownerEvent.announcement ? 'Hay un mensaje global activo.' : 'No hay un mensaje global activo.');
  const active = Boolean(ownerEvent.eventState?.active);
  document.querySelector('#admin-event-badge').textContent = active ? 'EN CURSO' : 'EN ESPERA';
  document.querySelector('#admin-event-badge').dataset.state = active ? 'active' : 'idle';
  document.querySelector('#admin-active-event-description').textContent = active ? `Efecto activo: ${eventEffectLabel(ownerEvent.eventState.effect)}. Puedes terminar la sesión desde aquí.` : 'Lanza una sesión cuando quieras desde la sección Eventos.';
  renderAdminSeasonEvents(ownerEvent.eventState?.seasonalEvents || ownerEvent.seasonalEvents || []);
}
function eventEffectLabel(effect) {
  const option = [...eventEffect.options].find((item) => item.value === effect);
  return option?.textContent || 'fiesta galáctica';
}
async function saveEvent(changes) {
  eventRun.disabled = true; eventWeekly.disabled = true;
  try {
    const effects = [...eventEffect.selectedOptions].map((option) => option.value);
    if (effects.length > 5) throw new Error('Puedes combinar hasta cinco efectos.');
    await requestJson('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ durationMinutes: Number(eventDuration.value), effects, music: eventMusic.value, ...changes }) });
    await loadEventSettings();
    note('admin-event-status', changes.action === 'start' ? `Evento iniciado; el aviso de ${panelPresenterName} aparecerá durante 10 segundos.` : changes.action === 'stop' ? 'Sesión manual detenida.' : 'Horario y ajustes guardados.');
  } catch (error) { note('admin-event-status', error.message, true); }
  finally { eventRun.disabled = false; eventWeekly.disabled = false; }
}
eventRun.addEventListener('click', () => saveEvent({ action: ownerEvent?.manualActive ? 'stop' : 'start' }));
eventWeekly.addEventListener('click', () => saveEvent({ weeklyEnabled: !ownerEvent?.weeklyEnabled }));

document.querySelector('#admin-announcement-publish').addEventListener('click', async () => {
  const body = document.querySelector('#admin-announcement-body').value.trim();
  try {
    const settings = await requestJson('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'announce', body }) });
    note('admin-announcement-status', `Publicado por ${settings.announcement?.authorName || panelPresenterName}. Desaparecerá en 10 segundos.`); await loadEventSettings();
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
    const role = document.createElement('small'); role.className = 'admin-user-role'; role.textContent = ({ admin: 'ADMIN', parent: 'ADULTO RESPONSABLE', user: 'USUARIO' })[user.role] || 'USUARIO';
    const state = document.createElement('small'); state.className = user.banned ? 'admin-user-banned' : 'admin-user-active'; state.textContent = user.banned ? 'SUSPENDIDA' : 'ACTIVA';
    const reportCount = document.createElement('small'); reportCount.className = 'admin-user-reports-count'; reportCount.textContent = `Denuncias abiertas: ${user.openReportsCount || 0} · total: ${user.reportsCount || 0}`;
    identity.append(name, email, role, state, reportCount);
    row.append(avatar, identity);
    const xpDetails = document.createElement('details'); xpDetails.className = 'admin-user-xp';
    const xpSummary = document.createElement('summary'); xpSummary.textContent = `XP · ${Number(user.xp) || 0}`;
    const xpControls = document.createElement('div'); xpControls.className = 'admin-xp-controls';
    const addForm = document.createElement('form'); addForm.className = 'admin-xp-form';
    const addLabel = document.createElement('label'); addLabel.textContent = 'Sumar XP';
    const addInput = document.createElement('input'); addInput.type = 'number'; addInput.min = '1'; addInput.max = '1000000'; addInput.step = '1'; addInput.placeholder = '1300'; addInput.required = true; addLabel.append(addInput);
    const addButton = document.createElement('button'); addButton.type = 'submit'; addButton.className = 'admin-primary-button'; addButton.textContent = 'Sumar'; addForm.append(addLabel, addButton);
    addForm.addEventListener('submit', async (event) => { event.preventDefault(); await updateUserXp(user.email, 'add-xp', Number(addInput.value), addButton); });
    const setForm = document.createElement('form'); setForm.className = 'admin-xp-form';
    const setLabel = document.createElement('label'); setLabel.textContent = 'Fijar total';
    const setInput = document.createElement('input'); setInput.type = 'number'; setInput.min = '0'; setInput.max = '1000000'; setInput.step = '1'; setInput.value = String(Number(user.xp) || 0); setInput.required = true; setLabel.append(setInput);
    const setButton = document.createElement('button'); setButton.type = 'submit'; setButton.className = 'admin-secondary-button'; setButton.textContent = 'Guardar'; setForm.append(setLabel, setButton);
    setForm.addEventListener('submit', async (event) => { event.preventDefault(); await updateUserXp(user.email, 'set-xp', Number(setInput.value), setButton); });
    const resetButton = document.createElement('button'); resetButton.type = 'button'; resetButton.className = 'admin-reset-progress'; resetButton.textContent = 'Reiniciar XP';
    resetButton.addEventListener('click', async () => { if (window.confirm(`¿Reiniciar el XP de ${name.textContent}?`)) await updateUserXp(user.email, 'reset-xp', 0, resetButton); });
    xpControls.append(addForm, setForm, resetButton); xpDetails.append(xpSummary, xpControls); row.append(xpDetails);
    if (panelRole === 'owner') {
      const roleSelect = document.createElement('select');
      roleSelect.className = 'admin-role-select';
      roleSelect.setAttribute('aria-label', `Rol de ${name.textContent}`);
      for (const [value, label] of [['user', 'Usuario'], ['admin', 'Admin'], ['parent', 'Adulto']]) {
        const option = document.createElement('option'); option.value = value; option.textContent = label; roleSelect.append(option);
      }
      roleSelect.value = user.role || 'user';
      roleSelect.addEventListener('change', async () => {
        roleSelect.disabled = true;
        try {
          await requestJson('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, action: 'set-role', role: roleSelect.value }) });
          note('admin-users-status', `Rol actualizado para ${name.textContent}.`);
          await loadUsers();
        } catch (error) { note('admin-users-status', error.message, true); roleSelect.value = user.role || 'user'; roleSelect.disabled = false; }
      });
      row.append(roleSelect);
      const button = document.createElement('button'); button.type = 'button'; button.className = user.banned ? 'admin-secondary-button' : 'admin-ban-button'; button.dataset.userEmail = user.email; button.dataset.userAction = user.banned ? 'unban' : 'ban'; button.textContent = user.banned ? 'Reactivar' : 'Suspender';
      row.append(button);
    }
    list.append(row);
  }
}
async function updateUserXp(email, action, value, button) {
  button.disabled = true;
  try {
    const payload = action === 'add-xp' ? { email, action, amount: value } : action === 'reset-xp' ? { email, action } : { email, action, xp: value };
    const result = await requestJson('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    note('admin-users-status', `Progreso actualizado: ${result.xp} XP.`);
    await loadUsers();
  } catch (error) { note('admin-users-status', error.message, true); button.disabled = false; }
}
document.querySelector('#admin-users-list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-user-action]'); if (!button) return;
  button.disabled = true;
  try { const action = button.dataset.userAction; await requestJson('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: button.dataset.userEmail, action }) }); note('admin-users-status', action === 'ban' ? 'Cuenta suspendida y sesión cerrada.' : 'Cuenta reactivada.'); await loadUsers(); }
  catch (error) { note('admin-users-status', error.message, true); button.disabled = false; }
});

async function loadReports() {
  const list = document.querySelector('#admin-reports-list');
  const data = await requestJson('/api/admin/reports');
  const reports = Array.isArray(data.reports) ? data.reports : [];
  list.replaceChildren();
  const pending = reports.filter((report) => ['new', 'reviewing'].includes(report.status)).length;
  document.querySelector('#admin-report-count').textContent = `${pending} pendientes`;
  if (!reports.length) { const empty = document.createElement('p'); empty.className = 'admin-empty'; empty.textContent = 'No hay denuncias. Si alguien reporta una cuenta desde el chat, aparecerá aquí.'; list.append(empty); return; }
  const reasons = { acoso: 'Acoso', contenido: 'Contenido inapropiado', suplantacion: 'Suplantación', seguridad: 'Seguridad', otro: 'Otro' };
  const statuses = [['new', 'Nueva'], ['reviewing', 'En revisión'], ['resolved', 'Resuelta'], ['dismissed', 'Descartada']];
  for (const report of reports) {
    const card = document.createElement('article'); card.className = 'admin-report-card';
    const heading = document.createElement('div'); heading.className = 'admin-report-heading';
    const title = document.createElement('b'); title.textContent = report.targetName || report.targetEmail;
    const reason = document.createElement('span'); reason.textContent = reasons[report.reason] || 'Otro';
    heading.append(title, reason);
    const details = document.createElement('p'); details.textContent = report.details;
    const meta = document.createElement('small'); meta.textContent = `Cuenta: ${report.targetEmail} · Reportó: ${report.reporterEmail} · ${new Date(report.createdAt).toLocaleString('es-MX')}`;
    const controls = document.createElement('label'); controls.className = 'admin-report-status'; controls.textContent = 'Estado';
    const select = document.createElement('select'); select.setAttribute('aria-label', `Estado de denuncia contra ${report.targetName || report.targetEmail}`);
    for (const [value, label] of statuses) { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); }
    select.value = report.status || 'new';
    select.addEventListener('change', async () => {
      select.disabled = true;
      try { await requestJson('/api/admin/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: report.id, status: select.value }) }); note('admin-reports-status', 'Estado de la denuncia actualizado.'); }
      catch (error) { note('admin-reports-status', error.message, true); select.value = report.status || 'new'; }
      finally { select.disabled = false; }
    });
    controls.append(select); card.append(heading, details, meta, controls); list.append(card);
  }
}

async function loadSiteSettings() {
  ownerSettings = await requestJson('/api/site-settings');
  document.querySelector('#admin-season-month').value = ownerSettings.seasonMonth;
  const localMonth = Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', month: 'numeric' }).format(new Date())) - 1;
  document.querySelector('#admin-season-event').value = ownerSettings.seasonMonth === 'auto' ? String(localMonth) : ownerSettings.seasonMonth;
  document.querySelector('#admin-hero-title').value = ownerSettings.heroTitle;
  document.querySelector('#admin-hero-tagline').value = ownerSettings.heroTagline;
  document.querySelector('#admin-parental-enabled').checked = ownerSettings.parentalEnabled;
  document.querySelector('#admin-daily-limit').value = String(ownerSettings.dailyLimitMinutes || 60);
}
document.querySelector('#admin-season-launch').addEventListener('click', async () => {
  const button = document.querySelector('#admin-season-launch');
  const month = document.querySelector('#admin-season-event').value;
  const label = document.querySelector('#admin-season-event').selectedOptions[0]?.textContent.split(' · ').slice(1).join(' · ') || 'la celebración';
  button.disabled = true;
  try {
    await requestJson('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start-season', month, durationMinutes: Number(eventDuration.value), music: document.querySelector('#admin-season-music').value }) });
    await requestJson('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'announce', body: `¡Comenzó ${label} en FUNVERSE! El tema, el reto y la música ya están disponibles.` }) });
    note('admin-season-status', `${label} activada por ${eventDuration.value} minutos. Puedes lanzar otras celebraciones a la vez.`);
    await loadEventSettings();
  } catch (error) { note('admin-season-status', error.message, true); }
  finally { button.disabled = false; }
});

const adminSeasonNames = ['Día de Reyes Galáctico', 'Festival de corazones', 'Primavera de colores', 'Búsqueda de huevos espaciales', 'Aventuras en familia', 'Verano con palmeras', 'Universo de verano', 'Regreso a la Academia', 'Fiesta de México', 'Halloween de nebulosa', 'Día de Muertos', 'Navidad cósmica'];
function renderAdminSeasonEvents(events) {
  const list = document.querySelector('#admin-season-active-list');
  if (!list) return;
  list.replaceChildren();
  const active = Array.isArray(events) ? events : [];
  if (!active.length) { const empty = document.createElement('p'); empty.className = 'admin-empty'; empty.textContent = 'No hay eventos de temporada activos.'; list.append(empty); return; }
  const heading = document.createElement('b'); heading.className = 'admin-season-list-heading'; heading.textContent = `${active.length} celebración${active.length === 1 ? '' : 'es'} activa${active.length === 1 ? '' : 's'}`; list.append(heading);
  for (const season of active) {
    const row = document.createElement('div'); row.className = 'admin-season-active-row';
    const info = document.createElement('span'); info.textContent = `${adminSeasonNames[season.month] || 'Evento de temporada'} · termina ${new Date(season.endsAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
    const stop = document.createElement('button'); stop.type = 'button'; stop.className = 'admin-season-stop'; stop.textContent = 'Terminar';
    stop.addEventListener('click', async () => {
      stop.disabled = true;
      try { await requestJson('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop-season', month: season.month }) }); note('admin-season-status', `${adminSeasonNames[season.month]} terminó.`); await loadEventSettings(); }
      catch (error) { note('admin-season-status', error.message, true); stop.disabled = false; }
    });
    row.append(info, stop); list.append(row);
  }
}

document.querySelector('#admin-global-reward-send').addEventListener('click', async () => {
  const button = document.querySelector('#admin-global-reward-send');
  const amount = Number(document.querySelector('#admin-global-reward-amount').value);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100_000) { note('admin-global-reward-status', 'Escribe entre 1 y 100,000 XP por cuenta.', true); return; }
  if (!window.confirm(`¿Regalar ${amount} XP a todas las cuentas activas de FUNVERSE?`)) return;
  button.disabled = true;
  try {
    const result = await requestJson('/api/admin/rewards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }) });
    note('admin-global-reward-status', `Listo: ${result.recipients} cuentas recibieron ${amount} XP cada una.`);
    await loadUsers();
  } catch (error) { note('admin-global-reward-status', error.message, true); }
  finally { button.disabled = false; }
});
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
  document.querySelector('#admin-web-detail').textContent = status.site === 'ok' ? 'Servidor de FUNVERSE conectado.' : 'No disponible';
}(async () => {
  try { if (!await requireAdmin()) return; await Promise.all([loadEventSettings(), loadSiteSettings(), loadUsers(), loadReports(), loadStatus()]); }
  catch (error) { gate.hidden = false; content.hidden = true; statusLine.textContent = 'No se pudo validar el acceso.'; gateMessage.textContent = error.message || 'Abre http://127.0.0.1:3000.'; }
})();
