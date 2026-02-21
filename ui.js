/* =========================================================
   UI LAYER — V3 Multi-app
   ========================================================= */

/* ---------------------------------------------------------
   0) STATE
   --------------------------------------------------------- */

// App sélectionnée pour la prochaine session (null = vue globale)
let _selectedApp = null;
window._selectedApp = null; // exposé pour main.js

/* ---------------------------------------------------------
   1) DOM HELPERS
   --------------------------------------------------------- */

function $(id) { return document.getElementById(id); }
function has(id) { return !!document.getElementById(id); }

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getEventsSafe() {
  try { return window.EventsStore?.getEvents?.() ?? []; } catch { return []; }
}

function getOpenPingsSafe() {
  try { return window.Storage?.get ? Storage.get("openPings", []) : []; } catch { return []; }
}

/* ---------------------------------------------------------
   2) PANELS
   --------------------------------------------------------- */

function hideAllPanels() {
  ["menu", "intentBlock", "timer", "coach"].forEach(id => has(id) && $(id).classList.add("hidden"));
}

function showMenu()   { hideAllPanels(); has("menu")        && $("menu").classList.remove("hidden"); }
function showIntent() { hideAllPanels(); has("intentBlock") && $("intentBlock").classList.remove("hidden"); }
function showTimer()  { hideAllPanels(); has("timer")       && $("timer").classList.remove("hidden"); }
function showCoach()  { hideAllPanels(); has("coach")       && $("coach").classList.remove("hidden"); }

/* ---------------------------------------------------------
   3) SESSION BANNER
   --------------------------------------------------------- */

function ensureSessionBanner() {
  const hero = document.querySelector(".hero");
  if (!hero) return null;

  let el = document.getElementById("sessionBanner");
  if (el) return el;

  el = document.createElement("div");
  el.id = "sessionBanner";
  el.className = "sessionBanner hidden";
  el.innerHTML = `
    <div class="sessionBannerRow">
      <div>
        <div class="sessionBannerTitle">Session en cours</div>
        <div id="sessionBannerText" class="sessionBannerText"></div>
      </div>
      <button id="btnStopSession" class="btnStop">STOP</button>
    </div>
  `;
  hero.appendChild(el);

  document.getElementById("btnStopSession")?.addEventListener("click", () => {
    try {
      window.Sessions?.stopActiveSession?.();
      renderAll();
    } catch (e) {
      alert("Impossible de stopper la session.");
    }
  });

  return el;
}

function renderSessionBanner() {
  const banner = ensureSessionBanner();
  if (!banner) return;

  const events = getEventsSafe();
  const active = window.Sessions?.getActiveSession?.(events) ?? null;

  if (!active) { banner.classList.add("hidden"); return; }

  const appCfg = APP_CONFIG[active.app] || APP_CONFIG.instagram;
  const planned = active.minutesPlanned ?? 10;
  const start = active.startedAt && window.Sessions?.formatHHMM
    ? window.Sessions.formatHHMM(active.startedAt)
    : "—";

  if (has("sessionBannerText")) {
    $("sessionBannerText").textContent =
      `${appCfg.icon} ${appCfg.label} · Début : ${start} · Plan : ${planned} min`;
  }
  banner.classList.remove("hidden");
}

/* ---------------------------------------------------------
   4) HERO — global scroll time + state
   --------------------------------------------------------- */

