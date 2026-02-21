/* =========================================================
   MAIN — Application Orchestrator
   ========================================================= */

if (typeof ensureSchema === "function") ensureSchema();

let pendingSessionType = null;

/* =========================================================
   SESSION FLOW
   ========================================================= */

function startSession(type) {
  pendingSessionType = type;
  window.UI.showIntent();
}

function cancelIntent() {
  pendingSessionType = null;
  window.UI.showMenu();
}

function setIntentAndStart(intent) {
  if (intent === "auto") {
    alert("Intention faible détectée. Le coach peut t'aider.");
    window.UI.launchCoach();
    return;
  }

  const sid = window.Sessions.newSessionId();
  const now = Date.now();

  window.EventsStore.addEvent({
    ts: now,
    date: Engine.todayKey(),
    type: "allow",
    mode: "allow",
    app: pendingSessionType || "instagram",
    minutes: 0,
    minutesPlanned: 10,
    minutesActual: null,
    intent,
    sessionId: sid,
    startedAt: now
  });

  window.Sessions.setActiveSessionId(sid);
  window.UI.renderAll();
  window.UI.showMenu();

  setTimeout(() => {
    window.location.href =
      "shortcuts://run-shortcut?name=" +
      encodeURIComponent("Mini Jarvis GO") +
      "&input=text&text=" +
      encodeURIComponent(sid);
  }, 250);
}

/* =========================================================
   COACH
   ========================================================= */

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

  // Show outcome block instead of reloading
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

/* =========================================================
   DATA EXPORT / IMPORT
   ========================================================= */

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

// FIX: resetLoop now always works (DEV_MODE removed)
function resetLoop() {
  const ok = confirm("Reset les données de boucle (openPings) ?");
  if (!ok) return;
  Storage.remove("openPings");
  alert("Reset effectué.");
  location.reload();
}

/* =========================================================
   ERROR SHIELD
   ========================================================= */

window.addEventListener("error", (e) => {
  try {
    Storage.set("_lastError", {
      ts: new Date().toISOString(),
      type: "error",
      message: e.message || "Unknown error",
      source: e.filename || "",
      line: e.lineno || null,
      col: e.colno || null
    });
  } catch {}
});

window.addEventListener("unhandledrejection", (e) => {
  try {
    Storage.set("_lastError", {
      ts: new Date().toISOString(),
      type: "unhandledrejection",
      message: String(e.reason || "Unhandled promise rejection")
    });
  } catch {}
});

/* =========================================================
   GLOBAL EXPORTS (HTML onclick)
   ========================================================= */

window.startSession = startSession;
window.cancelIntent = cancelIntent;
window.setIntentAndStart = setIntentAndStart;
window.launchCoach = () => window.UI.launchCoach();
window.logChoice = logChoice;
window.logOutcome = logOutcome;
window.exportData = exportData;
window.resetLoop = resetLoop;
window.triggerImport = window.triggerImport; // defined in import-export.js

/* =========================================================
   INIT
   ========================================================= */

(function init() {
  try {
    if (!window.Storage) throw new Error("Storage manquant");
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
      `<div style="padding:24px;font-family:-apple-system,sans-serif;color:#fff;background:#0e1117;min-height:100vh;">
        <h2 style="margin:0 0 12px;font-size:20px;">Intent — erreur de chargement</h2>
        <p style="opacity:.7;margin:0 0 12px;">Un fichier script est manquant ou contient une erreur.</p>
        <pre style="white-space:pre-wrap;background:rgba(255,255,255,.06);padding:14px;border-radius:12px;font-size:13px;border:1px solid rgba(255,255,255,.08);">${String(e)}</pre>
        <p style="opacity:.55;margin-top:12px;font-size:13px;">Vérifie que tous les fichiers .js sont bien présents et que les noms correspondent exactement.</p>
      </div>`;
  }
})();
