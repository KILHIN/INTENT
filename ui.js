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

  // Streak
  renderStreak(events);

  // Résumé de fin de journée (après 20h)
  const hour = new Date().getHours();
  if (hour >= 20) renderDailySummary(events, byApp);

  // Auto-coach si 3 sessions "auto" aujourd'hui
  checkAutoCoach(events);
}

function renderStreak(events) {
  const el = document.getElementById("streakBadge");
  if (!el) return;

  const streak = computeStreak(events);
  if (streak === 0) {
    el.classList.add("hidden");
    return;
  }

  el.classList.remove("hidden");
  el.innerHTML = `🔥 ${streak} jour${streak > 1 ? "s" : ""} sans dépasser les seuils`;
}

function computeStreak(events) {
  let streak = 0;
  const now = new Date();

  for (let i = 1; i <= 365; i++) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dateStr = d.toDateString();

    const dayEvents = events.filter(e => e.date === dateStr && e.mode === "allow" && e.finalized);

    // Pas de session ce jour-là = on arrête (streak basé sur jours actifs uniquement)
    if (dayEvents.length === 0) break;

    // Vérifie si un seuil rouge a été dépassé
    let exceeded = false;
    for (const appId of APP_IDS) {
      const cfg = APP_CONFIG[appId];
      const total = dayEvents
        .filter(e => e.app === appId)
        .reduce((s, e) => s + (e.minutes || 0), 0);
      if (total >= cfg.thresholds.red) { exceeded = true; break; }
    }

    if (exceeded) break;
    streak++;
  }

  return streak;
}

function renderDailySummary(events, byApp) {
  const el = document.getElementById("dailySummary");
  if (!el) return;

  const total = Object.values(byApp).reduce((s, v) => s + v, 0);
  if (total === 0) { el.classList.add("hidden"); return; }

  const streak = computeStreak(events);
  const streakMsg = streak > 0 ? ` · 🔥 ${streak}j de suite` : "";

  el.classList.remove("hidden");
  el.textContent = `Bilan du jour : ${total} min de scroll total${streakMsg}`;
}

