/* =========================================================
   MANGU — patch v3.11 · Paleta "Grafito & Amarillo"
   ---------------------------------------------------------
   Solo cambia COLORES. No toca estructura, textos ni lógica.

   Cómo funciona: convierte cada color de la app según su tono (HSL),
   en CSS (main.css + <style> de los parches) y en estilos inline
   generados por JS (vía MutationObserver):
     · Azul-marino de fondos/bordes/textos  → gris grafito neutro
     · Verdes (acento manga)                → amarillo  (#ffd23f aprox.)
     · Violetas (acento anime)              → celeste   (#6cb8ff aprox.)
     · Dorados (racha/tiempo)               → naranjo   (#ffa94d aprox.)
     · Rojo, rosa, blanco, negro, celestes  → sin cambio
   La transparencia (rgba) se conserva.

   Volver a los colores originales sin borrar nada (consola):
     localStorage.setItem('mangu_palette','original'); location.reload();
   Reactivar:
     localStorage.removeItem('mangu_palette'); location.reload();

   Cargar DESPUÉS de patch-v3.10-searchfix.js (último de la lista).
   ========================================================= */
(function () {
  'use strict';
  if (window._p311Loaded) return;
  window._p311Loaded = true;
  try { if (localStorage.getItem('mangu_palette') === 'original') { console.log('[MANGU v3.11] Paleta original (desactivado)'); return; } } catch (e) {}

  /* ---------- conversión de color ---------- */
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    if (!s) { var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [Math.round(f(p, q, h + 1 / 3) * 255), Math.round(f(p, q, h) * 255), Math.round(f(p, q, h - 1 / 3) * 255)];
  }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  var produced = Object.create(null); // colores ya convertidos → no reprocesar
  var cache = Object.create(null);

  function mapRGB(r, g, b) {
    var key = r + ',' + g + ',' + b;
    if (produced[key]) return null;
    if (cache[key] !== undefined) return cache[key];
    var hsl = rgb2hsl(r, g, b), h = hsl[0], s = hsl[1], l = hsl[2], out = null;

    if (s < 0.08) out = null;                                   // neutros: igual
    else if (h >= 195 && h <= 235 && s < 0.6)                   // azul-marino → grafito
      out = hsl2rgb(225, 0.06, l);
    else if (h >= 120 && h <= 175)                              // verdes → amarillo
      out = l >= 0.35 ? hsl2rgb(46, Math.max(s, 0.85), clamp(l + 0.15, 0.5, 0.8))
                      : hsl2rgb(46, s, l);
    else if (h >= 250 && h <= 300 && s > 0.3)                   // violetas → celeste
      out = hsl2rgb(210, s, l);
    else if (h >= 36 && h <= 50 && s > 0.75 && l > 0.4)         // dorados → naranjo
      out = hsl2rgb(30, s, clamp(l + 0.06, 0, 0.75));

    if (out) produced[out.join(',')] = true;
    cache[key] = out;
    return out;
  }

  function hex2(n) { return (n < 16 ? '0' : '') + n.toString(16); }
  var RE = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+%?)\s*)?\)/g;

  function recolor(text) {
    if (!text || (text.indexOf('#') < 0 && text.indexOf('rgb') < 0)) return text;
    return text.replace(RE, function (m, hex, r, g, b, a) {
      if (hex) {
        var x = hex.length <= 4 ? hex.split('').map(function (c) { return c + c; }).join('') : hex;
        var R = parseInt(x.slice(0, 2), 16), G = parseInt(x.slice(2, 4), 16), B = parseInt(x.slice(4, 6), 16);
        var o = mapRGB(R, G, B);
        if (!o) return m;
        return '#' + hex2(o[0]) + hex2(o[1]) + hex2(o[2]) + (x.length === 8 ? x.slice(6, 8) : '');
      }
      var o2 = mapRGB(+r, +g, +b);
      if (!o2) return m;
      return a !== undefined ? 'rgba(' + o2.join(',') + ',' + a + ')' : 'rgb(' + o2.join(',') + ')';
    });
  }

  // En CSS solo se tocan los VALORES (tras ':'), nunca los selectores:
  // evita romper ids que parecen hex, como #acf o #add-title.
  function recolorCSS(css) {
    return css.replace(/:([^;{}]+)/g, function (m, v) { return ':' + recolor(v); });
  }

  /* ---------- hojas de estilo ---------- */
  function doStyle(el) {
    if (!el || el.__p311 === el.textContent) return;
    var t = recolorCSS(el.textContent);
    if (t !== el.textContent) el.textContent = t;
    el.__p311 = el.textContent;
  }
  function doLink(link) {
    if (link.__p311 || !/\.css(\?|$)/.test(link.href) || link.href.indexOf(location.origin) !== 0) return;
    link.__p311 = true;
    fetch(link.href).then(function (r) { return r.text(); }).then(function (css) {
      var st = document.createElement('style');
      st.setAttribute('data-p311-from', link.getAttribute('href'));
      // url(...) relativas: se resuelven contra la ubicación del CSS original
      var base = link.href.replace(/[^/]*$/, '');
      st.textContent = recolorCSS(css).replace(/url\(\s*(['"]?)(?!data:|https?:|\/)([^'")]+)\1\s*\)/g, function (m, q, u) { return 'url(' + q + base + u + q + ')'; });
      st.__p311 = st.textContent;
      link.parentNode.insertBefore(st, link.nextSibling);
      link.disabled = true;
    }).catch(function (e) { console.warn('[MANGU v3.11] No pude recolorear', link.href, e); });
  }

  /* ---------- estilos inline y atributos SVG ---------- */
  var ATTRS = ['style', 'fill', 'stroke', 'stop-color', 'color', 'bgcolor'];
  function doEl(el) {
    if (el.nodeType !== 1) return;
    if (el.tagName === 'STYLE') { doStyle(el); return; }
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute(ATTRS[i]);
      if (v) { var n = recolor(v); if (n !== v) el.setAttribute(ATTRS[i], n); }
    }
  }
  function doTree(root) {
    if (root.nodeType !== 1) return;
    doEl(root);
    var list = root.querySelectorAll('[style],[fill],[stroke],[stop-color],[color],[bgcolor],style');
    for (var i = 0; i < list.length; i++) doEl(list[i]);
  }

  /* ---------- arranque ---------- */
  document.querySelectorAll('link[rel="stylesheet"]').forEach(doLink);
  document.querySelectorAll('style').forEach(doStyle);
  doTree(document.documentElement);   // incluye las variables --bg1, --am, etc. del <html>

  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'attributes') doEl(m.target);
      else if (m.type === 'characterData') { var p = m.target.parentNode; if (p && p.tagName === 'STYLE') doStyle(p); }
      else {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.tagName === 'LINK' && n.rel === 'stylesheet') doLink(n);
          else if (n.nodeType === 3 && n.parentNode && n.parentNode.tagName === 'STYLE') doStyle(n.parentNode);
          else doTree(n);
        }
      }
    }
  });
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRS, characterData: true });

  var mt = document.querySelector('meta[name="theme-color"]');
  if (mt) mt.setAttribute('content', '#111214');

  window._p311Recolor = recolor; // para pruebas en consola
  console.log('[MANGU v3.11] Paleta Grafito & Amarillo ✓');
})();
