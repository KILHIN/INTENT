/* =========================================================
   MAIN — V3 Multi-app orchestrator
   ========================================================= */

if (typeof ensureSchema === "function") ensureSchema();

let pendingSessionApp = null; // remplace pendingSessionType

/* ---------------------------------------------------------
   SESSION FLOW
   --------------------------------------------------------- */

function startSession(appId) {
  if (!appId || !APP_CONFIG[appId]) {
    alert("Sélectionne d'abord une app.");
    return;
  }

  const cfg = APP_CONFIG[appId];

  pendingSessionApp = appId;

  // Mettre à jour le titre du panneau intention
  const intentTitle = document.querySelector("#intentBlock h2");
  if (intentTitle) intentTitle.textContent = `Pourquoi ouvrir ${cfg.icon} ${cfg.label} ?`;

  window.UI.showIntent();
}

function cancelIntent() {
  pendingSessionApp = null;
  window.UI.showMenu();
}

function setIntentAndStart(intent) {
  if (intent === "auto") {
    alert("Intention faible détectée. Le coach peut t'aider.");
    window.UI.launchCoach(pendingSessionApp);
    return;
  }

  const appId = pendingSessionApp || "instagram";
  const cfg = APP_CONFIG[appId];
  const sid = window.Sessions.newSessionId();
  const now = Date.now();

  window.EventsStore.addEvent({
    ts: now,
    date: Engine.todayKey(),
    type: "allow",
    mode: "allow",
    app: appId,
    minutes: 0,
    minutesPlanned: cfg.thresholds.orange, // seuil orange = durée prévue par défaut
    minutesActual: null,
    intent,
    sessionId: sid,
    startedAt: now
  });

  window.Sessions.setActiveSessionId(sid);
  window.UI.renderAll();
  window.UI.showMenu();

  // Lance le raccourci iOS correspondant à l'app
  setTimeout(() => {
    window.location.href =
      "shortcuts://run-shortcut?name=" +
      encodeURIComponent(cfg.shortcutName) +
      "&input=text&text=" +
      encodeURIComponent(sid);
  }, 250);
}

/* ---------------------------------------------------------
   COACH
   --------------------------------------------------------- */

function logChoice(type) {
  window.EventsStore.addEvent({
    ts: Date.now(),
    date: Engine.todayKey(),
    type: "coach",
    mode: "coach",
    app: "system",
    minutes: 0,
    intent: null,
    choice: type
  });

  if (document.getElementById("outcomeBlock")) {
    document.getElementById("outcomeBlock").classList.remove("hidden");
    document.getElementById("coachActions").classList.add("hidden");
  } else {
    alert("Choix enregistré.");
    location.reload();
  }
}

function logOutcome(result) {
  const lastCoach = window.EventsStore.getEvents()
    .slice().reverse()
    .find(e => e.mode === "coach");

  if (!lastCoach) return;

  window.EventsStore.addEvent({
    ts: Date.now(),
    date: Engine.todayKey(),
    type: "outcome",
    mode: "outcome",
    app: "system",
    minutes: 0,
    actionKey: lastCoach.choice,
    result
  });

  alert("Enregistré !");
  location.reload();
}

/* ---------------------------------------------------------
   EXPORT / IMPORT
   --------------------------------------------------------- */

function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: Storage.get("_meta", {}).schemaVersion || 1,
    events: window.EventsStore.getEvents(),
    lastError: Storage.get("_lastError", null)
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `intent-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function resetLoop() {
  const ok = confirm("Réinitialiser les données de boucle (openPings) ?");
  if (!ok) return;
  Storage.remove("openPings");
  alert("Reset effectué.");
  location.reload();
}

/* ---------------------------------------------------------
   ERROR SHIELD
   --------------------------------------------------------- */

window.addEventListener("error", (e) => {
  try {
    Storage.set("_lastError", {
      ts: new Date().toISOString(), type: "error",
      message: e.message || "Unknown", source: e.filename || "",
      line: e.lineno || null, col: e.colno || null
    });
  } catch {}
});

window.addEventListener("unhandledrejection", (e) => {
  try {
    Storage.set("_lastError", {
      ts: new Date().toISOString(), type: "unhandledrejection",
      message: String(e.reason || "Unhandled promise rejection")
    });
  } catch {}
});

/* ---------------------------------------------------------
   GLOBAL EXPORTS
   --------------------------------------------------------- */

window.startSession = startSession;
window.cancelIntent = cancelIntent;
window.setIntentAndStart = setIntentAndStart;
window.launchCoach = (appId) => window.UI.launchCoach(appId || null);
window.logChoice = logChoice;
window.logOutcome = logOutcome;
window.exportData = exportData;
window.resetLoop = resetLoop;
window.triggerImport = window.triggerImport;

/* ---------------------------------------------------------
   INIT
   --------------------------------------------------------- */

(function init() {
  try {
    if (!window.Storage) throw new Error("Storage manquant");
    if (!window.APP_CONFIG) throw new Error("APP_CONFIG manquant (storage.js)");
    if (!window.EventsStore) throw new Error("EventsStore manquant");
    if (!window.Sessions) throw new Error("Sessions manquant");
    if (!window.Engine) throw new Error("Engine manquant");
    if (!window.UI) throw new Error("UI manquant");

    window.UI.showMenu();

    const params = new URLSearchParams(window.location.search);
    const src = params.get("src");
    if (src) Storage.set("lastSrc", { src, ts: Date.now() });

    window.Sessions.applySpentFromURL();
    window.Sessions.finalizeStaleSessionsToZero();

    window.UI.renderAll();

    setInterval(() => {
      window.Sessions.finalizeStaleSessionsToZero();
      window.UI.renderAll();
    }, 30000);

  } catch (e) {
    try { Storage.set("_lastError", { ts: new Date().toISOString(), type: "init", message: String(e) }); } catch {}
    document.body.innerHTML =
      `<div style="padding:24px;font-family:-apple-system,sans-serif;color:#fff;background:#08090c;min-height:100vh;">
        <h2 style="margin:0 0 12px;">Intent — erreur de chargement</h2>
        <p style="opacity:.7;margin:0 0 12px;">Un fichier script est manquant ou contient une erreur.</p>
        <pre style="white-space:pre-wrap;background:rgba(255,255,255,.06);padding:14px;border-radius:12px;font-size:13px;">${String(e)}</pre>
      </div>`;
  }
})();
