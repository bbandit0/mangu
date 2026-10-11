/* =========================================================
   MANGU — patch v3.10 (rev. 2) · Buscador de manga robusto
   ---------------------------------------------------------
   Problema: el buscador de MANGA de ui.js depende solo de Jikan.
   Si Jikan falla o no responde, searchJikan() deja jikanResults=[]
   en silencio y nunca dibuja el desplegable.

   Solución: se reemplaza window.searchJikan SOLO para manga:
     1. AniList primero (timeout 7 s), resultados convertidos al
        formato Jikan para reutilizar el flujo ORIGINAL de ui.js:
        renderJikanDrop() → selectJikanResult() → tarjeta de
        selección, badge de caps y géneros auto-marcados.
     2. Conteo real de capítulos con _getMangaCount() (proxy
        MangaDex / Kitsu / Jikan), igual que el original.
     3. Si AniList falla o no trae nada → búsqueda original Jikan.
   Anime no se toca (ya usaba AniList primero).
   Diseño: 100 % el original. No inyecta CSS.
   Cargar DESPUÉS de patch-v3.9.js
   ========================================================= */
(function () {
  'use strict';
  if (window._p310Loaded) return;
  window._p310Loaded = true;

  var _origSearch = window.searchJikan;
  if (typeof _origSearch !== 'function') {
    console.warn('[MANGU v3.10] searchJikan no existe — parche no aplicado');
    return;
  }

  var AL_TIMEOUT = 7000;
  var seq = 0;

  function timeout(ms) {
    return new Promise(function (_, rej) {
      setTimeout(function () { rej(new Error('timeout')); }, ms);
    });
  }

  /* ---------- AniList → formato Jikan ---------- */
  function aniListManga(q) {
    var query =
      'query($s:String){Page(perPage:10){media(search:$s,type:MANGA,isAdult:false){' +
      'id idMal format status chapters volumes averageScore synonyms ' +
      'title{romaji english} startDate{year} endDate{year} genres ' +
      'coverImage{extraLarge large medium}}}}';
    return Promise.race([
      fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: query, variables: { s: q } })
      }).then(function (r) {
        if (!r.ok) throw new Error('AniList ' + r.status);
        return r.json();
      }),
      timeout(AL_TIMEOUT)
    ]).then(function (j) {
      var list = (j && j.data && j.data.Page && j.data.Page.media) || [];
      return list
        .filter(function (m) { return m.format === 'MANGA'; }) // excluye one-shot y novelas (como el original)
        .slice(0, 6)
        .map(toJikan);
    });
  }

  function toJikan(m) {
    var en = (m.title && m.title.english) || null;
    var ro = (m.title && m.title.romaji) || en || '';
    var cov = m.coverImage || {};
    var releasing = m.status === 'RELEASING';
    return {
      mal_id: m.idMal || null,
      title: ro,
      title_english: en,
      title_synonyms: m.synonyms || [],
      _displayTitle: en || ro,
      images: { jpg: {
        image_url: cov.medium || cov.large || '',
        large_image_url: cov.extraLarge || cov.large || cov.medium || ''
      } },
      type: 'Manga',
      chapters: m.chapters || null,
      volumes: m.volumes || null,
      publishing: releasing,
      score: m.averageScore ? m.averageScore / 10 : null,
      genres: (m.genres || []).map(function (g) { return { name: g }; }),
      themes: [],
      demographics: [],
      published: { prop: {
        from: { year: (m.startDate && m.startDate.year) || null },
        to: { year: (m.endDate && m.endDate.year) || null }
      } },
      _accEps: m.chapters || 0,
      _seasonCount: 1,
      _anyAiring: releasing,
      _latestMalId: m.idMal || null,
      _p310: true
    };
  }

  /* ---------- nueva searchJikan ---------- */
  window.searchJikan = function (query, tabType) {
    if (tabType !== 'manga') return _origSearch.apply(this, arguments);
    if (!query || query.length < 2) return _origSearch.apply(this, arguments);

    var my = ++seq;
    var self = this, args = arguments;

    return aniListManga(query)
      .catch(function (e) {
        console.warn('[MANGU v3.10] AniList falló, uso Jikan:', e.message);
        return [];
      })
      .then(function (res) {
        if (my !== seq) return; // el usuario siguió escribiendo
        if (!res.length) return _origSearch.apply(self, args); // fallback Jikan original

        jikanResults = res;          // variable global de tracker.js
        removeJikanDrop();
        renderJikanDrop('manga');    // desplegable ORIGINAL

        // Conteo real de capítulos (mismo método que el original)
        return Promise.all(res.map(function (item) {
          if (!item.mal_id) { item._latestChapter = item.chapters || 0; return; }
          var title = item._displayTitle || item.title || '';
          return _getMangaCount(item.mal_id, title, item.chapters || 0)
            .catch(function () { return 0; })
            .then(function (best) {
              if (my !== seq) return;
              var live = jikanResults.find(function (x) { return x.mal_id === item.mal_id; });
              if (!live) return;
              live._latestChapter = best || 0;
              renderJikanDrop('manga');
            });
        }));
      });
  };

  console.log('[MANGU v3.10] Buscador manga: AniList → Jikan ✓');
})();
