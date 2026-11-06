const API_BASE = (() => {
  const { protocol, hostname, port } = window.location;
  const localHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname.toLowerCase());
  if (protocol === 'file:') return 'http://127.0.0.1:3000';
  if (localHost && port && port !== '3000') return `${protocol}//${hostname}:3000`;
  return '';
})();

function apiUrl(pathname) {
  return `${API_BASE}${pathname}`;
}

async function apiJson(pathname, options = {}) {
  const response = await fetch(apiUrl(pathname), { credentials: 'include', ...options });
  let data;
  try { data = await response.json(); }
  catch { throw new Error('El servidor respondió con un formato inesperado.'); }
  if (!response.ok) throw new Error(data.error || `La solicitud falló (HTTP ${response.status}).`);
  return data;
}

const menuButton = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('#main-nav');

menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Abrir menú' : 'Cerrar menú');
  mainNav.classList.toggle('open', !isOpen);
});

mainNav.addEventListener('click', (event) => {
  if (event.target.closest('a')) {
    mainNav.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Abrir menú');
  }
});

const ideaForm = document.querySelector('#idea-form');
const ideaInput = document.querySelector('#idea-input');
const eventKicker = document.querySelector('#event-kicker');
const eventClockLabel = document.querySelector('#event-clock-label');
const eventClock = document.querySelector('#event-clock');
const heroEventStatus = document.querySelector('#hero-event-status');
const heroEventClock = document.querySelector('#hero-event-clock');
const siteShell = document.querySelector('.site-shell');
let weeklyEventState = null;
let currentAdminEventEffect = null;
let eventToastTimer = 0;
let eventToastSignature = '';
const eventFxLayer = document.querySelector('#event-fx-layer');
const ownerLiveStop = document.querySelector('#owner-live-stop');
const eventMusicPlayer = document.querySelector('#event-music');
const eventMusicControl = document.querySelector('#event-music-control');
const eventMusicToggle = document.querySelector('#event-music-toggle');
const eventMusicTitle = document.querySelector('#event-music-title');
const eventEffectLabels = Object.freeze({ confetti: 'LLUVIA DE CONFETI', rainbow: 'MUNDO ARCOÍRIS', 'big-head': 'CABEZAS GRANDES', spotlight: 'LUZ DE FIESTA', 'low-gravity': 'GRAVEDAD LUNAR', 'super-speed': 'SUPERVELOCIDAD', giant: 'MODO GIGANTE', mini: 'MODO MINI', meteor: 'LLUVIA DE METEOROS', bouncy: 'MUNDO SALTARÍN', ufo: 'VISITA OVNI', 'pet-parade': 'DESFILE DE MASCOTAS', 'reverse-gravity': 'GRAVEDAD INVERTIDA', 'party-chaos': 'CAOS DE FIESTA', 'points-rain': 'LLUVIA DE PUNTOS' });
const eventMusicNames = Object.freeze({ 'Chasing_The_Spotlight.mp3': 'Chasing the Spotlight', 'Baneo_Masivo.mp3': 'Baneo Masivo', 'Beyond_The_Door.mp3': 'Beyond the Door', 'Breaking_the_Cage.mp3': 'Breaking the Cage', 'Rewrite_the_Scene.mp3': 'Rewrite the Scene' });
const eventEffectNames = Object.keys(eventEffectLabels);
const eventPointsStorageKey = 'funverse-admin-abuse-points-v1';
const eventPointRewardLimit = 10;
let eventFxSignature = '';
let eventPointRainTimer = 0;
let activeEventRewardId = '';
let activeEventPointCount = 0;
let activeSeasonSignature = '';

function syncEventMusic(event) {
  if (!eventMusicPlayer || !eventMusicControl) return;
  const seasons = Array.isArray(event.seasonalEvents) ? event.seasonalEvents : [];
  const latestSeason = [...seasons].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)).at(-1);
  const music = event.active ? event.music : latestSeason?.music;
  if (!music || !Object.hasOwn(eventMusicNames, music)) {
    eventMusicPlayer.pause();
    eventMusicControl.hidden = true;
    eventMusicPlayer.removeAttribute('src');
    eventMusicPlayer.load();
    return;
  }
  const source = `/assets/music/${music}`;
  if (eventMusicPlayer.getAttribute('src') !== source) {
    eventMusicPlayer.src = source;
    eventMusicPlayer.load();
  }
  eventMusicControl.hidden = false;
  eventMusicTitle.textContent = eventMusicNames[music];
  eventMusicToggle.textContent = eventMusicPlayer.paused ? '▶ Escuchar' : 'Ⅱ Pausar';
  eventMusicToggle.setAttribute('aria-label', eventMusicPlayer.paused ? `Reproducir ${eventMusicNames[music]}` : 'Pausar música del evento');
}

eventMusicToggle?.addEventListener('click', async () => {
  if (!eventMusicPlayer) return;
  if (eventMusicPlayer.paused) {
    try { await eventMusicPlayer.play(); }
    catch { eventMusicTitle.textContent = 'No se pudo reproducir; vuelve a intentarlo'; }
  } else eventMusicPlayer.pause();
  syncEventMusic(weeklyEventState || {});
});
eventMusicPlayer?.addEventListener('play', () => { if (eventMusicToggle) eventMusicToggle.textContent = 'Ⅱ Pausar'; });
eventMusicPlayer?.addEventListener('pause', () => { if (eventMusicToggle) eventMusicToggle.textContent = '▶ Escuchar'; });

function readEventPointCount(eventId) {
  try {
    const saved = JSON.parse(localStorage.getItem(eventPointsStorageKey) || '{}');
    return saved.eventId === eventId ? Math.min(eventPointRewardLimit, progressNumber(saved.count)) : 0;
  } catch { return 0; }
}

function spawnEventPoint(eventId) {
  if (!eventFxLayer || activeEventRewardId !== eventId || activeEventPointCount >= eventPointRewardLimit) return;
  const point = document.createElement('button');
  point.type = 'button';
  point.className = 'event-point';
  point.textContent = '+10';
  point.setAttribute('aria-label', 'Recoger una estrella y ganar 10 XP');
  point.style.setProperty('--point-left', `${4 + Math.random() * 88}vw`);
  point.style.setProperty('--point-duration', `${5 + Math.random() * 3}s`);
  point.style.setProperty('--point-delay', `${Math.random() * 0.7}s`);
  point.addEventListener('click', () => {
    if (activeEventRewardId !== eventId || activeEventPointCount >= eventPointRewardLimit) return;
    activeEventPointCount += 1;
    try { localStorage.setItem(eventPointsStorageKey, JSON.stringify({ eventId, count: activeEventPointCount })); } catch {}
    playerProgress.xp = progressNumber(playerProgress.xp + 10);
    savePlayerProgress();
    updatePassport();
    if (passportNotice) passportNotice.textContent = `¡Recogiste una estrella de Admin Abuse! +10 XP (${activeEventPointCount}/${eventPointRewardLimit}).`;
    point.classList.add('event-point-collected');
    point.textContent = '+10 XP';
    point.disabled = true;
    window.setTimeout(() => point.remove(), 750);
  }, { once: true });
  eventFxLayer.append(point);
  window.setTimeout(() => point.remove(), 9_000);
}

function syncAdminAbuseFx(event) {
  if (!eventFxLayer) return;
  if (!event.active) {
    if (eventPointRainTimer) window.clearInterval(eventPointRainTimer);
    eventPointRainTimer = 0;
    eventFxLayer.hidden = true;
    eventFxLayer.replaceChildren();
    eventFxLayer.dataset.effect = '';
    eventFxSignature = '';
    activeEventRewardId = '';
    activeEventPointCount = 0;
    return;
  }
  eventFxLayer.hidden = false;
  const eventId = `${event.source || 'weekly'}:${event.startsAt || event.endsAt || 'active'}`
  const effects = Array.isArray(event.effects) ? [...new Set(event.effects.filter((effect) => eventEffectNames.includes(effect)))].slice(0, 5) : [];
  if (!effects.length) effects.push(event.effect || 'confetti');
  const signature = `${eventId}:${effects.join(',')}`;
  if (signature === eventFxSignature) return;
  if (eventPointRainTimer) window.clearInterval(eventPointRainTimer);
  eventFxSignature = signature;
  activeEventRewardId = eventId;
  activeEventPointCount = readEventPointCount(eventId);
  eventFxLayer.dataset.effect = effects[0];
  eventFxLayer.dataset.effects = effects.join(' ');
  eventFxLayer.replaceChildren();
  for (let index = 0; index < 14; index += 1) {
    const spark = document.createElement('span');
    spark.className = 'event-fx-spark';
    spark.style.setProperty('--fx-left', `${Math.random() * 100}%`);
    spark.style.setProperty('--fx-delay', `-${Math.random() * 5}s`);
    spark.style.setProperty('--fx-duration', `${3 + Math.random() * 4}s`);
    spark.style.setProperty('--fx-hue', String(Math.floor(Math.random() * 360)));
    eventFxLayer.append(spark);
  }
  if (activeEventPointCount < eventPointRewardLimit) {
    spawnEventPoint(eventId);
    eventPointRainTimer = window.setInterval(() => spawnEventPoint(eventId), 2_300);
  }
}

