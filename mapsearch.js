/* MOR – coordinate search bar for the WebGIS map pages (styles in mapsearch.css).
   Accepts decimal degrees (44.79, 7.99 / 44,79 7,99), degrees-minutes-seconds
   (44°47'24"N 7°59'24"E) and UTM 32N / EPSG:32632 (411500 4960300).
   On the photovoltaic map it also reports whether the point is in an exclusion area.
   Load after lang.js. */
(function () {
  var map = window.map, L = window.L;
  var mapEl = document.getElementById('map');
  if (!map || !L || !mapEl) return;

  var TEXT = {
    it: {
      placeholder: 'Cerca coordinate… es. 44.79, 7.99',
      button: 'Cerca',
      error: 'Coordinate non riconosciute',
      title: 'Punto cercato',
      inside: 'Area di esclusione: ',
      outside: 'Fuori dalle aree di esclusione',
      remove: 'Rimuovi punto',
      clear: 'Cancella ricerca',
      layers: {
        natura: 'Rete Natura 2000', aree: 'Aree protette (EUAP)',
        frana: 'Pericolosità da frana elevata', idraulica: 'Pericolosità idraulica elevata',
        corpi: 'Corpi idrici con buffer'
      }
    },
    en: {
      placeholder: 'Search coordinates… e.g. 44.79, 7.99',
      button: 'Search',
      error: 'Coordinates not recognised',
      title: 'Searched point',
      inside: 'Exclusion area: ',
      outside: 'Outside all exclusion areas',
      remove: 'Remove point',
      clear: 'Clear search',
      layers: {
        natura: 'Natura 2000 network', aree: 'Protected areas (EUAP)',
        frana: 'High landslide hazard', idraulica: 'High flood hazard',
        corpi: 'Water bodies with buffer'
      }
    }
  };

  // Exclusion layers (only present on the photovoltaic map)
  var CHECKS = [
    ['natura', 'layer_rete_natura_10'],
    ['aree', 'layer_aree_protette_9'],
    ['frana', 'layer_pericolosit_da_frana_elevata_8'],
    ['idraulica', 'layer_pericolosit_idraulica_elevata_7'],
    ['corpi', 'layer_corpi_idrici_con_zona_di_buffer_6']
  ].filter(function (c) { return window[c[1]]; });

  function lang() {
    var l = document.documentElement.lang;
    try { l = localStorage.getItem('mor-lang') || l; } catch (e) {}
    return TEXT[l] ? l : 'it';
  }
  function t() { return TEXT[lang()]; }

  /* ── UI ─────────────────────────────────────── */
  var box = document.createElement('div');
  box.className = 'map-search';
  box.innerHTML =
    '<form role="search">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
      '<input type="text" inputmode="text" autocomplete="off">' +
      '<button type="button" class="map-search-clear" hidden>&times;</button>' +
      '<button type="submit" class="map-search-go"></button>' +
    '</form>' +
    '<div class="map-search-note"></div>';
  mapEl.appendChild(box);
  L.DomEvent.disableClickPropagation(box);
  L.DomEvent.disableScrollPropagation(box);

  var input = box.querySelector('input');
  var button = box.querySelector('.map-search-go');
  var clearBtn = box.querySelector('.map-search-clear');
  var note = box.querySelector('.map-search-note');
  var errorTimer = null, marker = null, lastPoint = null;

  function updateClear() { clearBtn.hidden = !(input.value || marker); }

  function clearSearch() {
    if (marker) { map.removeLayer(marker); marker = null; }
    lastPoint = null;
    input.value = '';
    updateClear();
  }

  function renderText() {
    var tx = t();
    input.placeholder = tx.placeholder;
    input.setAttribute('aria-label', tx.placeholder);
    button.textContent = tx.button;
    clearBtn.title = tx.clear;
    clearBtn.setAttribute('aria-label', tx.clear);
    if (marker && lastPoint) marker.setPopupContent(popupHtml(lastPoint));
  }

  /* ── Parsing ────────────────────────────────── */
  function num(s) { return parseFloat(String(s).replace(',', '.')); }

  function parseDMS(s) {
    var re = /(-?\d+(?:[.,]\d+)?)\s*°\s*(?:(\d+(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:["″”]|''|′′)\s*)?([NSEWO])?/gi;
    var out = [], m;
    while ((m = re.exec(s)) && out.length < 2) {
      var v = Math.abs(num(m[1])) + (m[2] ? num(m[2]) / 60 : 0) + (m[3] ? num(m[3]) / 3600 : 0);
      var h = (m[4] || '').toUpperCase();
      if (num(m[1]) < 0 || h === 'S' || h === 'W' || h === 'O') v = -v;
      out.push({ v: v, h: h });
    }
    if (out.length < 2) return null;
    var a = out[0], b = out[1];
    if (a.h === 'E' || a.h === 'W' || a.h === 'O') { var tmp = a; a = b; b = tmp; }
    return [a.v, b.v];
  }

  function utm32ToLatLng(E, N) {
    var a = 6378137, e2 = 0.00669438, k0 = 0.9996, lon0 = 9 * Math.PI / 180;
    var ep2 = e2 / (1 - e2), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    var x = E - 500000, mu = (N / k0) / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
    var p = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
               + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
               + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
               + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var sp = Math.sin(p), cp = Math.cos(p), tp = Math.tan(p);
    var C = ep2 * cp * cp, T = tp * tp, Nn = a / Math.sqrt(1 - e2 * sp * sp);
    var R = a * (1 - e2) / Math.pow(1 - e2 * sp * sp, 1.5), D = x / (Nn * k0);
    var lat = p - (Nn * tp / R) * (D * D / 2 - (5 + 3 * T + 10 * C - 4 * C * C - 9 * ep2) * Math.pow(D, 4) / 24
              + (61 + 90 * T + 298 * C + 45 * T * T - 252 * ep2 - 3 * C * C) * Math.pow(D, 6) / 720);
    var lon = lon0 + (D - (1 + 2 * T + C) * Math.pow(D, 3) / 6
              + (5 - 2 * C + 28 * T - 3 * C * C + 8 * ep2 + 24 * T * T) * Math.pow(D, 5) / 120) / cp;
    return [lat * 180 / Math.PI, lon * 180 / Math.PI];
  }

  function parse(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    if (s.indexOf('°') !== -1) return parseDMS(s);

    // "44,79 7,99" → Italian decimal commas; otherwise commas/semicolons separate the two numbers
    if (/^-?\d+,\d+[\s;]+-?\d+,\d+$/.test(s)) s = s.replace(/,/g, '.');
    var n = s.replace(/[;,]/g, ' ').match(/-?\d+(?:\.\d+)?/g);
    if (!n || n.length !== 2) return null;
    var a = parseFloat(n[0]), b = parseFloat(n[1]);

    // UTM 32N: easting 100 000–900 000 m, northing up to 10 000 000 m (either order)
    if (Math.abs(a) > 180 || Math.abs(b) > 180) {
      if (a > b) { var tmp = a; a = b; b = tmp; }
      if (a >= 100000 && a <= 900000 && b > 0 && b < 10000000) return utm32ToLatLng(a, b);
      return null;
    }
    // Decimal degrees: "lat, lon"; also accept "lon, lat" for points in Italy
    if (a >= 6 && a <= 19 && b >= 35 && b <= 48) return [b, a];
    if (Math.abs(a) <= 90) return [a, b];
    return null;
  }

  /* ── Exclusion check (ray casting on the GeoJSON polygons) ── */
  function inRing(x, y, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function inGeometry(x, y, g) {
    if (!g) return false;
    var polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    return polys.some(function (poly) {
      return inRing(x, y, poly[0]) && !poly.slice(1).some(function (hole) { return inRing(x, y, hole); });
    });
  }
  function exclusionsAt(lat, lng) {
    var hits = [];
    CHECKS.forEach(function (c) {
      var found = false;
      window[c[1]].eachLayer(function (l) {
        if (!found && l.feature && inGeometry(lng, lat, l.feature.geometry)) found = true;
      });
      if (found) hits.push(c[0]);
    });
    return hits;
  }

  /* ── Result ─────────────────────────────────── */
  function popupHtml(p) {
    var tx = t();
    var html = '<div class="map-search-pop"><div class="msp-title">' + tx.title + '</div>' +
               '<div class="msp-coords">' + p[0].toFixed(5) + ', ' + p[1].toFixed(5) + '</div>';
    if (CHECKS.length) {
      var hits = exclusionsAt(p[0], p[1]);
      html += hits.length
        ? '<div class="msp-status inside">' + tx.inside + hits.map(function (k) { return tx.layers[k]; }).join(', ') + '</div>'
        : '<div class="msp-status">' + tx.outside + '</div>';
    }
    return html + '<a href="#" class="msp-remove">' + tx.remove + '</a></div>';
  }

  // "Remove point" link inside the popup
  mapEl.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.msp-remove')) { e.preventDefault(); clearSearch(); }
  });

  var pin = L.divIcon({
    className: '', iconSize: [26, 36], iconAnchor: [13, 35], popupAnchor: [0, -32],
    html: '<svg width="26" height="36" viewBox="0 0 26 36" aria-hidden="true"><path d="M13 1C6.4 1 1.5 6 1.5 12.6 1.5 21.5 13 35 13 35S24.5 21.5 24.5 12.6C24.5 6 19.6 1 13 1Z" fill="#593922" stroke="#fff" stroke-width="2"/><circle cx="13" cy="12.6" r="4.5" fill="#E6C165"/></svg>'
  });

  function showError() {
    note.textContent = t().error;
    note.classList.add('error');
    clearTimeout(errorTimer);
    errorTimer = setTimeout(function () {
      note.classList.remove('error');
      note.textContent = '';
    }, 3000);
  }

  box.querySelector('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var p = parse(input.value);
    if (!p || isNaN(p[0]) || isNaN(p[1]) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180) { showError(); return; }
    lastPoint = p;
    if (marker) map.removeLayer(marker);
    marker = L.marker(p, { icon: pin, keyboard: false }).addTo(map).bindPopup(popupHtml(p), { maxWidth: 280 });
    map.setView(p, Math.max(map.getZoom(), 14));
    marker.openPopup();
    updateClear();
    input.blur();
  });

  input.addEventListener('input', updateClear);
  input.addEventListener('keydown', function (e) { if (e.key === 'Escape') clearSearch(); });
  clearBtn.addEventListener('click', function () { clearSearch(); input.focus(); });

  /* ── Follow the site language switch (lang.js) ── */
  var origSetLang = window.setLang;
  if (typeof origSetLang === 'function') {
    window.setLang = function (l) { origSetLang(l); renderText(); };
  }
  document.addEventListener('DOMContentLoaded', renderText);
  renderText();
})();
