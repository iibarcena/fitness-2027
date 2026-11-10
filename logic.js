(function (root) {
  'use strict';

  var FIRST_YEAR = 2027;       // primer año con objetivo
  var YEAR = FIRST_YEAR;       // (por compatibilidad)
  var DAYS_IN_YEAR = 365;      // año normal; los bisiestos se calculan con daysInYear()
  var MAX_GOAL = 365;
  // Objetivos del plan inicial (días al año). El total es siempre la suma de los tres.
  var DEFAULT_GOALS = { gym: 64, run: 23, swim: 19 };
  var GOALS = DEFAULT_GOALS;
  var GOAL_TOTAL = 106;

  var ACTS = [
    { id: 'gym', name: 'Gym', emoji: '🏋️', color: '#4f8cff' },
    { id: 'run', name: 'Correr', emoji: '🏃', color: '#ff8a3d' },
    { id: 'swim', name: 'Nadar', emoji: '🏊', color: '#22b8cf' },
    { id: 'football', name: 'Fútbol', emoji: '⚽', color: '#40c057' },
    { id: 'padel', name: 'Pádel', emoji: '🎾', color: '#e64980' }
  ];

  function pad(n) { return String(n).padStart(2, '0'); }

  function iso(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseISO(s) {
    var p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function daysInYear(y) {
    return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;
  }

  // Año del objetivo en curso: 2027 hasta que empiece, y el año actual a partir de entonces.
  function objectiveYear(now) { return Math.max(FIRST_YEAR, now.getFullYear()); }

  // Días transcurridos del año del objetivo, contando el día de "ref" (0 si el año no ha empezado).
  function elapsedDays(ref, year) {
    year = year || FIRST_YEAR;
    var dim = daysInYear(year);
    if (ref.getFullYear() < year) return 0;
    if (ref.getFullYear() > year) return dim;
    var start = new Date(year, 0, 1);
    var r = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    var n = Math.round((r - start) / 86400000) + 1;
    return Math.min(Math.max(n, 0), dim);
  }

  // Cuántos días de ese año tienen esa actividad, hasta refISO incluido.
  function countUpTo(days, id, refISO, year) {
    year = year || FIRST_YEAR;
    var from = year + '-01-01';
    var to = year + '-12-31';
    var c = 0;
    Object.keys(days).forEach(function (k) {
      if (k >= from && k <= to && k <= refISO && days[k].indexOf(id) >= 0) c++;
    });
    return c;
  }

  // Días con cada actividad en un mes concreto (m: 0-11).
  function monthDayCounts(days, y, m) {
    var prefix = y + '-' + pad(m + 1) + '-';
    var out = {};
    ACTS.forEach(function (a) { out[a.id] = 0; });
    Object.keys(days).forEach(function (k) {
      if (k.indexOf(prefix) === 0) {
        days[k].forEach(function (id) { if (id in out) out[id]++; });
      }
    });
    out.total = out.gym + out.run + out.swim;
    return out;
  }

  // Compara lo hecho con lo que tocaría llevar a esa fecha (objetivo repartido por días del año).
  function analyze(done, goal, elapsed, total) {
    total = total || DAYS_IN_YEAR;
    var rate = goal / total;
    var expected = goal * elapsed / total;
    var diff = done - expected;
    var res = {
      done: done, goal: goal, rate: rate, expected: expected, diff: diff,
      weeklyPace: rate * 7, status: 'ok', missing: 0, daysInARow: 0, skipDays: 0
    };
    if (!(goal > 0)) {
      res.status = 'nogoal';
    } else if (elapsed === 0) {
      res.status = 'notstarted';
    } else if (diff <= -0.5) {
      var deficit = -diff;
      res.status = 'below';
      res.missing = Math.ceil(deficit - 1e-9);
      // Yendo 1 sesión cada día, el ritmo esperado también sube cada día: n >= deficit / (1 - rate)
      res.daysInARow = Math.ceil(deficit / (1 - rate) - 1e-9);
    } else if (diff >= 0.5) {
      res.status = 'above';
      // Cada día sin ir, el ritmo esperado sube "rate": puedes faltar diff / rate días.
      res.skipDays = Math.floor(diff / rate + 1e-9);
    }
    return res;
  }

  // Semanas para ponerse al día haciendo "extra" sesiones por semana sobre el ritmo esperado.
  function weeksToCatchUp(deficit, extraPerWeek) {
    return Math.ceil(deficit / extraPerWeek - 1e-9);
  }

  function sumGoals(g) { return g.gym + g.run + g.swim; }

  function copyDefaults() { return { gym: DEFAULT_GOALS.gym, run: DEFAULT_GOALS.run, swim: DEFAULT_GOALS.swim }; }

  // Valida objetivos (de la memoria del móvil o de una copia). Devuelve {gym, run, swim} o null si no valen.
  function sanitizeGoals(g) {
    if (!g || typeof g !== 'object') return null;
    var out = {};
    var ok = ['gym', 'run', 'swim'].every(function (id) {
      var v = g[id];
      if (v === null || v === undefined || v === '' || typeof v === 'boolean') return false;
      var n = Math.round(Number(v));
      if (!isFinite(n)) return false;
      out[id] = Math.min(Math.max(n, 0), MAX_GOAL);
      return true;
    });
    return ok ? out : null;
  }

  // Objetivos guardados por año: {"2027": {gym, run, swim}, "2028": {...}}. Devuelve {} si no hay nada válido.
  function sanitizeGoalsByYear(obj) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.keys(obj).forEach(function (k) {
      if (!/^\d{4}$/.test(k)) return;
      var y = Number(k);
      if (y < FIRST_YEAR || y > 2100) return;
      var g = sanitizeGoals(obj[k]);
      if (g) out[k] = g;
    });
    return out;
  }

  // Objetivos de un año: los suyos, o si no tiene, los del último año anterior que los tuviera, o los iniciales.
  function goalsForYear(map, year) {
    var best = null;
    Object.keys(map || {}).forEach(function (k) {
      var y = Number(k);
      if (y <= year && (best === null || y > best)) best = y;
    });
    if (best === null) return copyDefaults();
    return sanitizeGoals(map[best]) || copyDefaults();
  }

  // Días que faltan para el 1 de enero del primer año del objetivo (0 si ya ha empezado).
  function daysUntilStart(now) {
    var start = new Date(FIRST_YEAR, 0, 1);
    var n = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.round((start - n) / 86400000));
  }

  function summary(days, ref, goals, year) {
    year = year || FIRST_YEAR;
    var g = sanitizeGoals(goals) || DEFAULT_GOALS;
    var dim = daysInYear(year);
    var refISO = iso(ref);
    var el = elapsedDays(ref, year);
    var out = { elapsed: el, year: year };
    var tot = 0;
    ['gym', 'run', 'swim'].forEach(function (id) {
      var done = countUpTo(days, id, refISO, year);
      tot += done;
      out[id] = analyze(done, g[id], el, dim);
    });
    out.total = analyze(tot, sumGoals(g), el, dim);
    out.football = countUpTo(days, 'football', refISO, year);
    out.padel = countUpTo(days, 'padel', refISO, year);
    return out;
  }

  function fmt(n) {
    var s = (Math.round(n * 10) / 10).toFixed(1);
    if (s.slice(-2) === '.0') s = s.slice(0, -2);
    return s.replace('.', ',');
  }

  // Valida una copia de seguridad importada. Devuelve {fecha: [ids]} o null si no es válida.
  function sanitizeImport(obj) {
    if (!obj || typeof obj !== 'object' || !obj.days || typeof obj.days !== 'object') return null;
    var ids = ACTS.map(function (a) { return a.id; });
    var days = {};
    Object.keys(obj.days).forEach(function (k) {
      var v = obj.days[k];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !Array.isArray(v)) return;
      var f = ids.filter(function (id) { return v.indexOf(id) >= 0; });
      if (f.length) days[k] = f;
    });
    return days;
  }

  var api = {
    FIRST_YEAR: FIRST_YEAR, YEAR: YEAR, DAYS_IN_YEAR: DAYS_IN_YEAR, GOALS: GOALS, GOAL_TOTAL: GOAL_TOTAL, ACTS: ACTS,
    DEFAULT_GOALS: DEFAULT_GOALS, MAX_GOAL: MAX_GOAL, sumGoals: sumGoals, sanitizeGoals: sanitizeGoals,
    sanitizeGoalsByYear: sanitizeGoalsByYear, goalsForYear: goalsForYear, daysUntilStart: daysUntilStart,
    daysInYear: daysInYear, objectiveYear: objectiveYear,
    pad: pad, iso: iso, parseISO: parseISO, elapsedDays: elapsedDays, countUpTo: countUpTo,
    monthDayCounts: monthDayCounts, analyze: analyze, weeksToCatchUp: weeksToCatchUp,
    summary: summary, fmt: fmt, sanitizeImport: sanitizeImport
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof self !== 'undefined' ? self : this);