function formatEventCountdown(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const totalMinutes = Math.floor(seconds / 60);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days} d · ${hours} h ${minutes} min`;
  if (hours) return `${hours} h ${minutes} min`;
  if (minutes) return `${minutes} min`;
  return `${seconds} s`;
}

function updateWeeklyEventClock() {
  if (!weeklyEventState || !eventClock) return;
  if (weeklyEventState.enabled === false && !weeklyEventState.manualActive) {
    eventClock.textContent = 'En pausa';
    if (heroEventClock) heroEventClock.textContent = 'En pausa';
    return;
  }
  const target = new Date(weeklyEventState.active ? weeklyEventState.endsAt : weeklyEventState.nextAt);
  if (!Number.isFinite(target.getTime())) return;
  eventClock.textContent = `${weeklyEventState.active ? 'Cierra en ' : 'En '} ${formatEventCountdown(target.getTime() - Date.now())}`;
  if (heroEventClock) heroEventClock.textContent = eventClock.textContent;
}

function renderWeeklyEvent(event) {
  if (!event || typeof event.active !== 'boolean' || !event.nextAt) return;
  weeklyEventState = event;
  const effects = Array.isArray(event.effects) ? [...new Set(event.effects.filter((effect) => eventEffectNames.includes(effect)))].slice(0, 5) : [event.effect].filter((effect) => eventEffectNames.includes(effect));
  currentAdminEventEffect = event.active ? (effects[0] || event.effect) : null;
  siteShell?.classList.toggle('weekly-event-active', event.active);
  eventEffectNames.forEach((effect) => siteShell?.classList.toggle(`event-effect-${effect}`, event.active && effects.includes(effect)));
  syncAdminAbuseFx(event);
  renderActiveSeasonalEvents(event.seasonalEvents);
  syncEventMusic(event);
  const liveToast = document.querySelector('#event-live-toast');
  if (liveToast) {
    const signature = event.active ? `${event.source || 'weekly'}:${event.startsAt || event.endsAt || 'active'}` : '';
    if (!event.active) {
      if (eventToastTimer) window.clearTimeout(eventToastTimer);
      eventToastTimer = 0;
      eventToastSignature = '';
      liveToast.hidden = true;
    } else if (signature !== eventToastSignature) {
      if (eventToastTimer) window.clearTimeout(eventToastTimer);
      eventToastSignature = signature;
      liveToast.hidden = false;
      eventToastTimer = window.setTimeout(() => {
        liveToast.hidden = true;
        eventToastTimer = 0;
      }, 10_000);
    }
    const liveText = document.querySelector('#event-live-text');
    const livePresenter = document.querySelector('#event-live-presenter');
    const liveAvatar = document.querySelector('#event-live-avatar');
    const presenterName = event.presenterName || 'FUNVERSE';
    if (livePresenter) livePresenter.textContent = `${presenterName} PRESENTA`;
    if (liveAvatar) liveAvatar.src = event.presenterAvatar || '/assets/funverse-astronaut.svg';
    if (liveText) liveText.textContent = `ADMIN ABUSE EN VIVO · ${effects.map((effect) => eventEffectLabels[effect]).join(' + ') || 'FIESTA'}`;
    if (ownerLiveStop) ownerLiveStop.hidden = !event.active || event.source !== 'manual' || !['owner', 'admin'].includes(authState.role);
  }
  if (event.enabled === false && !event.manualActive) {
    if (heroEventStatus) heroEventStatus.textContent = 'Horario semanal pausado · el owner puede iniciarlo';
    eventKicker.textContent = 'EVENTO SEMANAL PAUSADO POR EL PROPIETARIO';
    eventClockLabel.textContent = 'ESTADO';
    eventClock.textContent = 'En pausa';
    return;
  }
  if (event.active) {
    eventKicker.textContent = event.source === 'manual' ? `${event.presenterName || 'FUNVERSE'} PRESENTA · EVENTO EN VIVO` : 'AHORA · MODO FIESTA ACTIVO';
    eventClockLabel.textContent = 'TERMINA EN';
    if (heroEventStatus) heroEventStatus.textContent = event.source === 'manual' ? `${event.presenterName || 'FUNVERSE'} PRESENTA · EN VIVO` : '¡La fiesta está en vivo!';
  } else {
    const nextDate = new Date(event.nextAt);
    eventKicker.textContent = `CADA SÁBADO · 12:00 · CIUDAD DE MÉXICO · SIGUIENTE: ${new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'short' }).format(nextDate)}`;
    eventClockLabel.textContent = 'FALTA';
    if (heroEventStatus) heroEventStatus.textContent = 'Cada sábado · 12:00 · Ciudad de México';
  }
  updateWeeklyEventClock();
}

function mexicoWallTimeToUtc(year, month, day, hour) {
  const wanted = Date.UTC(year, month - 1, day, hour);
  let candidate = wanted;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const observed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    candidate += wanted - observed;
  }
  return new Date(candidate);
}

function fallbackWeeklyEvent(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const dayOffset = (6 - weekday + 7) % 7;
  const start = mexicoWallTimeToUtc(year, month, day + dayOffset, 12);
  const end = new Date(start.getTime() + 60 * 60 * 1_000);
  const active = weekday === 6 && now >= start && now < end;
  const next = weekday === 6 && now >= start
    ? mexicoWallTimeToUtc(year, month, day + 7, 12)
    : start;
  return {
    active, enabled: true, manualActive: false, source: active ? 'weekly' : null,
    durationMinutes: 60, effect: 'confetti', effects: ['confetti'], music: 'Chasing_The_Spotlight.mp3', seasonalEvents: [], timezone: 'America/Mexico_City',
    startsAt: active ? start.toISOString() : null,
    endsAt: active ? end.toISOString() : null,
    nextAt: next.toISOString(),
  };
}

async function refreshWeeklyEvent() {
  try {
    const data = await apiJson('/api/events/status');
    if (data.weeklyEvent) renderWeeklyEvent({ ...data.weeklyEvent, seasonalEvents: data.seasonalEvents || data.weeklyEvent.seasonalEvents || [] });
  } catch {
    if (!weeklyEventState) renderWeeklyEvent(fallbackWeeklyEvent());
  }
}

const seasonEvents = [
  { name: 'Día de Reyes Galáctico', theme: 'reyes', art: '👑', decor: ['👑', '🎁'], questIcon: '👑', questTitle: 'Entrega los regalos estelares', questText: 'Encuentra cinco regalos escondidos en el reino de los Reyes.', description: 'Sigue las estrellas, comparte regalos y comienza el año con una aventura.', game: 'Jugar el reto de Reyes', href: '#seasonal-quest' },
  { name: 'Festival de corazones', theme: 'hearts', art: '💝', decor: ['💗', '💝'], questIcon: '💝', questTitle: 'Reúne corazones brillantes', questText: 'Recoge cinco corazones para completar el festival.', description: 'Una celebración de amistad, amabilidad y aventuras en equipo.', game: 'Jugar el reto de corazones', href: '#seasonal-quest' },
  { name: 'Primavera de colores', theme: 'spring', art: '🌸', decor: ['🌷', '🦋'], questIcon: '🌸', questTitle: 'Haz florecer la estación', questText: 'Encuentra cinco flores luminosas en el jardín espacial.', description: 'Las galaxias se llenan de colores nuevos y pequeñas sorpresas.', game: 'Jugar el reto de primavera', href: '#seasonal-quest' },
  { name: 'Búsqueda de huevos espaciales', theme: 'eggs', art: '🥚', decor: ['🐣', '🥚'], questIcon: '🥚', questTitle: 'Encuentra los huevos cósmicos', questText: 'Busca cinco huevos de colores antes de que se escondan.', description: 'Una búsqueda familiar por planetas llenos de pistas.', game: 'Jugar la búsqueda', href: '#seasonal-quest' },
  { name: 'Aventuras en familia', theme: 'family', art: '🌿', decor: ['🌼', '🫶'], questIcon: '🌼', questTitle: 'Ayuda al jardín galáctico', questText: 'Recoge cinco semillas y devuelve el color al jardín.', description: 'Un mes para compartir historias, juegos y proyectos creativos.', game: 'Jugar el reto familiar', href: '#seasonal-quest' },
  { name: 'Verano con palmeras', theme: 'summer', art: '🌴', decor: ['🌴', '☀️'], questIcon: '🌴', questTitle: 'Explora la playa espacial', questText: 'Encuentra cinco conchas bajo las palmeras.', description: 'Sol, palmeras y nuevos récords para tus juegos favoritos.', game: 'Jugar el reto de verano', href: '#seasonal-quest' },
  { name: 'Universo de verano', theme: 'universe', art: '🪐', decor: ['🪐', '🌌'], questIcon: '✨', questTitle: 'Descubre nuevas constelaciones', questText: 'Recoge cinco estrellas para iluminar la galaxia de verano.', description: 'A mitad del verano, el cielo se abre a una aventura cósmica.', game: 'Jugar el reto estelar', href: '#seasonal-quest' },
  { name: 'Regreso a la Academia', theme: 'academy', art: '🎒', decor: ['🧑‍🚀', '📚'], questIcon: '📚', questTitle: 'Prepara tu mochila espacial', questText: 'Encuentra cinco herramientas para tu primera lección.', description: 'Vuelve a aprender y crea tu primer programa en FUN Academy.', game: 'Ir a FUN Academy', href: '#coding-academy' },
  { name: 'Fiesta de México', theme: 'mexico', art: '🇲🇽', decor: ['🇲🇽', '🎉'], questIcon: '⭐', questTitle: 'Sigue la ruta de estrellas', questText: 'Reúne cinco estrellas con los colores de la celebración.', description: 'Celebra las historias, los colores y la cultura de México con respeto.', game: 'Jugar el reto mexicano', href: '#seasonal-quest' },
  { name: 'Halloween de nebulosa', theme: 'halloween', art: '🎃', decor: ['🎃', '👻'], questIcon: '🎃', questTitle: 'Busca calabazas y fantasmas', questText: 'Encuentra cinco calabazas en una aventura misteriosa y amistosa.', description: 'Luces moradas, calabazas brillantes y un fantasma espacial original.', game: 'Jugar el reto de Halloween', href: '#seasonal-quest' },
  { name: 'Día de Muertos', theme: 'muertos', art: '💀', decor: ['💀', '🌼'], questIcon: '🌼', questTitle: 'Enciende las flores de recuerdo', questText: 'Reúne cinco flores para iluminar el camino de la memoria.', description: 'Una temporada colorida para conocer y recordar con cariño una tradición mexicana.', game: 'Jugar el reto de recuerdo', href: '#seasonal-quest' },
  { name: 'Navidad cósmica', theme: 'christmas', art: '🎄', decor: ['🎄', '🤖🎅'], questIcon: '🎁', questTitle: 'Ayuda al robot Santa', questText: 'Recoge cinco regalos antes de que el trineo despegue.', description: 'Un árbol galáctico y el robot con su traje de Santa llenan la estación de luces.', game: 'Jugar el reto navideño', href: '#seasonal-quest' },
];;

function renderActiveSeasonalEvents(events = []) {
  const container = document.querySelector('#season-active-events');
  if (!container) return;
  const active = (Array.isArray(events) ? events : []).filter((item) => Number.isInteger(item.month) && item.month >= 0 && item.month < seasonEvents.length && Number.isFinite(Date.parse(item.endsAt)));
  container.replaceChildren();
  container.hidden = active.length === 0;
  if (!active.length) {
    const hadActiveEvent = Boolean(activeSeasonSignature);
    activeSeasonSignature = '';
    if (hadActiveEvent) {
      const actualMonth = Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', month: 'numeric' }).format(new Date())) - 1;
      const restoredMonth = siteSettingsState.seasonMonth === 'auto' ? actualMonth : Number(siteSettingsState.seasonMonth);
      renderSeason(restoredMonth, true);
    }
    return;
  }
  const label = document.createElement('b');
  label.textContent = active.length === 1 ? 'Evento de temporada activo' : `${active.length} eventos de temporada activos`;
  container.append(label);
  const badges = document.createElement('div');
  badges.className = 'season-active-badges';
  for (const event of active) {
    const badge = document.createElement('span');
    badge.className = 'season-active-badge';
    const item = seasonEvents[event.month];
    badge.textContent = `${item.art} ${item.name} · hasta ${new Date(event.endsAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
    badges.append(badge);
  }
  container.append(badges);
  const signature = active.map((item) => item.id || `${item.month}:${item.startedAt}`).join('|');
  if (signature !== activeSeasonSignature) {
    activeSeasonSignature = signature;
    const latest = active.at(-1);
    renderSeason(latest.month, true);
  }
}

let currentSeasonMonth = 0;
let siteSettingsState = { seasonMonth: 'auto', heroTitle: 'El universo de diversión empieza aquí.', heroTagline: 'Juega, crea y explora a tu manera. Tu siguiente aventura está a un clic.', parentalEnabled: false, dailyLimitMinutes: 60 };

function renderSeason(month, selected = true) {
  const item = seasonEvents[month];
  if (!item) return;
  currentSeasonMonth = month;
  const seasonFeature = document.querySelector('#season-feature');
  const seasonArt = document.querySelector('#season-art');
  const monthLabel = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', month: 'long' }).format(new Date(Date.UTC(2026, month, 15)));
  seasonFeature.dataset.theme = item.theme;
  seasonArt.textContent = item.art;
  document.querySelector('#season-date').textContent = `${monthLabel.toLocaleUpperCase('es-MX')} · ${selected ? 'TEMPORADA ACTUAL' : 'ARCHIVO GALÁCTICO'}`;
  document.querySelector('#season-name').textContent = item.name;
  document.querySelector('#season-description').textContent = item.description;
  const seasonLink = document.querySelector('#season-link');
  seasonLink.href = item.href;
  seasonLink.innerHTML = `${item.game} <span>↗</span>`;
  const quest = document.querySelector('#seasonal-quest');
  if (quest) {
    quest.dataset.month = String(month);
    document.querySelector('#season-quest-art').textContent = item.questIcon || item.art;
    document.querySelector('#season-quest-title').textContent = item.questTitle || 'Recoge cinco estrellas';
    document.querySelector('#season-quest-description').textContent = item.questText || 'Encuentra cinco objetos para completar el reto.';
    updateSeasonQuestState(month);
  }
  if (selected) applyHeroSeason(month, item);
  document.querySelectorAll('.season-month-button').forEach((button) => {
    const active = Number(button.dataset.month) === month;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('is-selected', active);
  });
}

function applyHeroSeason(month, item = seasonEvents[month]) {
  const decor = item?.decor || [item?.art || '✦', ''];
  const primary = document.querySelector('#season-decor-primary');
  const secondary = document.querySelector('#season-decor-secondary');
  if (primary) primary.textContent = decor[0] || '';
  if (secondary) secondary.textContent = decor[1] || '';
  if (siteShell) siteShell.dataset.seasonTheme = item?.theme || 'universe';
}

function initSeasonCalendar() {
  const picker = document.querySelector('#season-month-picker');
  if (!picker) return;
  const currentMonth = Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', month: 'numeric' }).format(new Date())) - 1;
  const fragment = document.createDocumentFragment();
  seasonEvents.forEach((item, month) => {
    const button = document.createElement('button');
    button.className = 'season-month-button';
    button.type = 'button';
    button.dataset.month = String(month);
    button.setAttribute('aria-pressed', 'false');
    button.textContent = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'America/Mexico_City' }).format(new Date(Date.UTC(2026, month, 15))).replace('.', '');
    button.setAttribute('aria-label', `${item.name}, ${button.textContent}`);
    button.addEventListener('click', () => renderSeason(month, month === currentMonth));
    fragment.append(button);
  });
  picker.replaceChildren(fragment);
  renderSeason(currentMonth);
}

initSeasonCalendar();

