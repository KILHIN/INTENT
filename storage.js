/* =========================================================
   STORAGE LAYER — Single Source of Truth
   ========================================================= */

const Storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Storage.get parse error:", key);
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("Storage.set failed:", key);
      alert("Stockage saturé ou erreur locale.");
    }
  },

  remove(key) {
    try { localStorage.removeItem(key); } catch {}
  },

  clearAll() {
    try { localStorage.clear(); } catch {}
  }
};

function getMeta() {
  return Storage.get("_meta", { schemaVersion: 1 });
}

function setMeta(meta) {
  Storage.set("_meta", meta);
}

function ensureSchema() {
  const meta = getMeta();
  const currentVersion = meta.schemaVersion || 1;

  if (currentVersion < 2) {
    const events = Storage.get("events", []);
    let changed = false;

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e?.mode === "allow") {
        if (e.minutesPlanned == null) {
          events[i] = { ...e, minutesPlanned: 10 };
          changed = true;
        }
      }
    }

    if (changed) Storage.set("events", events);
    meta.schemaVersion = 2;
    setMeta(meta);
  }
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function debugDump() {
  return {
    meta: Storage.get("_meta", null),
    events: Storage.get("events", []),
    activeSessionId: Storage.get("activeSessionId", null),
    lastError: Storage.get("_lastError", null)
  };
}

window.Storage = Storage;
window.ensureSchema = ensureSchema;
