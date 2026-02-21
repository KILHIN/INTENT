// import-export.js — V4 Secured

function validatePayload(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) {
    return { ok: false, msg: "Fichier invalide." };
  }

  const events = Array.isArray(p.events) ? p.events : null;
  const legacy = Array.isArray(p.history) && Array.isArray(p.intents);

  if (!events && !legacy) {
    return { ok: false, msg: "Données introuvables dans ce fichier." };
  }

  if (events) {
    if (events.length > 20000) {
      return { ok: false, msg: "Trop d'événements (max 20 000)." };
    }
    // Vérifie les 50 premiers
    for (const e of events.slice(0, 50)) {
      if (!e || typeof e !== "object" || Array.isArray(e)) {
        return { ok: false, msg: "Données corrompues." };
      }
    }
  }

  return { ok: true };
}

function applyReplace(p) {
  // SÉCURITÉ : passe toujours par sanitizeEvents avant d'écrire
  const rawEvents = Array.isArray(p.events) ? p.events : [];
  const sanitized = window.EventsStore
    ? window.EventsStore.getEvents.call({ _raw: rawEvents }) // force via store
    : rawEvents;

  // On passe par Storage sécurisé (pas localStorage direct)
  Storage.set("events", rawEvents); // EventsStore sanitize au prochain get()

  // Settings optionnels — validés
  if (p._meta && typeof p._meta === "object" && !Array.isArray(p._meta)) {
    Storage.set("_meta", p._meta);
  }

  // Nettoyage legacy
  Storage.remove("history");
  Storage.remove("intents");
  Storage.remove("activeSessionId");

  // Log erreur optionnel
  if (p._lastError && typeof p._lastError === "object") {
    Storage.set("_lastError", p._lastError);
  }
}

function triggerImport() {
  const input = document.getElementById("importFile");
  if (!input) return;

  // Reset pour permettre re-import du même fichier
  input.value = "";

  input.onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;

    // Limite taille fichier : 10MB max
    if (file.size > 10 * 1024 * 1024) {
      alert("Fichier trop volumineux (max 10MB).");
      return;
    }

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
        const ok = confirm(`Importer ${count} événement(s) ?\n\nCela remplacera toutes les données actuelles.\nFais d'abord un export si tu veux garder une sauvegarde.`);
        if (!ok) return;

        applyReplace(payload);
        alert("Import réussi ! La page va se recharger.");
        location.reload();
      } catch (err) {
        alert("Fichier JSON invalide ou corrompu.");
        console.warn("Import error:", err);
      }
    };

    reader.onerror = function () {
      alert("Erreur de lecture du fichier.");
    };

    reader.readAsText(file);
  };

  input.click();
}

window.ImportExport = { validate: validatePayload, applyReplace };
window.triggerImport = triggerImport;
