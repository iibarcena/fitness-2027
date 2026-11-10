(function (root) {
  'use strict';

  var YEAR = 2027;
  var DAYS_IN_YEAR = 365;
  var GOALS = { gym: 64, run: 23, swim: 19 };
  var GOAL_TOTAL = 106;

  var ACTS = [
    { id: 'gym', name: 'Gym', emoji: '🏋️', color: '#4f8cff', goal: 64 },
    { id: 'run', name: 'Correr', emoji: '🏃', color: '#ff8a3d', goal: 23 },
    { id: 'swim', name: 'Nadar', emoji: '🏊', color: '#22b8cf', goal: 19 },
    { id: 'football', name: 'Fútbol', emoji: '⚽', color: '#40c057', goal: null },
    { id: 'padel', name: 'Pádel', emoji: '🎾', color: '#e64980', goal: null }
  ];

  function pad(n) { return String(n).padStart(2, '0'); }

  function iso(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseISO(s) {
    var p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  // Días transcurridos del año del objetivo, contando el día de "ref" (0 si el año no ha empezado).
  function elapsedDays(ref) {
    if (ref.getFullYear() < YEAR) return 0;
    if (ref.getFullYear() > YEAR) return DAYS_IN_YEAR;
    var start = new Date(YEAR, 0, 1);
    var r = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    var n = Math.round((r - start) / 86400000) + 1;
    return Math.min(Math.max(n, 0), DAYS_IN_YEAR);
  }

  // Cuántos días del año del objetivo tienen esa actividad, hasta refISO incluido.
  function countUpTo(days, id, refISO) {
    var from = YEAR + '-01-01';
    var to = YEAR + '-12-31';
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
  function analyze(done, goal, elapsed) {
    var rate = goal / DAYS_IN_YEAR;
    var expected = goal * elapsed / DAYS_IN_YEAR;
    var diff = done - expected;
    var res = {
      done: done, goal: goal, rate: rate, expected: expected, diff: diff,
      weeklyPace: rate * 7, status: 'ok', missing: 0, daysInARow: 0, skipDays: 0
    };
    if (elapsed === 0) {
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

  function summary(days, ref) {
    var refISO = iso(ref);
    var el = elapsedDays(ref);
    var out = { elapsed: el };
    var tot = 0;
    ['gym', 'run', 'swim'].forEach(function (id) {
      var done = countUpTo(days, id, refISO);
      tot += done;
      out[id] = analyze(done, GOALS[id], el);
    });
    out.total = analyze(tot, GOAL_TOTAL, el);
    out.football = countUpTo(days, 'football', refISO);
    out.padel = countUpTo(days, 'padel', refISO);
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
    YEAR: YEAR, DAYS_IN_YEAR: DAYS_IN_YEAR, GOALS: GOALS, GOAL_TOTAL: GOAL_TOTAL, ACTS: ACTS,
    pad: pad, iso: iso, parseISO: parseISO, elapsedDays: elapsedDays, countUpTo: countUpTo,
    monthDayCounts: monthDayCounts, analyze: analyze, weeksToCatchUp: weeksToCatchUp,
    summary: summary, fmt: fmt, sanitizeImport: sanitizeImport
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof self !== 'undefined' ? self : this);
