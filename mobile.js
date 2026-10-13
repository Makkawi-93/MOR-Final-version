/* MOR – mobile helpers (works together with mobile.css)
   - adds a ☰ button that opens the header links on small screens
   - on WebGIS pages, adds "Layers" / "Legend" buttons that slide the
     side panels over the map, and keeps the map below the header
   - lets embedded iframes (infographic) report their height */
(function () {
  var root = document.documentElement;
  var lang = (function () {
    try { return localStorage.getItem('mor-lang') || root.lang || 'it'; } catch (e) { return root.lang || 'it'; }
  })();
  var L10N = {
    it: { menu: 'Menu', layers: 'Layer', legend: 'Legenda' },
    en: { menu: 'Menu', layers: 'Layers', legend: 'Legend' }
  };
  function t(k) { return (L10N[lang] || L10N.it)[k]; }

  /* ── ☰ header menu ───────────────────────── */
  var navbar = document.querySelector('.site-header .navbar');
  var links = navbar && navbar.querySelector('.nav-links');
  if (navbar && links) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-toggle';
    btn.setAttribute('aria-label', t('menu'));
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '&#9776;';
    navbar.appendChild(btn);

    var setOpen = function (open) {
      root.classList.toggle('nav-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.innerHTML = open ? '&#10005;' : '&#9776;';
    };
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!root.classList.contains('nav-open'));
    });
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('click', function (e) {
      if (root.classList.contains('nav-open') && !navbar.contains(e.target)) setOpen(false);
    });
  }

  /* ── WebGIS pages ────────────────────────── */
  var filter = document.getElementById('filter-panel');
  var legend = document.getElementById('legend-panel');
  var mapEl = document.getElementById('map');
  if (filter && legend && mapEl) {
    root.classList.add('gis-page');

    var backdrop = document.createElement('div');
    backdrop.className = 'gis-backdrop';
    document.body.appendChild(backdrop);

    var bar = document.createElement('div');
    bar.className = 'gis-mobile-bar';
    bar.innerHTML =
      '<button type="button" data-panel="filter">&#9776; <span data-i18n="m.layers">' + t('layers') + '</span></button>' +
      '<button type="button" class="secondary" data-panel="legend">&#9673; <span data-i18n="m.legend">' + t('legend') + '</span></button>';
    document.body.appendChild(bar);

    var closePanels = function () { root.classList.remove('show-filter', 'show-legend'); };
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var cls = 'show-' + b.getAttribute('data-panel');
      var wasOpen = root.classList.contains(cls);
      closePanels();
      if (!wasOpen) root.classList.add(cls);
    });
    backdrop.addEventListener('click', closePanels);

    /* keep map/panels exactly below the header, whatever its height */
    var header = document.querySelector('.site-header');
    var lastH = 0;
    var syncHeader = function () {
      var h = header ? header.offsetHeight : 0;
      if (h && h !== lastH) {
        lastH = h;
        root.style.setProperty('--hdr', h + 'px');
        if (window.map && typeof window.map.invalidateSize === 'function') window.map.invalidateSize();
      }
    };
    syncHeader();
    window.addEventListener('load', syncHeader);
    window.addEventListener('resize', function () {
      syncHeader();
      if (window.innerWidth > 860) closePanels();
    });
  }

  /* ── iframes that report their own height (infographic) ── */
  window.addEventListener('message', function (e) {
    if (!e.data || typeof e.data.morFrameHeight !== 'number') return;
    var frames = document.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source) {
        frames[i].style.height = Math.ceil(e.data.morFrameHeight) + 'px';
      }
    }
  });
})();
