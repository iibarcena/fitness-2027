(function () {
  'use strict';

  var L = window.Logic;
  var ACTS = L.ACTS, YEAR = L.YEAR, iso = L.iso, parseISO = L.parseISO, pad = L.pad, fmt = L.fmt;

  var KEY = 'fitness2027.v1';
  var BK = 'fitness2027.lastBackup';
  var MIN = { y: 2026, m: 10 };  // noviembre 2026 (para pruebas)
  var MAX = { y: 2027, m: 11 };  // diciembre 2027

  var days = load();
  var today = new Date();
  var selected = iso(today);
  var tab = 'days';

  function clampMonth(mm) {
    var v = mm.y * 12 + mm.m;
    var lo = MIN.y * 12 + MIN.m, hi = MAX.y * 12 + MAX.m;
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

  function actById(id) { return ACTS.filter(function (a) { return a.id === id; })[0]; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function monthLabel(mm) {
    return cap(new Date(mm.y, mm.m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
  }
  function shiftMonth(mm, d) { return clampMonth({ y: mm.y, m: mm.m + d }); }
  function atMin(mm) { return mm.y * 12 + mm.m <= MIN.y * 12 + MIN.m; }
  function atMax(mm) { return mm.y * 12 + mm.m >= MAX.y * 12 + MAX.m; }

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
    if (sd.getFullYear() < YEAR) html += '<p class="note">🧪 Prueba: este día no cuenta para el objetivo de 2027.</p>';
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

  function statusHTML(a) {
    if (a.status === 'notstarted') return '<p class="muted">El objetivo empieza el 1 de enero de 2027.</p>';
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

  function card(title, emoji, color, a, monthCount) {
    return '<section class="card"><div class="cardhead"><h3>' + emoji + ' ' + title + '</h3>' +
      '<span class="big">' + a.done + '<small> / ' + a.goal + '</small></span></div>' +
      bar(a, color) +
      '<p class="sub">Deberías llevar ' + fmt(a.expected) + ' · ritmo esperado ≈ ' + fmt(a.weeklyPace) + ' por semana · este mes: ' +
      monthCount + '</p>' + statusHTML(a) + '</section>';
  }

  function hero(a, monthCount) {
    return '<section class="hero"><p class="herolabel">🎯 Total · gym + correr + nadar</p>' +
      '<div class="herobig">' + a.done + '<small> / ' + a.goal + '</small></div>' + bar(a, '#1a1005') +
      '<p class="sub">Deberías llevar ' + fmt(a.expected) + ' · ritmo esperado ≈ ' + fmt(a.weeklyPace) +
      ' por semana · este mes: ' + monthCount + '</p>' + statusHTML(a) + '</section>';
  }

  function renderReport() {
    var y = repMonth.y, m = repMonth.m;
    var monthStart = new Date(y, m, 1);
    var monthEnd = new Date(y, m + 1, 0);
    var now = new Date();
    var ref = monthEnd < now ? monthEnd : now;
    var refLabel = monthEnd < now ? 'a final de ' + monthLabel(repMonth).toLowerCase() : 'a hoy';
    var mc = L.monthDayCounts(days, y, m);
    var s = L.summary(days, ref);

    var html = '<div class="monthnav">' +
      '<button class="icon" data-act="rep-prev"' + (atMin(repMonth) ? ' disabled' : '') + '>‹</button>' +
      '<h2>' + monthLabel(repMonth) + '</h2>' +
      '<button class="icon" data-act="rep-next"' + (atMax(repMonth) ? ' disabled' : '') + '>›</button></div>';

    if (y < YEAR) html += '<p class="note">🧪 Prueba: el objetivo anual empieza el 1 de enero de 2027.</p>';
    if (monthStart > now) html += '<p class="note">Este mes aún no ha empezado. Abajo ves el acumulado a hoy.</p>';

    html += '<h4 class="sect">Acumulado del año ' + refLabel + '</h4>';
    html += hero(s.total, mc.total);
    html += card('Gym', '🏋️', '#4f8cff', s.gym, mc.gym);
    html += card('Correr', '🏃', '#ff8a3d', s.run, mc.run);
    html += card('Nadar', '🏊', '#22b8cf', s.swim, mc.swim);
    html += '<p class="legend"><span class="lg"></span> La marca vertical es lo que deberías llevar a esa fecha.</p>';

    html += '<h4 class="sect">Sin objetivo</h4><section class="card plain">' +
      '<div class="row"><span>⚽ Fútbol</span><span>este mes <b>' + mc.football + '</b> · en 2027 <b>' + s.football + '</b></span></div>' +
      '<div class="row"><span>🎾 Pádel</span><span>este mes <b>' + mc.padel + '</b> · en 2027 <b>' + s.padel + '</b></span></div></section>';

    var last = null;
    try { last = localStorage.getItem(BK); } catch (e) {}
    html += '<h4 class="sect">Copia de seguridad</h4><section class="card plain">' +
      '<p class="sub">Tus datos están solo en este móvil. Haz una copia de vez en cuando (por ejemplo, cada mes).</p>' +
      '<p class="sub">Última copia: <b>' + (last ? cap(parseISO(last).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })) : 'nunca') + '</b></p>' +
      '<div class="btns"><button class="btn" data-act="export">Exportar copia</button>' +
      '<button class="btn alt" data-act="import">Importar copia</button></div>' +
      '<input type="file" id="file" accept="application/json,.json" hidden></section>';
    return html;
  }

  /* ---------- Render y eventos ---------- */

  function render() {
    var app = document.getElementById('app');
    var scroll = window.scrollY;
    app.innerHTML = tab === 'days' ? renderDays() : renderReport();
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
    var text = JSON.stringify({ version: 1, exported: new Date().toISOString(), days: days }, null, 1);
    var name = 'fitness-2027-copia-' + iso(new Date()) + '.json';
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
      navigator.share({ files: [file], title: 'Copia fitness 2027' })
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
      var parsed = null;
      try { parsed = L.sanitizeImport(JSON.parse(r.result)); } catch (e) {}
      if (!parsed) { alert('Ese archivo no es una copia válida de esta app. No he cambiado nada.'); return; }
      var msg = 'Esto reemplaza tus ' + Object.keys(days).length + ' días marcados por los ' +
        Object.keys(parsed).length + ' de la copia. ¿Continuar?';
      if (!confirm(msg)) return;
      days = parsed; save(); render();
    };
    r.readAsText(f);
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-toggle],[data-date],[data-act],[data-tab]');
    if (!t) return;
    if (t.hasAttribute('data-tab')) { tab = t.getAttribute('data-tab'); render(); return; }
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
  });

  // Al volver a abrir la app otro día, que "hoy" se actualice.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      var n = iso(new Date());
      if (n !== iso(today)) { today = new Date(); selected = n; calMonth = clampMonth({ y: today.getFullYear(), m: today.getMonth() }); }
      render();
    }
  });

  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  render();
})();
