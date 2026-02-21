/* =========================================================
   UI LAYER — DOM rendering (V2 — redesigned + bugfixed)
   ========================================================= */

const THRESH_ORANGE = 30;
const THRESH_RED = 60;

/* =========================================================
   1) DOM HELPERS
   ========================================================= */
function $(id) { return document.getElementById(id); }
function has(id) { return !!document.getElementById(id); }

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getEventsSafe() {
  try { return window.EventsStore?.getEvents?.() ?? []; } catch (e) { return []; }
}

function getOpenPingsSafe() {
  try {
    if (window.Storage?.get) return Storage.get("openPings", []);
    return [];
  } catch (e) { return []; }
}

/* =========================================================
   2) PANELS
   ========================================================= */
function hideAllPanels() {
  ["menu", "intentBlock", "timer", "coach"].forEach(id => has(id) && $(id).classList.add("hidden"));
}

function showMenu() { hideAllPanels(); has("menu") && $("menu").classList.remove("hidden"); }
function showIntent() { hideAllPanels(); has("intentBlock") && $("intentBlock").classList.remove("hidden"); }
function showTimer() { hideAllPanels(); has("timer") && $("timer").classList.remove("hidden"); }
function showCoach() { hideAllPanels(); has("coach") && $("coach").classList.remove("hidden"); }

/* =========================================================
   3) SESSION BANNER
   ========================================================= */
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
      console.warn(e);
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

  const planned = active.minutesPlanned ?? 10;
  const start = active.startedAt && window.Sessions?.formatHHMM
    ? window.Sessions.formatHHMM(active.startedAt)
    : "—";

  if (has("sessionBannerText")) {
    $("sessionBannerText").textContent = `Début : ${start} · Plan : ${planned} min`;
  }
  banner.classList.remove("hidden");
}

/* =========================================================
   4) HERO
   ========================================================= */
function renderHero() {
  if (!window.Engine) return;

  const events = getEventsSafe();
  const totalToday = Engine.totalToday(events);
  const trend = Engine.trendPrediction(events, THRESH_ORANGE, THRESH_RED);
  const intents7 = Engine.intentStats7d(events);
  const pressure = Engine.jarvisPressure(events);

  const state = Engine.stateFromThresholds(totalToday, trend.avg, THRESH_ORANGE, THRESH_RED);

  if (has("todayMinutes")) $("todayMinutes").innerText = totalToday;

  const stateLabels = { GREEN: "En contrôle", ORANGE: "Attention", RED: "Zone rouge" };
  if (has("stateLabel")) $("stateLabel").innerText = stateLabels[state] ?? state;

  if (has("stateDot")) {
    $("stateDot").className = "stateDot";
    if (state === "GREEN") $("stateDot").classList.add("green");
    if (state === "ORANGE") $("stateDot").classList.add("orange");
    if (state === "RED") $("stateDot").classList.add("red");
  }

  if (has("kpiTrend")) {
    const arrow = trend.trendText.includes("augmentation") ? "↑" :
      trend.trendText.includes("baisse") ? "↓" : "→";
    $("kpiTrend").innerText = arrow;
    $("kpiTrend").className = "kpiValue " + (
      trend.trendText.includes("augmentation") ? "kpi-red" :
        trend.trendText.includes("baisse") ? "kpi-green" : ""
    );
  }

  if (has("kpiPressure")) {
    $("kpiPressure").innerText = `${pressure}/3`;
    $("kpiPressure").className = "kpiValue " + (pressure >= 2 ? "kpi-red" : pressure === 1 ? "kpi-orange" : "");
  }

  if (has("kpiAuto")) {
    $("kpiAuto").innerText = intents7.total ? `${intents7.pAuto}%` : "—";
    $("kpiAuto").className = "kpiValue " + (intents7.pAuto >= 50 ? "kpi-red" : intents7.pAuto >= 30 ? "kpi-orange" : "");
  }
}

/* =========================================================
   5) CHART — redesigned with cleaner rendering
   ========================================================= */