async function loadSiteSettings() {
  try {
    siteSettingsState = { ...siteSettingsState, ...await apiJson('/api/site-settings') };
    document.querySelector('#hero-headline').textContent = siteSettingsState.heroTitle;
    document.querySelector('#hero-tagline').textContent = siteSettingsState.heroTagline;
    document.title = siteSettingsState.heroTitle + ' · FUNVERSE';
    const actualMonth = Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', month: 'numeric' }).format(new Date())) - 1;
    const activeMonth = siteSettingsState.seasonMonth === 'auto' ? actualMonth : Number(siteSettingsState.seasonMonth);
    renderSeason(activeMonth, true);
    startParentalControls();
  } catch { /* La página mantiene el tema predeterminado si el servidor reinicia. */ }
}

void loadSiteSettings();

let shownAnnouncementId = '';
let announcementHideTimer = 0;
function renderAnnouncement(announcement) {
  const banner = document.querySelector('#announcement-banner');
  const body = document.querySelector('#announcement-body');
  const visible = Boolean(announcement && typeof announcement.body === 'string' && announcement.body.trim() && Date.parse(announcement.expiresAt) > Date.now());
  if (!visible) {
    banner.hidden = true;
    banner.classList.remove('announcement-show');
    shownAnnouncementId = '';
    window.clearTimeout(announcementHideTimer);
    return;
  }
  const id = announcement.publishedAt || announcement.expiresAt;
  if (id === shownAnnouncementId) return;
  shownAnnouncementId = id;
  window.clearTimeout(announcementHideTimer);
  const author = document.querySelector('#announcement-byline');
  const avatar = document.querySelector('#announcement-avatar');
  if (author) author.textContent = announcement.authorName || 'FUNVERSE';
  if (avatar) avatar.src = announcement.authorAvatar || '/assets/funverse-astronaut.svg';
  body.textContent = announcement.body;
  banner.hidden = false;
  banner.classList.remove('announcement-show');
  requestAnimationFrame(() => banner.classList.add('announcement-show'));
  const remaining = Math.max(0, Date.parse(announcement.expiresAt) - Date.now());
  announcementHideTimer = window.setTimeout(() => {
    if (shownAnnouncementId !== id) return;
    banner.hidden = true;
    banner.classList.remove('announcement-show');
    shownAnnouncementId = '';
  }, remaining);
}

async function refreshDanzokAnnouncement() {
  try { renderAnnouncement((await apiJson('/api/announcement')).announcement); }
  catch { /* El aviso breve no interrumpe la navegación si el servidor se reinicia. */ }
}

void refreshDanzokAnnouncement();
window.setInterval(refreshDanzokAnnouncement, 1_000);

window.setInterval(updateWeeklyEventClock, 1_000);

// El pasaporte y las misiones viven en este navegador; no envían actividad a un servidor.
const progressStorageKey = 'funverse-progress-v1';
const dailyMissions = Object.freeze({ jenga: { target: 3, reward: 20 }, gato: { target: 1, reward: 20 }, bloques: { target: 3, reward: 20 } });

function mexicoDateKey() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function progressNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function loadPlayerProgress(storageKey = progressStorageKey) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch {}
  const stats = saved.stats && typeof saved.stats === 'object' ? saved.stats : {};
  const today = mexicoDateKey();
  const savedDaily = saved.daily && saved.daily.date === today ? saved.daily : {};
  const claimed = savedDaily.claimed && typeof savedDaily.claimed === 'object' ? savedDaily.claimed : {};
  return {
    xp: progressNumber(saved.xp),
    stats: { jengaBest: progressNumber(stats.jengaBest), gatoWins: progressNumber(stats.gatoWins), gatoDraws: progressNumber(stats.gatoDraws), blocksBest: progressNumber(stats.blocksBest) },
    daily: { date: today, jenga: progressNumber(savedDaily.jenga), gato: progressNumber(savedDaily.gato), bloques: progressNumber(savedDaily.bloques), claimed: { jenga: Boolean(claimed.jenga), gato: Boolean(claimed.gato), bloques: Boolean(claimed.bloques) } },
  };
}

let playerProgress = loadPlayerProgress();
// Declared before the first savePlayerProgress() call so startup never hits the
// temporal dead zone while the account section is initialized later in file.
let authState = { setupRequired: false, signedIn: false, email: null, role: null, emailNotificationsReady: false };
const passportNotice = document.querySelector('#passport-notice');
let passportOwner = false;
let progressSyncTimer = 0;
let lastServerXp = null;

function accountProgressStorageKey(email) { return `${progressStorageKey}:${encodeURIComponent(email)}`; }