function renderHero() {
  if (!window.Engine) return;

  const events = getEventsSafe();

  // Global total (toutes apps)
  const totalGlobal = Engine.totalTodayAllApps(events);
  const byApp = Engine.totalTodayByApp(events);
  const globalState = Engine.globalState(events);

  if (has("todayMinutes")) $("todayMinutes").innerText = totalGlobal;

  const stateLabels = { GREEN: "En contrôle", ORANGE: "Attention", RED: "Zone rouge" };
  if (has("stateLabel")) $("stateLabel").innerText = stateLabels[globalState] ?? globalState;

  if (has("stateDot")) {
    $("stateDot").className = "stateDot " + globalState.toLowerCase();
  }

  // KPIs globaux
  const globalTrend = Engine.trendPrediction(events, 30, 90); // seuils globaux raisonnables
  if (has("kpiTrend")) {
    const arrow = globalTrend.trendText.includes("augmentation") ? "↑" :
      globalTrend.trendText.includes("baisse") ? "↓" : "→";
    $("kpiTrend").innerText = arrow;
    $("kpiTrend").className = "kpiValue " +
      (globalTrend.trendText.includes("augmentation") ? "kpi-red" :
       globalTrend.trendText.includes("baisse") ? "kpi-green" : "");
  }

  const pressure = Engine.jarvisPressure(events);
  if (has("kpiPressure")) {
    $("kpiPressure").innerText = `${pressure}/3`;
    $("kpiPressure").className = "kpiValue " + (pressure >= 2 ? "kpi-red" : pressure === 1 ? "kpi-orange" : "");
  }

  const intents7 = Engine.intentStats7d(events);
  if (has("kpiAuto")) {
    $("kpiAuto").innerText = intents7.total ? `${intents7.pAuto}%` : "—";
    $("kpiAuto").className = "kpiValue " +
      (intents7.pAuto >= 50 ? "kpi-red" : intents7.pAuto >= 30 ? "kpi-orange" : "");
  }

  // Mini breakdown par app dans le hero
  renderAppBreakdown(byApp);
}

function renderAppBreakdown(byApp) {
  const el = $("appBreakdown");
  if (!el) return;

  const items = APP_IDS
    .filter(id => byApp[id] > 0)
    .map(id => {
      const cfg = APP_CONFIG[id];
      const mins = byApp[id];
      const thresh = cfg.thresholds;
      const cls = mins >= thresh.red ? "ab-red" : mins >= thresh.orange ? "ab-orange" : "ab-green";
      return `<span class="appBreakdownItem ${cls}">${cfg.icon} ${mins}m</span>`;
    });

  el.innerHTML = items.length
    ? items.join("")
    : `<span class="appBreakdownEmpty">Aucune session aujourd'hui</span>`;
}

/* ---------------------------------------------------------
   5) APP SELECTOR (dans le panneau Contrôle)
   --------------------------------------------------------- */

function renderAppSelector() {
  const container = $("appSelector");
  if (!container) return;

  const events = getEventsSafe();
  const byApp = Engine.totalTodayByApp(events);

  container.innerHTML = APP_IDS.map(appId => {
    const cfg = APP_CONFIG[appId];
    const mins = byApp[appId] || 0;
    const thresh = cfg.thresholds;
    const stateClass = mins >= thresh.red ? "sel-red" : mins >= thresh.orange ? "sel-orange" : "sel-green";
    const isActive = _selectedApp === appId;

    return `
      <button
        class="appSelectorBtn ${stateClass} ${isActive ? "appSelectorBtn--active" : ""}"
        onclick="selectApp('${appId}')"
        aria-pressed="${isActive}"
      >
        <span class="appSelIcon">${cfg.icon}</span>
        <span class="appSelLabel">${cfg.label}</span>
        <span class="appSelMins">${mins > 0 ? mins + "m" : "—"}</span>
      </button>
    `;
  }).join("");
}

function selectApp(appId) {
  _selectedApp = appId;
  window._selectedApp = appId; // sync global pour main.js
  renderAppSelector();

  // Mettre à jour le bouton de lancement
  const btn = $("btnAllow");
  if (btn) {
    const cfg = APP_CONFIG[appId];
    btn.innerHTML = `Autoriser ${cfg.icon} ${cfg.label} — ${cfg.thresholds.orange} min`;
    btn.classList.remove("hidden");
  }
}

/* ---------------------------------------------------------
   6) CHART — par app ou global
   --------------------------------------------------------- */