function checkAutoCoach(events) {
  const today = new Date().toDateString();
  const autoToday = events.filter(e =>
    e.date === today &&
    e.mode === "allow" &&
    e.intent === "auto"
  ).length;

  const banner = document.getElementById("autoCoachBanner");
  if (!banner) return;

  if (autoToday >= 3) {
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
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

/* ---------------------------------------------------------
   CHART HELPERS (top-level pour éviter hoisting bugs)
   --------------------------------------------------------- */

function _buildDayStack(events, dateStr) {
  const intentColorsMap = { reply: 1, fun: 1, auto: 1, null: 1 };
  const dayEvents = events.filter(e =>
    e.date === dateStr && e.mode === "allow" && (e.finalized || e.minutesActual != null)
  );
  if (_chartMode === "app") {
    const byApp = {};
    for (const id of APP_IDS) byApp[id] = 0;
    for (const e of dayEvents) {
      const k = APP_IDS.includes(e.app) ? e.app : "unknown";
      byApp[k] = (byApp[k] || 0) + (e.minutes || 0);
    }
    return { dateStr, segments: byApp, segmentKeys: APP_IDS, total: Object.values(byApp).reduce((s,v)=>s+v,0) };
  } else {
    const byIntent = { reply: 0, fun: 0, auto: 0, null: 0 };
    for (const e of dayEvents) {
      const k = intentColorsMap[e.intent] ? e.intent : "null";
      byIntent[k] += e.minutes || 0;
    }
    return { dateStr, segments: byIntent, segmentKeys: ["reply","fun","auto","null"], total: Object.values(byIntent).reduce((s,v)=>s+v,0) };
  }
}

function _buildSingleDayStacks(events, dateStr) {
  const dayEvents = events
    .filter(e => e.date === dateStr && e.mode === "allow" && (e.finalized || e.minutesActual != null))
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));

  if (dayEvents.length === 0) {
    return [{ dateStr, segments: {}, segmentKeys: [], total: 0, label: "—" }];
  }

  return dayEvents.map(e => {
    const key = _chartMode === "app" ? (e.app || "unknown") : (e.intent || "null");
    const label = e.startedAt
      ? new Date(e.startedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      : "—";
    return { dateStr, segments: { [key]: e.minutes || 0 }, segmentKeys: [key], total: e.minutes || 0, label };
  });
}

// Mode du graphique : "app" ou "intent"
let _chartMode = "app";
// Jour sélectionné : null = 7 jours, sinon dateString
let _chartDay = null;

function toggleChartMode() {
  _chartMode = _chartMode === "app" ? "intent" : "app";
  const btn = document.getElementById("chartToggle");
  if (btn) btn.textContent = _chartMode === "app" ? "Par intention" : "Par app";
  drawChart(_statsApp);
}

function selectChartDay(dateStr) {
  _chartDay = _chartDay === dateStr ? null : dateStr;
  renderDayPicker();
  drawChart(_statsApp);
}

function renderDayPicker() {
  const el = document.getElementById("chartDayPicker");
  if (!el) return;

  const events = getEventsSafe();
  const today = new Date();

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    days.push(d.toDateString());
  }

  const dayLabels = ["Di","Lu","Ma","Me","Je","Ve","Sa"];

  el.innerHTML = days.map(dateStr => {
    const d = new Date(dateStr);
    const label = dayLabels[d.getDay()];
    const hasData = events.some(e => e.date === dateStr && e.mode === "allow" && e.finalized);
    const isActive = _chartDay === dateStr;
    return `<button
      class="dayPickerBtn ${isActive ? "dayPickerBtn--active" : ""} ${hasData ? "" : "dayPickerBtn--empty"}"
      onclick="selectChartDay('${dateStr}')"
    >${label}</button>`;
  }).join("");
}