function drawChart() {
  if (!has("chart") || !window.Engine) return;

  const canvas = $("chart");
  const ctx = canvas.getContext("2d");
  const events = getEventsSafe();
  const data = Engine.last7DaysMap(events);

  const values = Object.values(data);
  const dates = Object.keys(data);
  const maxValue = Math.max(...values, THRESH_RED + 10);

  const W = canvas.width;
  const H = canvas.height;
  const PADDING = { top: 28, bottom: 40, left: 10, right: 10 };
  const chartH = H - PADDING.top - PADDING.bottom;
  const chartW = W - PADDING.left - PADDING.right;

  ctx.clearRect(0, 0, W, H);

  // Grid lines
  [THRESH_ORANGE, THRESH_RED].forEach(thresh => {
    const y = PADDING.top + chartH - (thresh / maxValue) * chartH;
    ctx.strokeStyle = thresh === THRESH_ORANGE ? "rgba(255,159,10,0.25)" : "rgba(255,69,58,0.25)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PADDING.left, y);
    ctx.lineTo(W - PADDING.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  const barW = Math.floor(chartW / values.length) - 6;
  const gap = 6;

  values.forEach((value, i) => {
    const barH = Math.max(2, (value / maxValue) * chartH);
    const x = PADDING.left + i * (barW + gap) + (chartW - values.length * (barW + gap)) / 2;
    const y = PADDING.top + chartH - barH;

    // Bar color
    const color = value >= THRESH_RED ? "#ff453a" : value >= THRESH_ORANGE ? "#ff9f0a" : "#34c759";
    const alpha = value === 0 ? 0.25 : 0.85;

    ctx.fillStyle = color.replace("#", "rgba(").replace(/(.{2})(.{2})(.{2})/, (m, r, g, b) => {
      return `${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)},${alpha})`;
    });

    // Simplify — use a direct color approach
    if (value >= THRESH_RED) ctx.fillStyle = `rgba(255,69,58,${alpha})`;
    else if (value >= THRESH_ORANGE) ctx.fillStyle = `rgba(255,159,10,${alpha})`;
    else ctx.fillStyle = `rgba(52,199,89,${alpha})`;

    // Bar with rounded top
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

    // Value label
    if (value > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 11px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(value + "m", x + barW / 2, y - 6);
    }

    // Day label
    const dateObj = new Date(dates[i]);
    const dayLabels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const isToday = dateObj.toDateString() === new Date().toDateString();
    ctx.fillStyle = isToday ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)";
    ctx.font = (isToday ? "bold " : "") + "11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(dayLabels[dateObj.getDay()], x + barW / 2, H - 8);
  });
}

/* =========================================================
   6) STATS
   ========================================================= */
function renderPrediction() {
  if (!has("prediction") || !window.Engine) return;

  const events = getEventsSafe();
  const pred = Engine.trendPrediction(events, THRESH_ORANGE, THRESH_RED);

  $("prediction").innerText =
    `Moyenne 7j : ${pred.avg} min/jour · Projection semaine : ${pred.weeklyProjection} min · ${pred.trendText}`;
}

function renderIntentStats() {
  if (!has("intentStats") || !window.Engine) return;

  const events = getEventsSafe();
  const s = Engine.intentStats7d(events);

  $("intentStats").innerText = s.total
    ? `Intentions (7j, n=${s.total}) — Répondre : ${s.pReply}% · Fun : ${s.pFun}% · Auto : ${s.pAuto}%`
    : "Intentions (7j) : aucune donnée encore.";
}

/* =========================================================
   7) RISK — fixed: chips now show text, not [object Object]
   ========================================================= */
function renderRisk() {
  if (!window.Analytics) return;

  const events = getEventsSafe();
  const openPings = getOpenPingsSafe();
  const thresholds = { THRESH_ORANGE, THRESH_RED };
  const risk = Analytics.computeRisk({ events, thresholds, openPings, now: new Date() });

  // Score number with animation
  if (has("riskScore")) {
    const el = $("riskScore");
    el.innerText = risk.score;
    el.className = "riskScore " + (risk.tier === "élevé" ? "risk-high" : risk.tier === "modéré" ? "risk-med" : "risk-low");
  }

  if (has("riskLine")) {
    $("riskLine").innerText = `Risque ${risk.tier}`;
    $("riskLine").className = "riskTier tier-" + (risk.tier === "élevé" ? "high" : risk.tier === "modéré" ? "med" : "low");
  }

  // Bar
  const fill = $("riskBarFill");
  if (fill) {
    const pct = Math.max(0, Math.min(100, risk.score));
    fill.style.width = pct + "%";
    if (risk.tier === "élevé") fill.style.background = "rgba(255,59,48,0.85)";
    else if (risk.tier === "modéré") fill.style.background = "rgba(255,159,10,0.85)";
    else fill.style.background = "rgba(52,199,89,0.85)";
  }

  // FIX: chips — was rendering [object Object] because t was an object, not a string
  const chips = $("riskChips");
  if (chips) {
    const top = Array.isArray(risk.topReasons) ? risk.topReasons.slice(0, 3) : [];
    chips.innerHTML = top.length
      ? top.map(t => `<span class="pill">${escapeHtml(t.detail || t.code || String(t))}</span>`).join("")
      : `<span class="pill pill-green">Tout va bien</span>`;
  }
}

/* =========================================================
   8) PROFILE
   ========================================================= */
function renderProfileTraits() {
  if (!has("profileTraits") || !window.Analytics) return;

  const events = getEventsSafe();
  const p = Analytics.computeProfile({ events });

  $("profileTraits").innerText = p.summary;
}

/* =========================================================
   9) COACH — redesigned rendering
   ========================================================= */
function launchCoach() {
  if (!window.Engine || !window.Analytics) return;

  const events = getEventsSafe();
  const openPings = getOpenPingsSafe();

  const result = Engine.coachSuggestion({
    events,
    thresholds: { THRESH_ORANGE, THRESH_RED },
    openPings
  });

  if (has("coachRiskBadge")) {
    const el = $("coachRiskBadge");
    el.innerText = `${result.riskScore}/100 — ${result.riskTier}`;
    el.className = "coachBadge badge-" + (result.riskTier === "élevé" ? "high" : result.riskTier === "modéré" ? "med" : "low");
  }

  if (has("coachProfile")) {
    $("coachProfile").innerText = result.profileTraits;
  }

  if (has("coachRecommendation")) {
    $("coachRecommendation").innerText = result.actions[result.finalKey];
  }

  // Update button labels with the actual actions
  const btnLabels = {
    primary: result.actions.primary,
    alt1: result.actions.alt1,
    alt2: result.actions.alt2
  };

  ["primary", "alt1", "alt2"].forEach(key => {
    const btn = document.querySelector(`[data-choice="${key}"]`);
    if (btn) {
      btn.classList.toggle("btn-recommended", key === result.finalKey);
    }
  });

  showCoach();
}

/* =========================================================
   10) GLOBAL RENDER
   ========================================================= */
function renderAll() {
  renderHero();
  renderSessionBanner();
  drawChart();
  renderPrediction();
  renderIntentStats();
  renderRisk();
  renderProfileTraits();
}

window.UI = {
  showMenu,
  showIntent,
  showTimer,
  showCoach,
  renderAll,
  launchCoach
};