async function syncAccountProgress(email) {
  if (!email) return;
  const storageKey = accountProgressStorageKey(email);
  try {
    if (localStorage.getItem(storageKey)) playerProgress = loadPlayerProgress(storageKey);
    else {
      const firstAccountKey = `${progressStorageKey}:first-account`;
      const firstAccount = localStorage.getItem(firstAccountKey);
      const localProgress = localStorage.getItem(progressStorageKey);
      if (!firstAccount && localProgress) {
        localStorage.setItem(storageKey, localProgress);
        localStorage.setItem(firstAccountKey, email);
        playerProgress = loadPlayerProgress(storageKey);
      } else playerProgress = loadPlayerProgress(storageKey);
    }
  } catch { playerProgress = loadPlayerProgress(storageKey); }
  try {
    const serverProgress = await apiJson('/api/auth/progress');
    if (serverProgress.initialized) playerProgress.xp = progressNumber(serverProgress.xp);
    else {
      const saved = await apiJson('/api/auth/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xp: playerProgress.xp }) });
      playerProgress.xp = progressNumber(saved.xp);
    }
    lastServerXp = playerProgress.xp;
    try { localStorage.setItem(storageKey, JSON.stringify(playerProgress)); } catch {}
  } catch { /* El pasaporte local sigue funcionando si el servidor se desconecta. */ }
  updatePassport();
}

async function refreshAccountProgress() {
  if (!authState?.signedIn || !authState.email) return;
  try {
    const remote = await apiJson('/api/auth/progress');
    const remoteXp = progressNumber(remote.xp);
    if (lastServerXp === null) { lastServerXp = remoteXp; return; }
    if (remoteXp === lastServerXp) return;
    if (remoteXp < lastServerXp) playerProgress.xp = remoteXp;
    else playerProgress.xp = progressNumber(remoteXp + Math.max(0, playerProgress.xp - lastServerXp));
    lastServerXp = remoteXp;
    try { localStorage.setItem(accountProgressStorageKey(authState.email), JSON.stringify(playerProgress)); } catch {}
    updatePassport();
  } catch { /* El pasaporte conserva su última copia local si el servidor se desconecta. */ }
}

function savePlayerProgress() {
  const key = authState?.signedIn && authState.email ? accountProgressStorageKey(authState.email) : progressStorageKey;
  try { localStorage.setItem(key, JSON.stringify(playerProgress)); } catch {
    if (passportNotice) passportNotice.textContent = 'El navegador no pudo guardar tu progreso. Revisa el espacio disponible.';
  }
  if (authState?.signedIn) {
    if (progressSyncTimer) window.clearTimeout(progressSyncTimer);
    progressSyncTimer = window.setTimeout(async () => {
      try {
        const saved = await apiJson('/api/auth/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xp: playerProgress.xp }) });
        lastServerXp = progressNumber(saved.xp);
        if (progressNumber(saved.xp) !== playerProgress.xp) {
          playerProgress.xp = progressNumber(saved.xp);
          try { localStorage.setItem(accountProgressStorageKey(authState.email), JSON.stringify(playerProgress)); } catch {}
          updatePassport();
        }
      } catch { /* La progresión se sincroniza al volver a conectar. */ }
    }, 650);
  }
}

function updatePassport() {
  const level = Math.floor(playerProgress.xp / 100) + 1;
  const levelXp = playerProgress.xp % 100;
  const rank = level >= 10 ? 'Capitán de estrellas' : level >= 5 ? 'Guardián galáctico' : level >= 3 ? 'Navegante espacial' : 'Explorador espacial';
  const setText = (selector, text) => { const element = document.querySelector(selector); if (element) element.textContent = text; };
  setText('#passport-rank', passportOwner ? 'OWNER' : rank);
  setText('#passport-level', passportOwner ? 'Nivel OWNER' : `Nivel ${level}`);
  const ownerBadge = document.querySelector('#passport-owner-label');
  if (ownerBadge) ownerBadge.hidden = !passportOwner;
  setText('#passport-xp-label', `${levelXp} / 100 XP`);
  setText('#passport-total-xp', `${playerProgress.xp} XP en total`);
  setText('#passport-jenga-best', String(playerProgress.stats.jengaBest));
  setText('#passport-gato-wins', String(playerProgress.stats.gatoWins));
  setText('#passport-blocks-best', String(playerProgress.stats.blocksBest));
  const levelBar = document.querySelector('.passport-meter[role="progressbar"]');
  if (levelBar) levelBar.setAttribute('aria-valuenow', String(levelXp));
  const levelFill = document.querySelector('#passport-meter-fill');
  if (levelFill) levelFill.style.width = `${levelXp}%`;
  Object.entries(dailyMissions).forEach(([id, mission]) => {
    const count = Math.min(playerProgress.daily[id], mission.target);
    const countElement = document.querySelector(`#mission-${id}-count`);
    const fill = document.querySelector(`#mission-${id}-fill`);
    const meter = document.querySelector(`[data-daily-mission="${id}"] .mission-meter`);
    const card = document.querySelector(`[data-daily-mission="${id}"]`);
    if (countElement) countElement.textContent = playerProgress.daily.claimed[id] ? 'Completada ✓' : `${count} / ${mission.target}`;
    if (fill) fill.style.width = `${Math.round(count / mission.target * 100)}%`;
    if (meter) meter.setAttribute('aria-valuenow', String(count));
    if (card) card.dataset.completed = String(playerProgress.daily.claimed[id]);
  });
}

function resetDailyMissionsIfNeeded() {
  const today = mexicoDateKey();
  if (playerProgress.daily.date === today) return;
  playerProgress.daily = { date: today, jenga: 0, gato: 0, bloques: 0, claimed: { jenga: false, gato: false, bloques: false } };
  if (passportNotice) passportNotice.textContent = '¡Hay misiones nuevas para hoy!';
  savePlayerProgress();
  updatePassport();
}

function advanceDailyMission(id, amount = 1) {
  resetDailyMissionsIfNeeded();
  const mission = dailyMissions[id];
  if (!mission || playerProgress.daily.claimed[id]) return;
  playerProgress.daily[id] = Math.min(mission.target, playerProgress.daily[id] + amount);
  if (playerProgress.daily[id] >= mission.target) {
    playerProgress.daily.claimed[id] = true;
    playerProgress.xp += mission.reward;
    if (passportNotice) passportNotice.textContent = `¡Misión completada! Ganaste ${mission.reward} XP gratis. ✨`;
  }
  savePlayerProgress();
  updatePassport();
}

function recordGameResult(game, outcome, score = 0) {
  if (game === 'jenga') playerProgress.stats.jengaBest = Math.max(playerProgress.stats.jengaBest, progressNumber(score));
  if (game === 'gato' && outcome === 'X') playerProgress.stats.gatoWins += 1;
  if (game === 'gato' && outcome === 'draw') playerProgress.stats.gatoDraws += 1;
  savePlayerProgress();
  updatePassport();
}

updatePassport();
savePlayerProgress();

const starterSkinKey = 'funverse-starter-skin-v1';
function initWelcomeSkin() {
  const status = document.querySelector('#welcome-skin-status');
  const toggle = document.querySelector('#buddy-toggle');
  let skin = 'cometa';
  try {
    const saved = localStorage.getItem(starterSkinKey);
    if (!saved) localStorage.setItem(starterSkinKey, JSON.stringify({ skin, unlockedAt: new Date().toISOString() }));
    else skin = JSON.parse(saved).skin || 'cometa';
  } catch {}
  toggle?.classList.toggle('buddy-skin-cometa', skin === 'cometa');
  if (status) status.textContent = '¡Regalo del primer día reclamado y equipado!';
}

function seasonQuestStorageKey(month) { return `funverse-season-quest-${new Date().getFullYear()}-${month}`; }
function updateSeasonQuestState(month = currentSeasonMonth) {
  const button = document.querySelector('#season-quest-start');
  const board = document.querySelector('#season-quest-board');
  if (!button || !board) return;
  const completed = localStorage.getItem(seasonQuestStorageKey(month)) === 'complete';
  button.disabled = completed;
  button.textContent = completed ? 'Reto completado ✓' : 'Comenzar reto ✦';
  document.querySelector('#season-quest-status').textContent = completed ? '¡Ya ganaste 20 XP este mes! Vuelve para el siguiente reto.' : 'Encuentra cinco objetos para ganar 20 XP.';
  board.replaceChildren();
}

function startSeasonalQuest() {
  const month = currentSeasonMonth;
  const item = seasonEvents[month];
  const board = document.querySelector('#season-quest-board');
  const status = document.querySelector('#season-quest-status');
  if (!board || localStorage.getItem(seasonQuestStorageKey(month)) === 'complete') return;
  board.replaceChildren();
  let found = 0;
  for (let index = 0; index < 5; index += 1) {
    const token = document.createElement('button');
    token.type = 'button';
    token.className = 'season-quest-token';
    token.textContent = item.questIcon || '✦';
    token.setAttribute('aria-label', `Encontrar objeto de temporada ${index + 1}`);
    token.addEventListener('click', () => {
      token.disabled = true;
      token.classList.add('is-found');
      found += 1;
      if (found < 5) { status.textContent = `Encontrados: ${found} / 5`; return; }
      localStorage.setItem(seasonQuestStorageKey(month), 'complete');
      playerProgress.xp = progressNumber(playerProgress.xp + 20);
      savePlayerProgress();
      updatePassport();
      status.textContent = '¡Reto completado! Ganaste 20 XP. 🎉';
      document.querySelector('#season-quest-start').disabled = true;
      document.querySelector('#season-quest-start').textContent = 'Reto completado ✓';
    });
    board.append(token);
  }
  status.textContent = 'Toca los cinco objetos de la temporada para recogerlos.';
}

document.querySelector('#season-quest-start')?.addEventListener('click', startSeasonalQuest);
initWelcomeSkin();
window.setInterval(resetDailyMissionsIfNeeded, 60_000);

// Jenga usa Matter.js para las colisiones, la gravedad y el arrastre de bloques.
const jengaCanvas = document.querySelector('#jenga-canvas');
const physicsError = document.querySelector('#physics-error');

if (jengaCanvas && window.Matter) {
  const { Engine, Bodies, Composite, Mouse, MouseConstraint, Events } = window.Matter;
  const canvasWidth = 780;
  const canvasHeight = 493;
  const towerCenter = canvasWidth / 2;
  const blockWidth = 68;
  const blockHeight = 17;
  const blockGap = 2;
  const layerGap = 18;
  const layerCount = 14;
  const floorTop = canvasHeight - 55;
  const context = jengaCanvas.getContext('2d');
  const statusText = document.querySelector('#jenga-status');
  const restartButton = document.querySelector('#restart-jenga');
  const stars = [[78,72,1.5],[175,142,1],[675,86,1.6],[604,160,1],[110,275,1.3],[704,290,1.5],[170,360,1],[620,375,1.2]];
  let engine;
  let mouseConstraint;
  let blocks = [];
  let score = 0;
  let gameOver = false;
  let lastFrame = performance.now();

  jengaCanvas.width = canvasWidth;
  jengaCanvas.height = canvasHeight;

  function setStatus(message) {
    statusText.textContent = `${message} · Retirados: `;
    const scoreBadge = document.createElement('b');
    scoreBadge.id = 'jenga-score';
    scoreBadge.textContent = String(score);
    statusText.append(scoreBadge);
  }

  function createTower() {
    if (engine) {
      Composite.clear(engine.world, false, true);
      Engine.clear(engine);
    }
    engine = Engine.create({ enableSleeping: true });
    engine.gravity.y = 0.82;
    engine.positionIterations = 8;
    engine.velocityIterations = 7;
    engine.constraintIterations = 3;
    blocks = [];
    score = 0;
    gameOver = false;
    setStatus('Arrastra un bloque');

    const floor = Bodies.rectangle(canvasWidth / 2, floorTop + 25, canvasWidth + 100, 50, {
      isStatic: true,
      friction: 0.9,
      render: { visible: false },
    });
    Composite.add(engine.world, floor);

    for (let layer = 0; layer < layerCount; layer += 1) {
      const centerY = floorTop - blockHeight / 2 - layer * layerGap;
      for (let slot = 0; slot < 3; slot += 1) {
        const x = towerCenter + (slot - 1) * (blockWidth + blockGap);
        const block = Bodies.rectangle(x, centerY, blockWidth, blockHeight, {
          density: 0.002,
          friction: 0.96,
          frictionStatic: 1.15,
          restitution: 0,
          frictionAir: 0.025,
          chamfer: { radius: 2 },
        });
        block.plugin.jenga = { layer, slot, hue: layer % 2, startX: x };
        blocks.push(block);
      }
    }
    Composite.add(engine.world, blocks);

    const mouse = Mouse.create(jengaCanvas);
    const rect = jengaCanvas.getBoundingClientRect();
    Mouse.setScale(mouse, { x: canvasWidth / rect.width, y: canvasHeight / rect.height });
    Mouse.setOffset(mouse, { x: 0, y: 0 });
    mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      constraint: {
        stiffness: 0.11,
        damping: 0.15,
        render: { visible: false },
      },
    });
    Composite.add(engine.world, mouseConstraint);

    Events.on(mouseConstraint, 'startdrag', () => {
      if (!gameOver) setStatus('¡Con cuidado!');
    });
    Events.on(mouseConstraint, 'enddrag', (event) => {
      const block = event.body;
      if (!block || !blocks.includes(block) || gameOver) return;
      const movedClearOfSlot = Math.abs(block.position.x - block.plugin.jenga.startX) > blockWidth * 1.3;
      if (movedClearOfSlot || block.position.y < 5 || block.position.y > canvasHeight + 10) {
        Composite.remove(engine.world, block);
        blocks = blocks.filter((item) => item !== block);
        score += 1;
        advanceDailyMission('jenga');
        recordGameResult('jenga', 'ongoing', score);
        setStatus('¡Bloque retirado!');
      } else {
        setStatus('La torre sigue en pie');
      }
    });
  }

  function draw() {
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    stars.forEach(([x, y, radius]) => {
      context.beginPath();
      context.fillStyle = 'rgba(224, 210, 255, .55)';
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    });

    context.fillStyle = 'rgba(181, 155, 235, .2)';
    context.fillRect(0, floorTop + 2, canvasWidth, 1);
    context.fillStyle = 'rgba(181, 155, 235, .08)';
    context.fillRect(0, floorTop + 3, canvasWidth, canvasHeight - floorTop);

    blocks.forEach((block) => {
      const { layer, slot, hue } = block.plugin.jenga;
      context.save();
      context.translate(block.position.x, block.position.y);
      context.rotate(block.angle);
      const x = -blockWidth / 2;
      const y = -blockHeight / 2;
      const tint = hue ? ['#8171bf', '#a48cd7', '#c3a3e7'] : ['#c77b79', '#e9aa83', '#f4c08b'];
      const gradient = context.createLinearGradient(x, y, x, y + blockHeight);
      gradient.addColorStop(0, tint[2]);
      gradient.addColorStop(.45, tint[1]);
      gradient.addColorStop(1, tint[0]);
      context.shadowColor = 'rgba(7, 6, 20, .35)';
      context.shadowBlur = 7;
      context.shadowOffsetY = 3;
      context.beginPath();
      context.roundRect(x, y, blockWidth, blockHeight, 2.5);
      context.fillStyle = gradient;
      context.fill();
      context.shadowColor = 'transparent';
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(255, 236, 211, .48)';
      context.stroke();
      context.strokeStyle = 'rgba(65, 43, 103, .18)';
      context.beginPath();
      context.moveTo(x + 1, y + 3);
      context.lineTo(x + blockWidth - 1, y + 3);
      context.stroke();
      if (slot === 1 && layer % 4 === 0) {
        context.fillStyle = 'rgba(255,255,255,.52)';
        context.beginPath();
        context.arc(x + blockWidth / 2, 0, 1.2, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    });
  }

  function checkCollapse() {
    if (gameOver) return;
    const fallen = blocks.some((block) =>
      (Math.abs(block.angle) > 1.42 && Math.abs(block.position.x - towerCenter) > 52 && block.position.y > floorTop - 150) ||
      Math.abs(block.position.x - towerCenter) > canvasWidth * 0.37 ||
      block.position.y > canvasHeight + 14
    );
    if (fallen) {
      gameOver = true;
      recordGameResult('jenga', 'finished', score);
      setStatus('¡La torre cayó!');
    }
  }

  function frame(now) {
    const delta = Math.min(now - lastFrame, 16.667);
    lastFrame = now;
    if (!gameOver) {
      engine.gravity.y = currentAdminEventEffect === 'low-gravity' ? 0.22 : currentAdminEventEffect === 'reverse-gravity' ? -0.24 : 0.82;
      engine.timing.timeScale = currentAdminEventEffect === 'super-speed' ? 1.3 : 1;
      blocks.forEach((block) => { block.restitution = currentAdminEventEffect === 'bouncy' ? 0.48 : 0; });
      Engine.update(engine, delta);
      checkCollapse();
    }
    draw();
    requestAnimationFrame(frame);
  }

  restartButton.addEventListener('click', () => {
    createTower();
    lastFrame = performance.now();
  });

  window.addEventListener('resize', () => {
    const rect = jengaCanvas.getBoundingClientRect();
    Mouse.setScale(mouseConstraint.mouse, { x: canvasWidth / rect.width, y: canvasHeight / rect.height });
  });

  createTower();
  requestAnimationFrame(frame);
} else if (jengaCanvas && physicsError) {
  jengaCanvas.hidden = true;
  physicsError.hidden = false;
}

// Gato Galáctico: dos personas juegan por turnos en el mismo dispositivo.
const ticBoardElement=document.querySelector('#tic-board');
if(ticBoardElement){
 const ticStatus=document.querySelector('#gato-status'),ticRestart=document.querySelector('#gato-restart');
 let ticCells=Array(9).fill(''),ticTurn='X',ticFinished=false;
 const ticLines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
 function ticWinner(cells){for(const [a,b,c] of ticLines)if(cells[a]&&cells[a]===cells[b]&&cells[a]===cells[c])return cells[a];return cells.every(Boolean)?'draw':'';}
 function renderTicBoard(){ticBoardElement.replaceChildren();ticCells.forEach((mark,index)=>{const cell=document.createElement('button');cell.type='button';cell.className='tic-cell'+(mark?' mark-'+mark.toLowerCase():'');cell.textContent=mark==='X'?'×':mark==='O'?'○':'';cell.setAttribute('aria-label','Casilla '+(index+1)+(mark?', jugador '+mark:', vacía'));cell.disabled=Boolean(mark)||ticFinished;cell.addEventListener('click',()=>playTicMove(index));ticBoardElement.append(cell);});}
 function finishTic(result){ticFinished=true;ticStatus.textContent=result==='draw'?'¡Empate! Buena partida.':'¡Ganó el jugador '+(result==='X'?'×':'○')+'! ✨';advanceDailyMission('gato');recordGameResult('gato',result);renderTicBoard();}
 function playTicMove(index){if(ticFinished||ticCells[index])return;ticCells[index]=ticTurn;const result=ticWinner(ticCells);if(result){finishTic(result);return;}ticTurn=ticTurn==='X'?'O':'X';ticStatus.textContent='Turno de '+(ticTurn==='X'?'×':'○')+'.';renderTicBoard();}
 ticRestart.addEventListener('click',()=>{ticCells=Array(9).fill('');ticTurn='X';ticFinished=false;ticStatus.textContent='Turno de ×.';renderTicBoard();});
 renderTicBoard();
}
// Bloques estelares: tablero de 8 × 8, colocación y despeje de filas y columnas.
const blockBoardElement = document.querySelector('#block-board');
if (blockBoardElement) {
  const blockSize = 8;
  const scoreElement = document.querySelector('#blocks-score');
  const bestElement = document.querySelector('#blocks-best');
  const statusElement = document.querySelector('#blocks-status');
  const rackElement = document.querySelector('#piece-rack');
  const restartBlocks = document.querySelector('#blocks-restart');
  const bestKey = 'funverse-blocks-best';
  const shapes = [
    { name: 'Punto', cells: [[0, 0]] },
    { name: 'Dúo', cells: [[0, 0], [0, 1]] },
    { name: 'Línea corta', cells: [[0, 0], [0, 1], [0, 2]] },
    { name: 'Línea larga', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
    { name: 'Barra vertical', cells: [[0, 0], [1, 0], [2, 0]] },
    { name: 'Cuadrado', cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
    { name: 'Esquina', cells: [[0, 0], [1, 0], [1, 1]] },
    { name: 'Esquina larga', cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
    { name: 'T', cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
    { name: 'Zigzag', cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
    { name: 'Cruz', cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]] },
    { name: 'Cuña', cells: [[0, 0], [1, 0], [1, 1], [2, 0], [2, 1]] },
  ];
  const blockColors = ['#bba4ff', '#ff9fc7', '#d1ff72', '#ffcb79', '#8edcff'];
  let blockGrid = [];
  let pieceRack = [];
  let selectedPiece = -1;
  let blockScore = 0;
  let bestScore = progressNumber(localStorage.getItem(bestKey) || 0);
  playerProgress.stats.blocksBest = Math.max(playerProgress.stats.blocksBest, bestScore);
  let blockGameOver = false;

  function newRack() {
    pieceRack = Array.from({ length: 3 }, () => {
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      return { ...shape, cells: shape.cells.map(([row, col]) => [row, col]), color: blockColors[Math.floor(Math.random() * blockColors.length)] };
    });
    selectedPiece = -1;
  }

  function canPlace(shape, row, col) {
    return shape.cells.every(([rowOffset, colOffset]) => {
      const targetRow = row + rowOffset;
      const targetCol = col + colOffset;
      return targetRow >= 0 && targetCol >= 0 && targetRow < blockSize && targetCol < blockSize && !blockGrid[targetRow][targetCol];
    });
  }

  function hasAnyMove() {
    return pieceRack.some((shape) => shape && blockGrid.some((line, row) => line.some((_, col) => canPlace(shape, row, col))));
  }

  function clearPreview() {
    blockBoardElement.querySelectorAll('.preview').forEach((cell) => cell.classList.remove('preview'));
  }

  function renderBlockBoard() {
    clearPreview();
    blockBoardElement.replaceChildren();
    blockGrid.forEach((line, row) => line.forEach((filled, col) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `block-cell${filled ? ' filled' : ''}`;
      if (filled) cell.style.setProperty('--block-color', filled);
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.setAttribute('aria-label', `Fila ${row + 1}, columna ${col + 1}${filled ? ', ocupada' : ', libre'}`);
      cell.disabled = blockGameOver;
      blockBoardElement.append(cell);
    }));
  }

  function renderRack() {
    rackElement.replaceChildren();
    pieceRack.forEach((shape, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `piece-choice${index === selectedPiece ? ' selected' : ''}${shape ? '' : ' used'}`;
      button.disabled = !shape || blockGameOver;
      button.setAttribute('aria-label', shape ? `Elegir pieza ${shape.name}` : 'Pieza usada');
      if (shape) {
        const maxRow = Math.max(...shape.cells.map(([row]) => row));
        const maxCol = Math.max(...shape.cells.map(([, col]) => col));
        const mini = document.createElement('span');
        mini.className = 'piece-shape';
        mini.style.setProperty('--piece-cols', String(maxCol + 1));
        mini.style.setProperty('--piece-rows', String(maxRow + 1));
        shape.cells.forEach(([row, col]) => {
          const miniCell = document.createElement('i');
          miniCell.style.gridRow = String(row + 1);
          miniCell.style.gridColumn = String(col + 1);
          miniCell.style.setProperty('--block-color', shape.color);
          mini.append(miniCell);
        });
        button.append(mini);
      } else {
        button.textContent = '✓';
      }
      button.addEventListener('click', () => {
        selectedPiece = index;
        statusElement.textContent = `Pieza ${shape.name} seleccionada: toca dónde empieza.`;
        renderRack();
        renderBlockBoard();
      });
      rackElement.append(button);
    });
  }

  function renderBlockScore() {
    scoreElement.textContent = String(blockScore);
    bestElement.textContent = String(bestScore);
  }

  function finishBlockMove() {
    if (pieceRack.every((shape) => !shape)) newRack();
    if (!hasAnyMove()) {
      blockGameOver = true;
      recordGameResult('bloques', 'finished', blockScore);
      statusElement.textContent = `¡Partida terminada! Hiciste ${blockScore} puntos. Toca “Reiniciar” para jugar otra vez.`;
    }
    renderRack();
    renderBlockBoard();
    renderBlockScore();
  }

  function placePiece(row, col) {
    if (selectedPiece < 0 || !pieceRack[selectedPiece] || blockGameOver) {
      statusElement.textContent = 'Primero elige una pieza de la derecha.';
      return;
    }
    const shape = pieceRack[selectedPiece];
    if (!canPlace(shape, row, col)) {
      statusElement.textContent = 'Ahí no cabe. Prueba otro espacio libre.';
      return;
    }
    shape.cells.forEach(([rowOffset, colOffset]) => {
      blockGrid[row + rowOffset][col + colOffset] = shape.color;
    });
    advanceDailyMission('bloques');
    blockScore += shape.cells.length;
    pieceRack[selectedPiece] = null;
    selectedPiece = -1;

    const fullRows = blockGrid.map((line, index) => line.every(Boolean) ? index : -1).filter((index) => index >= 0);
    const fullCols = Array.from({ length: blockSize }, (_, colIndex) => colIndex).filter((colIndex) => blockGrid.every((line) => line[colIndex]));
    if (fullRows.length || fullCols.length) {
      const cleared = new Set();
      fullRows.forEach((rowIndex) => blockGrid[rowIndex].forEach((_, colIndex) => cleared.add(`${rowIndex},${colIndex}`)));
      fullCols.forEach((colIndex) => blockGrid.forEach((_, rowIndex) => cleared.add(`${rowIndex},${colIndex}`)));
      for (const location of cleared) {
        const [clearRow, clearCol] = location.split(',').map(Number);
        blockGrid[clearRow][clearCol] = '';
      }
      blockScore += fullRows.length * 10 + fullCols.length * 10;
      statusElement.textContent = `¡Bien! Despejaste ${fullRows.length ? `${fullRows.length} fila${fullRows.length === 1 ? '' : 's'}` : ''}${fullRows.length && fullCols.length ? ' y ' : ''}${fullCols.length ? `${fullCols.length} columna${fullCols.length === 1 ? '' : 's'}` : ''}.`;
    } else {
      statusElement.textContent = '¡Pieza colocada! Elige la siguiente.';
    }
    if (blockScore > bestScore) {
      bestScore = blockScore;
      localStorage.setItem(bestKey, String(bestScore));
      playerProgress.stats.blocksBest = Math.max(playerProgress.stats.blocksBest, bestScore);
      savePlayerProgress();
      updatePassport();
    }
    finishBlockMove();
  }

  blockBoardElement.addEventListener('click', (event) => {
    const cell = event.target.closest('.block-cell');
    if (cell) placePiece(Number(cell.dataset.row), Number(cell.dataset.col));
  });
  blockBoardElement.addEventListener('pointerover', (event) => {
    const cell = event.target.closest('.block-cell');
    const shape = pieceRack[selectedPiece];
    if (!cell || !shape || blockGameOver) return;
    clearPreview();
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (!canPlace(shape, row, col)) return;
    shape.cells.forEach(([dr, dc]) => {
      const target = blockBoardElement.querySelector(`[data-row="${row + dr}"][data-col="${col + dc}"]`);
      if (target) target.classList.add('preview');
    });
  });
  blockBoardElement.addEventListener('pointerleave', clearPreview);

  function resetBlocks() {
    blockGrid = Array.from({ length: blockSize }, () => Array(blockSize).fill(''));
    blockScore = 0;
    blockGameOver = false;
    newRack();
    renderBlockScore();
    renderRack();
    renderBlockBoard();
    statusElement.textContent = 'Elige una pieza y toca el tablero para colocarla.';
  }

  restartBlocks.addEventListener('click', resetBlocks);
  renderBlockScore();
  resetBlocks();
}

// Tres minijuegos nuevos del arcade: memoria, reflejos y preguntas espaciales.
const memoryGrid = document.querySelector('#memory-grid');
if (memoryGrid) {
  const memoryFaces = ['🚀', '🪐', '👾', '🌙', '🛸', '⭐'];
  const memoryResult = document.querySelector('#memory-result');
  let memoryCards = [];
  let memoryOpen = [];
  let memoryPairs = 0;
  let memoryAttempts = 0;
  let memoryLocked = false;
  let memoryTimer = 0;
  function resetMemory() {
    window.clearTimeout(memoryTimer);
    memoryCards = [...memoryFaces, ...memoryFaces].map((face, id) => ({ face, id, matched: false })).sort(() => Math.random() - 0.5);
    memoryOpen = [];
    memoryPairs = 0;
    memoryAttempts = 0;
    memoryLocked = false;
    memoryGrid.replaceChildren();
    memoryCards.forEach((card, index) => {
      const button = document.createElement('button');
      button.className = 'memory-card';
      button.type = 'button';
      button.textContent = '✦';
      button.dataset.index = String(index);
      button.setAttribute('aria-label', `Carta ${index + 1}, oculta`);
      button.addEventListener('click', () => {
        const current = memoryCards[index];
        if (!current || current.matched || memoryLocked || memoryOpen.includes(index)) return;
        button.textContent = current.face;
        button.classList.add('is-revealed');
        button.setAttribute('aria-label', `Carta ${index + 1}, ${current.face}`);
        memoryOpen.push(index);
        if (memoryOpen.length < 2) return;
        memoryAttempts += 1;
        const [firstIndex, secondIndex] = memoryOpen;
        if (memoryCards[firstIndex].face === memoryCards[secondIndex].face) {
          memoryCards[firstIndex].matched = true;
          memoryCards[secondIndex].matched = true;
          [firstIndex, secondIndex].forEach((matchedIndex) => memoryGrid.children[matchedIndex].classList.add('is-matched'));
          memoryPairs += 1;
          memoryOpen = [];
          memoryResult.textContent = memoryPairs === memoryFaces.length ? `¡Todas las parejas en ${memoryAttempts} intentos! ✨` : `Parejas: ${memoryPairs} / 6 · Intentos: ${memoryAttempts}`;
          return;
        }
        memoryLocked = true;
        memoryResult.textContent = `Parejas: ${memoryPairs} / 6 · Intentos: ${memoryAttempts}`;
        memoryTimer = window.setTimeout(() => {
          [firstIndex, secondIndex].forEach((mismatchIndex) => {
            const cardButton = memoryGrid.children[mismatchIndex];
            cardButton.textContent = '✦';
            cardButton.classList.remove('is-revealed');
            cardButton.setAttribute('aria-label', `Carta ${mismatchIndex + 1}, oculta`);
          });
          memoryOpen = [];
          memoryLocked = false;
        }, 720);
      });
      memoryGrid.append(button);
    });
    memoryResult.textContent = 'Parejas: 0 / 6 · Intentos: 0';
  }
  document.querySelector('#memory-restart').addEventListener('click', resetMemory);
  resetMemory();
}

const reactionPad = document.querySelector('#reaction-pad');
if (reactionPad) {
  const reactionResult = document.querySelector('#reaction-result');
  const bestKey = 'funverse-reaction-best-v1';
  let reactionState = 'idle';
  let reactionTimer = 0;
  let reactionStartedAt = 0;
  let reactionBest = 0;
  try { reactionBest = progressNumber(localStorage.getItem(bestKey)); } catch {}
  reactionResult.textContent = reactionBest ? `Tu récord: ${reactionBest} ms` : 'Tu récord: — ms';
  reactionPad.addEventListener('click', () => {
    if (reactionState === 'idle' || reactionState === 'done') {
      reactionState = 'waiting';
      reactionPad.dataset.state = 'waiting';
      reactionPad.textContent = 'Espera el destello azul…';
      reactionResult.textContent = 'No pulses todavía';
      reactionTimer = window.setTimeout(() => {
        reactionState = 'ready';
        reactionStartedAt = performance.now();
        reactionPad.dataset.state = 'ready';
        reactionPad.textContent = '¡AHORA!';
      }, 1300 + Math.random() * 2400);
      return;
    }
    if (reactionState === 'waiting') {
      window.clearTimeout(reactionTimer);
      reactionState = 'done';
      reactionPad.dataset.state = 'early';
      reactionPad.textContent = '¡Muy pronto! Otra vez';
      reactionResult.textContent = 'Espera el destello para medir tu tiempo.';
      return;
    }
    if (reactionState === 'ready') {
      const time = Math.max(1, Math.round(performance.now() - reactionStartedAt));
      reactionBest = reactionBest ? Math.min(reactionBest, time) : time;
      try { localStorage.setItem(bestKey, String(reactionBest)); } catch {}
      reactionState = 'done';
      reactionPad.dataset.state = 'done';
      reactionPad.textContent = `${time} ms · jugar otra vez`;
      reactionResult.textContent = `Tu tiempo: ${time} ms · récord: ${reactionBest} ms`;
    }
  });
}

const quizQuestion = document.querySelector('#quiz-question');
if (quizQuestion) {
  const quizOptions = document.querySelector('#quiz-options');
  const quizResult = document.querySelector('#quiz-result');
  const questions = [
    { q: '¿Qué planeta es conocido como el planeta rojo?', options: ['Marte', 'Venus', 'Neptuno'], answer: 0 },
    { q: 'En un juego de gato, ¿cuántas casillas tiene el tablero?', options: ['6', '9', '12'], answer: 1 },
    { q: '¿Qué estrella está en el centro de nuestro sistema solar?', options: ['Sirio', 'Polaris', 'El Sol'], answer: 2 },
    { q: '¿Qué forma tiene una órbita perfectamente circular?', options: ['Triángulo', 'Círculo', 'Hexágono'], answer: 1 },
    { q: '¿Cuál de estas opciones es un lenguaje que se usa en Roblox Studio?', options: ['Luau', 'LuaScript++', 'RobloxCode'], answer: 0 },
  ];
  let quizIndex = Math.floor(Math.random() * questions.length);
  let quizScore = 0;
  let quizAnswered = false;
  function renderQuiz() {
    const item = questions[quizIndex];
    quizQuestion.textContent = item.q;
    quizOptions.replaceChildren();
    quizAnswered = false;
    item.options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiz-option';
      button.textContent = option;
      button.addEventListener('click', () => {
        if (quizAnswered) return;
        quizAnswered = true;
        const correct = index === item.answer;
        if (correct) quizScore += 1;
        [...quizOptions.children].forEach((answerButton, answerIndex) => {
          answerButton.disabled = true;
          if (answerIndex === item.answer) answerButton.classList.add('answer-correct');
          else if (answerIndex === index) answerButton.classList.add('answer-wrong');
        });
        quizResult.textContent = `${correct ? '¡Correcto! ✨' : 'Buen intento.'} Aciertos: ${quizScore}`;
      });
      quizOptions.append(button);
    });
  }
  document.querySelector('#quiz-next').addEventListener('click', () => {
    quizIndex = (quizIndex + 1) % questions.length;
    renderQuiz();
  });
  renderQuiz();
}

const drawingCanvas = document.querySelector('#pixel-canvas');
if (drawingCanvas) {
  const drawingContext = drawingCanvas.getContext('2d');
  const drawingColor = document.querySelector('#pixel-color');
  const drawingSize = document.querySelector('#pixel-size');
  const drawingStatus = document.querySelector('#pixel-status');
  let drawing = false;
  drawingContext.lineCap = 'round';
  drawingContext.lineJoin = 'round';
  drawingContext.fillStyle = '#071633';
  drawingContext.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  function canvasPoint(event) {
    const rect = drawingCanvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * drawingCanvas.width / rect.width, y: (event.clientY - rect.top) * drawingCanvas.height / rect.height };
  }
  drawingCanvas.addEventListener('pointerdown', (event) => {
    drawing = true;
    drawingCanvas.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    drawingContext.beginPath();
    drawingContext.moveTo(point.x, point.y);
    drawingContext.strokeStyle = drawingColor.value;
    drawingContext.lineWidth = Number(drawingSize.value);
    drawingContext.lineTo(point.x + .1, point.y + .1);
    drawingContext.stroke();
    drawingStatus.textContent = '¡Buen trazo! Tu dibujo sigue en este equipo.';
  });
  drawingCanvas.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    const point = canvasPoint(event);
    drawingContext.lineTo(point.x, point.y);
    drawingContext.strokeStyle = drawingColor.value;
    drawingContext.lineWidth = Number(drawingSize.value);
    drawingContext.stroke();
  });
  drawingCanvas.addEventListener('pointerup', () => { drawing = false; drawingContext.closePath(); });
  drawingCanvas.addEventListener('pointercancel', () => { drawing = false; drawingContext.closePath(); });
  document.querySelector('#pixel-clear').addEventListener('click', () => {
    drawingContext.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    drawingContext.fillStyle = '#071633';
    drawingContext.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    drawingStatus.textContent = 'Lienzo limpio. ¡Dibuja otra idea!';
  });
  document.querySelector('#pixel-save').addEventListener('click', () => {
    drawingCanvas.toBlob((blob) => {
      if (!blob) { drawingStatus.textContent = 'No pude crear el archivo del dibujo.'; return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'funverse-dibujo.png';
      link.click();
      URL.revokeObjectURL(url);
      drawingStatus.textContent = 'Dibujo guardado en Descargas.';
    }, 'image/png');
  });
}

