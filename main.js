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

  // Finalise automatiquement toute session encore ouverte
  const existingId = window.Sessions.getActiveSessionId();
  if (existingId) {
    const allEvents = window.EventsStore.getEvents();
    const idx = allEvents.findIndex(e => e.sessionId === existingId);
    if (idx !== -1 && !allEvents[idx].finalized && !allEvents[idx].cancelled) {
      const now0 = Date.now();
      const spent = Math.round((now0 - (allEvents[idx].startedAt || now0)) / 60000);
      allEvents[idx] = {
        ...allEvents[idx],
        endedAt: now0,
        minutesActual: spent,
        minutes: spent,
        finalized: true,
        staleFinalized: true
      };
      window.EventsStore.setEvents(allEvents);
    }
    window.Sessions.clearActiveSessionId();
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
    minutesPlanned: cfg.thresholds.orange,
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

function resetToday() {
  const today = new Date().toDateString();
  const ok = confirm("Effacer toutes les sessions d'aujourd'hui ?\nCette action est irréversible.");
  if (!ok) return;

  const events = window.EventsStore.getEvents();
  const kept = events.filter(e => e.date !== today);
  window.EventsStore.setEvents(kept);
  window.Sessions.clearActiveSessionId();
  window.UI.renderAll();
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
window.resetToday = resetToday;

/* ---------------------------------------------------------
   OUTILS DEV
   --------------------------------------------------------- */

function purgeOrphans() {
  const activeId = window.Sessions.getActiveSessionId();
  const events = window.EventsStore.getEvents();
  const before = events.length;

  const kept = events.filter(e => {
    if (e.mode !== "allow") return true;
    if (e.finalized || e.cancelled) return true;
    if (e.minutesActual != null) return true;
    // Garde la session active
    if (e.sessionId && e.sessionId === activeId) return true;
    // Supprime les orphelines
    return false;
  });

  const removed = before - kept.length;
  window.EventsStore.setEvents(kept);
  window.UI.renderAll();
  alert(`${removed} session(s) orpheline(s) supprimée(s).`);
}

function debugState() {
  const events = window.EventsStore.getEvents();
  const today = new Date().toDateString();
  const todayEvents = events.filter(e => e.date === today);
  const activeId = window.Sessions.getActiveSessionId();
  const activeSession = window.Sessions.getActiveSession(events);
  const meta = Storage.get("_meta", {});
  const kb = Storage.sizeKB();

  const orphans = events.filter(e =>
    e.mode === "allow" && !e.finalized && !e.cancelled &&
    e.minutesActual == null && e.sessionId !== activeId
  ).length;

  const info = {
    "📅 Date": today,
    "📦 localStorage": kb + " KB",
    "🗂 Schema version": meta.schemaVersion ?? "?",
    "📊 Total events": events.length,
    "📅 Events aujourd'hui": todayEvents.length,
    "🔑 Active session ID": activeId ?? "aucune",
    "⚡ Session active": activeSession
      ? `${activeSession.app} · ${activeSession.intent} · démarrée ${new Date(activeSession.startedAt).toLocaleTimeString("fr-FR")}`
      : "aucune",
    "👻 Orphelines": orphans,
    "🕐 Dernière session": (() => {
      const last = [...events]
        .filter(e => e.mode === "allow" && e.finalized)
        .sort((a, b) => b.startedAt - a.startedAt)[0];
      return last
        ? `${last.app} · ${last.minutes}min · ${new Date(last.startedAt).toLocaleTimeString("fr-FR")} · sid: ${last.sessionId?.slice(0,12)}…`
        : "aucune";
    })()
  };

  const output = Object.entries(info)
    .map(([k, v]) => `${k}
  ${v}`)
    .join("

");

  const el = document.getElementById("debugOutput");
  const modal = document.getElementById("debugModal");
  if (el) el.textContent = output;
  if (modal) modal.classList.remove("hidden");
}

function closeDebugModal() {
  const modal = document.getElementById("debugModal");
  if (modal) modal.classList.add("hidden");
}

function copyLogs() {
  const events = window.EventsStore.getEvents();
  const today = new Date().toDateString();
  const activeId = window.Sessions.getActiveSessionId();
  const meta = Storage.get("_meta", {});

  const lines = [
    `=== Intent Debug Log — ${new Date().toLocaleString("fr-FR")} ===`,
    `Schema: v${meta.schemaVersion ?? "?"} | Storage: ${Storage.sizeKB()}KB | Events: ${events.length}`,
    `Active session ID: ${activeId ?? "aucune"}`,
    ``,
    `=== Sessions du jour (${today}) ===`,
    ...events
      .filter(e => e.date === today && e.mode === "allow")
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(e =>
        `[${e.finalized ? "✓" : e.cancelled ? "✗" : "⏳"}] ${e.app} | ${e.intent ?? "?"} | ${e.minutes ?? 0}min | ${e.startedAt ? new Date(e.startedAt).toLocaleTimeString("fr-FR") : "?"} | sid: ${e.sessionId?.slice(0,12)}…`
      ),
    ``,
    `=== 10 derniers events ===`,
    ...events.slice(-10).reverse().map(e =>
      `${e.mode} | ${e.app ?? "?"} | ${e.date} | finalized:${e.finalized} | cancelled:${e.cancelled}`
    )
  ].join("
");

  navigator.clipboard.writeText(lines)
    .then(() => alert("Logs copiés dans le presse-papier ✓"))
    .catch(() => {
      // Fallback si clipboard API indisponible
      const ta = document.createElement("textarea");
      ta.value = lines;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      alert("Logs copiés ✓");
    });
}

function resetAll() {
  const ok = confirm(
    "⚠️ RESET COMPLET\n\n" +
    "Toutes les données seront effacées :\n" +
    "• Sessions et historique\n" +
    "• Paramètres et schéma\n\n" +
    "Cette action est irréversible.\nContinuer ?"
  );
  if (!ok) return;

  Storage.clearAll();
  location.reload();
}

function clearCache() {
  const ok = confirm("Vider le cache et recharger la page ?");
  if (!ok) return;
  if ("caches" in window) {
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => location.reload(true));
  } else {
    location.reload(true);
  }
}

function bindToolButtons() {
  const map = {
    "btnResetToday":   resetToday,
    "btnPurgeOrphans": purgeOrphans,
    "btnDebugState":   debugState,
    "btnCopyLogs":     copyLogs,
    "btnResetAll":     resetAll,
    "btnClearCache":   clearCache,
    "btnCloseDebug":   closeDebugModal,
    "btnCloseDebug2":  closeDebugModal,
  };
  for (const [id, fn] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  }
}

window.purgeOrphans    = purgeOrphans;
window.debugState      = debugState;
window.closeDebugModal = closeDebugModal;
window.copyLogs        = copyLogs;
window.resetAll        = resetAll;
window.clearCache      = clearCache;
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
    bindToolButtons();

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