function drawChart(appId = null) {
  if (!has("chart") || !window.Engine) return;

  const canvas = $("chart");
  const ctx = canvas.getContext("2d");
  const events = getEventsSafe();
  const data = Engine.last7DaysMap(events, appId);

  const cfg = appId ? APP_CONFIG[appId] : null;
  const orangeThresh = cfg ? cfg.thresholds.orange : 30;
  const redThresh = cfg ? cfg.thresholds.red : 90;

  const values = Object.values(data);
  const dates = Object.keys(data);
  const maxValue = Math.max(...values, redThresh + 10);

  const W = canvas.width;
  const H = canvas.height;
  const PT = 28, PB = 40, PL = 10, PR = 10;
  const chartH = H - PT - PB;
  const chartW = W - PL - PR;

  ctx.clearRect(0, 0, W, H);

  // Threshold lines
  [[orangeThresh, "rgba(255,159,10,0.25)"], [redThresh, "rgba(255,69,58,0.25)"]].forEach(([thresh, color]) => {
    const y = PT + chartH - (thresh / maxValue) * chartH;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PL, y);
    ctx.lineTo(W - PR, y);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  const barW = Math.floor(chartW / values.length) - 6;
  const gap = 6;

  values.forEach((value, i) => {
    const barH = Math.max(2, (value / maxValue) * chartH);
    const x = PL + i * (barW + gap) + (chartW - values.length * (barW + gap)) / 2;
    const y = PT + chartH - barH;
    const alpha = value === 0 ? 0.2 : 0.85;

    if (value >= redThresh) ctx.fillStyle = `rgba(255,69,58,${alpha})`;
    else if (value >= orangeThresh) ctx.fillStyle = `rgba(255,159,10,${alpha})`;
    else ctx.fillStyle = `rgba(52,199,89,${alpha})`;

    const r = Math.min(5, barW / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + barW - r, y);
    ctx.arcTo(x + barW, y, x + barW, y + r, r);
    ctx.lineTo(x + barW, y + barH);
    ctx.lineTo(x, y + barH);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.fill();

    if (value > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 11px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(value + "m", x + barW / 2, y - 6);
    }

    const dateObj = new Date(dates[i]);
    const dayLabels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const isToday = dateObj.toDateString() === new Date().toDateString();
    ctx.fillStyle = isToday ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.42)";
    ctx.font = (isToday ? "bold " : "") + "11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(dayLabels[dateObj.getDay()], x + barW / 2, H - 8);
  });
}

/* ---------------------------------------------------------
   7) STATS TAB — sélecteur par app dans diagnostic
   --------------------------------------------------------- */

let _statsApp = null; // null = global

function renderStatsTabBar() {
  const bar = $("statsTabBar");
  if (!bar) return;

  const tabs = [{ id: null, label: "Global", icon: "◎" }, ...APP_IDS.map(id => APP_CONFIG[id])];

  bar.innerHTML = tabs.map(t => {
    const id = t.id ?? null;
    const isActive = _statsApp === id;
    return `
      <button class="statsTab ${isActive ? "statsTab--active" : ""}" onclick="setStatsApp(${id ? `'${id}'` : 'null'})">
        ${t.icon} ${t.label}
      </button>
    `;
  }).join("");
}

function setStatsApp(appId) {
  _statsApp = appId;
  renderStatsTabBar();
  renderRisk();
  renderPrediction();
  renderIntentStats();
  drawChart(_statsApp);
}

/* ---------------------------------------------------------
   8) TEXT STATS
   --------------------------------------------------------- */

function renderPrediction() {
  if (!has("prediction") || !window.Engine) return;

  const events = getEventsSafe();
  const appId = _statsApp;
  const cfg = appId ? APP_CONFIG[appId] : null;
  const orange = cfg ? cfg.thresholds.orange : 30;
  const red = cfg ? cfg.thresholds.red : 90;

  const pred = Engine.trendPrediction(events, orange, red, appId);
  const label = appId ? `${APP_CONFIG[appId].icon} ${APP_CONFIG[appId].label}` : "Toutes apps";

  $("prediction").innerText =
    `${label} · Moyenne 7j : ${pred.avg} min/j · Projection : ${pred.weeklyProjection} min/sem · ${pred.trendText}`;
}

function renderIntentStats() {
  if (!has("intentStats") || !window.Engine) return;

  const events = getEventsSafe();
  const appId = _statsApp;
  const s = Engine.intentStats7d(events, appId);
  const label = appId ? `${APP_CONFIG[appId].label}` : "Toutes apps";

  $("intentStats").innerText = s.total
    ? `Intentions ${label} (7j, n=${s.total}) — Répondre : ${s.pReply}% · Fun : ${s.pFun}% · Auto : ${s.pAuto}%`
    : `Intentions ${label} (7j) : aucune donnée encore.`;
}