const beatGrid = document.querySelector('#beat-grid');
if (beatGrid) {
  const beatRows = [
    { id: 'kick', label: 'Bombo', code: 'KICK', type: 'sine', frequency: 105, level: 0.24, pattern: [1,0,0,0,1,0,0,0] },
    { id: 'snare', label: 'Caja', code: 'SNARE', type: 'triangle', frequency: 205, level: 0.13, pattern: [0,0,1,0,0,0,1,0] },
    { id: 'hat', label: 'Chispa', code: 'HAT', type: 'square', frequency: 820, level: 0.045, pattern: [1,1,1,1,1,1,1,1] },
    { id: 'synth', label: 'Estrella', code: 'SYNTH', type: 'triangle', frequency: 420, level: 0.1, pattern: [1,0,0,1,0,0,1,0] },
  ];
  const beatToggle = document.querySelector('#beat-toggle');
  const beatTempo = document.querySelector('#beat-tempo');
  const beatStatus = document.querySelector('#beat-status');
  let beatAudio = null;
  let beatTimer = 0;
  let beatStep = 0;
  let beatPlaying = false;
  function renderBeatGrid() {
    beatGrid.replaceChildren();
    const fragment = document.createDocumentFragment();
    beatRows.forEach((row) => {
      const label = document.createElement('span');
      label.className = 'beat-row-label';
      label.textContent = row.label;
      fragment.append(label);
      row.pattern.forEach((on, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'beat-step';
        button.dataset.track = row.id;
        button.dataset.step = String(index);
        button.setAttribute('aria-label', `${row.label}, paso ${index + 1}`);
        button.setAttribute('aria-pressed', String(Boolean(on)));
        button.classList.toggle('is-on', Boolean(on));
        button.addEventListener('click', () => {
          row.pattern[index] = row.pattern[index] ? 0 : 1;
          button.setAttribute('aria-pressed', String(Boolean(row.pattern[index])));
          button.classList.toggle('is-on', Boolean(row.pattern[index]));
        });
        fragment.append(button);
      });
    });
    beatGrid.replaceChildren(fragment);
  }
  function playBeatStep() {
    beatGrid.querySelectorAll('.beat-step').forEach((button) => button.classList.toggle('is-current', Number(button.dataset.step) === beatStep));
    const now = beatAudio.currentTime;
    beatRows.forEach((row) => {
      if (!row.pattern[beatStep]) return;
      const oscillator = beatAudio.createOscillator();
      const gain = beatAudio.createGain();
      oscillator.type = row.type;
      oscillator.frequency.setValueAtTime(row.frequency, now);
      if (row.id === 'kick') oscillator.frequency.exponentialRampToValueAtTime(48, now + .11);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(row.level, now + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, now + (row.id === 'synth' ? .18 : .12));
      oscillator.connect(gain);
      gain.connect(beatAudio.destination);
      oscillator.start(now);
      oscillator.stop(now + .2);
    });
    beatStep = (beatStep + 1) % 8;
  }
  function stopBeat() {
    window.clearInterval(beatTimer);
    beatTimer = 0;
    beatPlaying = false;
    beatGrid.querySelectorAll('.beat-step').forEach((button) => button.classList.remove('is-current'));
    beatToggle.textContent = '▶ Tocar ritmo';
    if (beatAudio && beatAudio.state === 'running') void beatAudio.suspend();
  }
  async function startBeat() {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) { beatStatus.textContent = 'Este navegador no admite audio sintetizado.'; return; }
    if (!beatAudio) beatAudio = new AudioEngine();
    await beatAudio.resume();
    beatPlaying = true;
    beatStep = 0;
    beatToggle.textContent = '■ Detener ritmo';
    beatStatus.textContent = 'Ritmo original creado en este navegador.';
    playBeatStep();
    beatTimer = window.setInterval(playBeatStep, Number(beatTempo.value));
  }
  renderBeatGrid();
  beatToggle.addEventListener('click', () => { if (beatPlaying) stopBeat(); else void startBeat(); });
  beatTempo.addEventListener('change', () => { if (beatPlaying) { window.clearInterval(beatTimer); beatTimer = window.setInterval(playBeatStep, Number(beatTempo.value)); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopBeat(); });
  window.addEventListener('pagehide', stopBeat);
}

