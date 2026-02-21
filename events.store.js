/* =========================================================
   EVENTS STORE — V4 Secured
   ========================================================= */

const VALID_MODES   = new Set(["allow", "coach", "outcome", "unknown"]);
const VALID_INTENTS = new Set(["reply", "fun", "auto"]);

function isValidObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function normalizeEvent(e) {
  if (!isValidObject(e)) return null;

  const ts = Number.isFinite(e.ts) ? e.ts : Date.now();

  // Valide que l'app est connue
  const app = (typeof e.app === "string" && APP_IDS.includes(e.app))
    ? e.app
    : "instagram";

  // Valide le mode
  const rawMode = e.mode || e.type || "unknown";
  const mode = VALID_MODES.has(rawMode) ? rawMode : "unknown";

  // Valide l'intent
  const rawIntent = typeof e.intent === "string" ? e.intent : null;
  const intent = rawIntent && VALID_INTENTS.has(rawIntent) ? rawIntent : null;

  // Valide les minutes — jamais négatif, jamais > 480 (8h)
  // IMPORTANT: null/undefined doit rester null (pas converti en 0 via Number())
  const clampMin = (v, max = 480) => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
  };

  return {
    id: typeof e.id === "string" ? e.id.slice(0, 64) : generateSessionId(),
    sessionId: typeof e.sessionId === "string" ? e.sessionId.slice(0, 64) : null,

    type: mode,
    mode,
    app,

    ts,
    date: typeof e.date === "string" ? e.date.slice(0, 40) : new Date(ts).toDateString(),

    startedAt: Number.isFinite(e.startedAt) ? e.startedAt : null,
    endedAt:   Number.isFinite(e.endedAt)   ? e.endedAt   : null,

    minutesPlanned: clampMin(e.minutesPlanned) ?? 10,
    minutesActual:  clampMin(e.minutesActual)  ?? null,
    minutes:        clampMin(e.minutes)        ?? 0,

    intent,
    cancelled:      !!e.cancelled,
    finalized:      !!e.finalized,
    staleFinalized: !!e.staleFinalized,

    // coach fields — sanitisés
    choice:    typeof e.choice    === "string" ? e.choice.slice(0, 32)    : null,
    actionKey: typeof e.actionKey === "string" ? e.actionKey.slice(0, 32) : null,
    result:    typeof e.result    === "string" ? e.result.slice(0, 32)    : null
  };
}

function sanitizeEvents(events) {
  if (!Array.isArray(events)) return [];

  // Limite stricte : jamais plus de 10 000 events en mémoire
  const MAX_EVENTS = 10000;
  const seenIds = new Set();
  const cleaned = [];

  for (const raw of events) {
    if (cleaned.length >= MAX_EVENTS) break;

    const e = normalizeEvent(raw);
    if (!e) continue;

    // Déduplique par sessionId
    if (e.sessionId) {
      if (seenIds.has(e.sessionId)) continue;
      seenIds.add(e.sessionId);
    }

    cleaned.push(e);
  }

  return cleaned;
}

function getEvents() {
  const raw = Storage.get("events", []);
  const clean = sanitizeEvents(raw);
  if (raw.length !== clean.length) Storage.set("events", clean);
  return clean;
}

function setEvents(events) {
  const clean = sanitizeEvents(events);
  const ok = Storage.set("events", clean);
  if (!ok) console.error("setEvents: échec de sauvegarde");
}

function addEvent(evt) {
  const events = getEvents();
  const normalized = normalizeEvent(evt);
  if (!normalized) return null;
  events.push(normalized);
  setEvents(events);
  return normalized;
}

function findEventIndexBySessionId(sessionId) {
  if (typeof sessionId !== "string" || !sessionId) return -1;
  return getEvents().findIndex(e => e.sessionId === sessionId);
}

function getTodayEvents() {
  const today = new Date().toDateString();
  return getEvents().filter(e => e.date === today);
}

function getTotalMinutesToday() {
  return getTodayEvents().reduce((sum, e) => sum + (e.minutes || 0), 0);
}

function getEventsByType(type) {
  return getEvents().filter(e => e.type === type);
}

window.EventsStore = {
  getEvents, setEvents, addEvent,
  findEventIndexBySessionId,
  getTodayEvents, getTotalMinutesToday, getEventsByType
};
