(function () {
  'use strict';
  var KEY = 'biblegems-progress-v1';
  var WOL = 'https://wol.jw.org/en/wol/l/r1/lp-e';
  var readings = [];
  var done = {};

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) arr.forEach(function (i) { done[i] = true; });
    } catch (e) { done = {}; }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.keys(done).map(Number)));
    } catch (e) { /* storage unavailable */ }
  }
  function url(ref) {
    var u = new URL(WOL);
    u.searchParams.set('q', ref);
    return u.toString();
  }
  function update() {
    var n = Object.keys(done).length, total = readings.length;
    document.getElementById('progress-text').textContent = 'Completed: ' + n + ' / ' + total;
    document.getElementById('progress-fill').style.width = (total ? n / total * 100 : 0) + '%';
    document.getElementById('progress-bar').setAttribute('aria-valuenow', n);
  }
  function render() {
    var list = document.getElementById('readings');
    var frag = document.createDocumentFragment();
    readings.forEach(function (ref, i) {
      var li = document.createElement('li');
      li.className = 'item' + (done[i] ? ' done' : '');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'r' + i;
      cb.checked = !!done[i];
      cb.setAttribute('aria-label', 'Mark as read: ' + ref);
      cb.addEventListener('change', function () {
        if (cb.checked) done[i] = true; else delete done[i];
        li.classList.toggle('done', cb.checked);
        save(); update();
      });
      var a = document.createElement('a');
      a.href = url(ref);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = ref;
      li.appendChild(cb); li.appendChild(a);
      frag.appendChild(li);
    });
    list.appendChild(frag);
    update();
  }
  document.getElementById('reset-btn').addEventListener('click', function () {
    if (!window.confirm('Reset all progress? This cannot be undone.')) return;
    done = {}; save();
    document.querySelectorAll('#readings .item').forEach(function (li) {
      li.classList.remove('done');
      li.querySelector('input').checked = false;
    });
    update();
  });
  fetch('readings.json').then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function (data) {
    readings = data; load(); render();
  }).catch(function () {
    document.getElementById('error').hidden = false;
  });
})();
