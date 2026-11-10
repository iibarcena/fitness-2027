(function () {
  'use strict';

  var L = window.Logic;
  var iso = L.iso, parseISO = L.parseISO, pad = L.pad, fmt = L.fmt;

  var KEY = 'fitness2027.v1';
  var BK = 'fitness2027.lastBackup';
  var GK = 'fitness2027.goals.v1';   // objetivos por año: {"2026": {gym, run, swim}}
  var SK = 'fitness2027.start.v1';   // día en que empieza el objetivo
  var PK = 'fitness2027.sports.v1';  // lista de deportes
  var YK = 'fitness2027.yearok.v1';  // último año nuevo en el que respondiste a la ventana de año nuevo
  var VERSION = '7';                 // súbela junto con ?v= en index.html y CACHE en sw.js

  var days = load();
  var goalsByYear = loadGoals();
  var startISO = loadStart();
  var sports = loadSports();
  var addOpen = false, addError = '', confirmId = null;   // formulario de añadir y confirmación de quitar
  var today = new Date();
  var selected = iso(today);
  var tab = 'days';
  var draft = null, draftDate = null, justSaved = false;   // cambios sin guardar del día seleccionado

  // Año del objetivo en curso: el del inicio hasta el 31 de diciembre y, después, el año actual.
  function objYear() { return L.objectiveYear(new Date(), startISO); }
  function maxMonth() { return { y: objYear(), m: 11 }; }
  function minMonth() { var d = parseISO(startISO); return { y: d.getFullYear(), m: d.getMonth() }; }
  function goalsFor(year) { return L.goalsForYear(goalsByYear, year, startISO, sports); }
  function longDate(s) { return parseISO(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }); }

  function clampMonth(mm) {
    var v = mm.y * 12 + mm.m;
    var mn = minMonth(), lo = mn.y * 12 + mn.m, mx = maxMonth(), hi = mx.y * 12 + mx.m;
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

  function loadStart() {
    try { return L.sanitizeStart(localStorage.getItem(SK)) || L.DEFAULT_START; } catch (e) { return L.DEFAULT_START; }
  }

  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  function loadSports() {
    try {
      var v = L.sanitizeSports(JSON.parse(localStorage.getItem(PK)));
      return v === null ? copy(L.DEFAULT_SPORTS) : v;
    } catch (e) { return copy(L.DEFAULT_SPORTS); }
  }

  function saveSports() {
    try { localStorage.setItem(PK, JSON.stringify(sports)); } catch (e) {}
  }

  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  function yearAnswered() {
    try { return Number(localStorage.getItem(YK)) || 0; } catch (e) { return 0; }
  }

  function markYearAnswered(y) {
    try { localStorage.setItem(YK, String(y)); } catch (e) {}
  }

  // ¿Hay que preguntar por el año nuevo? Sí, desde el 1 de enero hasta que respondas.
  function needYearPrompt() {
    var oy = objYear();
    return oy > L.startYear(startISO) && yearAnswered() < oy && L.goalSports(sports).length > 0;
  }

  function saveStart() {
    try { localStorage.setItem(SK, startISO); } catch (e) {}
  }

  function saveGoals() {
    try {
      localStorage.setItem(GK, JSON.stringify(goalsByYear));
    } catch (e) {
      alert('No he podido guardar los objetivos en el móvil. Revisa que Safari no esté en modo privado.');
    }
  }

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

  function actById(id) { return sports.filter(function (a) { return a.id === id; })[0] || null; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function monthLabel(mm) {
    return cap(new Date(mm.y, mm.m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
  }
  function shiftMonth(mm, d) { return clampMonth({ y: mm.y, m: mm.m + d }); }
  function atMin(mm) { var mn = minMonth(); return mm.y * 12 + mm.m <= mn.y * 12 + mn.m; }
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
      ids.forEach(function (id) { var sp = actById(id); if (sp) cal += '<i style="background:' + sp.color + '"></i>'; });
      cal += '</span></button>';
    }
    cal += '</div>';

    var sd = parseISO(selected);
    var label = cap(sd.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    var isFuture = selected > todayISO;
    var dirty = draft !== null && draftDate === selected;
    var marked = dirty ? draft : (days[selected] || []);

    html += '<section class="panel"><div class="panelhead"><h3>' + label + '</h3>' +
      (selected !== todayISO ? '<button class="link" data-act="go-today">Ir a hoy</button>' : '') + '</div>';
    if (selected < startISO) html += '<p class="note">Este día es anterior al inicio del objetivo (' + longDate(startISO) + ') y no cuenta.</p>';
    if (isFuture) html += '<p class="note">Este día aún no ha llegado.</p>';
    html += '<div class="toggles">';
    sports.forEach(function (a) {
      var on = marked.indexOf(a.id) >= 0;
      html += '<button class="tog' + (on ? ' on' : '') + '" style="--c:' + a.color + '" data-toggle="' + a.id + '"' +
        (isFuture ? ' disabled' : '') + '><span class="emoji">' + a.emoji + '</span><span class="tname">' + esc(a.name) +
        '</span><span class="check">' + (on ? '✓' : '') + '</span></button>';
    });
    if (!sports.length) html += '<p class="sub">No tienes deportes. Añade alguno con el botón +.</p>';
    html += '</div>';
    if (!isFuture) {
      html += '<button class="btn save" data-act="save"' + (dirty ? '' : ' disabled') + '>' +
        (dirty ? 'Guardar' : (justSaved ? '✓ Guardado' : 'Guardar')) + '</button>';
      if (dirty) html += '<p class="sub">Tienes cambios sin guardar.</p>';
    }
    html += '</section>';
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
    if (a.status === 'notstarted') return '<p class="muted">El objetivo aún no ha empezado.</p>';
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
    return '<section class="card"><div class="cardhead"><h3>' + emoji + ' ' + esc(title) + '</h3>' +
      '<span class="big">' + a.done + '<small> / ' + a.goal + '</small></span></div>' +
      bar(a, color) + paceLine(a, monthCount, mode) + statusHTML(a, mode) + '</section>';
  }

  function hero(a, monthCount, mode) {
    var names = L.goalSports(sports).map(function (x) { return esc(x.name.toLowerCase()); }).join(' + ');
    return '<section class="hero"><p class="herolabel">🎯 Total · ' + names + '</p>' +
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
      '<input type="file" id="file" accept="application/json,.json" hidden></section>' +
      '<p class="legend">Versión de la app: v' + VERSION + '</p>';
  }

  function renderReport() {
    var y = repMonth.y, m = repMonth.m;
    var now = new Date();
    var oy = objYear();
    var vy = y;                                  // año del objetivo al que pertenece el mes que miras
    var monthStart = new Date(y, m, 1);
    var monthEnd = new Date(y, m + 1, 0);
    var past = monthEnd < now;                   // ¿miras una fecha que ya ha pasado?
    var ref = past ? monthEnd : now;
    var mode = past ? 'past' : 'live';
    var refLabel = past ? 'a final de ' + monthLabel(repMonth).toLowerCase() : 'a hoy';
    var mc = L.monthDayCounts(days, y, m, sports);
    var sy = L.startYear(startISO);
    var html = '';

    // Aviso del primer periodo (recortado): del día de inicio al 31 de diciembre
    if (L.isPartial(oy, startISO) && vy === oy) {
      html += '<section class="banner"><b>🗓️ Objetivo en marcha desde el ' + longDate(startISO) + '</b>' +
        '<p>Dura hasta el 31 de diciembre (' + L.periodDays(oy, startISO) + ' días). ' +
        'El 1 de enero empieza un año nuevo y todos los contadores vuelven a cero.</p></section>';
    }

    // Selector de año: aparece cuando ya hay algún año anterior que consultar
    if (oy > sy) {
      html += '<div class="pills">';
      for (var yy = sy; yy <= oy; yy++) {
        html += '<button class="pill' + (yy === vy ? ' active' : '') + '" data-year="' + yy + '">' + yy + '</button>';
      }
      html += '</div>';
    }

    html += '<div class="monthnav">' +
      '<button class="icon" data-act="rep-prev"' + (atMin(repMonth) ? ' disabled' : '') + '>‹</button>' +
      '<h2>' + monthLabel(repMonth) + '</h2>' +
      '<button class="icon" data-act="rep-next"' + (atMax(repMonth) ? ' disabled' : '') + '>›</button></div>';

    if (monthStart > now) html += '<p class="note">Este mes aún no ha empezado. Abajo ves el acumulado a hoy.</p>';

    var s = L.summary(days, ref, goalsFor(vy), vy, startISO, sports);
    var closed = vy < oy;                         // año ya cerrado
    var isFinal = closed && m === 11 && y === vy; // diciembre de un año cerrado = resultado final
    if (isFinal) mode = 'final';

    var heading = isFinal ? 'Resultado final de ' + vy
      : (s.elapsed === 0 ? 'Objetivos para ' + vy : 'Acumulado de ' + vy + ' ' + refLabel);
    html += '<h4 class="sect">' + heading + '</h4>';
    var gs = L.goalSports(sports), ns = sports.filter(function (x) { return !x.goal; });
    if (gs.length) {
      html += hero(s.total, mc.total, mode);
      gs.forEach(function (x) { html += card(x.name, x.emoji, x.color, s.bySport[x.id], mc[x.id], mode); });
      html += '<p class="legend"><span class="lg"></span> La marca vertical es lo que tocaba llevar a esa fecha.</p>';
    } else {
      html += '<p class="note">No tienes ningún deporte con objetivo. Puedes añadirlo con el botón +.</p>';
    }
    if (ns.length) {
      html += '<h4 class="sect">Sin objetivo</h4><section class="card plain">';
      ns.forEach(function (x) {
        html += '<div class="row"><span>' + x.emoji + ' ' + esc(x.name) + '</span><span>este mes <b>' + mc[x.id] +
          '</b> · en ' + vy + ' <b>' + s.counts[x.id] + '</b></span></div>';
      });
      html += '</section>';
    }

    html += backupHTML();
    return html;
  }

  /* ---------- Pantalla: objetivos (botón +) ---------- */

  function perWeek(n, year) { return fmt(n * 7 / L.periodDays(year, startISO)); }

  function goalCard(a, goals, gy, unit) {
    var id = a.id;
    return '<section class="card goalrow"><button class="rm" data-act="remove" data-id="' + id + '" aria-label="Quitar ' + esc(a.name) + '">−</button>' +
      '<div class="cardhead"><h3>' + a.emoji + ' ' + esc(a.name) + '</h3>' +
      '<span class="sub">≈ ' + perWeek(goals[id], gy) + ' por semana</span></div>' +
      '<div class="stepper">' +
      '<button class="step" data-goal="' + id + '" data-d="-1" aria-label="Menos ' + esc(a.name) + '"' + (goals[id] <= 0 ? ' disabled' : '') + '>−</button>' +
      '<label class="goalbox"><input class="goalinput" type="number" inputmode="numeric" min="0" max="' + L.MAX_GOAL + '" ' +
      'value="' + goals[id] + '" data-goalinput="' + id + '" aria-label="Días de ' + esc(a.name) + '"><span>' + unit + '</span></label>' +
      '<button class="step" data-goal="' + id + '" data-d="1" aria-label="Más ' + esc(a.name) + '"' + (goals[id] >= L.MAX_GOAL ? ' disabled' : '') + '>+</button>' +
      '</div></section>';
  }

  function addFormHTML() {
    if (!addOpen) return '<div class="btns"><button class="btn" data-act="add-open">＋ Añadir deporte</button></div>';
    return '<section class="card"><div class="cardhead"><h3>Nuevo deporte</h3></div>' +
      '<div class="addform"><div class="addrow"><input id="newemoji" class="txt emo" value="🏅" maxlength="4" aria-label="Emoji">' +
      '<input id="newname" class="txt" placeholder="Nombre (por ejemplo, Yoga)" maxlength="20" aria-label="Nombre del deporte"></div>' +
      '<select id="newtype" class="txt" aria-label="Tipo"><option value="goal">Con objetivo (suma al total)</option>' +
      '<option value="count">Sin objetivo (solo cuenta días)</option></select>' +
      '<label class="goalbox" id="newannualbox"><input id="newannual" class="goalinput" type="number" inputmode="numeric" min="0" max="' + L.MAX_GOAL +
      '" value="20"><span>días al año de objetivo</span></label>' +
      (addError ? '<p class="down">' + esc(addError) + '</p>' : '') +
      '<div class="btns"><button class="btn" data-act="add-save">Añadir</button>' +
      '<button class="btn alt" data-act="add-cancel">Cancelar</button></div></div></section>';
  }

  function renderGoals() {
    var gy = objYear();
    var goals = goalsFor(gy);
    var gs = L.goalSports(sports), ns = sports.filter(function (x) { return !x.goal; });
    var total = L.sumGoals(goals, sports);
    var partial = L.isPartial(gy, startISO);
    var nd = L.periodDays(gy, startISO);
    var ref = partial ? L.prorated(gy, startISO, sports) : L.annualGoals(sports);
    var unit = partial ? 'días en este periodo' : 'días al año';
    var same = gs.every(function (x) { return goals[x.id] === ref[x.id]; });
    var refTxt = gs.map(function (x) { return ref[x.id]; }).join(' / ');
    var html = '<header class="hello"><p class="hi">Tu plan</p><h1>Objetivos de ' + gy + '</h1></header>';

    html += '<section class="hero"><p class="herolabel">🎯 ' + (partial ? 'Total de este periodo' : 'Total al año') + '</p>' +
      '<div class="herobig">' + total + '<small> días</small></div>' +
      '<p class="sub">' + (partial
        ? 'Del ' + longDate(L.periodStartISO(gy, startISO)) + ' al 31 de diciembre (' + nd + ' días). '
        : '') +
      '≈ ' + perWeek(total, gy) + ' por semana' + (partial ? '. ' : ', contando el año completo (vacaciones y bajas incluidas). ') +
      'El total es la suma de los deportes con objetivo.</p></section>';

    if (partial) {
      var sd0 = parseISO(startISO), thisYear = new Date().getFullYear();
      function opts(from, to, sel, label) {
        var o = '';
        for (var i = from; i <= to; i++) o += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + label(i) + '</option>';
        return o;
      }
      var mNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      html += '<section class="card"><div class="cardhead"><h3>🗓️ Empieza el</h3></div>' +
        '<div class="datesel">' +
        '<select data-startpart="d" aria-label="Día">' + opts(1, 31, sd0.getDate(), String) + '</select>' +
        '<select data-startpart="m" aria-label="Mes">' + opts(1, 12, sd0.getMonth() + 1, function (i) { return mNames[i - 1]; }) + '</select>' +
        '<select data-startpart="y" aria-label="Año">' + opts(2020, Math.max(thisYear, sd0.getFullYear()), sd0.getFullYear(), String) + '</select></div>' +
        '<p class="sub">Si la cambias, el informe recalcula el periodo desde ese día.</p></section>';
    }

    if (gs.length) html += '<h4 class="sect">Con objetivo</h4>';
    gs.forEach(function (a) { html += goalCard(a, goals, gy, unit); });

    if (ns.length) {
      html += '<h4 class="sect">Sin objetivo (solo cuentan días)</h4>';
      ns.forEach(function (a) {
        html += '<section class="card goalrow"><button class="rm" data-act="remove" data-id="' + a.id + '" aria-label="Quitar ' + esc(a.name) + '">−</button>' +
          '<div class="cardhead"><h3>' + a.emoji + ' ' + esc(a.name) + '</h3></div></section>';
      });
    }

    html += '<h4 class="sect">Deportes</h4>' + addFormHTML();
    var missing = L.DEFAULT_SPORTS.filter(function (d) { return !actById(d.id); });
    if (missing.length) {
      html += '<p class="legend">Recuperar un deporte que quitaste (con sus días marcados):</p><div class="chips">';
      missing.forEach(function (d) { html += '<button class="chip" data-act="restore" data-id="' + d.id + '">' + d.emoji + ' ' + d.name + '</button>'; });
      html += '</div>';
    }
    html += '<p class="legend">Si quitas un deporte, desaparece de las pantallas pero tus días marcados se guardan. ' +
      'Si lo vuelves a añadir con el mismo nombre, recuperas esos días.</p>';

    if (gs.length) {
      if (partial) {
        html += '<p class="legend">Estos objetivos son el plan anual repartido en proporción a los ' + nd + ' días que dura este periodo.</p>';
        html += '<p class="legend">El 1 de enero empieza un año nuevo desde cero con el plan anual completo. Ese día te preguntaré si quieres seguir con el mismo reparto.</p>';
      } else {
        html += '<p class="legend">Si cambias un objetivo, el informe recalcula todo el año con el objetivo nuevo, ' +
          'como si hubiera sido ese desde el 1 de enero.</p>';
        html += '<p class="legend">Cada 1 de enero empieza un año nuevo desde cero y te preguntaré si quieres seguir con el mismo reparto. ' +
          'Los informes de años anteriores conservan los objetivos que tenían.</p>';
      }
      html += '<div class="btns"><button class="btn alt" data-act="goals-reset"' + (same ? ' disabled' : '') + '>' +
        (partial ? 'Volver al reparto proporcional (' : 'Volver al plan inicial (') + refTxt + ')</button></div>';
    }
    html += '<p class="legend">Versión de la app: v' + VERSION + '</p>';
    return html;
  }

  /* ---------- Render y eventos ---------- */

  function render() {
    var app = document.getElementById('app');
    var scroll = window.scrollY;
    if (tab !== 'days' || draftDate !== selected) { draft = null; draftDate = null; justSaved = false; }
    app.innerHTML = tab === 'days' ? renderDays() : tab === 'report' ? renderReport() : renderGoals();
    var cs = confirmId ? actById(confirmId) : null;
    if (cs) {
      app.innerHTML += '<div class="overlay"><div class="dialog"><h3>¿Quitar ' + cs.emoji + ' ' + esc(cs.name) + '?</h3>' +
        '<p class="sub">Desaparecerá de las pantallas. Tus días marcados de este deporte se guardan por si lo vuelves a añadir.</p>' +
        '<div class="btns"><button class="btn danger" data-act="remove-yes">Sí, quitar</button>' +
        '<button class="btn alt" data-act="remove-no">No</button></div></div></div>';
    } else {
      confirmId = null;
      if (needYearPrompt()) {
        var py = objYear(), pg = goalsFor(py), plist = '';
        L.goalSports(sports).forEach(function (x) { plist += '<li>' + x.emoji + ' ' + esc(x.name) + ': <b>' + pg[x.id] + '</b> días</li>'; });
        app.innerHTML += '<div class="overlay"><div class="dialog"><h3>🎉 ¡Empieza ' + py + '!</h3>' +
          '<p class="sub">Todos los contadores vuelven a cero. ¿Quieres seguir con el mismo reparto de días por deporte?</p>' +
          '<ul>' + plist + '</ul><p class="sub">Total: <b>' + L.sumGoals(pg, sports) + '</b> días al año.</p>' +
          '<div class="btns"><button class="btn" data-act="year-keep">Sí, seguir igual</button>' +
          '<button class="btn alt" data-act="year-change">Cambiar</button></div></div></div>';
      }
    }
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    window.scrollTo(0, scroll);
    var f = document.getElementById('file');
    if (f) f.addEventListener('change', onFile);
  }

  function toggle(id) {
    if (selected > iso(new Date())) return;
    var a = (draft !== null && draftDate === selected ? draft : (days[selected] || [])).slice();
    var i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    draft = a; draftDate = selected; justSaved = false;
    render();
  }

  function saveDay() {
    if (draft === null || draftDate !== selected) return;
    if (draft.length) days[selected] = draft; else delete days[selected];
    save();
    draft = null; draftDate = null; justSaved = true;
    render();
  }

  function addSport() {
    var name = document.getElementById('newname').value.trim();
    var emoji = document.getElementById('newemoji').value.trim() || '🏅';
    var isGoal = document.getElementById('newtype').value === 'goal';
    var annual = Math.round(Number(document.getElementById('newannual').value));
    var id = L.slug(name);
    if (!name) { addError = 'Escribe un nombre.'; render(); return; }
    if (actById(id)) { addError = 'Ya tienes un deporte con ese nombre.'; render(); return; }
    if (isGoal && !(annual >= 0)) { addError = 'Pon un número de días válido.'; render(); return; }
    var def = L.DEFAULT_SPORTS.filter(function (x) { return x.id === id; })[0];
    var color = def ? def.color : L.PALETTE[sports.length % L.PALETTE.length];
    var added = L.sanitizeSports([{ id: id, name: name, emoji: emoji, color: color, goal: isGoal, annual: isGoal ? annual : 0 }]);
    if (!added.length) { addError = 'No he podido añadirlo, prueba con otro nombre.'; render(); return; }
    sports.push(added[0]);
    saveSports();
    addOpen = false; addError = '';
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
    var text = JSON.stringify({ version: 2, exported: new Date().toISOString(), start: startISO, sports: sports, goalsByYear: g, days: days }, null, 1);
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
      var parsed = null, gm = null, st = null, sp = null;
      try {
        var raw = JSON.parse(r.result);
        parsed = L.sanitizeImport(raw);
        st = L.sanitizeStart(raw && raw.start);
        sp = L.sanitizeSports(raw && raw.sports);
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
      if (st) { startISO = st; saveStart(); }
      if (sp) { sports = sp; saveSports(); }
      calMonth = clampMonth(calMonth); repMonth = clampMonth(repMonth);
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
    else if (act === 'save') saveDay();
    else if (act === 'year-keep') {
      var ky = objYear();
      goalsByYear[ky] = goalsFor(ky); saveGoals(); markYearAnswered(ky); render();
    }
    else if (act === 'year-change') { markYearAnswered(objYear()); tab = 'goals'; render(); window.scrollTo(0, 0); }
    else if (act === 'add-open') { addOpen = true; addError = ''; render(); }
    else if (act === 'add-cancel') { addOpen = false; addError = ''; render(); }
    else if (act === 'add-save') addSport();
    else if (act === 'remove') { confirmId = t.getAttribute('data-id'); render(); }
    else if (act === 'remove-no') { confirmId = null; render(); }
    else if (act === 'remove-yes') {
      sports = sports.filter(function (x) { return x.id !== confirmId; });
      confirmId = null; saveSports(); render();
    }
    else if (act === 'restore') {
      var d0 = L.DEFAULT_SPORTS.filter(function (x) { return x.id === t.getAttribute('data-id'); })[0];
      if (d0 && !actById(d0.id)) { sports.push(copy(d0)); saveSports(); }
      render();
    }
    else if (act === 'export') exportData();
    else if (act === 'import') document.getElementById('file').click();
    else if (act === 'goals-reset') {
      var oy = objYear();
      delete goalsByYear[oy];   // vuelve al reparto por defecto de ese periodo
      saveGoals(); render();
    }
  });

  // Al escribir un objetivo a mano en la pantalla del +
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'newtype') {
      document.getElementById('newannualbox').style.display = e.target.value === 'goal' ? '' : 'none';
      return;
    }
    if (e.target.closest && e.target.closest('[data-startpart]')) {
      var q = function (k) { return Number(document.querySelector('[data-startpart="' + k + '"]').value); };
      var yy = q('y'), mm = q('m'), dd = Math.min(q('d'), new Date(yy, mm, 0).getDate());
      var v = L.sanitizeStart(yy + '-' + pad(mm) + '-' + pad(dd));
      if (v && v <= iso(new Date())) {
        startISO = v; saveStart();
        calMonth = clampMonth(calMonth); repMonth = clampMonth(repMonth);
      }
      render();
      return;
    }
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
    // Si una versión nueva toma el control, recarga una vez para usarla (no recarga en la primera instalación).
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController) location.reload(); else hadController = true;
    });
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  render();
})();
