(function (root) {
  'use strict';

  // Día en que empezó el objetivo (el día que se instaló la app). Se puede cambiar desde la app.
  var DEFAULT_START = '2026-11-10';
  var DAYS_IN_YEAR = 365;      // año normal; los bisiestos se calculan con daysInYear()
  var MAX_GOAL = 365;
  // Plan anual (días al año). El total es siempre la suma de los tres.
  var DEFAULT_GOALS = { gym: 64, run: 23, swim: 19 };

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

  /* ---------- Periodos ----------
     El primer periodo va desde el día de inicio hasta el 31 de diciembre de ese año.
     Cada 1 de enero empieza un año nuevo desde cero. */

  function startYear(startISO) { return Number(startISO.slice(0, 4)); }

  function periodStartISO(year, startISO) {
    return year === startYear(startISO) ? startISO : year + '-01-01';
  }

  // ¿Es un periodo recortado (empieza después del 1 de enero)?
  function isPartial(year, startISO) {
    return periodStartISO(year, startISO) !== year + '-01-01';
  }

  // Días que dura el periodo de ese año (del inicio al 31 de diciembre).
  function periodDays(year, startISO) {
    var a = parseISO(periodStartISO(year, startISO));
    var b = new Date(year, 11, 31);
    return Math.round((b - a) / 86400000) + 1;
  }

  // Año del periodo en curso: el del inicio hasta que acabe, y después el año actual.
  function objectiveYear(now, startISO) { return Math.max(startYear(startISO), now.getFullYear()); }

  // Días transcurridos del periodo, contando el día de "ref" (0 si aún no ha empezado).
  function elapsedDays(ref, year, startISO) {
    var total = periodDays(year, startISO);
    var ps = parseISO(periodStartISO(year, startISO));
    var r = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    if (r < ps) return 0;
    if (r.getFullYear() > year) return total;
    var n = Math.round((r - ps) / 86400000) + 1;
    return Math.min(Math.max(n, 0), total);
  }

  // Cuántos días del periodo tienen esa actividad, hasta refISO incluido.
  function countUpTo(days, id, refISO, year, startISO) {
    var from = periodStartISO(year, startISO);
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

  // Compara lo hecho con lo que tocaría llevar a esa fecha (objetivo repartido por los días del periodo).
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

  // Plan anual repartido en proporción a los días del periodo (para el primer tramo, más corto).
  function prorated(year, startISO) {
    var n = periodDays(year, startISO), dim = daysInYear(year);
    return {
      gym: Math.round(DEFAULT_GOALS.gym * n / dim),
      run: Math.round(DEFAULT_GOALS.run * n / dim),
      swim: Math.round(DEFAULT_GOALS.swim * n / dim)
    };
  }

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

  // Objetivos guardados por año: {"2026": {gym, run, swim}, "2027": {...}}. Devuelve {} si no hay nada válido.
  function sanitizeGoalsByYear(obj) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.keys(obj).forEach(function (k) {
      if (!/^\d{4}$/.test(k)) return;
      var y = Number(k);
      if (y < 2020 || y > 2100) return;
      var g = sanitizeGoals(obj[k]);
      if (g) out[k] = g;
    });
    return out;
  }

  // Objetivos de un periodo.
  // - Periodo recortado (el primero): los suyos, o el plan anual repartido en proporción.
  // - Año completo: los suyos, o los del último año completo anterior, o el plan anual.
  function goalsForYear(map, year, startISO) {
    startISO = startISO || DEFAULT_START;
    map = map || {};
    if (isPartial(year, startISO)) return sanitizeGoals(map[year]) || prorated(year, startISO);
    var best = null;
    Object.keys(map).forEach(function (k) {
      var y = Number(k);
      if (y <= year && !isPartial(y, startISO) && (best === null || y > best)) best = y;
    });
    return (best === null ? null : sanitizeGoals(map[best])) || copyDefaults();
  }

  // Valida una fecha de inicio "AAAA-MM-DD". Devuelve la misma fecha o null.
  function sanitizeStart(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var d = parseISO(s);
    if (iso(d) !== s) return null;
    if (d.getFullYear() < 2020 || d.getFullYear() > 2100) return null;
    return s;
  }

  function summary(days, ref, goals, year, startISO) {
    startISO = startISO || DEFAULT_START;
    year = year || startYear(startISO);
    var g = sanitizeGoals(goals) || DEFAULT_GOALS;
    var total = periodDays(year, startISO);
    var refISO = iso(ref);
    var el = elapsedDays(ref, year, startISO);
    var out = { elapsed: el, year: year, periodDays: total };
    var tot = 0;
    ['gym', 'run', 'swim'].forEach(function (id) {
      var done = countUpTo(days, id, refISO, year, startISO);
      tot += done;
      out[id] = analyze(done, g[id], el, total);
    });
    out.total = analyze(tot, sumGoals(g), el, total);
    out.football = countUpTo(days, 'football', refISO, year, startISO);
    out.padel = countUpTo(days, 'padel', refISO, year, startISO);
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
    DEFAULT_START: DEFAULT_START, DAYS_IN_YEAR: DAYS_IN_YEAR, ACTS: ACTS,
    DEFAULT_GOALS: DEFAULT_GOALS, MAX_GOAL: MAX_GOAL, sumGoals: sumGoals, sanitizeGoals: sanitizeGoals,
    sanitizeGoalsByYear: sanitizeGoalsByYear, goalsForYear: goalsForYear, prorated: prorated,
    sanitizeStart: sanitizeStart, daysInYear: daysInYear, startYear: startYear, periodStartISO: periodStartISO,
    isPartial: isPartial, periodDays: periodDays, objectiveYear: objectiveYear,
    pad: pad, iso: iso, parseISO: parseISO, elapsedDays: elapsedDays, countUpTo: countUpTo,
    monthDayCounts: monthDayCounts, analyze: analyze, weeksToCatchUp: weeksToCatchUp,
    summary: summary, fmt: fmt, sanitizeImport: sanitizeImport
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof self !== 'undefined' ? self : this);
