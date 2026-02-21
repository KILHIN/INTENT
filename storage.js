/* =========================================================
   STORAGE LAYER — V4 Secured
   ========================================================= */

const APP_CONFIG = {
  instagram: {
    id: "instagram", label: "Instagram", icon: "📸",
    thresholds: { orange: 30, red: 60 },
    shortcutName: "Mini Jarvis instagram"
  },
  x: {
    id: "x", label: "X", icon: "🐦",
    thresholds: { orange: 30, red: 60 },
    shortcutName: "Mini Jarvis X"
  },
  facebook: {
    id: "facebook", label: "Facebook", icon: "👤",
    thresholds: { orange: 30, red: 60 },
    shortcutName: "Mini Jarvis Facebook"
  },
  youtube: {
    id: "youtube", label: "YouTube", icon: "🎬",
    thresholds: { orange: 60, red: 90 },
    shortcutName: "Mini Jarvis YouTube"
  }
};

const APP_IDS = Object.keys(APP_CONFIG);

/* ---------------------------------------------------------
   STORAGE WRAPPER
   --------------------------------------------------------- */

const Storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      console.warn("Storage.get parse error:", key);
      return fallback;
    }
  },

  set(key, value) {
    try {
      const serialized = JSON.stringify(value);
      if (serialized.length > 4 * 1024 * 1024) {
        console.error("Storage.set: item trop volumineux:", key);
        return false;
      }
      localStorage.setItem(key, serialized);
      return true;
    } catch (e) {
      console.error("Storage.set failed:", key);
      return false;
    }
  },

  remove(key) { try { localStorage.removeItem(key); } catch {} },
  clearAll()  { try { localStorage.clear(); } catch {} },

  sizeKB() {
    try {
      let total = 0;
      for (const key of Object.keys(localStorage)) {
        total += (localStorage.getItem(key) || "").length;
      }
      return Math.round(total / 1024);
    } catch { return 0; }
  }
};

/* ---------------------------------------------------------
   SESSION ID — crypto sécurisé
   --------------------------------------------------------- */

function generateSessionId() {
  try {
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("") +
           "-" + Date.now().toString(36);
  } catch {
    return Math.random().toString(36).slice(2) +
           Math.random().toString(36).slice(2) +
           "-" + Date.now().toString(36);
  }
}

/* ---------------------------------------------------------
   PURGE AUTO — events > 90 jours
   --------------------------------------------------------- */

function purgeOldEvents() {
  try {
    const events = Storage.get("events", []);
    const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const before = events.length;
    const kept = events.filter(e => !e.ts || e.ts >= cutoff);
    if (kept.length < before) {
      Storage.set("events", kept);
    }
    const kb = Storage.sizeKB();
    if (kb > 3500) console.warn(`Stockage élevé: ${kb}KB`);
  } catch (e) {
    console.warn("purgeOldEvents error:", e);
  }
}

/* ---------------------------------------------------------
   META / SCHEMA
   --------------------------------------------------------- */

function getMeta()      { return Storage.get("_meta", { schemaVersion: 1 }); }
function setMeta(meta)  { Storage.set("_meta", meta); }

function ensureSchema() {
  const meta = getMeta();
  let v = meta.schemaVersion || 1;

  if (v < 2) {
    const events = Storage.get("events", []);
    let changed = false;
    for (let i = 0; i < events.length; i++) {
      if (events[i]?.mode === "allow" && events[i].minutesPlanned == null) {
        events[i] = { ...events[i], minutesPlanned: 10 };
        changed = true;
      }
    }
    if (changed) Storage.set("events", events);
    v = 2; meta.schemaVersion = 2; setMeta(meta);
  }

  if (v < 3) {
    const events = Storage.get("events", []);
    let changed = false;
    for (let i = 0; i < events.length; i++) {
      if (!events[i].app || !APP_CONFIG[events[i].app]) {
        events[i] = { ...events[i], app: "instagram" };
        changed = true;
      }
    }
    if (changed) Storage.set("events", events);
    meta.schemaVersion = 3; setMeta(meta);
  }

  purgeOldEvents();
}

window.Storage          = Storage;
window.APP_CONFIG       = APP_CONFIG;
window.APP_IDS          = APP_IDS;
window.ensureSchema     = ensureSchema;
window.generateSessionId = generateSessionId;
