/* =========================================================
   ENGINE — Analytics & Decision Core
   Pure logic. No DOM. No Storage.
   ========================================================= */

const Engine = {};

Engine.todayKey = function () {
  return new Date().toDateString();
};

Engine.last7DaysMap = function (events) {
  const data = {};
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    data[d.toDateString()] = 0;
  }

  events.forEach(e => {
    if (data[e.date] !== undefined) {
      data[e.date] += (e.minutes || 0);
    }
  });

  return data;
};

Engine.totalToday = function (events) {
  const today = this.todayKey();
  return events
    .filter(e => e.date === today)
    .reduce((sum, e) => sum + (e.minutes || 0), 0);
};

Engine.trendPrediction = function (events, THRESH_ORANGE, THRESH_RED) {
  const values = Object.values(this.last7DaysMap(events));
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;

  const prev3 = (values[0] + values[1] + values[2]) / 3;
  const last3 = (values[4] + values[5] + values[6]) / 3;
  const delta = last3 - prev3;

  let trendText = "Tendance: stable.";
  if (delta > 5) trendText = "Tendance: augmentation.";
  else if (delta < -5) trendText = "Tendance: baisse.";

  let risk = "faible";
  if (avg >= THRESH_RED) risk = "élevé";
  else if (avg >= THRESH_ORANGE) risk = "modéré";

  return {
    avg: Math.round(avg),
    weeklyProjection: Math.round(avg * 7),
    trendText,
    risk
  };
};

Engine.stateFromThresholds = function (totalToday, avg7, THRESH_ORANGE, THRESH_RED) {
  if (totalToday >= THRESH_RED || avg7 >= THRESH_RED) return "RED";
  if (totalToday >= THRESH_ORANGE || avg7 >= THRESH_ORANGE) return "ORANGE";
  return "GREEN";
};

Engine.intentStats7d = function (events) {
  const now = Date.now();
  const windowMs = 7 * 24 * 60 * 60 * 1000;

  const recent = events.filter(e => e.intent && e.ts && (now - e.ts <= windowMs));

  const counts = { reply: 0, fun: 0, auto: 0, total: 0 };
  recent.forEach(e => {
    if (counts[e.intent] !== undefined) counts[e.intent]++;
    counts.total++;
  });

  const pct = n => counts.total === 0 ? 0 : Math.round((n / counts.total) * 100);

  return {
    total: counts.total,
    pReply: pct(counts.reply),
    pFun: pct(counts.fun),
    pAuto: pct(counts.auto)
  };
};

Engine.jarvisPressure = function (events) {
  const coach = events.filter(e => e.mode === "coach");
  const total = coach.length;
  if (total < 5) return 0;

  const easy = coach.filter(e => e.choice && e.choice !== "primary").length;
  const easyRate = easy / total;

  if (easyRate >= 0.75) return 3;
  if (easyRate >= 0.60) return 2;
  if (easyRate >= 0.45) return 1;
  return 0;
};

Engine.coachSuggestion = function ({ events, thresholds, openPings = [], nowDate = new Date() }) {
  const { THRESH_ORANGE, THRESH_RED } = thresholds;

  const risk = Analytics.computeRisk({ events, thresholds, openPings, now: nowDate });
  const profile = Analytics.computeProfile({ events });
  const performance = Analytics.actionPerformance
    ? Analytics.actionPerformance(events)
    : { primary: 0, alt1: 0, alt2: 0 };

  const actions = {
    primary: "10 min — tâche unique, téléphone hors pièce.",
    alt1: "10 min — marche sans téléphone.",
    alt2: "5 min — respiration 4/6."
  };

  let baseKey = "primary";
  if (risk.score >= 65) baseKey = "alt1";
  else if (profile.traits.some(t => t.key === "night")) baseKey = "alt2";

  const scores = {
    primary: performance.primary,
    alt1: performance.alt1,
    alt2: performance.alt2
  };

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  let finalKey = baseKey;
  if (scores[best] > scores[baseKey] + 0.5) finalKey = best;

  return {
    riskScore: risk.score,
    riskTier: risk.tier,
    profileTraits: profile.traits.map(t => t.key).join(", ") || "stable",
    scores,
    finalKey,
    actions
  };
};

window.Engine = Engine;
