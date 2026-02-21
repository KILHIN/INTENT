/* =========================================================
   STORAGE LAYER — V3 Multi-app
   ========================================================= */

/* ---------------------------------------------------------
   APP CONFIG — source de vérité pour toutes les apps
   --------------------------------------------------------- */

const APP_CONFIG = {
  instagram: {
    id: "instagram",
    label: "Instagram",
    icon: "📸",
    thresholds: { orange: 30, red: 60 },
    shortcutName: "Mini Jarvis GO"
  },
  x: {
    id: "x",
    label: "X",
    icon: "🐦",
    thresholds: { orange: 30, red: 60 },
    shortcutName: "Mini Jarvis GO X"
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    icon: "👤",
    thresholds: { orange: 30, red: 60 },
    shortcutName: "Mini Jarvis GO Facebook"
  },
  youtube: {
    id: "youtube",
    label: "YouTube",
    icon: "🎬",
    thresholds: { orange: 60, red: 90 },
    shortcutName: "Mini Jarvis GO YouTube"
  }
};

const APP_IDS = Object.keys(APP_CONFIG);

/* ---------------------------------------------------------
   CORE STORAGE WRAPPER
   --------------------------------------------------------- */

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

/* ---------------------------------------------------------
   META / SCHEMA
   --------------------------------------------------------- */

function getMeta() {
  return Storage.get("_meta", { schemaVersion: 1 });
}

function setMeta(meta) {
  Storage.set("_meta", meta);
}

function ensureSchema() {
  const meta = getMeta();
  let currentVersion = meta.schemaVersion || 1;

  if (currentVersion < 2) {
    const events = Storage.get("events", []);
    let changed = false;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e?.mode === "allow" && e.minutesPlanned == null) {
        events[i] = { ...e, minutesPlanned: 10 };
        changed = true;
      }
    }
    if (changed) Storage.set("events", events);
    currentVersion = 2;
    meta.schemaVersion = 2;
    setMeta(meta);
  }

  // v2 → v3 : normalise le champ app sur les anciens events
  if (currentVersion < 3) {
    const events = Storage.get("events", []);
    let changed = false;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e.app || !APP_CONFIG[e.app]) {
        events[i] = { ...e, app: "instagram" };
        changed = true;
      }
    }
    if (changed) Storage.set("events", events);
    meta.schemaVersion = 3;
    setMeta(meta);
  }
}

/* ---------------------------------------------------------
   EXPORTS
   --------------------------------------------------------- */

window.Storage = Storage;
window.APP_CONFIG = APP_CONFIG;
window.APP_IDS = APP_IDS;
window.ensureSchema = ensureSchema;
