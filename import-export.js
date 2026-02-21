// import-export.js

function validatePayload(p) {
  if (!p || typeof p !== "object") return { ok: false, msg: "Fichier invalide." };

  const events = Array.isArray(p.events) ? p.events : null;
  const legacy = Array.isArray(p.history) && Array.isArray(p.intents);

  if (!events && !legacy) return { ok: false, msg: "Données manquantes (events introuvables)." };

  if (events) {
    if (events.length > 20000) return { ok: false, msg: "Trop d'événements (fichier suspect)." };
    for (const e of events.slice(0, 50)) {
      if (!e || typeof e !== "object") return { ok: false, msg: "Données corrompues." };
    }
  }

  return { ok: true };
}

function applyReplace(p) {
  if (Array.isArray(p.events)) localStorage.setItem("events", JSON.stringify(p.events));
  else localStorage.setItem("events", JSON.stringify([]));

  if (p._meta) localStorage.setItem("_meta", JSON.stringify(p._meta));
  if (p.lastSrc) localStorage.setItem("lastSrc", JSON.stringify(p.lastSrc));

  localStorage.removeItem("history");
  localStorage.removeItem("intents");
  localStorage.removeItem("activeSessionId");

  if (p._lastError) localStorage.setItem("_lastError", JSON.stringify(p._lastError));
}

// FIX: cette fonction manquait — elle était appelée dans le HTML mais jamais définie
function triggerImport() {
  const input = document.getElementById("importFile");
  if (!input) return;

  input.onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const payload = JSON.parse(ev.target.result);
        const validation = validatePayload(payload);

        if (!validation.ok) {
          alert("Import échoué : " + validation.msg);
          return;
        }

        const count = Array.isArray(payload.events) ? payload.events.length : 0;
        const ok = confirm(`Importer ${count} événement(s) ? Cela remplacera les données actuelles.`);
        if (!ok) return;

        applyReplace(payload);
        alert("Import réussi !");
        location.reload();
      } catch (err) {
        alert("Fichier JSON invalide.");
        console.warn(err);
      }
    };
    reader.readAsText(file);
  };

  input.click();
}

window.ImportExport = {
  validate: validatePayload,
  applyReplace
};

window.triggerImport = triggerImport;
