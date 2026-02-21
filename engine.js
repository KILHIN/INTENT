/* =========================================================
ENGINE — V3 Multi-app
Pure logic. No DOM. No Storage.
========================================================= */

const Engine = {};

/* ———————————————————

1. TIME HELPERS
   ——————————————————— */

Engine.todayKey = function () {
return new Date().toDateString();
};

Engine.last7DaysMap = function (events, appId = null) {
const data = {};
const now = new Date();

for (let i = 6; i >= 0; i–) {
const d = new Date();
d.setDate(now.getDate() - i);
data[d.toDateString()] = 0;
}

events
.filter(e => appId ? e.app === appId : true)
.forEach(e => {
if (data[e.date] !== undefined) {
data[e.date] += (e.minutes || 0);
}
});

return data;
};

Engine.totalToday = function (events, appId = null) {
const today = this.todayKey();
return events
.filter(e => e.date === today && (appId ? e.app === appId : true))
.reduce((sum, e) => sum + (e.minutes || 0), 0);
};

// Total scroll toutes apps confondues aujourd’hui
Engine.totalTodayAllApps = function (events) {
return this.totalToday(events, null);
};

// Total par app aujourd’hui — retourne un objet { instagram: 12, youtube: 34, … }
Engine.totalTodayByApp = function (events) {
const result = {};
for (const appId of APP_IDS) {
result[appId] = this.totalToday(events, appId);
}
return result;
};

/* ———————————————————
2) TREND & STATE
——————————————————— */

Engine.trendPrediction = function (events, orangeThresh, redThresh, appId = null) {
const values = Object.values(this.last7DaysMap(events, appId));
const sum = values.reduce((a, b) => a + b, 0);
const avg = sum / values.length;

const prev3 = (values[0] + values[1] + values[2]) / 3;
const last3 = (values[4] + values[5] + values[6]) / 3;
const delta = last3 - prev3;

let trendText = “Tendance: stable.”;
if (delta > 5) trendText = “Tendance: augmentation.”;
else if (delta < -5) trendText = “Tendance: baisse.”;

let risk = “faible”;
if (avg >= redThresh) risk = “élevé”;
else if (avg >= orangeThresh) risk = “modéré”;

return {
avg: Math.round(avg),
weeklyProjection: Math.round(avg * 7),
trendText,
risk
};
};

Engine.stateFromThresholds = function (totalToday, avg7, orangeThresh, redThresh) {
if (totalToday >= redThresh || avg7 >= redThresh) return “RED”;
if (totalToday >= orangeThresh || avg7 >= orangeThresh) return “ORANGE”;
return “GREEN”;
};

// État global toutes apps — utilise le seuil le plus contraignant déclenché
Engine.globalState = function (events) {
let worst = “GREEN”;
for (const appId of APP_IDS) {
const cfg = APP_CONFIG[appId];
const total = this.totalToday(events, appId);
const trend = this.trendPrediction(events, cfg.thresholds.orange, cfg.thresholds.red, appId);
const state = this.stateFromThresholds(total, trend.avg, cfg.thresholds.orange, cfg.thresholds.red);
if (state === “RED”) { worst = “RED”; break; }
if (state === “ORANGE”) worst = “ORANGE”;
}
return worst;
};

/* ———————————————————
3) INTENT & PRESSURE
——————————————————— */

Engine.intentStats7d = function (events, appId = null) {
const now = Date.now();
const windowMs = 7 * 24 * 60 * 60 * 1000;

const recent = events.filter(e =>
e.intent &&
e.ts &&
(now - e.ts <= windowMs) &&
(appId ? e.app === appId : true)
);

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
const coach = events.filter(e => e.mode === “coach”);
const total = coach.length;
if (total < 5) return 0;

const easy = coach.filter(e => e.choice && e.choice !== “primary”).length;
const easyRate = easy / total;

if (easyRate >= 0.75) return 3;
if (easyRate >= 0.60) return 2;
if (easyRate >= 0.45) return 1;
return 0;
};

/* ———————————————————
4) COACH
——————————————————— */

Engine.coachSuggestion = function ({ events, appId = null, openPings = [], nowDate = new Date() }) {
const appCfg = appId ? APP_CONFIG[appId] : null;
const thresholds = appCfg
? { THRESH_ORANGE: appCfg.thresholds.orange, THRESH_RED: appCfg.thresholds.red }
: { THRESH_ORANGE: 30, THRESH_RED: 60 };

const risk = Analytics.computeRisk({ events, thresholds, openPings, now: nowDate, appId });
const profile = Analytics.computeProfile({ events });
const performance = Analytics.actionPerformance
? Analytics.actionPerformance(events)
: { primary: 0, alt1: 0, alt2: 0 };

const actions = {
primary: “10 min — tâche unique, téléphone hors pièce.”,
alt1: “10 min — marche sans téléphone.”,
alt2: “5 min — respiration 4/6.”
};

let baseKey = “primary”;
if (risk.score >= 65) baseKey = “alt1”;
else if (profile.traits.some(t => t.key === “night”)) baseKey = “alt2”;

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
profileTraits: profile.traits.map(t => t.key).join(”, “) || “stable”,
scores,
finalKey,
actions
};
};

/* ———————————————————
EXPORT
——————————————————— */

window.Engine = Engine;