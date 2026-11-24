(function () {
  'use strict';
  var LANG_KEY = 'biblegems-lang', POS_KEY = 'biblegems-refs-pos';
  var bible, rui, refs = {}, lang = 'en', pos = { b: 1, c: 1, v: 1 };

  function $(id) { return document.getElementById(id); }
  function T(k) { var u = rui[lang] || rui.en; return u[k] !== undefined ? u[k] : rui.en[k]; }
  function L() { return bible.langs[lang]; }

  // data may be flat {"1:1:1":[...]} or nested {"1":{"1":{"1":[...]}}}
  function flatten(data) {
    var out = {};
    Object.keys(data).forEach(function (k) {
      var v = data[k];
      if (Array.isArray(v)) { out[k] = v; return; }
      if (v && typeof v === 'object') Object.keys(v).forEach(function (c) {
        var cv = v[c];
        if (cv && typeof cv === 'object') Object.keys(cv).forEach(function (vs) { out[k + ':' + c + ':' + vs] = cv[vs]; });
      });
    });
    return out;
  }
  // "b:c:v", "b:c:v1-v2" or "b:c:v1-c2:v2"
  function parseRef(s) {
    var m = /^\s*(\d+):(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?\s*$/.exec(String(s));
    if (!m) return null;
    var c = +m[2], v = +m[3];
    return { b: +m[1], c1: c, v1: v, c2: m[4] ? +m[4] : c, v2: m[5] ? +m[5] : v };
  }
  function cmp(a, b) { return a.b - b.b || a.c1 - b.c1 || a.v1 - b.v1 || a.c2 - b.c2 || a.v2 - b.v2; }
  // Bible order, no duplicates, touching verses in one chapter joined into a range
  function tidy(list) {
    var rs = list.map(parseRef).filter(Boolean).sort(cmp), out = [];
    rs.forEach(function (r) {
      var p = out[out.length - 1];
      if (p && p.b === r.b) {
        if ((r.c1 > p.c1 || (r.c1 === p.c1 && r.v1 >= p.v1)) && (r.c2 < p.c2 || (r.c2 === p.c2 && r.v2 <= p.v2))) return;
        if (p.c1 === p.c2 && r.c1 === r.c2 && p.c1 === r.c1 && r.v1 <= p.v2 + 1) { p.v2 = Math.max(p.v2, r.v2); return; }
      }
      out.push({ b: r.b, c1: r.c1, v1: r.v1, c2: r.c2, v2: r.v2 });
    });
    return out;
  }
  function refText(r) {
    var name = L().books[r.b - 1];
    if (r.c1 === r.c2) return name + ' ' + r.c1 + ':' + r.v1 + (r.v2 > r.v1 ? '-' + r.v2 : '');
    return name + ' ' + r.c1 + ':' + r.v1 + ' - ' + r.c2 + ':' + r.v2;
  }
  function wolUrl(text) {
    var u = new URL(L().wol);
    u.searchParams.set('q', text);
    return u.toString();
  }

  function fillSelect(sel, n, value, labelFn) {
    sel.textContent = '';
    for (var i = 1; i <= n; i++) {
      var o = document.createElement('option');
      o.value = i; o.textContent = labelFn ? labelFn(i) : i;
      sel.appendChild(o);
    }
    sel.value = value;
  }
  function fillBooks() {
    fillSelect($('book-select'), 66, pos.b, function (i) { return L().books[i - 1]; });
  }
  function clampPos() {
    var ch = bible.counts[pos.b - 1];
    pos.c = Math.min(Math.max(pos.c, 1), ch.length);
    pos.v = Math.min(Math.max(pos.v, 1), ch[pos.c - 1]);
  }
  function fillChapterVerse() {
    clampPos();
    var ch = bible.counts[pos.b - 1];
    fillSelect($('chapter-select'), ch.length, pos.c);
    fillSelect($('verse-select'), ch[pos.c - 1], pos.v);
  }
  function show() {
    var list = tidy(refs[pos.b + ':' + pos.c + ':' + pos.v] || []);
    var topic = refText({ b: pos.b, c1: pos.c, v1: pos.v, c2: pos.c, v2: pos.v });
    var parts = list.map(refText);
    // the topic verse goes first in every search, so it heads the results
    var search = wolUrl([topic].concat(parts).join('; '));
    var title = $('verse-title');
    title.textContent = '';
    var ta = document.createElement('a');
    ta.href = search; ta.target = '_blank'; ta.rel = 'noopener noreferrer'; ta.className = 'topic-link'; ta.textContent = topic;
    title.appendChild(ta);
    var link = $('refs-link'), none = $('refs-none'), hint = $('refs-hint');
    if (!list.length) {
      link.hidden = true; none.hidden = false; none.textContent = T('none');
      hint.hidden = true; $('verse-count').textContent = '';
    } else {
      link.textContent = parts.join('; '); link.href = search; link.hidden = false; none.hidden = true;
      hint.textContent = T('hint'); hint.hidden = false;
      $('verse-count').textContent = T('count').replace('{n}', list.length);
    }
    try { localStorage.setItem(POS_KEY, JSON.stringify([pos.b, pos.c, pos.v])); } catch (e) {}
  }
  function applyLang() {
    document.documentElement.lang = lang;
    document.title = T('title');
    $('page-title').textContent = T('title');
    $('lang-label').textContent = L().ui.language;
    $('book-label').textContent = T('book');
    $('chapter-label').textContent = T('chapter');
    $('verse-label').textContent = T('verse');
    $('error').textContent = T('error');
    document.querySelectorAll('#plan-nav a').forEach(function (a) {
      var k = a.getAttribute('data-plan');
      a.textContent = k === 'refs' ? T('nav') : L().ui['plan' + k];
      if (k === 'refs') a.setAttribute('aria-current', 'page');
    });
    fillBooks(); show();
  }
  function initialLang() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q && bible.langs[q]) return q;
    try { var s = localStorage.getItem(LANG_KEY); if (s && bible.langs[s]) return s; } catch (e) {}
    return 'en';
  }
  function initialPos() {
    try {
      var p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (Array.isArray(p) && p.length === 3 && p[0] >= 1 && p[0] <= 66) pos = { b: +p[0], c: +p[1], v: +p[2] };
    } catch (e) {}
  }
  function json(url, optional) {
    return fetch(url).then(function (r) {
      if (!r.ok) { if (optional) return {}; throw new Error(r.status); }
      return r.json();
    }).catch(function (e) { if (optional) return {}; throw e; });
  }

  (function () {
    var h = document.createElement('p'); h.id = 'refs-hint'; h.className = 'hint'; h.hidden = true;
    $('refs-link').insertAdjacentElement('afterend', h);
  })();

  Promise.all([json('data/bible.json'), json('data/refs-ui.json'), json('data/crossrefs.json', true)]).then(function (res) {
    bible = res[0]; rui = res[1]; refs = flatten(res[2]);
    lang = initialLang(); initialPos();
    var sel = $('lang-select');
    Object.keys(bible.langs).forEach(function (code) {
      var o = document.createElement('option'); o.value = code; o.textContent = bible.langs[code].label; sel.appendChild(o);
    });
    sel.value = lang;
    sel.addEventListener('change', function () {
      lang = sel.value;
      try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
      applyLang();
    });
    $('book-select').addEventListener('change', function () { pos = { b: +this.value, c: 1, v: 1 }; fillChapterVerse(); show(); });
    $('chapter-select').addEventListener('change', function () { pos.c = +this.value; pos.v = 1; fillChapterVerse(); show(); });
    $('verse-select').addEventListener('change', function () { pos.v = +this.value; show(); });
    fillChapterVerse(); applyLang();
  }).catch(function () { $('error').hidden = false; });
})();