/* ---------------------------------------------------------
   9) RISK
   --------------------------------------------------------- */

function renderRisk() {
  if (!window.Analytics) return;

  const events = getEventsSafe();
  const openPings = getOpenPingsSafe();
  const appId = _statsApp;
  const cfg = appId ? APP_CONFIG[appId] : null;
  const thresholds = cfg
    ? { THRESH_ORANGE: cfg.thresholds.orange, THRESH_RED: cfg.thresholds.red }
    : { THRESH_ORANGE: 30, THRESH_RED: 90 };

  const risk = Analytics.computeRisk({ events, thresholds, openPings, now: new Date(), appId });

  if (has("riskScore")) {
    $("riskScore").innerText = risk.score;
    $("riskScore").className = "riskScore " +
      (risk.tier === "élevé" ? "risk-high" : risk.tier === "modéré" ? "risk-med" : "risk-low");
  }

  if (has("riskLine")) {
    $("riskLine").innerText = `Risque ${risk.tier}`;
    $("riskLine").className = "riskTier tier-" +
      (risk.tier === "élevé" ? "high" : risk.tier === "modéré" ? "med" : "low");
  }

  const fill = $("riskBarFill");
  if (fill) {
    fill.style.width = Math.max(0, Math.min(100, risk.score)) + "%";
    if (risk.tier === "élevé") fill.style.background = "rgba(255,59,48,0.85)";
    else if (risk.tier === "modéré") fill.style.background = "rgba(255,159,10,0.85)";
    else fill.style.background = "rgba(52,199,89,0.85)";
  }

  const chips = $("riskChips");
  if (chips) {
    const top = Array.isArray(risk.topReasons) ? risk.topReasons.slice(0, 3) : [];
    chips.innerHTML = top.length
      ? top.map(t => `<span class="pill">${escapeHtml(t.detail || t.code || "")}</span>`).join("")
      : `<span class="pill pill-green">Tout va bien</span>`;
  }
}

/* ---------------------------------------------------------
   10) PROFILE
   --------------------------------------------------------- */

function renderProfileTraits() {
  if (!has("profileTraits") || !window.Analytics) return;
  const events = getEventsSafe();
  const p = Analytics.computeProfile({ events });
  $("profileTraits").innerText = p.summary;
}

/* ---------------------------------------------------------
   11) COACH
   --------------------------------------------------------- */

function launchCoach(appId = null) {
  if (!window.Engine || !window.Analytics) return;

  const events = getEventsSafe();
  const openPings = getOpenPingsSafe();

  const result = Engine.coachSuggestion({ events, appId, openPings });

  if (has("coachRiskBadge")) {
    $("coachRiskBadge").innerText = `${result.riskScore}/100 — ${result.riskTier}`;
    $("coachRiskBadge").className = "coachBadge badge-" +
      (result.riskTier === "élevé" ? "high" : result.riskTier === "modéré" ? "med" : "low");
  }

  if (has("coachProfile")) $("coachProfile").innerText = result.profileTraits;
  if (has("coachRecommendation")) $("coachRecommendation").innerText = result.actions[result.finalKey];

  ["primary", "alt1", "alt2"].forEach(key => {
    const btn = document.querySelector(`[data-choice="${key}"]`);
    if (btn) btn.classList.toggle("btn-recommended", key === result.finalKey);
  });

  // Reset outcome block
  if (has("outcomeBlock")) $("outcomeBlock").classList.add("hidden");
  if (has("coachActions")) $("coachActions").classList.remove("hidden");

  showCoach();
}

/* ---------------------------------------------------------
   12) GLOBAL RENDER
   --------------------------------------------------------- */

function renderAll() {
  renderHero();
  renderSessionBanner();
  renderAppSelector();
  renderStatsTabBar();
  drawChart(_statsApp);
  renderPrediction();
  renderIntentStats();
  renderRisk();
  renderProfileTraits();
}

/* ---------------------------------------------------------
   EXPORT
   --------------------------------------------------------- */

window.UI = {
  showMenu, showIntent, showTimer, showCoach,
  renderAll, launchCoach, selectApp, setStatsApp
};
window.selectApp = selectApp;
window.setStatsApp = setStatsApp;
