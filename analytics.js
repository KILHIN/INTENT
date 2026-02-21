/* =========================================================
   ANALYTICS — V3 Multi-app
   Pure functions. No DOM. No Storage.
   ========================================================= */

const Analytics = {};

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function minutesToday(events, appId = null) {
  const today = new Date().toDateString();
  return events
    .filter(e => e.date === today && (appId ? e.app === appId : true))
    .reduce((s, e) => s + (e.minutes || 0), 0);
}

function loopStatus(openPings) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const recent = (openPings || []).filter(t => now - t <= windowMs);
  return { count15: recent.length, inLoop: recent.length >= 3 };
}

function pushReason(reasons, code, detail, weight) {
  reasons.push({ code, detail, weight });
}

/* ---------------------------------------------------------
   RISK SCORE — tient compte de l'app active
   --------------------------------------------------------- */

Analytics.computeRisk = function ({ events, thresholds, openPings = [], now = new Date(), appId = null }) {
  const THRESH_ORANGE = thresholds.THRESH_ORANGE;
  const THRESH_RED = thresholds.THRESH_RED;

  const totalToday = minutesToday(events, appId);
  const totalGlobal = minutesToday(events, null); // toutes apps

  const trend = Engine.trendPrediction(events, THRESH_ORANGE, THRESH_RED, appId);
  const intents7 = Engine.intentStats7d(events, appId);
  const pressure = Engine.jarvisPressure(events);
  const loop = loopStatus(openPings);

  const hour = now.getHours();
  const isLate = hour >= 22;
  const isWork = hour >= 9 && hour <= 18;

  let score = 8;
  const reasons = [];

  // A) App today vs seuils
  if (totalToday >= THRESH_RED) {
    score += 42;
    pushReason(reasons, "TODAY_RED", `≥ ${THRESH_RED}m aujourd'hui`, 42);
  } else if (totalToday >= THRESH_ORANGE) {
    const part = clamp((totalToday - THRESH_ORANGE) / (THRESH_RED - THRESH_ORANGE), 0, 1);
    const add = Math.round(24 + 12 * part);
    score += add;
    pushReason(reasons, "TODAY_ORANGE", `${totalToday}m (seuil ${THRESH_ORANGE}m)`, add);
  } else if (totalToday >= 15) {
    const add = Math.round(6 * (totalToday / THRESH_ORANGE));
    score += add;
    pushReason(reasons, "TODAY_BUILDUP", `${totalToday}m aujourd'hui`, add);
  }

  // A2) Bonus si scroll global élevé (multi-app)
  if (appId && totalGlobal > totalToday) {
    const otherApps = totalGlobal - totalToday;
    if (otherApps >= 45) {
      score += 10;
      pushReason(reasons, "GLOBAL_HIGH", `+${otherApps}m sur d'autres apps`, 10);
    }
  }

  // B) Trend
  if (trend.trendText.includes("augmentation")) {
    score += 14;
    pushReason(reasons, "TREND_UP", "↑ Tendance en hausse (7j)", 14);
  } else if (trend.trendText.includes("baisse")) {
    score -= 6;
    pushReason(reasons, "TREND_DOWN", "↓ Tendance en baisse (7j)", -6);
  }

  // C) Auto intent
  if (intents7.total >= 4) {
    if (intents7.pAuto >= 60) {
      score += 26;
      pushReason(reasons, "AUTO_HIGH", `Auto élevé (${intents7.pAuto}%)`, 26);
    } else if (intents7.pAuto >= 40) {
      score += 16;
      pushReason(reasons, "AUTO_MED", `Auto modéré (${intents7.pAuto}%)`, 16);
    } else if (intents7.pAuto >= 25) {
      score += 8;
      pushReason(reasons, "AUTO_LOW", `Auto présent (${intents7.pAuto}%)`, 8);
    }
  }

  // D) Loop
  if (loop.inLoop) {
    const add = 22 + Math.min(10, (loop.count15 - 3) * 4);
    score += add;
    pushReason(reasons, "LOOP", `Boucle: ${loop.count15}× en 15 min`, add);
  }

  // E) Pressure
  if (pressure === 3) { score += 16; pushReason(reasons, "PRESSURE_3", "Évitement systématique", 16); }
  else if (pressure === 2) { score += 10; pushReason(reasons, "PRESSURE_2", "Biais de confort", 10); }
  else if (pressure === 1) { score += 5; pushReason(reasons, "PRESSURE_1", "Dérive légère", 5); }

  // F) Time context
  if (isLate) { score += 12; pushReason(reasons, "LATE", "Après 22h", 12); }
  if (isWork) { score += 7; pushReason(reasons, "WORK_HOURS", "Heures de travail", 7); }

  score = clamp(Math.round(score), 0, 100);

  let tier = "faible";
  if (score >= 75) tier = "élevé";
  else if (score >= 45) tier = "modéré";

  reasons.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  return {
    score,
    tier,
    topReasons: reasons.slice(0, 3),
    debug: { totalToday, totalGlobal, intents7, pressure, loop, trend }
  };
};