function drawChart(appId = null) {
  if (!has("chart") || !window.Engine) return;

  const canvas = $("chart");
  const ctx = canvas.getContext("2d");
  const events = getEventsSafe();

  const cfg = appId ? APP_CONFIG[appId] : null;
  const orangeThresh = cfg ? cfg.thresholds.orange : 30;
  const redThresh    = cfg ? cfg.thresholds.red    : 90;

  // Si un jour est sélectionné, on affiche les sessions de ce jour
  // sinon on affiche les 7 derniers jours
  let dates;
  let isSingleDay = false;

  if (_chartDay) {
    dates = [_chartDay];
    isSingleDay = true;
  } else {
    const last7 = Engine.last7DaysMap(events, appId);
    dates = Object.keys(last7);
  }

  // Couleurs par app
  const appColors = {
    instagram: "rgba(193,53,132,0.85)",
    x:         "rgba(29,161,242,0.85)",
    facebook:  "rgba(66,103,178,0.85)",
    youtube:   "rgba(255,0,0,0.85)",
    unknown:   "rgba(180,180,180,0.5)"
  };

  // Couleurs par intention
  const intentColors = {
    reply: "rgba(10,132,255,0.85)",
    fun:   "rgba(52,199,89,0.85)",
    auto:  "rgba(255,69,58,0.85)",
    null:  "rgba(180,180,180,0.4)"
  };

  // Construit les stacks selon le mode
  const stacks = isSingleDay
    ? _buildSingleDayStacks(events, dates[0])
    : dates.map(dateStr => _buildDayStack(events, dateStr));

  const maxValue = Math.max(...stacks.map(s => s.total), redThresh + 10);
  const colors = _chartMode === "app" ? appColors : intentColors;

  const W = canvas.width;
  const H = canvas.height;
  const PT = 28, PB = 52, PL = 10, PR = 10;
  const chartH = H - PT - PB;
  const chartW = W - PL - PR;

  ctx.clearRect(0, 0, W, H);

  // Threshold lines
  [[orangeThresh, "rgba(255,159,10,0.3)"], [redThresh, "rgba(255,69,58,0.3)"]].forEach(([thresh, color]) => {
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

  const barW = Math.floor(chartW / stacks.length) - 6;
  const gap  = 6;
  const dayLabels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  stacks.forEach((stack, i) => {
    const { dateStr, segments, segmentKeys, total } = stack;
    const x = PL + i * (barW + gap) + (chartW - stacks.length * (barW + gap)) / 2;
    const isToday = dateStr === new Date().toDateString();

    if (total === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      const emptyH = 4;
      ctx.beginPath();
      ctx.roundRect(x, PT + chartH - emptyH, barW, emptyH, Math.min(5, barW / 2));
      ctx.fill();
    } else {
      let yOffset = PT + chartH;
      const activeKeys = segmentKeys.filter(k => segments[k] > 0);

      segmentKeys.forEach(key => {
        const mins = segments[key] || 0;
        if (mins === 0) return;
        const segH = Math.max(2, (mins / maxValue) * chartH);
        yOffset -= segH;
        ctx.fillStyle = colors[key] || "rgba(180,180,180,0.4)";
        const isTop = key === activeKeys[activeKeys.length - 1];
        const r = Math.min(5, barW / 2);
        ctx.beginPath();
        if (isTop) {
          ctx.moveTo(x + r, yOffset);
          ctx.lineTo(x + barW - r, yOffset);
          ctx.arcTo(x + barW, yOffset, x + barW, yOffset + r, r);
          ctx.lineTo(x + barW, yOffset + segH);
          ctx.lineTo(x, yOffset + segH);
          ctx.arcTo(x, yOffset, x + r, yOffset, r);
        } else {
          ctx.rect(x, yOffset, barW, segH);
        }
        ctx.closePath();
        ctx.fill();
      });

      // Total au-dessus
      const topY = PT + chartH - (total / maxValue) * chartH;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 11px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(total + "m", x + barW / 2, topY - 6);
    }

    // Label jour ou heure selon le mode
    const shortLabels = ["Di","Lu","Ma","Me","Je","Ve","Sa"];
    const labelText = stack.label
      ? stack.label
      : shortLabels[new Date(dateStr).getDay()];
    ctx.fillStyle = isToday && !stack.label ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)";
    ctx.font = (isToday && !stack.label ? "bold " : "") + "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(labelText, x + barW / 2, H - PB + 16);
  });

  // Légende dynamique
  const legendItems = _chartMode === "app"
    ? APP_IDS.map(id => ({ key: id, label: APP_CONFIG[id].icon + " " + APP_CONFIG[id].label }))
    : [
        { key: "reply", label: "Répondre" },
        { key: "fun",   label: "Fun" },
        { key: "auto",  label: "Auto" }
      ];

  const legendY = H - 18;
  const itemW = Math.floor(W / legendItems.length);
  legendItems.forEach(({ key, label }, idx) => {
    const lx = idx * itemW + 4;
    ctx.fillStyle = colors[key] || "rgba(180,180,180,0.4)";
    ctx.beginPath();
    ctx.roundRect(lx, legendY - 7, 10, 10, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(label, lx + 14, legendY + 1);
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
  const red = cfg ? cfg.thresholds.red : 60;

  const pred = Engine.trendPrediction(events, orange, red, appId);

  $("prediction").innerHTML = `
    <div class="statRow">
      <span class="statItem">
        <span class="statLabel">Moyenne 7j</span>
        <span class="statValue">${pred.avg} <small>min/j</small></span>
      </span>
      <span class="statItem">
        <span class="statLabel">Projection</span>
        <span class="statValue">${pred.weeklyProjection} <small>min/sem</small></span>
      </span>
      <span class="statItem">
        <span class="statLabel">Tendance</span>
        <span class="statValue statTrend">${pred.trendText}</span>
      </span>
    </div>
  `;
}

function renderIntentStats() {
  if (!has("intentStats") || !window.Engine) return;

  const events = getEventsSafe();
  const appId = _statsApp;
  const s = Engine.intentStats7d(events, appId);

  if (!s.total) {
    $("intentStats").innerHTML = `<p class="statEmpty">Pas encore de données sur 7 jours.</p>`;
    return;
  }

  $("intentStats").innerHTML = `
    <div class="statRow">
      <span class="statItem">
        <span class="statLabel">💬 Répondre</span>
        <span class="statValue statReply">${s.pReply}%</span>
      </span>
      <span class="statItem">
        <span class="statLabel">🎉 Fun</span>
        <span class="statValue statFun">${s.pFun}%</span>
      </span>
      <span class="statItem">
        <span class="statLabel">😶 Auto</span>
        <span class="statValue statAuto">${s.pAuto}%</span>
      </span>
    </div>
  `;
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
  renderDayPicker();
  drawChart(_statsApp);
  renderPrediction();
  renderIntentStats();
  renderRisk();
  renderProfileTraits();
  renderTodaySessions();
}

/* ---------------------------------------------------------
   EXPORT
   --------------------------------------------------------- */

window.UI = {
  showMenu, showIntent, showTimer, showCoach,
  renderAll, launchCoach, selectApp, setStatsApp,
  renderTodaySessions, toggleChartMode, selectChartDay
};
window.selectApp = selectApp;
window.setStatsApp = setStatsApp;
window.toggleChartMode = toggleChartMode;
window.selectChartDay = selectChartDay;

/* ---------------------------------------------------------
   PATCH — renderTodaySessions (ajout accordéon sessions du jour)
   --------------------------------------------------------- */

function renderTodaySessions() {
  const el = $("todaySessionsList");
  if (!el) return;

  const events = getEventsSafe();
  const today = new Date().toDateString();

  const now = Date.now();
  const STALE_MS = 5 * 60 * 1000; // 5 min

  const sessions = events.filter(e => {
    if (e.mode !== "allow") return false;
    if (e.date !== today) return false;
    if (!e.startedAt) return false;
    // Cache les sessions "En cours" orphelines (> 5 min sans finalisation)
    if (!e.finalized && !e.cancelled && (now - e.startedAt) > STALE_MS) return false;
    return true;
  }).sort((a, b) => a.startedAt - b.startedAt);

  if (!sessions.length) {
    el.innerHTML = `<p class="todayEmpty">Aucune session aujourd'hui.</p>`;
    return;
  }

  const intentLabels = {
    reply: "💬 Répondre",
    fun:   "🎉 Fun",
    auto:  "😶 Auto",
    null:  "—"
  };

  el.innerHTML = sessions.map(e => {
    const cfg = APP_CONFIG[e.app] || { icon: "📱", label: e.app };
    const start = window.Sessions?.formatHHMM?.(e.startedAt) ?? "—";
    const mins = e.minutes ?? 0;
    const intent = intentLabels[e.intent] || "—";
    const status = e.finalized
      ? `${mins} min`
      : e.cancelled
        ? "Annulée"
        : `En cours…`;

    const statusClass = e.cancelled
      ? "ts-cancelled"
      : !e.finalized
        ? "ts-active"
        : mins >= (APP_CONFIG[e.app]?.thresholds?.red ?? 60)
          ? "ts-red"
          : mins >= (APP_CONFIG[e.app]?.thresholds?.orange ?? 30)
            ? "ts-orange"
            : "ts-green";

    return `
      <div class="todaySession">
        <div class="tsLeft">
          <span class="tsApp">${cfg.icon} ${cfg.label}</span>
          <span class="tsIntent">${intent}</span>
        </div>
        <div class="tsRight">
          <span class="tsTime">${start}</span>
          <span class="tsDuration ${statusClass}">${status}</span>
        </div>
      </div>
    `;
  }).join("");
}
