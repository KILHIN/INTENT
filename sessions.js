// sessions.js
const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 min auto-finalize

function newSessionId() {
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

function getActiveSessionId() {
  return Storage.get("activeSessionId", null);
}

function clearActiveSessionId() {
  Storage.remove("activeSessionId");
}

function setActiveSessionId(sid) {
  const current = getActiveSessionId();
  if (current && current !== sid) {
    const events = window.EventsStore.getEvents();
    const idx = events.findIndex(e => e.sessionId === current);

    if (
      idx !== -1 &&
      events[idx]?.mode === "allow" &&
      events[idx]?.minutesActual == null &&
      !events[idx]?.cancelled
    ) {
      events[idx] = {
        ...events[idx],
        endedAt: Date.now(),
        minutesActual: 0,
        minutes: 0,
        staleFinalized: true
      };
      window.EventsStore.setEvents(events);
    }
  }

  Storage.set("activeSessionId", sid);
}

function getActiveSession(events) {
  const now = Date.now();
  const maxAgeMs = 3 * 60 * 60 * 1000;
  const activeId = getActiveSessionId();

  if (activeId) {
    const e = events.find(x => x.sessionId === activeId);
    if (
      e &&
      e.mode === "allow" &&
      e.minutesActual == null &&
      !e.cancelled &&
      e.startedAt &&
      (now - e.startedAt) <= maxAgeMs
    ) {
      return e;
    }
  }

  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (
      e?.mode === "allow" &&
      e.minutesActual == null &&
      !e.cancelled &&
      e.startedAt &&
      (now - e.startedAt) <= maxAgeMs
    ) {
      return e;
    }
  }
  return null;
}

function stopActiveSession() {
  const events = window.EventsStore.getEvents();
  const active = getActiveSession(events);

  if (!active) {
    alert("Aucune session active à arrêter.");
    return;
  }

  const ok = confirm("Arrêter la session en cours ? (Elle comptera 0 min)");
  if (!ok) return;

  const idx = events.findIndex(e => e.sessionId === active.sessionId);
  if (idx === -1) return;

  events[idx] = {
    ...events[idx],
    cancelled: true,
    endedAt: Date.now(),
    minutesActual: 0,
    minutes: 0,
    finalized: true
  };

  window.EventsStore.setEvents(events);
  clearActiveSessionId();
}

function applySpentFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("sid");
    const spentRaw = params.get("spent");

    if (!sid || spentRaw === null) return;

    const spent = Number.parseInt(spentRaw, 10);

    const cleanURL = () => {
      params.delete("sid");
      params.delete("spent");
      const clean = params.toString();
      const newUrl = window.location.pathname + (clean ? `?${clean}` : "");
      window.history.replaceState({}, "", newUrl);
    };

    if (!Number.isFinite(spent) || spent < 0 || spent > 240) {
      alert("DEBUG — spent invalide: " + spentRaw + " (parsé: " + spent + ")");
      cleanURL();
      return;
    }

    const events = window.EventsStore.getEvents();
    const idx = events.findIndex(e => e.sessionId === sid);

    if (idx === -1) {
      const sids = events.map(e => e.sessionId).filter(Boolean).slice(-3);
      alert("DEBUG — sid introuvable.\nSid reçu: " + sid + "\nDerniers sids connus: " + (sids.join(", ") || "aucun"));
      cleanURL();
      return;
    }

    const event = events[idx];

    if (event.cancelled || event.minutesActual != null || event.finalized) {
      alert("DEBUG — session déjà finalisée.\nfinalized=" + event.finalized + " cancelled=" + event.cancelled + " minutesActual=" + event.minutesActual);
      cleanURL();
      return;
    }

    events[idx] = {
      ...event,
      minutesActual: spent,
      minutes: spent,
      endedAt: Date.now(),
      finalized: true
    };

    window.EventsStore.setEvents(events);

    const activeId = getActiveSessionId();
    if (activeId === sid) clearActiveSessionId();

    cleanURL();

  } catch (e) {
    alert("ERREUR applySpentFromURL: " + String(e));
    console.warn("applySpentFromURL error:", e);
  }
}

function finalizeStaleSessionsToZero() {
  const now = Date.now();
  const events = window.EventsStore.getEvents();
  let changed = false;

  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.mode !== "allow") continue;
    if (e.cancelled) continue;
    if (e.minutesActual != null || e.finalized) continue;
    if (!e.startedAt) continue;

    const age = now - e.startedAt;
    if (age >= SESSION_MAX_AGE_MS) {
      events[i] = {
        ...e,
        endedAt: now,
        minutesActual: 0,
        minutes: 0,
        staleFinalized: true,
        finalized: true
      };
      changed = true;

      const activeId = getActiveSessionId();
      if (activeId && activeId === e.sessionId) clearActiveSessionId();
    }
  }

  if (changed) window.EventsStore.setEvents(events);
}

function formatHHMM(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

window.Sessions = {
  newSessionId,
  setActiveSessionId,
  getActiveSessionId,
  clearActiveSessionId,
  getActiveSession,
  stopActiveSession,
  applySpentFromURL,
  finalizeStaleSessionsToZero,
  formatHHMM
};
