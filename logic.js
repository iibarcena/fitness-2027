(function (root) {
  'use strict';

  // Día en que empezó el objetivo (el día que se instaló la app). Se puede cambiar desde la app.
  var DEFAULT_START = '2026-11-10';
  var DAYS_IN_YEAR = 365;      // año normal; los bisiestos se calculan con daysInYear()
  var MAX_GOAL = 365;
  // Deportes por defecto. goal=true: lleva objetivo (suma al total); annual = plan en días al año.
  var DEFAULT_SPORTS = [
    { id: 'gym', name: 'Gym', emoji: '🏋️', color: '#4f8cff', goal: true, annual: 64 },
    { id: 'run', name: 'Correr', emoji: '🏃', color: '#ff8a3d', goal: true, annual: 23 },
    { id: 'swim', name: 'Nadar', emoji: '🏊', color: '#22b8cf', goal: true, annual: 19 },
    { id: 'football', name: 'Fútbol', emoji: '⚽', color: '#40c057', goal: false, annual: 0 },
    { id: 'padel', name: 'Pádel', emoji: '🎾', color: '#e64980', goal: false, annual: 0 }
  ];
  var ACTS = DEFAULT_SPORTS;
  var PALETTE = ['#a78bfa', '#f59e0b', '#14b8a6', '#f43f5e', '#84cc16', '#38bdf8', '#d946ef', '#fb923c'];

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

  // Días con cada deporte en un mes concreto (m: 0-11).
  function monthDayCounts(days, y, m, sports) {
    sports = sports || DEFAULT_SPORTS;
    var prefix = y + '-' + pad(m + 1) + '-';
    var out = {};
    sports.forEach(function (a) { out[a.id] = 0; });
    Object.keys(days).forEach(function (k) {
      if (k.indexOf(prefix) === 0) {
        days[k].forEach(function (id) { if (id in out) out[id]++; });
      }
    });
    out.total = 0;
    sports.forEach(function (a) { if (a.goal) out.total += out[a.id]; });
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

  function goalSports(sports) { return (sports || DEFAULT_SPORTS).filter(function (a) { return a.goal; }); }

  function sumGoals(g, sports) {
    var t = 0;
    goalSports(sports).forEach(function (a) { t += g[a.id] || 0; });
    return t;
  }

  // Plan anual repartido en proporción a los días del periodo (para el primer tramo, más corto).
  function prorated(year, startISO, sports) {
    var n = periodDays(year, startISO), dim = daysInYear(year), out = {};
    goalSports(sports).forEach(function (a) { out[a.id] = Math.round(a.annual * n / dim); });
    return out;
  }

  function annualGoals(sports) {
    var out = {};
    goalSports(sports).forEach(function (a) { out[a.id] = a.annual; });
    return out;
  }

  var ID_RE = /^[a-z0-9_-]{1,30}$/;

  // Valida objetivos guardados: {idDeporte: días}. Devuelve un objeto (puede faltar algún deporte) o null.
  function sanitizeGoals(g) {
    if (!g || typeof g !== 'object' || Array.isArray(g)) return null;
    var out = {}, any = false;
    Object.keys(g).forEach(function (id) {
      var v = g[id];
      if (!ID_RE.test(id) || v === null || v === undefined || v === '' || typeof v === 'boolean') return;
      var n = Math.round(Number(v));
      if (!isFinite(n)) return;
      out[id] = Math.min(Math.max(n, 0), MAX_GOAL);
      any = true;
    });
    return any ? out : null;
  }

  // Objetivos guardados por año: {"2026": {gym: 9, ...}}. Devuelve {} si no hay nada válido.
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

  // Valida la lista de deportes. Devuelve la lista limpia o null si no es una lista.
  function sanitizeSports(arr) {
    if (!Array.isArray(arr)) return null;
    var seen = {}, out = [];
    arr.forEach(function (a) {
      if (!a || typeof a !== 'object' || !ID_RE.test(a.id) || seen[a.id]) return;
      var name = typeof a.name === 'string' ? a.name.trim().slice(0, 20) : '';
      if (!name) return;
      var emoji = typeof a.emoji === 'string' && a.emoji.trim() ? a.emoji.trim().slice(0, 8) : '🏅';
      var color = typeof a.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(a.color) ? a.color : '#a78bfa';
      var annual = Math.min(Math.max(Math.round(Number(a.annual)) || 0, 0), MAX_GOAL);
      seen[a.id] = 1;
      out.push({ id: a.id, name: name, emoji: emoji, color: color, goal: !!a.goal, annual: a.goal ? annual : 0 });
    });
    return out;
  }

  // Crea un identificador a partir del nombre ("Yoga suave" -> "yoga-suave").
  function slug(name) {
    var t = String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
    return t || 'deporte';
  }

  // Objetivos de un periodo, deporte a deporte.
  // - Periodo recortado (el primero): el suyo guardado, o el plan anual repartido en proporción.
  // - Año completo: el del último año completo anterior que lo tenga, o el plan anual.
  function goalsForYear(map, year, startISO, sports) {
    startISO = startISO || DEFAULT_START;
    map = map || {};
    var partial = isPartial(year, startISO);
    var pr = partial ? prorated(year, startISO, sports) : annualGoals(sports);
    var out = {};
    goalSports(sports).forEach(function (a) {
      var v = null;
      if (partial) {
        var g = sanitizeGoals(map[year]);
        if (g && a.id in g) v = g[a.id];
      } else {
        var best = null;
        Object.keys(map).forEach(function (k) {
          var y = Number(k), g2 = sanitizeGoals(map[k]);
          if (y <= year && !isPartial(y, startISO) && g2 && a.id in g2 && (best === null || y > best)) best = y;
        });
        if (best !== null) v = sanitizeGoals(map[best])[a.id];
      }
      out[a.id] = v === null ? pr[a.id] : v;
    });
    return out;
  }

  // Valida una fecha de inicio "AAAA-MM-DD". Devuelve la misma fecha o null.
  function sanitizeStart(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var d = parseISO(s);
    if (iso(d) !== s) return null;
    if (d.getFullYear() < 2020 || d.getFullYear() > 2100) return null;
    return s;
  }

  function summary(days, ref, goals, year, startISO, sports) {
    startISO = startISO || DEFAULT_START;
    sports = sports || DEFAULT_SPORTS;
    year = year || startYear(startISO);
    var total = periodDays(year, startISO);
    var refISO = iso(ref);
    var el = elapsedDays(ref, year, startISO);
    var out = { elapsed: el, year: year, periodDays: total, bySport: {}, counts: {} };
    var tot = 0, goalTot = 0;
    sports.forEach(function (a) {
      var done = countUpTo(days, a.id, refISO, year, startISO);
      if (a.goal) {
        var g = Math.min(Math.max(Math.round(Number(goals && goals[a.id])) || 0, 0), MAX_GOAL);
        tot += done; goalTot += g;
        out.bySport[a.id] = analyze(done, g, el, total);
      } else {
        out.counts[a.id] = done;
      }
    });
    out.total = analyze(tot, goalTot, el, total);
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
    var days = {};
    Object.keys(obj.days).forEach(function (k) {
      var v = obj.days[k];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !Array.isArray(v)) return;
      var f = v.filter(function (id, i) { return typeof id === 'string' && ID_RE.test(id) && v.indexOf(id) === i; });
      if (f.length) days[k] = f;
    });
    return days;
  }

  var api = {
    DEFAULT_START: DEFAULT_START, DAYS_IN_YEAR: DAYS_IN_YEAR, ACTS: ACTS, DEFAULT_SPORTS: DEFAULT_SPORTS, PALETTE: PALETTE,
    MAX_GOAL: MAX_GOAL, goalSports: goalSports, annualGoals: annualGoals, sumGoals: sumGoals, sanitizeGoals: sanitizeGoals,
    sanitizeGoalsByYear: sanitizeGoalsByYear, sanitizeSports: sanitizeSports, slug: slug,
    goalsForYear: goalsForYear, prorated: prorated,
    sanitizeStart: sanitizeStart, daysInYear: daysInYear, startYear: startYear, periodStartISO: periodStartISO,
    isPartial: isPartial, periodDays: periodDays, objectiveYear: objectiveYear,
    pad: pad, iso: iso, parseISO: parseISO, elapsedDays: elapsedDays, countUpTo: countUpTo,
    monthDayCounts: monthDayCounts, analyze: analyze, weeksToCatchUp: weeksToCatchUp,
    summary: summary, fmt: fmt, sanitizeImport: sanitizeImport
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof self !== 'undefined' ? self : this);