document.querySelectorAll('.soundtrack-item audio').forEach((audio) => {
  audio.addEventListener('play', () => {
    document.querySelectorAll('.soundtrack-item audio').forEach((otherAudio) => { if (otherAudio !== audio) otherAudio.pause(); });
  });
});

// Cuenta propietaria para gestionar la galería local de videos.
const accountButton = document.querySelector('#account-button');
const accountDialog = document.querySelector('#account-dialog');
const accountIntro = document.querySelector('#account-intro');
const accountMessage = document.querySelector('#account-message');
const setupForm = document.querySelector('#setup-form');
const loginForm = document.querySelector('#login-form');
const registerForm = document.querySelector('#register-form');
const ownerPanel = document.querySelector('#owner-panel');
const ownerAdminLink = document.querySelector('#owner-admin-link');
const ownerEmail = document.querySelector('#owner-email');
const profileNameInput = document.querySelector('#profile-display-name');
const profileAvatarFile = document.querySelector('#profile-avatar-file');
const profileAvatarPreview = document.querySelector('#profile-avatar-preview');
const profileStatus = document.querySelector('#profile-status');
let pendingProfileAvatar = undefined;
const accountRole = document.querySelector('#account-role');
const mailSetupNote = document.querySelector('#mail-setup-note');
const ownerEventTools = document.querySelector('#owner-event-tools');
const ownerEventStatus = document.querySelector('#owner-event-status');
const ownerEventToggle = document.querySelector('#owner-event-toggle');
const ownerEventSave = document.querySelector('#owner-event-save');
const ownerEventRun = document.querySelector('#owner-event-run');
const ownerEventDuration = document.querySelector('#owner-event-duration');
const ownerEventEffect = document.querySelector('#owner-event-effect');
const ownerAnnouncementBody = document.querySelector('#owner-announcement-body');
const ownerAnnouncementStatus = document.querySelector('#owner-announcement-status');
const ownerAnnouncementPublish = document.querySelector('#owner-announcement-publish');
const ownerAnnouncementClear = document.querySelector('#owner-announcement-clear');
const twoFactorPanel = document.querySelector('#two-factor-panel');
const twoFactorBegin = document.querySelector('#two-factor-begin');
const twoFactorSetup = document.querySelector('#two-factor-setup');
const twoFactorSecret = document.querySelector('#two-factor-secret');
const twoFactorCode = document.querySelector('#two-factor-code');
const twoFactorPasswordRow = document.querySelector('#two-factor-password-row');
const twoFactorPassword = document.querySelector('#two-factor-password');
const twoFactorConfirm = document.querySelector('#two-factor-confirm');
const twoFactorDisable = document.querySelector('#two-factor-disable');
const twoFactorStatus = document.querySelector('#two-factor-status');
let twoFactorEnabled = false;
const videoAdmin = document.querySelector('#video-admin');
const videoInput = document.querySelector('#video-file');
const uploadStatus = document.querySelector('#upload-status');
const videoGrid = document.querySelector('#video-grid');
const isStaffRole = (role) => role === 'owner' || role === 'admin';
let authMode = 'login';
let ownerManualEventActive = false;

