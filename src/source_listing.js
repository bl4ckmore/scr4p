// source_listing.js — v1.2 — simple floating panel, always works

(function () {
  "use strict";

  function getStatementFromNextData() {
    const el = document.getElementById("__NEXT_DATA__");
    if (!el) return null;
    try {
      const data = JSON.parse(el.textContent);
      const queries = data.props.pageProps.dehydratedState.queries || [];
      for (const q of queries) {
        const st = q && q.state && q.state.data && q.state.data.data && q.state.data.data.statement;
        if (st && st.id) return st;
      }
    } catch (e) {}
    return null;
  }

  function normalize(st) {
    const images = (st.images || []).map((im) => ({
      large: im.large, thumb: im.thumb, is_main: !!im.is_main
    }));
    images.sort((a, b) => (b.is_main ? 1 : 0) - (a.is_main ? 1 : 0));
    return {
      source_id: st.id,
      source_url: location.href,
      deal_type_id: st.deal_type_id,
      real_estate_type_id: st.real_estate_type_id,
      city_id: st.city_id,       city_name: st.city_name,
      district_id: st.district_id, district_name: st.district_name,
      urban_id: st.urban_id,     urban_name: st.urban_name,
      street_id: st.street_id,
      status_id: st.status_id,   condition_id: st.condition_id,
      project_type_id: st.project_type_id,
      room_type_id: st.room_type_id,
      bedroom_type_id: st.bedroom_type_id,
      bathroom_type_id: st.bathroom_type_id,
      heating_type_id: st.heating_type_id,
      hot_water_type_id: st.hot_water_type_id,
      parking_type_id: st.parking_type_id,
      daily_rent_type_id: st.daily_rent_type_id,
      area: st.area, floor: st.floor, total_floors: st.total_floors,
      total_price: st.total_price, price: st.price,
      currency_id: st.currency_id, price_type_id: st.price_type_id,
      address: st.address, lat: st.lat, lng: st.lng,
      comment: st.comment, title: st.dynamic_title,
      parameters: (st.parameters || []).map((p) => ({ id: p.id, key: p.key, type: p.type })),
      images: images
    };
  }

  function injectPanel(payload) {
    if (document.getElementById("mh-copier-panel-source")) return;

    const panel = document.createElement("div");
    panel.id = "mh-copier-panel-source";
    panel.innerHTML =
      '<div class="mh-src-title">სწრაფი ატვირთვა</div>' +
      '<div class="mh-src-row">' +
        '<button class="mh-src-btn mh-src-green" id="mh-src-myhome">MyHome</button>' +
        '<button class="mh-src-btn mh-src-dark" id="mh-src-photos">ფოტო (' + payload.images.length + ')</button>' +
        '<button class="mh-src-btn mh-src-blue mh-src-disabled" disabled>SS</button>' +
      '</div>' +
      '<div class="mh-src-status" id="mh-src-status"></div>';

    // Inline styles so no CSS dependency issues
    panel.style.cssText = [
      'position:fixed',
      'bottom:20px',
      'right:20px',
      'z-index:2147483647',
      'background:#fff',
      'border:1px solid #e5e7eb',
      'border-radius:10px',
      'padding:12px 14px',
      'width:240px',
      'box-shadow:0 4px 20px rgba(0,0,0,0.12)',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(';');

    // Try to insert into sidebar (flex-col gap-4 with >2 children)
    let inserted = false;
    const sidebars = Array.from(document.querySelectorAll('div')).filter(e =>
      e.className.includes('flex-col') && e.className.includes('gap-4') &&
      e.offsetParent !== null && e.children.length > 2
    );
    if (sidebars.length > 0) {
      // Remove fixed positioning and insert inline
      panel.style.cssText = [
        'background:#fff',
        'border:1px solid #e8e8e8',
        'border-radius:12px',
        'padding:16px',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'box-shadow:0 1px 4px rgba(0,0,0,0.06)'
      ].join(';');
      sidebars[0].appendChild(panel);
      inserted = true;
    }
    if (!inserted) document.body.appendChild(panel);

    // Style to match myhome sidebar cards
    panel.querySelector('.mh-src-title').style.cssText =
      'font-size:12px;color:#6b7280;margin-bottom:10px;font-weight:500;letter-spacing:0.01em;';
    panel.querySelector('.mh-src-row').style.cssText = 'display:flex;gap:6px;';
    panel.querySelectorAll('.mh-src-btn').forEach(b => {
      b.style.cssText = [
        'flex:1',
        'padding:9px 6px',
        'border-radius:8px',
        'font-size:13px',
        'font-weight:600',
        'cursor:pointer',
        'border:none',
        'color:#fff',
        'transition:opacity 0.15s',
        'white-space:nowrap',
        'text-align:center'
      ].join(';');
    });
    panel.querySelector('.mh-src-green').style.background = '#26B571';
    panel.querySelector('.mh-src-dark').style.background  = '#1f2937';
    panel.querySelector('.mh-src-blue').style.cssText +=
      ';background:#60a5fa;opacity:0.5;cursor:not-allowed;';
    panel.querySelector('#mh-src-status').style.cssText =
      'font-size:11px;color:#26B571;margin-top:8px;min-height:14px;line-height:1.4;';

    const statusEl = panel.querySelector('#mh-src-status');

    // MyHome copy — save then open create form tab
    panel.querySelector('#mh-src-myhome').addEventListener('click', () => {
      const btn = panel.querySelector('#mh-src-myhome');
      btn.disabled = true;
      btn.textContent = '...';
      chrome.runtime.sendMessage({ type: 'SAVE_LISTING', payload }, (res) => {
        if (res && res.ok) {
          btn.textContent = '✓ იხსნება...';
          btn.style.background = '#16a34a';
          // Open the create form — it will auto-fill on load
          window.open('https://statements.myhome.ge/ka/statement/create', '_blank');
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = 'MyHome';
            btn.style.background = '#26B571';
          }, 4000);
        } else {
          btn.disabled = false;
          btn.textContent = 'MyHome';
          statusEl.textContent = 'შეცდომა';
        }
      });
    });

    // Download photos
    panel.querySelector('#mh-src-photos').addEventListener('click', () => {
      const btn = panel.querySelector('#mh-src-photos');
      btn.disabled = true;
      statusEl.textContent = 'იტვირთება...';
      const urls = payload.images.map(im => im.large).filter(Boolean);
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_PHOTOS', listingId: payload.source_id, imageUrls: urls }, (res) => {
        const count = (res && res.count) || 0;
        statusEl.textContent = count + '/' + urls.length + ' ჩამოიტვირთა';
        btn.disabled = false;
      });
    });
  }

  function init() {
    if (!/\/pr\/\d+/.test(location.href)) return;
    const st = getStatementFromNextData();
    if (!st) return;
    const payload = normalize(st);
    setTimeout(() => injectPanel(payload), 800);
  }

  init();

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      const old = document.getElementById('mh-copier-panel-source');
      if (old) old.remove();
      setTimeout(init, 800);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();