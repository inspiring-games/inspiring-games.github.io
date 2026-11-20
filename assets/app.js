(function () {
  'use strict';
  var PLAN = document.body.getAttribute('data-plan') || '1';
  var PROGRESS_KEY = { '1': 'biblegems-progress-v1', '2': 'biblegems-progress-2y-v1', '3': 'biblegems-progress-3y-v1' }[PLAN];
  var LANG_KEY = 'biblegems-lang';
  var bible, plan, lang = 'en', done = {}, links = [];

  function $(id) { return document.getElementById(id); }
  function ui(k) { return bible.langs[lang].ui[k]; }

  function loadDone() {
    try {
      var arr = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '[]');
      if (Array.isArray(arr)) arr.forEach(function (i) { done[i] = true; });
    } catch (e) { done = {}; }
  }
  function saveDone() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(Object.keys(done).map(Number))); } catch (e) {}
  }
  function initialLang() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q && bible.langs[q]) return q;
    try { var s = localStorage.getItem(LANG_KEY); if (s && bible.langs[s]) return s; } catch (e) {}
    return 'en';
  }

  // position within a book (1-based verse index) -> [chapter, verse]
  function cv(b, i) {
    var ch = bible.counts[b - 1], c = 0;
    while (i > ch[c]) { i -= ch[c]; c++; }
    return [c + 1, i];
  }
  function segText(s) {
    var b = s[0], name = bible.langs[lang].books[b - 1], ch = bible.counts[b - 1];
    var a = cv(b, s[1]), z = cv(b, s[2]);
    var full = a[1] === 1 && z[1] === ch[z[0] - 1];
    if (full) {
      if (ch.length === 1) return name;
      return name + ' ' + a[0] + (a[0] === z[0] ? '' : ' - ' + z[0]);
    }
    if (a[0] === z[0]) return name + ' ' + a[0] + ':' + a[1] + (a[1] === z[1] ? '' : '-' + z[1]);
    return name + ' ' + a[0] + ':' + a[1] + ' - ' + z[0] + ':' + z[1];
  }
  function itemText(k) {
    // the 1-year plan shows the PDF's exact wording in English
    if (PLAN === '1' && lang === 'en' && plan.en) return plan.en[k];
    return plan.items[k].map(segText).join('; ');
  }
  function url(text) {
    var u = new URL(bible.langs[lang].wol);
    u.searchParams.set('q', text);
    return u.toString();
  }

  function updateProgress() {
    var n = Object.keys(done).length, total = plan.items.length;
    $('progress-text').textContent = ui('completed').replace('{n}', n).replace('{total}', total);
    $('progress-fill').style.width = (n / total * 100) + '%';
    $('progress-bar').setAttribute('aria-valuenow', n);
  }
  function applyLang() {
    var L = bible.langs[lang];
    document.documentElement.lang = lang;
    document.title = L.ui.title;
    $('page-title').textContent = L.ui.title;
    $('lang-label').textContent = L.ui.language;
    $('reset-btn').textContent = L.ui.reset;
    $('plan-nav').setAttribute('aria-label', L.ui.plans);
    document.querySelectorAll('#plan-nav a').forEach(function (a) {
      a.textContent = L.ui['plan' + a.getAttribute('data-plan')];
      if (a.getAttribute('data-plan') === PLAN) a.setAttribute('aria-current', 'page');
    });
    links.forEach(function (o, k) {
      var t = itemText(k);
      o.a.textContent = t;
      o.a.href = url(t);
      o.cb.setAttribute('aria-label', L.ui.mark + ' ' + t);
    });
    $('error').textContent = L.ui.error;
    updateProgress();
  }
  function render() {
    var list = $('readings'), frag = document.createDocumentFragment();
    plan.items.forEach(function (_, k) {
      var li = document.createElement('li');
      li.className = 'item' + (done[k] ? ' done' : '');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.id = 'r' + k; cb.checked = !!done[k];
      cb.addEventListener('change', function () {
        if (cb.checked) done[k] = true; else delete done[k];
        li.classList.toggle('done', cb.checked);
        saveDone(); updateProgress();
      });
      var a = document.createElement('a');
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      li.appendChild(cb); li.appendChild(a); frag.appendChild(li);
      links.push({ a: a, cb: cb });
    });
    list.appendChild(frag);
  }
  function setupLangSelect() {
    var sel = $('lang-select');
    Object.keys(bible.langs).forEach(function (code) {
      var o = document.createElement('option');
      o.value = code; o.textContent = bible.langs[code].label;
      sel.appendChild(o);
    });
    sel.value = lang;
    sel.addEventListener('change', function () {
      lang = sel.value;
      try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
      applyLang();
    });
  }

  $('reset-btn').addEventListener('click', function () {
    if (!bible || !window.confirm(ui('confirm'))) return;
    done = {}; saveDone();
    links.forEach(function (o) { o.cb.checked = false; o.cb.closest('.item').classList.remove('done'); });
    updateProgress();
  });

  Promise.all([
    fetch('data/bible.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch('data/plan-' + PLAN + '.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
  ]).then(function (res) {
    bible = res[0]; plan = res[1];
    lang = initialLang();
    loadDone(); setupLangSelect(); render(); applyLang();
  }).catch(function () { $('error').hidden = false; });
})();