function updateOwnerEventPanel(settings) {
  ownerEventDuration.value = String(settings.durationMinutes);
  ownerEventEffect.value = settings.effect;
  ownerManualEventActive = Boolean(settings.manualActive);
  const event = settings.eventState;
  if (ownerManualEventActive) {
    const end = new Date(settings.manualEndsAt || event?.endsAt);
    const time = Number.isFinite(end.getTime()) ? new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: 'numeric', minute: '2-digit' }).format(end) : '';
    ownerEventStatus.textContent = `Lanzado por ti · termina a las ${time} · puedes finalizarlo aquí.`;
  } else if (event?.source === 'weekly' && event.active) {
    ownerEventStatus.textContent = 'La sesión semanal está activa. Puedes lanzar tu propia sesión también.';
  } else if (settings.weeklyEnabled) {
    ownerEventStatus.textContent = `Horario semanal: sábado a las 12:00 · ${settings.durationMinutes} min · Ciudad de México.`;
  } else {
    ownerEventStatus.textContent = 'Horario semanal pausado. Puedes iniciar un evento manual cuando quieras.';
  }
  ownerEventToggle.textContent = settings.weeklyEnabled ? 'Pausar horario semanal' : 'Activar horario semanal';
  ownerEventRun.textContent = ownerManualEventActive ? 'Terminar ahora' : 'Iniciar ahora ✦';
  ownerAnnouncementStatus.textContent = settings.announcement ? `Anuncio global publicado por ${settings.announcement.authorName || 'FUNVERSE'}.` : 'Todavía no hay un anuncio activo.';
}

function showAccountPanel(message = '') {
  setupForm.hidden = !authState.setupRequired;
  loginForm.hidden = authState.setupRequired || authState.signedIn || authMode === 'register';
  registerForm.hidden = authState.setupRequired || authState.signedIn || authMode !== 'register';
  ownerPanel.hidden = !authState.signedIn;
  accountIntro.textContent = authState.setupRequired
    ? 'Crea la cuenta propietaria de esta instalación.'
    : authState.signedIn
      ? authState.role === 'owner' ? 'Tu cuenta propietaria está activa.' : 'Tu cuenta personal está activa en esta computadora.'
      : authMode === 'register' ? 'Crea una cuenta personal de FUNVERSE.' : 'Inicia sesión o crea tu cuenta personal.';
  ownerEmail.textContent = authState.email || '';
  accountRole.textContent = authState.role === 'owner' ? 'OWNER · ÚNICO' : authState.role === 'admin' ? 'ADMINISTRADOR' : authState.role === 'parent' ? 'ADULTO RESPONSABLE' : 'CUENTA PERSONAL';
  passportOwner = authState.role === 'owner';
  updatePassport();
  profileNameInput.value = authState.displayName || (authState.email || '').split('@')[0];
  profileAvatarPreview.src = authState.avatar || '/assets/funverse-astronaut.svg';
  if (profileStatus) profileStatus.textContent = authState.avatar ? 'Foto de perfil guardada en esta instalación.' : 'Foto PNG, JPG o WebP de hasta 256 KB.';
  mailSetupNote.hidden = authState.role !== 'owner' || authState.emailNotificationsReady;
  ownerEventTools.hidden = !isStaffRole(authState.role);
  accountButton.textContent = authState.signedIn ? (authState.displayName || 'Mi cuenta') : authState.setupRequired ? 'Configurar' : 'Entrar';
  accountButton.querySelector('.account-avatar-thumb')?.remove();
  if (authState.signedIn && authState.avatar) { const avatar = document.createElement('img'); avatar.className = 'account-avatar-thumb'; avatar.src = authState.avatar; avatar.alt = ''; accountButton.prepend(avatar); }
  videoAdmin.hidden = !isStaffRole(authState.role);
  if (ownerAdminLink) ownerAdminLink.hidden = !isStaffRole(authState.role);
  if (twoFactorPanel) twoFactorPanel.hidden = !authState.signedIn;
  if (ownerLiveStop) ownerLiveStop.hidden = !isStaffRole(authState.role) || !weeklyEventState?.manualActive;
  accountMessage.textContent = message;
}

async function refreshAuth() {
  try {
    const data = await apiJson('/api/auth/status');
    authState = data;
    showAccountPanel();
    renderVideos();
    if (authState.signedIn) void syncAccountProgress(authState.email);
    if (isStaffRole(authState.role)) void refreshOwnerEventSettings();
    if (authState.signedIn) void refreshTwoFactorSettings();
  } catch {
    accountButton.textContent = 'Entrar';
    videoAdmin.hidden = true;
    accountMessage.textContent = 'No encuentro FUNVERSE. Deja abierto el servidor y vuelve a intentarlo.';
  }
}

async function refreshOwnerEventSettings() {
  if (!isStaffRole(authState.role)) return;
  try {
    const settings = await apiJson('/api/admin/events');
    updateOwnerEventPanel(settings);
  } catch (error) {
    ownerEventStatus.textContent = error.message || 'No pude cargar la configuración.';
  }
}

function renderTwoFactorSettings(data = {}) {
  if (!twoFactorPanel) return;
  twoFactorEnabled = Boolean(data.enabled);
  const hasPendingSecret = Boolean(data.pendingSecret);
  twoFactorPanel.hidden = !authState.signedIn;
  twoFactorBegin.hidden = twoFactorEnabled || hasPendingSecret;
  twoFactorSetup.hidden = !twoFactorEnabled && !hasPendingSecret;
  twoFactorDisable.hidden = !twoFactorEnabled;
  twoFactorConfirm.hidden = twoFactorEnabled;
  twoFactorPasswordRow.hidden = !twoFactorEnabled;
  twoFactorSecret.textContent = data.pendingSecret || (twoFactorEnabled ? 'Configurada y protegida en esta instalación.' : '');
  twoFactorStatus.textContent = twoFactorEnabled ? 'Activa. El próximo inicio de sesión pedirá un código de 6 dígitos.' : hasPendingSecret ? 'Escribe el código actual de tu aplicación para confirmar.' : 'Aún no está activada.';
}

async function refreshTwoFactorSettings() {
  if (!authState.signedIn || !twoFactorPanel) return;
  try { renderTwoFactorSettings(await apiJson('/api/auth/two-factor')); }
  catch (error) { twoFactorStatus.textContent = error.message || 'No pude consultar la verificación.'; }
}

twoFactorBegin?.addEventListener('click', async () => {
  twoFactorBegin.disabled = true;
  try { renderTwoFactorSettings(await apiJson('/api/auth/two-factor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'begin' }) })); }
  catch (error) { twoFactorStatus.textContent = error.message || 'No pude iniciar la configuración.'; }
  finally { twoFactorBegin.disabled = false; }
});

twoFactorConfirm?.addEventListener('click', async () => {
  twoFactorConfirm.disabled = true;
  try {
    await apiJson('/api/auth/two-factor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'enable', code: twoFactorCode.value }) });
    twoFactorCode.value = '';
    await refreshTwoFactorSettings();
  } catch (error) { twoFactorStatus.textContent = error.message || 'No pude activar la verificación.'; }
  finally { twoFactorConfirm.disabled = false; }
});

twoFactorDisable?.addEventListener('click', async () => {
  twoFactorDisable.disabled = true;
  try {
    await apiJson('/api/auth/two-factor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disable', code: twoFactorCode.value, password: twoFactorPassword.value }) });
    twoFactorCode.value = '';
    twoFactorPassword.value = '';
    await refreshTwoFactorSettings();
  } catch (error) { twoFactorStatus.textContent = error.message || 'No pude desactivar la verificación.'; }
  finally { twoFactorDisable.disabled = false; }
});

function showAccountDialog() {
  showAccountPanel();
  if (typeof accountDialog.showModal === 'function') accountDialog.showModal();
  else accountDialog.setAttribute('open', '');
}

function openAccountDialog() {
  showAccountDialog();
  accountMessage.textContent = 'Comprobando tu cuenta…';
  void refreshAuth();
}

if (window.location.hash === '#account-dialog') openAccountDialog();

accountButton.addEventListener('click', openAccountDialog);
document.querySelector('#account-close').addEventListener('click', () => accountDialog.close());
accountDialog.addEventListener('click', (event) => {
  if (event.target === accountDialog) accountDialog.close();
});

async function saveOwnerEventSettings(changes) {
  [ownerEventToggle, ownerEventSave, ownerEventRun].forEach((button) => { button.disabled = true; });
  try {
    await apiJson('/api/admin/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationMinutes: Number(ownerEventDuration.value), effect: ownerEventEffect.value, ...changes }),
    });
    await refreshOwnerEventSettings();
    await updateAssistantStatus();
    accountMessage.textContent = 'Configuración del evento guardada.';
  } catch (error) {
    accountMessage.textContent = error.message || 'No pude guardar el evento.';
  } finally {
    [ownerEventToggle, ownerEventSave, ownerEventRun].forEach((button) => { button.disabled = false; });
  }
}

ownerEventToggle.addEventListener('click', () => saveOwnerEventSettings({ weeklyEnabled: ownerEventToggle.textContent === 'Activar horario semanal' }));
ownerEventSave.addEventListener('click', () => saveOwnerEventSettings({}));
ownerEventRun.addEventListener('click', () => saveOwnerEventSettings({ action: ownerManualEventActive ? 'stop' : 'start' }));
ownerLiveStop?.addEventListener('click', () => saveOwnerEventSettings({ action: 'stop' }));

async function updateDanzokAnnouncement(action) {
  ownerAnnouncementPublish.disabled = true;
  ownerAnnouncementClear.disabled = true;
  ownerAnnouncementStatus.textContent = action === 'announce' ? 'Publicando anuncio…' : 'Retirando anuncio…';
  try {
    const payload = { action };
    if (action === 'announce') {
      payload.body = ownerAnnouncementBody.value;
    }
    const settings = await apiJson('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    ownerAnnouncementStatus.textContent = settings.announcement ? `Anuncio publicado por ${settings.announcement.authorName || authState.displayName || 'FUNVERSE'}.` : 'El anuncio se retiró.';
    if (action === 'announce') {
      ownerAnnouncementBody.value = '';
    }
    await updateAssistantStatus();
  } catch (error) {
    ownerAnnouncementStatus.textContent = error.message || 'No pude actualizar el anuncio.';
  } finally {
    ownerAnnouncementPublish.disabled = false;
    ownerAnnouncementClear.disabled = false;
  }
}

ownerAnnouncementPublish.addEventListener('click', () => updateDanzokAnnouncement('announce'));
ownerAnnouncementClear.addEventListener('click', () => updateDanzokAnnouncement('clear-announcement'));

async function submitAccountForm(event, endpoint) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  accountMessage.textContent = 'Conectando…';
  const formData = new FormData(form);
  try {
    const data = await apiJson(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: formData.get('email'), password: formData.get('password'), otp: formData.get('otp'), accountType: formData.get('accountType') }),
    });
    if (data.twoFactorRequired || data.emailCodeRequired) {
      const codeRow = document.querySelector('#login-otp-row');
      const codeInput = document.querySelector('#login-otp');
      codeRow.hidden = false;
      codeInput.required = true;
      accountMessage.textContent = data.emailCodeRequired
        ? data.emailCodeSent ? 'Te envié un código de 6 dígitos al correo de OWNER. Revisa también Spam.' : 'Ya envié el código. Revisa tu correo y escribe los 6 dígitos.'
        : 'Escribe el código de 6 dígitos de tu aplicación autenticadora.';
      codeInput.focus();
      return;
    }
    authState = { ...authState, ...data, setupRequired: false, signedIn: true };
    await syncAccountProgress(authState.email);
    form.reset();
    const codeRow = document.querySelector('#login-otp-row');
    if (codeRow) codeRow.hidden = true;
    const codeInput = document.querySelector('#login-otp');
    if (codeInput) codeInput.required = false;
    if (isStaffRole(authState.role)) await refreshOwnerEventSettings();
    showAccountPanel(authState.role === 'owner' ? '¡Listo! Ya puedes administrar FUNVERSE como OWNER.' : authState.role === 'admin' ? '¡Listo! Ya puedes administrar FUNVERSE como ADMIN.' : authState.role === 'parent' ? '¡Listo! Tu cuenta de adulto responsable ya está creada.' : '¡Listo! Tu cuenta personal ya está creada.');
    void refreshTwoFactorSettings();
    await refreshVideos();
    accountDialog.close();
  } catch (error) {
    accountMessage.textContent = error instanceof TypeError
      ? 'No encuentro FUNVERSE. Abre http://127.0.0.1:3000 y deja el servidor activo.'
      : error.message;
  } finally {
    submitButton.disabled = false;
  }
}

setupForm.addEventListener('submit', (event) => submitAccountForm(event, '/api/auth/setup'));
loginForm.addEventListener('submit', (event) => submitAccountForm(event, '/api/auth/login'));
registerForm.addEventListener('submit', (event) => submitAccountForm(event, '/api/auth/register'));
document.querySelector('#show-register').addEventListener('click', () => {
  authMode = 'register';
  document.querySelector('#login-otp-row').hidden = true;
  document.querySelector('#login-otp').required = false;
  showAccountPanel();
});
document.querySelector('#show-login').addEventListener('click', () => {
  authMode = 'login';
  showAccountPanel();
});

