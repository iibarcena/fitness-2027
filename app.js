(function () {
  'use strict';

  var L = window.Logic;
  var ACTS = L.ACTS, FIRST_YEAR = L.FIRST_YEAR, iso = L.iso, parseISO = L.parseISO, pad = L.pad, fmt = L.fmt;

  var KEY = 'fitness2027.v1';
  var BK = 'fitness2027.lastBackup';
  var GK = 'fitness2027.goals.v1';   // objetivos por año: {"2027": {gym, run, swim}}
  var MIN = { y: 2026, m: 10 };      // noviembre 2026 (para pruebas)

  var days = load();
  var goalsByYear = loadGoals();
  var today = new Date();
  var selected = iso(today);
  var tab = 'days';

  // Año del objetivo en curso: 2027 hasta que empiece y, después, el año actual.
  function objYear() { return L.objectiveYear(new Date()); }
  function maxMonth() { return { y: objYear(), m: 11 }; }
  function goalsFor(year) { return L.goalsForYear(goalsByYear, year); }

  function clampMonth(mm) {
    var v = mm.y * 12 + mm.m;
    var lo = MIN.y * 12 + MIN.m, mx = maxMonth(), hi = mx.y * 12 + mx.m;
    v = Math.min(Math.max(v, lo), hi);
    return { y: Math.floor(v / 12), m: v % 12 };
  }
  var calMonth = clampMonth({ y: today.getFullYear(), m: today.getMonth() });
  var repMonth = { y: calMonth.y, m: calMonth.m };

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      return L.sanitizeImport(raw) || {};
    } catch (e) { return {}; }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, days: days }));
    } catch (e) {
      alert('No he podido guardar en el móvil. Revisa que Safari no esté en modo privado.');
    }
  }

  function loadGoals() {
    try {
      return L.sanitizeGoalsByYear(JSON.parse(localStorage.getItem(GK)));
    } catch (e) { return {}; }
  }

  function saveGoals() {
    try {
      localStorage.setItem(GK, JSON.stringify(goalsByYear));
    } catch (e) {
      alert('No he podido guardar los objetivos en el móvil. Revisa que Safari no esté en modo privado.');
    }
  }

  function defaultGoals() { return JSON.parse(JSON.stringify(L.DEFAULT_GOALS)); }

  // Cambia un objetivo del año en curso. Los años anteriores conservan los suyos.
  function setGoal(id, value) {
    var y = objYear();
    var g = goalsFor(y);
    var n = Math.round(Number(value));
    if (!isFinite(n)) n = g[id];
    g[id] = Math.min(Math.max(n, 0), L.MAX_GOAL);
    goalsByYear[y] = g;
    saveGoals();
    render();
  }

  function actById(id) { return ACTS.filter(function (a) { return a.id === id; })[0]; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function monthLabel(mm) {
    return cap(new Date(mm.y, mm.m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
  }
  function shiftMonth(mm, d) { return clampMonth({ y: mm.y, m: mm.m + d }); }
  function atMin(mm) { return mm.y * 12 + mm.m <= MIN.y * 12 + MIN.m; }
  function atMax(mm) { var mx = maxMonth(); return mm.y * 12 + mm.m >= mx.y * 12 + mx.m; }

  /* ---------- Pantalla: días ---------- */

  function renderDays() {
    var y = calMonth.y, m = calMonth.m;
    var first = new Date(y, m, 1);
    var offset = (first.getDay() + 6) % 7; // semana empieza en lunes
    var dim = new Date(y, m + 1, 0).getDate();
    var todayISO = iso(new Date());

    var hr = new Date().getHours();
    var greet = hr < 6 ? 'Buenas noches' : hr < 13 ? 'Buenos días' : hr < 21 ? 'Buenas tardes' : 'Buenas noches';
    var html = '<header class="hello"><p class="hi">' + greet + ' 👋</p><h1>¿Qué has entrenado?</h1></header>';
    var cal = '<div class="monthnav">' +
      '<button class="icon" data-act="cal-prev"' + (atMin(calMonth) ? ' disabled' : '') + '>‹</button>' +
      '<h2>' + monthLabel(calMonth) + '</h2>' +
      '<button class="icon" data-act="cal-next"' + (atMax(calMonth) ? ' disabled' : '') + '>›</button></div>';

    cal += '<div class="grid">';
    ['L', 'M', 'X', 'J', 'V', 'S', 'D'].forEach(function (d) { cal += '<div class="wd">' + d + '</div>'; });
    for (var i = 0; i < offset; i++) cal += '<div></div>';
    for (var d = 1; d <= dim; d++) {
      var key = y + '-' + pad(m + 1) + '-' + pad(d);
      var ids = days[key] || [];
      var cls = 'cell';
      if (key === todayISO) cls += ' today';
      if (key === selected) cls += ' sel';
      if (key > todayISO) cls += ' future';
      cal += '<button class="' + cls + '" data-date="' + key + '"><span>' + d + '</span><span class="dots">';
      ids.forEach(function (id) { cal += '<i style="background:' + actById(id).color + '"></i>'; });
      cal += '</span></button>';
    }
    cal += '</div>';

    var sd = parseISO(selected);
    var label = cap(sd.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    var isFuture = selected > todayISO;
    var marked = days[selected] || [];

    html += '<section class="panel"><div class="panelhead"><h3>' + label + '</h3>' +
      (selected !== todayISO ? '<button class="link" data-act="go-today">Ir a hoy</button>' : '') + '</div>';
    if (sd.getFullYear() < FIRST_YEAR) html += '<p class="note">🧪 Prueba: este día no cuenta para el objetivo de ' + FIRST_YEAR + '.</p>';
    if (isFuture) html += '<p class="note">Este día aún no ha llegado.</p>';
    html += '<div class="toggles">';
    ACTS.forEach(function (a) {
      var on = marked.indexOf(a.id) >= 0;
      html += '<button class="tog' + (on ? ' on' : '') + '" style="--c:' + a.color + '" data-toggle="' + a.id + '"' +
        (isFuture ? ' disabled' : '') + '><span class="emoji">' + a.emoji + '</span><span class="tname">' + a.name +
        '</span><span class="check">' + (on ? '✓' : '') + '</span></button>';
    });
    html += '</div></section>';
    return html + cal;
  }

  /* ---------- Pantalla: informe ---------- */

  function bar(a, color) {
    var pct = Math.min(100, a.goal ? a.done / a.goal * 100 : 0);
    var exp = Math.min(100, a.goal ? a.expected / a.goal * 100 : 0);
    return '<div class="bar"><div class="fill" style="width:' + pct + '%;background:' + color + '"></div>' +
      '<div class="mark" style="left:' + exp + '%"></div></div>';
  }

  // mode: 'live' (hasta hoy), 'past' (a una fecha ya pasada) o 'final' (resultado de un año cerrado)
  function statusHTML(a, mode) {
    if (a.status === 'nogoal') return '<p class="muted">Sin objetivo: puedes ponerlo en la pantalla del +.</p>';
    if (a.status === 'notstarted') return '<p class="muted">El objetivo empieza el 1 de enero de ' + FIRST_YEAR + '.</p>';
    if (mode === 'final') {
      if (a.done >= a.goal) {
        return '<p class="ok">🏆 Objetivo cumplido' + (a.done > a.goal ? ' (+' + (a.done - a.goal) + ')' : '') + '</p>';
      }
      return '<p class="down">No llegaste al objetivo: te faltaron ' + (a.goal - a.done) + '.</p>';
    }
    if (mode === 'past') {
      if (a.status === 'ok') return '<p class="ok">✅ Ibas en la media.</p>';
      if (a.status === 'above') return '<p class="up">⬆️ Ibas ' + fmt(a.diff) + ' por encima.</p>';
      return '<p class="down">⬇️ Ibas ' + fmt(-a.diff) + ' por debajo.</p>';
    }
    if (a.status === 'ok') return '<p class="ok">✅ Vas en la media.</p>';
    if (a.status === 'above') {
      return '<p class="up">⬆️ Vas ' + fmt(a.diff) + ' por encima. Puedes estar <b>' + a.skipDays +
        ' días</b> sin hacerlo y seguir en la media.</p>';
    }
    var deficit = -a.diff;
    function w(k) { return L.weeksToCatchUp(deficit, k) + ' sem'; }
    return '<p class="down">⬇️ Vas ' + fmt(deficit) + ' por debajo (te faltan ' + a.missing + ').</p>' +
      '<p class="sub">Para ponerte al día:</p><ul>' +
      '<li>Ir <b>' + a.daysInARow + ' días seguidos</b> (1 sesión al día)</li>' +
      '<li>Sesiones extra cada semana: +½ → ' + w(0.5) + ' · +1 → ' + w(1) + ' · +2 → ' + w(2) + '</li></ul>';
  }

  function paceLine(a, monthCount, mode) {
    return '<p class="sub">' + (mode === 'live' ? 'Deberías llevar ' : 'Tocaba llevar ') + fmt(a.expected) +
      ' · ritmo esperado ≈ ' + fmt(a.weeklyPace) + ' por semana · este mes: ' + monthCount + '</p>';
  }

  function card(title, emoji, color, a, monthCount, mode) {
    return '<section class="card"><div class="cardhead"><h3>' + emoji + ' ' + title + '</h3>' +
      '<span class="big">' + a.done + '<small> / ' + a.goal + '</small></span></div>' +
      bar(a, color) + paceLine(a, monthCount, mode) + statusHTML(a, mode) + '</section>';
  }

  function hero(a, monthCount, mode) {
    return '<section class="hero"><p class="herolabel">🎯 Total · gym + correr + nadar</p>' +
      '<div class="herobig">' + a.done + '<small> / ' + a.goal + '</small></div>' + bar(a, '#1a1005') +
      paceLine(a, monthCount, mode) + statusHTML(a, mode) + '</section>';
  }

  function backupHTML() {
    var last = null;
    try { last = localStorage.getItem(BK); } catch (e) {}
    return '<h4 class="sect">Copia de seguridad</h4><section class="card plain">' +
      '<p class="sub">Tus datos están solo en este móvil. Haz una copia de vez en cuando (por ejemplo, cada mes).</p>' +
      '<p class="sub">Última copia: <b>' + (last ? cap(parseISO(last).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })) : 'nunca') + '</b></p>' +
      '<div class="btns"><button class="btn" data-act="export">Exportar copia</button>' +
      '<button class="btn alt" data-act="import">Importar copia</button></div>' +
      '<input type="file" id="file" accept="application/json,.json" hidden></section>';
  }

  function renderReport() {
    var y = repMonth.y, m = repMonth.m;
    var now = new Date();
    var oy = objYear();
    var vy = Math.max(FIRST_YEAR, y);            // año del objetivo al que pertenece el mes que miras
    var monthStart = new Date(y, m, 1);
    var monthEnd = new Date(y, m + 1, 0);
    var past = monthEnd < now;                   // ¿miras una fecha que ya ha pasado?
    var ref = past ? monthEnd : now;
    var mode = past ? 'past' : 'live';
    var refLabel = past ? 'a final de ' + monthLabel(repMonth).toLowerCase() : 'a hoy';
    var mc = L.monthDayCounts(days, y, m);
    var left = L.daysUntilStart(now);
    var html = '';

    if (left > 0) {
      html += '<section class="banner"><b>🗓️ El objetivo empieza el 1 de enero de ' + FIRST_YEAR + '</b>' +
        '<p>' + (left === 1 ? 'Falta 1 día.' : 'Faltan ' + left + ' días.') +
        ' Lo que marques ahora es de prueba y no cuenta: el 1 de enero todos los contadores empiezan desde cero.</p></section>';
    }

    // Selector de año: aparece cuando ya hay algún año anterior que consultar
    if (oy > FIRST_YEAR) {
      html += '<div class="pills">';
      for (var yy = FIRST_YEAR; yy <= oy; yy++) {
        html += '<button class="pill' + (yy === vy && y >= FIRST_YEAR ? ' active' : '') + '" data-year="' + yy + '">' + yy + '</button>';
      }
      html += '</div>';
    }

    html += '<div class="monthnav">' +
      '<button class="icon" data-act="rep-prev"' + (atMin(repMonth) ? ' disabled' : '') + '>‹</button>' +
      '<h2>' + monthLabel(repMonth) + '</h2>' +
      '<button class="icon" data-act="rep-next"' + (atMax(repMonth) ? ' disabled' : '') + '>›</button></div>';

    // Mes de prueba de 2026 mirado cuando el objetivo ya ha empezado: solo los días de ese mes
    if (y < FIRST_YEAR && left === 0) {
      html += '<p class="note">🧪 Mes de prueba: no cuenta para el objetivo.</p>';
      html += '<h4 class="sect">Este mes (prueba)</h4><section class="card plain">';
      ACTS.forEach(function (a) {
        html += '<div class="row"><span>' + a.emoji + ' ' + a.name + '</span><b>' + mc[a.id] + '</b></div>';
      });
      html += '</section>' + backupHTML();
      return html;
    }

    if (monthStart > now) html += '<p class="note">Este mes aún no ha empezado. Abajo ves el acumulado a hoy.</p>';

    var s = L.summary(days, ref, goalsFor(vy), vy);
    var closed = vy < oy;                         // año ya cerrado
    var isFinal = closed && m === 11 && y === vy; // diciembre de un año cerrado = resultado final
    if (isFinal) mode = 'final';

    var heading = isFinal ? 'Resultado final de ' + vy
      : (s.elapsed === 0 ? 'Objetivos para ' + vy : 'Acumulado de ' + vy + ' ' + refLabel);
    html += '<h4 class="sect">' + heading + '</h4>';
    html += hero(s.total, mc.total, mode);
    html += card('Gym', '🏋️', '#4f8cff', s.gym, mc.gym, mode);
    html += card('Correr', '🏃', '#ff8a3d', s.run, mc.run, mode);
    html += card('Nadar', '🏊', '#22b8cf', s.swim, mc.swim, mode);
    html += '<p class="legend"><span class="lg"></span> La marca vertical es lo que tocaba llevar a esa fecha.</p>';

    html += '<h4 class="sect">Sin objetivo</h4><section class="card plain">' +
      '<div class="row"><span>⚽ Fútbol</span><span>este mes <b>' + mc.football + '</b> · en ' + vy + ' <b>' + s.football + '</b></span></div>' +
      '<div class="row"><span>🎾 Pádel</span><span>este mes <b>' + mc.padel + '</b> · en ' + vy + ' <b>' + s.padel + '</b></span></div></section>';

    html += backupHTML();
    return html;
  }

  /* ---------- Pantalla: objetivos (botón +) ---------- */

  function perWeek(n, year) { return fmt(n * 7 / L.daysInYear(year)); }

  function renderGoals() {
    var gy = objYear();
    var goals = goalsFor(gy);
    var total = L.sumGoals(goals);
    var same = ['gym', 'run', 'swim'].every(function (id) { return goals[id] === L.DEFAULT_GOALS[id]; });
    var html = '<header class="hello"><p class="hi">Tu plan</p><h1>Objetivos de ' + gy + '</h1></header>';

    html += '<section class="hero"><p class="herolabel">🎯 Total al año</p>' +
      '<div class="herobig">' + total + '<small> días</small></div>' +
      '<p class="sub">≈ ' + perWeek(total, gy) + ' por semana, contando el año completo (vacaciones y bajas incluidas). ' +
      'El total es la suma de los tres.</p></section>';

    ['gym', 'run', 'swim'].forEach(function (id) {
      var a = actById(id);
      html += '<section class="card goalrow"><div class="cardhead"><h3>' + a.emoji + ' ' + a.name + '</h3>' +
        '<span class="sub">≈ ' + perWeek(goals[id], gy) + ' por semana</span></div>' +
        '<div class="stepper">' +
        '<button class="step" data-goal="' + id + '" data-d="-1" aria-label="Menos ' + a.name + '"' + (goals[id] <= 0 ? ' disabled' : '') + '>−</button>' +
        '<label class="goalbox"><input class="goalinput" type="number" inputmode="numeric" min="0" max="' + L.MAX_GOAL + '" ' +
        'value="' + goals[id] + '" data-goalinput="' + id + '" aria-label="Días al año de ' + a.name + '"><span>días al año</span></label>' +
        '<button class="step" data-goal="' + id + '" data-d="1" aria-label="Más ' + a.name + '"' + (goals[id] >= L.MAX_GOAL ? ' disabled' : '') + '>+</button>' +
        '</div></section>';
    });

    html += '<p class="legend">Fútbol y pádel no tienen objetivo: solo se cuentan los días.</p>';
    html += '<p class="legend">Si cambias un objetivo, el informe recalcula todo el año con el objetivo nuevo, ' +
      'como si hubiera sido ese desde el 1 de enero.</p>';
    html += '<p class="legend">Cada 1 de enero empieza un año nuevo desde cero con estos mismos objetivos, que podrás cambiar. ' +
      'Los informes de años anteriores conservan los objetivos que tenían.</p>';
    html += '<div class="btns"><button class="btn alt" data-act="goals-reset"' + (same ? ' disabled' : '') + '>' +
      'Volver al plan inicial (' + L.DEFAULT_GOALS.gym + ' / ' + L.DEFAULT_GOALS.run + ' / ' + L.DEFAULT_GOALS.swim + ')</button></div>';
    return html;
  }

  /* ---------- Render y eventos ---------- */

  function render() {
    var app = document.getElementById('app');
    var scroll = window.scrollY;
    app.innerHTML = tab === 'days' ? renderDays() : tab === 'report' ? renderReport() : renderGoals();
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    window.scrollTo(0, scroll);
    var f = document.getElementById('file');
    if (f) f.addEventListener('change', onFile);
  }

  function toggle(id) {
    if (selected > iso(new Date())) return;
    var a = (days[selected] || []).slice();
    var i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    if (a.length) days[selected] = a; else delete days[selected];
    save();
    render();
  }

  function selectMonthDay(mm) {
    var t = new Date();
    selected = (t.getFullYear() === mm.y && t.getMonth() === mm.m) ? iso(t) : mm.y + '-' + pad(mm.m + 1) + '-01';
  }

  function markBackup() { try { localStorage.setItem(BK, iso(new Date())); } catch (e) {} }

  function exportData() {
    var g = JSON.parse(JSON.stringify(goalsByYear));
    g[objYear()] = goalsFor(objYear());   // la copia siempre lleva los objetivos del año en curso
    var text = JSON.stringify({ version: 2, exported: new Date().toISOString(), goalsByYear: g, days: days }, null, 1);
    var name = 'fitness-copia-' + iso(new Date()) + '.json';
    var file;
    try { file = new File([text], name, { type: 'application/json' }); } catch (e) { file = null; }
    function fallback() {
      var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      var a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      markBackup(); render();
    }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Copia de Fitness' })
        .then(function () { markBackup(); render(); })
        .catch(function (e) { if (!e || e.name !== 'AbortError') fallback(); });
    } else {
      fallback();
    }
  }

  function onFile(ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var parsed = null, gm = null;
      try {
        var raw = JSON.parse(r.result);
        parsed = L.sanitizeImport(raw);
        gm = L.sanitizeGoalsByYear(raw && raw.goalsByYear);
        if (gm && !Object.keys(gm).length) gm = null;
      } catch (e) {}
      if (!parsed) { alert('Ese archivo no es una copia válida de esta app. No he cambiado nada.'); return; }
      var msg = 'Esto reemplaza tus ' + Object.keys(days).length + ' días marcados por los ' +
        Object.keys(parsed).length + ' de la copia.' +
        (gm ? ' También se restauran tus objetivos.' : '') + ' ¿Continuar?';
      if (!confirm(msg)) return;
      days = parsed;
      if (gm) { goalsByYear = gm; saveGoals(); }
      save(); render();
    };
    r.readAsText(f);
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-toggle],[data-date],[data-act],[data-tab],[data-goal],[data-year]');
    if (!t) return;
    if (t.hasAttribute('data-tab')) { tab = t.getAttribute('data-tab'); render(); window.scrollTo(0, 0); return; }
    if (t.hasAttribute('data-goal')) {
      var gid = t.getAttribute('data-goal');
      setGoal(gid, goalsFor(objYear())[gid] + Number(t.getAttribute('data-d')));
      return;
    }
    if (t.hasAttribute('data-year')) {
      var Y = Number(t.getAttribute('data-year'));
      var n = new Date();
      repMonth = Y === objYear() ? clampMonth({ y: n.getFullYear(), m: n.getMonth() }) : { y: Y, m: 11 };
      render();
      return;
    }
    if (t.hasAttribute('data-toggle')) { toggle(t.getAttribute('data-toggle')); return; }
    if (t.hasAttribute('data-date')) { selected = t.getAttribute('data-date'); render(); return; }
    var act = t.getAttribute('data-act');
    if (act === 'cal-prev') { calMonth = shiftMonth(calMonth, -1); selectMonthDay(calMonth); render(); }
    else if (act === 'cal-next') { calMonth = shiftMonth(calMonth, 1); selectMonthDay(calMonth); render(); }
    else if (act === 'go-today') { tab = 'days'; selected = iso(new Date()); calMonth = clampMonth({ y: new Date().getFullYear(), m: new Date().getMonth() }); render(); }
    else if (act === 'rep-prev') { repMonth = shiftMonth(repMonth, -1); render(); }
    else if (act === 'rep-next') { repMonth = shiftMonth(repMonth, 1); render(); }
    else if (act === 'export') exportData();
    else if (act === 'import') document.getElementById('file').click();
    else if (act === 'goals-reset') { goalsByYear[objYear()] = defaultGoals(); saveGoals(); render(); }
  });

  // Al escribir un objetivo a mano en la pantalla del +
  document.addEventListener('change', function (e) {
    var inp = e.target.closest && e.target.closest('[data-goalinput]');
    if (inp) setGoal(inp.getAttribute('data-goalinput'), inp.value);
  });

  // Al volver a abrir la app otro día, que "hoy" se actualice (también al cambiar de año).
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      var n = iso(new Date());
      if (n !== iso(today)) {
        today = new Date(); selected = n;
        calMonth = clampMonth({ y: today.getFullYear(), m: today.getMonth() });
        repMonth = { y: calMonth.y, m: calMonth.m };
      }
      render();
    }
  });

  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  render();
})();
