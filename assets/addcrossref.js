(function () {
  'use strict';
  var bible, data = null, history = [], changes = 0, lang = 'en';
  function $(id) { return document.getElementById(id); }
  function names() { return bible.langs[lang].books; }

  // ---- reference helpers: "b:c:v" or "b:c:v1-v2" ----
  function parseRef(s) {
    var m = /^\s*(\d+):(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?\s*$/.exec(String(s));
    if (!m) return null;
    var c = +m[2], v = +m[3];
    return { b: +m[1], c1: c, v1: v, c2: m[4] ? +m[4] : c, v2: m[5] ? +m[5] : v };
  }
  function fmt(r) {
    if (r.c1 === r.c2 && r.v1 === r.v2) return r.b + ':' + r.c1 + ':' + r.v1;
    if (r.c1 === r.c2) return r.b + ':' + r.c1 + ':' + r.v1 + '-' + r.v2;
    return r.b + ':' + r.c1 + ':' + r.v1 + '-' + r.c2 + ':' + r.v2;
  }
  function cmp(a, b) { return a.b - b.b || a.c1 - b.c1 || a.v1 - b.v1 || a.c2 - b.c2 || a.v2 - b.v2; }
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
    return out.map(fmt);
  }
  function label(r) {
    var n = names()[r.b - 1];
    return n + ' ' + r.c1 + ':' + r.v1 + (r.v2 > r.v1 ? '-' + r.v2 : '');
  }
  function flatten(d) {
    var out = {};
    Object.keys(d).forEach(function (k) {
      var v = d[k];
      if (Array.isArray(v)) { out[k] = v; return; }
      if (v && typeof v === 'object') Object.keys(v).forEach(function (c) {
        var cv = v[c];
        if (cv && typeof cv === 'object') Object.keys(cv).forEach(function (vs) { out[k + ':' + c + ':' + vs] = cv[vs]; });
      });
    });
    return out;
  }
  function keyOrder(a, b) {
    var x = a.split(':').map(Number), y = b.split(':').map(Number);
    return (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);
  }
  function serialize() {
    var keys = Object.keys(data).filter(function (k) { return data[k].length; }).sort(keyOrder);
    return '{\n' + keys.map(function (k) { return '  ' + JSON.stringify(k) + ': ' + JSON.stringify(data[k]); }).join(',\n') + '\n}\n';
  }

  // ---- pickers ----
  function fill(sel, n, value, labelFn, blank) {
    sel.textContent = '';
    if (blank) { var o0 = document.createElement('option'); o0.value = ''; o0.textContent = '–'; sel.appendChild(o0); }
    for (var i = 1; i <= n; i++) {
      var o = document.createElement('option'); o.value = i; o.textContent = labelFn ? labelFn(i) : i; sel.appendChild(o);
    }
    sel.value = value;
  }
  function picker(root) {
    var s = { b: root.querySelector('.b'), c: root.querySelector('.c'), v: root.querySelector('.v'), e: root.querySelector('.e') };
    function counts() { return bible.counts[+s.b.value - 1]; }
    function chapters() {
      var ch = counts(); fill(s.c, ch.length, 1); verses();
    }
    function verses(keepV) {
      var n = counts()[+s.c.value - 1], v = keepV ? Math.min(keepV, n) : 1;
      fill(s.v, n, v); ends();
    }
    function ends() {
      var n = counts()[+s.c.value - 1], v = +s.v.value;
      s.e.textContent = '';
      var o0 = document.createElement('option'); o0.value = ''; o0.textContent = '–'; s.e.appendChild(o0);
      for (var i = v + 1; i <= n; i++) { var o = document.createElement('option'); o.value = i; o.textContent = i; s.e.appendChild(o); }
    }
    fill(s.b, 66, 1, function (i) { return names()[i - 1]; });
    s.b.addEventListener('change', chapters);
    s.c.addEventListener('change', function () { verses(); });
    s.v.addEventListener('change', ends);
    chapters();
    return {
      relabel: function () { var v = s.b.value; fill(s.b, 66, v, function (i) { return names()[i - 1]; }); },
      get: function () {
        var v1 = +s.v.value, e = s.e.value ? +s.e.value : v1, c = +s.c.value;
        return { b: +s.b.value, c1: c, v1: v1, c2: c, v2: e };
      }
    };
  }

  // ---- editing ----
  function versesOf(r) { var a = []; for (var v = r.v1; v <= r.v2; v++) a.push({ b: r.b, c1: r.c1, v1: v, c2: r.c1, v2: v }); return a; }
  function link(from, to, recs) {
    var added = 0, target = fmt(to);
    versesOf(from).forEach(function (fv) {
      var key = fv.b + ':' + fv.c1 + ':' + fv.v1, before = data[key] ? data[key].slice() : null;
      var after = tidy((before || []).concat([target]));
      var same = before && before.length === after.length && before.every(function (x, i) { return x === after[i]; });
      if (!same) { recs.push({ key: key, before: before }); data[key] = after; added++; }
    });
    return added;
  }
  function setMsg(t, warn) { $('msg').textContent = t; $('msg').className = 'status' + (warn ? ' warn' : ''); }
  function refresh() {
    var ok = !!data;
    $('add').disabled = !ok; $('share').disabled = !ok; $('download').disabled = !ok;
    $('undo').disabled = !history.length;
    $('unsaved').textContent = changes ? 'Unsaved changes: ' + changes + '. Save the file before leaving this page.' : 'No changes yet.';
  }
  var P1, P2;
  function add() {
    var a = P1.get(), b = P2.get();
    if (versesOf(a).length > 40 || versesOf(b).length > 40) return setMsg('A passage can be at most 40 verses.', true);
    if (a.b === b.b && a.c1 === b.c1 && a.v1 <= b.v2 && b.v1 <= a.v2) return setMsg('The two scriptures overlap.', true);
    var recs = [], n = link(a, b, recs);
    if ($('both').checked) n += link(b, a, recs);
    var text = label(a) + ($('both').checked ? ' ↔ ' : ' → ') + label(b);
    if (!recs.length) { setMsg('Already there: ' + text); return; }
    history.push({ recs: recs, text: text }); changes++;
    var li = document.createElement('li'); li.textContent = text; $('log').appendChild(li);
    setMsg('Added: ' + text); refresh();
  }
  function undo() {
    var h = history.pop(); if (!h) return;
    h.recs.reverse().forEach(function (r) { if (r.before) data[r.key] = r.before; else delete data[r.key]; });
    $('log').removeChild($('log').lastChild); changes = Math.max(0, changes - 1);
    setMsg('Undone: ' + h.text); refresh();
  }
  function loaded(obj, source) {
    data = flatten(obj); history = []; changes = 0; $('log').textContent = '';
    $('status').textContent = 'Loaded ' + Object.keys(data).length + ' verses from ' + source + '.';
    setMsg(''); refresh();
  }
  function saveFile(share) {
    var text = serialize();
    var file = new File([text], 'crossrefs.json', { type: 'application/json' });
    if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).then(function () { changes = 0; refresh(); }).catch(function () {});
      return;
    }
    var url = URL.createObjectURL(file), a = document.createElement('a');
    a.href = url; a.download = 'crossrefs.json'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    changes = 0; refresh();
  }

  $('load-site').addEventListener('click', function () {
    $('status').textContent = 'Loading…';
    fetch('data/crossrefs.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { loaded(j, 'the site'); })
      .catch(function () { $('status').textContent = 'Could not load data/crossrefs.json from the site.'; });
  });
  $('file-in').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () { try { loaded(JSON.parse(rd.result), f.name); } catch (e) { $('status').textContent = 'That file is not valid JSON.'; } };
    rd.readAsText(f);
  });
  $('add').addEventListener('click', add);
  $('undo').addEventListener('click', undo);
  $('share').addEventListener('click', function () { saveFile(true); });
  $('download').addEventListener('click', function () { saveFile(false); });
  window.addEventListener('beforeunload', function (e) { if (changes) { e.preventDefault(); e.returnValue = ''; } });

  fetch('data/bible.json').then(function (r) { return r.json(); }).then(function (b) {
    bible = b;
    try { var s = localStorage.getItem('biblegems-lang'); if (s && b.langs[s]) lang = s; } catch (e) {}
    P1 = picker(document.querySelector('[data-p="1"]')); P2 = picker(document.querySelector('[data-p="2"]'));
    refresh();
  }).catch(function () { $('status').textContent = 'Could not load data/bible.json.'; });
})();