profileAvatarFile?.addEventListener('change', () => {
  const file = profileAvatarFile.files?.[0];
  if (!file) { pendingProfileAvatar = undefined; return; }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 256 * 1024) {
    pendingProfileAvatar = undefined;
    profileAvatarFile.value = '';
    profileStatus.textContent = 'Elige PNG, JPG o WebP de hasta 256 KB.';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => { pendingProfileAvatar = String(reader.result); profileAvatarPreview.src = pendingProfileAvatar; profileStatus.textContent = 'Vista previa lista. Guarda el perfil para publicar el cambio.'; };
  reader.onerror = () => { profileStatus.textContent = 'No pude leer esa imagen.'; };
  reader.readAsDataURL(file);
});
document.querySelector('#profile-save')?.addEventListener('click', async () => {
  const button = document.querySelector('#profile-save');
  button.disabled = true;
  try {
    const payload = { displayName: profileNameInput.value.trim() };
    if (pendingProfileAvatar !== undefined) payload.avatar = pendingProfileAvatar;
    const profile = await apiJson('/api/auth/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    authState = { ...authState, ...profile };
    pendingProfileAvatar = undefined;
    profileAvatarFile.value = '';
    showAccountPanel('Perfil guardado.');
  } catch (error) { profileStatus.textContent = error.message || 'No pude guardar el perfil.'; }
  finally { button.disabled = false; }
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  try { await apiJson('/api/auth/logout', { method: 'POST' }); }
  catch (error) { accountMessage.textContent = error.message; return; }
  authState = { setupRequired: false, signedIn: false, email: null, role: null, emailNotificationsReady: false };
  authMode = 'login';
  showAccountPanel('Sesión cerrada.');
  await refreshVideos();
});

// FUN Academy: lecciones cortas, progreso local y vista previa aislada.
const codingLessonList = document.querySelector('#coding-lesson-list');
if (codingLessonList) {
  const codingLessons = [
    { title: 'Variables', intro: 'Una variable guarda un dato para poder usarlo después.', challenge: 'Cambia el nombre Viajero por otro nombre.', sample: '<main><h1 id="saludo"></h1></main>\n<script>\nconst nombre = "Viajero";\ndocument.getElementById("saludo").textContent = "Hola, " + nombre + " ✨";\n</script>', checks: ['const', 'getElementById', 'textContent'], validate: (code) => !code.includes('const nombre = "Viajero"') },
    { title: 'Botones y eventos', intro: 'addEventListener conecta una acción con un clic.', challenge: 'Cambia el contador para que cada clic sume dos estrellas.', sample: '<button id="boton">Sumar estrella</button>\n<p>Estrellas: <b id="total">0</b></p>\n<script>\nlet estrellas = 0;\ndocument.getElementById("boton").addEventListener("click", () => {\n  estrellas = estrellas + 1;\n  document.getElementById("total").textContent = estrellas;\n});\n</script>', checks: ['addEventListener', 'textContent', 'estrellas'], validate: (code) => code.includes('estrellas = estrellas + 2') },
    { title: 'Decisiones', intro: 'if y else permiten que el programa elija qué hacer.', challenge: 'Cambia la energía a 2 para mostrar el mensaje de recarga.', sample: '<h2 id="resultado"></h2>\n<script>\nconst energia = 7;\nif (energia >= 5) {\n  document.getElementById("resultado").textContent = "¡Despegue! 🚀";\n} else {\n  document.getElementById("resultado").textContent = "Recarga la nave ✨";\n}\n</script>', checks: ['if', 'else', '>='], validate: (code) => code.includes('const energia = 2') },
    { title: 'Repeticiones', intro: 'Un bucle for repite una acción varias veces.', challenge: 'Cambia el límite del bucle para crear ocho estrellas.', sample: '<ul id="estrellas"></ul>\n<script>\nconst lista = document.getElementById("estrellas");\nfor (let numero = 1; numero <= 5; numero++) {\n  const estrella = document.createElement("li");\n  estrella.textContent = "Estrella " + numero + " ✦";\n  lista.append(estrella);\n}\n</script>', checks: ['for', 'append', 'numero'], validate: (code) => code.includes('numero <= 8') },
  ];
  const codingLessonGuides = [
    ['const nombre = "Viajero" guarda el nombre en una variable.', 'getElementById("saludo") busca el elemento HTML que tiene ese id.', 'textContent coloca el saludo dentro de ese elemento.', 'Pulsa “Ver vista previa” para ver el resultado sin salir de la página.'],
    ['let estrellas = 0 crea un contador que puede cambiar.', 'addEventListener("click", ...) espera a que pulses el botón.', 'estrellas = estrellas + 1 suma una estrella en cada clic.', 'textContent actualiza el número que aparece en pantalla.'],
    ['const energia = 7 guarda el valor que vamos a revisar.', 'if (energia >= 5) comprueba si la energía llega a cinco.', 'Si la condición es verdadera, muestra “¡Despegue!”.', 'else muestra el mensaje alternativo cuando la condición es falsa.'],
    ['getElementById("estrellas") encuentra la lista de la página.', 'for empieza en 1 y repite mientras numero sea menor o igual a 5.', 'createElement("li") prepara un renglón nuevo para cada estrella.', 'append agrega cada renglón a la lista para que aparezca en pantalla.'],
  ];
  const lessonKey = 'funverse-coding-lessons-v1';
  let completedLessons = 0;
  try { completedLessons = Math.min(codingLessons.length, Math.max(0, Number(localStorage.getItem(lessonKey)) || 0)); } catch {}
  let currentLessonIndex = 0;
  const lessonNumber = document.querySelector('#coding-lesson-number');
  const lessonTitle = document.querySelector('#coding-lesson-title');
  const lessonExplanation = document.querySelector('#coding-lesson-explanation');
  const lessonChallenge = document.querySelector('#coding-lesson-challenge');
  const editor = document.querySelector('#coding-editor');
  const preview = document.querySelector('#coding-preview-frame');
  const status = document.querySelector('#coding-status');
  const safePreview = () => {
    const content = editor.value.slice(0, 12_000).replace(/<script\s+src\s*=|<iframe\b|<form\b/gi, '<!-- elemento bloqueado -->');
    preview.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>body{font:16px system-ui;color:#f6f2ff;background:#11102a;padding:20px}button{padding:10px 14px;border:1px solid #56e9ff;border-radius:10px;background:#242052;color:white;cursor:pointer}li{margin:8px 0}h1{color:#79efff}</style></head><body>${content}</body></html>`;
  };
  function renderLesson() {
    currentLessonIndex = Math.min(currentLessonIndex, codingLessons.length - 1);
    const lesson = codingLessons[currentLessonIndex];
    lessonNumber.textContent = `LECCIÓN ${currentLessonIndex + 1} DE ${codingLessons.length}`;
    lessonTitle.textContent = lesson.title;
    lessonExplanation.textContent = lesson.intro;
    lessonChallenge.textContent = `Reto: ${lesson.challenge}`;
    const lessonGuide = document.querySelector('#coding-tutor-answer');
    lessonGuide.hidden = false;
    lessonGuide.textContent = `PASO A PASO\n${codingLessonGuides[currentLessonIndex].map((step, index) => `${index + 1}. ${step}`).join('\n')}`;
    editor.value = lesson.sample;
    status.textContent = currentLessonIndex < completedLessons ? 'Lección completada. Puedes volver a practicar.' : 'Prueba el ejemplo y luego completa el reto.';
    codingLessonList.replaceChildren();
    codingLessons.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'coding-lesson-button';
      button.disabled = index > completedLessons;
      button.setAttribute('aria-current', String(index === currentLessonIndex));
      button.textContent = `${index < completedLessons ? '✓' : String(index + 1).padStart(2, '0')} · ${item.title}${index > completedLessons ? ' · Bloqueada' : ''}`;
      button.addEventListener('click', () => { currentLessonIndex = index; renderLesson(); });
      codingLessonList.append(button);
    });
    document.querySelector('#coding-progress').textContent = completedLessons + '/' + codingLessons.length;
  }
  document.querySelector('#coding-run').addEventListener('click', () => { safePreview(); status.textContent = 'Vista previa actualizada en el espacio aislado.'; });
  document.querySelector('#coding-check').addEventListener('click', () => {
    const lesson = codingLessons[currentLessonIndex];
    const passed = editor.value.trim() !== lesson.sample.trim() && lesson.checks.every((token) => editor.value.includes(token)) && lesson.validate(editor.value);
    if (!passed) { status.textContent = 'No basta con pulsar el botón: completa el cambio del reto y vuelve a revisar.'; return; }
    if (currentLessonIndex === completedLessons) { completedLessons += 1; try { localStorage.setItem(lessonKey, String(completedLessons)); } catch {} }
    status.textContent = completedLessons === codingLessons.length ? '¡Terminaste las cuatro lecciones de FUN Academy! ✨' : '¡Lección completada! Ya puedes abrir la siguiente. ✨';
    renderLesson();
  });
  renderLesson();
  safePreview();
}

function videoSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function renderVideos(videos = []) {
  videoGrid.replaceChildren();
  if (!videos.length) {
    const empty = document.createElement('div');
    empty.className = 'video-empty';
    const icon = document.createElement('span');
    icon.textContent = '✦';
    const title = document.createElement('b');
    title.textContent = authState.signedIn ? 'Tu primer video empieza aquí' : 'Este espacio es tuyo';
    const note = document.createElement('p');
    note.textContent = authState.role === 'owner'
      ? 'Elige un video arriba para sumarlo a la biblioteca local.'
      : authState.signedIn ? 'La cuenta propietaria subirá videos a esta biblioteca.' : 'Inicia sesión para explorar la biblioteca local de FUNVERSE.';
    empty.append(icon, title, note);
    videoGrid.append(empty);
    return;
  }

  videos.forEach((video) => {
    const card = document.createElement('article');
    card.className = 'video-card';
    const player = document.createElement('video');
    player.controls = true;
    player.playsInline = true;
    player.preload = 'metadata';
    player.src = apiUrl(video.url);
    player.setAttribute('aria-label', video.title);
    const info = document.createElement('div');
    info.className = 'video-card-info';
    const title = document.createElement('h3');
    title.textContent = video.title;
    const detail = document.createElement('span');
    detail.textContent = `${videoSize(video.size)} · ${new Date(video.uploadedAt).toLocaleDateString('es-MX')}`;
    info.append(title, detail);
    if (authState.role === 'owner') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'video-remove';
      remove.textContent = 'Quitar video';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`¿Quitar “${video.title}” de la biblioteca?`)) return;
        try {
          await apiJson(`/api/videos/${video.id}`, { method: 'DELETE' });
          await refreshVideos();
        } catch (error) { uploadStatus.textContent = error.message; }
      });
      info.append(remove);
    }
    card.append(player, info);
    videoGrid.append(card);
  });
}

async function refreshVideos() {
  try {
    const data = await apiJson('/api/videos');
    renderVideos(data.videos);
  } catch (error) {
    const message = error instanceof TypeError
      ? 'Abre http://127.0.0.1:3000 para conectar con la biblioteca.'
      : error.message;
    const empty = document.createElement('div');
    empty.className = 'video-empty';
    const title = document.createElement('b');
    title.textContent = 'No pude conectar con los videos';
    const note = document.createElement('p');
    note.textContent = message;
    empty.append(title, note);
    videoGrid.replaceChildren(empty);
  }
}

videoInput.addEventListener('change', async () => {
  const file = videoInput.files?.[0];
  if (!file) return;
  if (file.size > 300 * 1024 * 1024) {
    uploadStatus.textContent = 'El video supera el límite de 300 MB.';
    videoInput.value = '';
    return;
  }
  uploadStatus.textContent = `Subiendo ${file.name}…`;
  videoInput.disabled = true;
  try {
    await apiJson('/api/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Video-Name': encodeURIComponent(file.name) },
      body: file,
    });
    uploadStatus.textContent = '¡Video agregado a FUNVERSE!';
    await refreshVideos();
  } catch (error) {
    uploadStatus.textContent = error instanceof TypeError
      ? 'No pude conectar con el servidor. Abre http://127.0.0.1:3000.'
      : error.message;
  } finally {
    videoInput.disabled = false;
    videoInput.value = '';
  }
});

void refreshAuth();
void refreshVideos();
void refreshWeeklyEvent();
window.setInterval(refreshWeeklyEvent, 15_000);
window.setInterval(refreshAccountProgress, 15_000);
