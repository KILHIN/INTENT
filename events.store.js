/* =========================================================
   EVENTS STORE — Single Source of Truth
   ========================================================= */

function isValidObject(v) {
  return v && typeof v === "object";
}

function normalizeEvent(e) {
  if (!isValidObject(e)) return null;

  const ts = Number.isFinite(e.ts) ? e.ts : Date.now();

  return {
    id: e.id || (e.sessionId ? e.sessionId : Math.random().toString(36).slice(2)),
    sessionId: typeof e.sessionId === "string" ? e.sessionId : null,

    type: e.type || e.mode || "unknown",
    mode: e.mode || e.type || "unknown",

    app: e.app || "instagram",

    ts,
    date: typeof e.date === "string" ? e.date : new Date(ts).toDateString(),

    startedAt: Number.isFinite(e.startedAt) ? e.startedAt : null,
    endedAt: Number.isFinite(e.endedAt) ? e.endedAt : null,

    minutesPlanned: Number.isFinite(e.minutesPlanned) ? e.minutesPlanned : 10,
    minutesActual: Number.isFinite(e.minutesActual) ? e.minutesActual : null,
    minutes: Number.isFinite(e.minutes) ? e.minutes : 0,

    intent: typeof e.intent === "string" ? e.intent : null,
    cancelled: !!e.cancelled,
    finalized: !!e.finalized,
    staleFinalized: !!e.staleFinalized,

    // coach fields
    choice: e.choice || null,
    actionKey: e.actionKey || null,
    result: e.result || null
  };
}

function sanitizeEvents(events) {
  if (!Array.isArray(events)) return [];

  const seenSessionIds = new Set();
  const cleaned = [];

  for (const raw of events) {
    const e = normalizeEvent(raw);
    if (!e) continue;

    if (e.sessionId) {
      if (seenSessionIds.has(e.sessionId)) continue;
      seenSessionIds.add(e.sessionId);
    }

    cleaned.push(e);
  }

  return cleaned;
}

function getEvents() {
  const raw = Storage.get("events", []);
  const clean = sanitizeEvents(raw);

  if (raw.length !== clean.length) {
    Storage.set("events", clean);
  }

  return clean;
}

function setEvents(events) {
  const clean = sanitizeEvents(events);
  Storage.set("events", clean);
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
  if (!sessionId) return -1;
  const events = getEvents();
  return events.findIndex(e => e.sessionId === sessionId);
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
  getEvents,
  setEvents,
  addEvent,
  findEventIndexBySessionId,
  getTodayEvents,
  getTotalMinutesToday,
  getEventsByType
};