/* ---------------------------------------------------------
   PROFILE
   --------------------------------------------------------- */

Analytics.computeProfile = function ({ events }) {
  const allow = events.filter(e => e.mode === "allow" && Number.isFinite(e.minutes));
  if (allow.length < 6) {
    return { traits: [], summary: "Pas assez de données (min. 6 sessions)." };
  }

  const isWeekday = (d) => { const day = d.getDay(); return day >= 1 && day <= 5; };
  let night = 0, work = 0, auto = 0, shortB = 0, longB = 0, total = 0;

  for (const e of allow) {
    const d = new Date(e.ts || Date.now());
    const h = d.getHours();
    const m = e.minutes || 0;
    total++;
    if (h >= 22) night++;
    if (isWeekday(d) && h >= 9 && h <= 18) work++;
    if (e.intent === "auto") auto++;
    if (m > 0 && m <= 3) shortB++;
    if (m >= 12) longB++;
  }

  const pct = (x) => Math.round((x / total) * 100);
  const traits = [];

  if (pct(night) >= 30) traits.push({ key: "night", label: `Night scroller (${pct(night)}%)` });
  if (pct(work) >= 35) traits.push({ key: "work", label: `Work-hours leak (${pct(work)}%)` });
  if (pct(auto) >= 40) traits.push({ key: "auto", label: `Auto bias (${pct(auto)}%)` });
  if (pct(shortB) >= 40) traits.push({ key: "short", label: `Short bursts (${pct(shortB)}%)` });
  if (pct(longB) >= 20) traits.push({ key: "long", label: `Long binges (${pct(longB)}%)` });

  if (traits.length === 0) traits.push({ key: "stable", label: "Profil stable" });

  return {
    traits,
    summary: traits.map(t => t.label).join(" · ")
  };
};

/* ---------------------------------------------------------
   ACTION PERFORMANCE
   --------------------------------------------------------- */

Analytics.actionPerformance = function (events) {
  const outcomes = events.filter(e => e.mode === "outcome");
  const stats = {
    primary: { done: 0, partial: 0, ignored: 0 },
    alt1: { done: 0, partial: 0, ignored: 0 },
    alt2: { done: 0, partial: 0, ignored: 0 }
  };

  for (const o of outcomes) {
    const key = o.actionKey;
    const res = o.result;
    if (!stats[key]) continue;
    if (res !== "done" && res !== "partial" && res !== "ignored") continue;
    stats[key][res]++;
  }

  function score(s) {
    const total = s.done + s.partial + s.ignored;
    if (total === 0) return 0;
    return (s.done * 2 + s.partial * 1 - s.ignored * 2) / total;
  }

  return {
    primary: score(stats.primary),
    alt1: score(stats.alt1),
    alt2: score(stats.alt2)
  };
};

window.Analytics = Analytics;
