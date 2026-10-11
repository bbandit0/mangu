/* =========================================================
   MANGU — patch v3.10 · Buscador robusto
   - Delegación de eventos en document: sobrevive a render()
   - AniList primero, Jikan como fallback
   - Mensajes visibles de error / sin conexión
   Cargar DESPUÉS de patch-v3.9.js
   ========================================================= */
(function () {
  'use strict';
  if (window._p310Loaded) return;
  window._p310Loaded = true;

  var DEBOUNCE = 450, MIN_CHARS = 3;
  var timer = null, seq = 0, filling = false;

  /* ---------- estilos ---------- */
  if (!document.getElementById('p310-style')) {
    var st = document.createElement('style');
    st.id = 'p310-style';
    st.textContent =
      '.p310-dd{position:absolute;z-index:99999;background:#0a1020;border:1px solid #131d2e;border-radius:12px;max-height:360px;overflow-y:auto;box-shadow:0 12px 32px rgba(0,0,0,.55)}' +
      '.p310-it{display:flex;gap:10px;align-items:center;padding:8px 10px;cursor:pointer;border-bottom:1px solid #0f1826}' +
      '.p310-it:last-child{border-bottom:none}' +
      '.p310-it:hover{background:#131d2e}' +
      '.p310-it img{width:36px;height:52px;object-fit:cover;border-radius:4px;flex:none;background:#131d2e}' +
      '.p310-t{color:#c8dae8;font-size:13px;font-weight:600;line-height:1.25}' +
      '.p310-s{color:#6b85a3;font-size:11px;margin-top:3px}' +
      '.p310-msg{padding:12px 14px;color:#6b85a3;font-size:12px}';
    document.head.appendChild(st);
  }

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isAnime() {
    var shell = document.querySelector('.mng-add-shell');
    if (shell) return /agregar anime/i.test(shell.textContent);
    try { if (typeof tab !== 'undefined') return tab === 'anime'; } catch (e) {}
    return false;
  }

  function getBox(input) {
    var box = document.getElementById('p310-dd');
    if (!box) {
      box = document.createElement('div');
      box.id = 'p310-dd';
      box.className = 'p310-dd';
      document.body.appendChild(box);
    }
    var r = input.getBoundingClientRect();
    box.style.left = (r.left + window.scrollX) + 'px';
    box.style.top = (r.bottom + window.scrollY + 6) + 'px';
    box.style.width = r.width + 'px';
    return box;
  }

  function closeBox() {
    var b = document.getElementById('p310-dd');
    if (b) b.remove();
  }

  /* ---------- APIs ---------- */
  function searchAniList(q, anime) {
    var query =
      'query($s:String,$t:MediaType){Page(perPage:8){media(search:$s,type:$t,isAdult:false){' +
      'id idMal title{romaji english} chapters episodes status format startDate{year} genres coverImage{large medium}}}}';
    return fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: query, variables: { s: q, t: anime ? 'ANIME' : 'MANGA' } })
    }).then(function (r) {
      if (!r.ok) throw new Error('AniList ' + r.status);
      return r.json();
    }).then(function (j) {
      var list = (j && j.data && j.data.Page && j.data.Page.media) || [];
      return list.map(function (m) {
        return {
          title: m.title.romaji || m.title.english,
          total: anime ? m.episodes : m.chapters,
          cover: (m.coverImage && (m.coverImage.large || m.coverImage.medium)) || '',
          genres: m.genres || [],
          year: (m.startDate && m.startDate.year) || '',
          format: m.format || '',
          status: m.status || '',
          malId: m.idMal || null,
          anilistId: m.id
        };
      });
    });
  }

  function searchJikan(q, anime) {
    var url = 'https://api.jikan.moe/v4/' + (anime ? 'anime' : 'manga') +
      '?q=' + encodeURIComponent(q) + '&limit=8&sfw=true';
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Jikan ' + r.status);
      return r.json();
    }).then(function (j) {
      return (j.data || []).map(function (m) {
        var from = anime ? (m.aired && m.aired.prop && m.aired.prop.from)
                         : (m.published && m.published.prop && m.published.prop.from);
        return {
          title: m.title,
          total: anime ? m.episodes : m.chapters,
          cover: (m.images && m.images.jpg && m.images.jpg.image_url) || '',
          genres: (m.genres || []).map(function (g) { return g.name; }),
          year: (from && from.year) || '',
          format: m.type || '',
          status: m.status || '',
          malId: m.mal_id || null,
          anilistId: null
        };
      });
    });
  }

  /* ---------- búsqueda ---------- */
  function run(input) {
    input = document.getElementById('add-title') || input;
    var q = (input.value || '').trim();
    var my = ++seq;
    if (q.length < MIN_CHARS) { closeBox(); return; }

    if (!navigator.onLine) {
      getBox(input).innerHTML = '<div class="p310-msg">⚠️ Sin conexión a internet</div>';
      return;
    }

    var anime = isAnime();
    getBox(input).innerHTML = '<div class="p310-msg">Buscando…</div>';
    var firstErr = null;

    searchAniList(q, anime)
      .catch(function (e) { firstErr = e; return []; })
      .then(function (res) {
        if (res.length) return res;
        return searchJikan(q, anime).catch(function (e) { firstErr = firstErr || e; return []; });
      })
      .then(function (res) {
        if (my !== seq) return; // llegó una búsqueda más nueva
        var inp = document.getElementById('add-title');
        if (!inp) { closeBox(); return; }
        var box = getBox(inp);

        if (!res.length) {
          if (firstErr) console.warn('[MANGU p310]', firstErr);
          box.innerHTML = '<div class="p310-msg">' +
            (firstErr ? '❌ Error de API: ' + esc(firstErr.message) : 'Sin resultados') + '</div>';
          return;
        }

        window._p310Results = res;
        box.innerHTML = res.map(function (m, i) {
          var info = [m.format, m.year,
            m.total ? m.total + (anime ? ' eps' : ' caps') : 'en emisión'].filter(Boolean).join(' · ');
          return '<div class="p310-it" data-i="' + i + '">' +
            '<img src="' + esc(m.cover) + '" loading="lazy" alt="">' +
            '<div><div class="p310-t">' + esc(m.title) + '</div>' +
            '<div class="p310-s">' + esc(info) + '</div></div></div>';
        }).join('');
      });
  }

  /* ---------- selección ---------- */
  function setVal(el, v) {
    if (!el) return;
    filling = true;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    filling = false;
  }

  function pick(m) {
    if (!m) return;
    var shell = document.querySelector('.mng-add-shell') || document;
    setVal(document.getElementById('add-title'), m.title);
    if (m.total) {
      setVal(shell.querySelector('input[type="number"], input[placeholder*="mero de"]'), m.total);
    }
    var coverInp = shell.querySelector('#add-cover, input[id*="cover"]');
    if (coverInp && m.cover) setVal(coverInp, m.cover);
    window._p310Pick = m; // portada, géneros, malId disponibles aquí
    closeBox();
    if (typeof showToast === 'function') showToast('✓ ' + m.title);
  }

  /* ---------- eventos (delegados: sobreviven a render) ---------- */
  document.addEventListener('input', function (e) {
    if (filling || !e.target || e.target.id !== 'add-title') return;
    clearTimeout(timer);
    var t = e.target;
    timer = setTimeout(function () { run(t); }, DEBOUNCE);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeBox(); return; }
    if (e.key === 'Enter' && e.target && e.target.id === 'add-title') {
      clearTimeout(timer);
      run(e.target);
    }
  }, true);

  document.addEventListener('click', function (e) {
    var it = e.target.closest && e.target.closest('.p310-it');
    if (it) { pick((window._p310Results || [])[+it.dataset.i]); return; }
    if (!e.target || e.target.id !== 'add-title') closeBox();
  });

  window.addEventListener('resize', closeBox);

  console.log('[MANGU v3.10] Buscador robusto activado ✓');
})();
