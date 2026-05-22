// create_form.js — v1.0

(function () {
  "use strict";

  function getJWT() {
    var match = document.cookie.split(';')
      .map(function(c) { return c.trim(); })
      .find(function(c) { return c.startsWith('AccessToken='); });
    return match ? match.slice('AccessToken='.length) : null;
  }

  function setVal(el, value) {
    if (!el) return false;
    var proto = el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, String(value));
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function stripHtml(str) {
    if (!str) return '';
    return str.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  function wait(ms) {
    return new Promise(function(r) { setTimeout(r, ms); });
  }

  function clickLabelInSection(text, sectionHint) {
    var labels = document.querySelectorAll('label');
    for (var i = 0; i < labels.length; i++) {
      if ((labels[i].innerText || '').trim() !== text) continue;
      if (!sectionHint) { labels[i].click(); return true; }
      var node = labels[i].parentElement;
      for (var j = 0; j < 10; j++) {
        if (!node) break;
        if ((node.textContent || '').includes(sectionHint)) {
          labels[i].click(); return true;
        }
        node = node.parentElement;
      }
    }
    return false;
  }

  function clickLabel(text) { return clickLabelInSection(text, null); }

  function clickLabelWithRetry(text, maxWait, sectionHint) {
    return new Promise(function(resolve) {
      var elapsed = 0;
      function attempt() {
        if (clickLabelInSection(text, sectionHint)) { resolve(true); return; }
        elapsed += 150;
        if (elapsed >= maxWait) { resolve(false); return; }
        setTimeout(attempt, 150);
      }
      attempt();
    });
  }

  function goToSection(sectionName) {
    return new Promise(function(resolve) {
      var items = document.querySelectorAll('ul li');
      for (var i = 0; i < items.length; i++) {
        var t = (items[i].innerText || '').trim();
        if (t === sectionName || t.includes(sectionName)) {
          items[i].click();
          setTimeout(resolve, 200);
          return;
        }
      }
      resolve();
    });
  }

  function getSuggestionsNearInput(inputEl) {
    if (!inputEl) return [];
    var container = inputEl.parentElement;
    for (var k = 0; k < 6; k++) {
      if (!container) break;
      var items = Array.from(container.querySelectorAll('span.inline-block'));
      if (items.length > 0) return items.filter(function(e){ return e.offsetParent !== null; });
      container = container.parentElement;
    }
    return [];
  }

  function getVisibleSuggestions() {
    // Confirmed: city/street suggestions are SPAN with class "inline-block w-full text-sm text-black-100"
    var spans = Array.from(document.querySelectorAll('span.inline-block'))
      .filter(function(e) {
        return e.offsetParent !== null &&
          (e.innerText||'').trim().length > 1 &&
          (e.innerText||'').trim().length < 80;
      });
    if (spans.length > 0) return spans;
    // fallback
    return Array.from(document.querySelectorAll('[class*=cursor-pointer]'))
      .filter(function(e) {
        return e.offsetParent !== null && e.children.length === 0 &&
          (e.innerText||'').trim().length > 1 && !e.closest('ul') && !e.closest('header');
      });
  }

  function fullClick(el) {
    // Full mouse event sequence to properly trigger React handlers
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
    el.click();
    // Also try clicking the parent (suggestion row container)
    if (el.parentElement) el.parentElement.click();
  }

  function streetMatches(suggestion, searchText) {
    var s = suggestion.toLowerCase();
    var q = searchText.toLowerCase();
    if (s === q) return true;
    if (s.startsWith(q)) return true;
    if (q.startsWith(s.split(',')[0])) return true;
    // Handle abbreviations: "ბოჭორმის ქ." matches "ბოჭორმის ქუჩა"
    // Get first word(s) before ქ. or ქუჩა
    var sBase = s.replace(/\s*(ქ\.|ქუჩა|გამზ\.|გამზირი|პრ\.|პროსპექტი|შეს\.|შესახვევი)\s*$/i, '').trim();
    var qBase = q.replace(/\s*(ქ\.|ქუჩა|გამზ\.|გამზირი|პრ\.|პროსპექტი|შეს\.|შესახვევი)\s*$/i, '').trim();
    if (sBase && qBase && (sBase === qBase || sBase.startsWith(qBase) || qBase.startsWith(sBase))) return true;
    return false;
  }

  function clickSuggestion(text) {
    return new Promise(function(resolve) {
      var attempts = 0;
      function try_click() {
        var sugs = getVisibleSuggestions();
        for (var i = 0; i < sugs.length; i++) {
          var t = (sugs[i].innerText || '').trim();
          if (streetMatches(t, text)) {
            fullClick(sugs[i]); resolve(true); return;
          }
        }
        attempts++;
        if (attempts < 6) { setTimeout(try_click, 150); }
        else {
          console.log('[copier] no suggestion for "' + text + '", found:', sugs.slice(0,5).map(function(e){ return (e.innerText||'').trim().slice(0,30); }));
          resolve(false);
        }
      }
      try_click();
    });
  }

  function extractHouseNumber(address) {
    if (!address) return '';
    var m = address.match(/\s(\d+\S*)\s*$/);
    return m ? m[1] : '';
  }

  function extractStreetName(address) {
    if (!address) return '';
    return address.replace(/\s+\d+\S*\s*$/, '').trim() || address.trim();
  }

  async function fillLocation(listing, filled, skipped) {
    await goToSection('მდებარეობა');
    await wait(300);

    var inputs = Array.from(document.querySelectorAll('input[type=text]'))
      .filter(function(e) { return e.offsetParent !== null; });
    if (inputs.length === 0) { skipped.push('location(no inputs)'); return; }

    // City - type into field and wait for API suggestions
    var cityName = listing.city_name || 'თბილისი';
    inputs[0].focus();
    inputs[0].click();
    await wait(100);
    setVal(inputs[0], cityName);
    // Dispatch keyboard events to trigger the autocomplete API call
    inputs[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: cityName.slice(-1) }));
    inputs[0].dispatchEvent(new KeyboardEvent('keyup',   { bubbles: true, key: cityName.slice(-1) }));
    inputs[0].dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: cityName }));
    await wait(600);

    // Log what's near the input after typing
    var nearCity = getSuggestionsNearInput(inputs[0]);
    console.log('[copier] city suggestions near input:', nearCity.map(function(e){ return (e.innerText||'').trim(); }).slice(0,10));

    var cityOk = await clickSuggestion(cityName);
    if (cityOk) { filled.push('city:' + cityName); await wait(200); }
    else {
      // fallback: click first item near the city input
      var nearItems = getSuggestionsNearInput(inputs[0]);
      if (nearItems.length > 0) { nearItems[0].click(); filled.push('city(first)'); await wait(200); }
      else skipped.push('city:' + cityName);
    }

    // Street
    var inputs2 = Array.from(document.querySelectorAll('input[type=text]'))
      .filter(function(e) { return e.offsetParent !== null; });
    var streetInput = inputs2[1];
    var streetName = extractStreetName(listing.address);
    var houseNumber = extractHouseNumber(listing.address);

    if (streetInput && streetName) {
      setVal(streetInput, streetName);
      streetInput.focus();
      streetInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
      streetInput.dispatchEvent(new KeyboardEvent('keyup',   { bubbles: true, key: 'a' }));
      await wait(500);
      var streetOk = await clickSuggestion(streetName);
      if (!streetOk) {
        var allVis = Array.from(document.querySelectorAll('div,span')).filter(function(e){
          return e.offsetParent !== null && e.children.length === 0 &&
                 (e.innerText||'').trim().length > 2 && (e.innerText||'').trim().length < 50 &&
                 !e.closest('header') && !e.closest('ul') && !e.closest('nav');
        }).map(function(e){ return (e.innerText||'').trim(); });
        console.log('[copier] street visible after wait:', allVis.slice(0,15));
        var sugs = getVisibleSuggestions();
        console.log('[copier] street suggestions:', sugs.map(function(e){ return (e.innerText||'').trim(); }));
        if (sugs.length > 0) { sugs[0].click(); streetOk = true; await wait(300); }
      }
      if (streetOk) { filled.push('street'); await wait(250); }
      else skipped.push('street:' + streetName);
    }

    // House number — wait for form to render :rn: after street selection
    await wait(200);
    var inputs3 = Array.from(document.querySelectorAll('input[type=text]'))
      .filter(function(e) { return e.offsetParent !== null; });
    console.log('[copier] inputs after street select:', inputs3.map(function(e){ return e.id; }));
    // Try by id first
    var houseEl = document.getElementById(':rn:');
    if (!houseEl || houseEl.offsetParent === null) houseEl = inputs3[2] || null;
    if (houseEl && houseNumber) {
      setVal(houseEl, houseNumber);
      filled.push('house_number:' + houseNumber);
    } else if (houseNumber) {
      skipped.push('house_number(field not visible)');
    }

    await wait(200);

    // lat/lng/address_ka
    var latEl  = document.getElementById(':rt:');
    var lngEl  = document.getElementById(':ru:');
    var addrEl = document.getElementById(':rr:');
    if (latEl  && latEl.offsetParent  !== null && listing.lat)     { setVal(latEl,  listing.lat);     filled.push('lat'); }
    if (lngEl  && lngEl.offsetParent  !== null && listing.lng)     { setVal(lngEl,  listing.lng);     filled.push('lng'); }
    if (addrEl && addrEl.offsetParent !== null && listing.address) { setVal(addrEl, listing.address); filled.push('address_ka'); }
  }

  // Currency toggle: aria-checked=false=GEL, true=USD
  // currency_id: 1=GEL, 2=USD, 3=EUR
  function setCurrency(currencyId) {
    var toggle = null;
    // Find toggle nearest to price input
    var priceEl = document.getElementById('total_price');
    if (priceEl) {
      var node = priceEl.parentElement;
      for (var k = 0; k < 8; k++) {
        if (!node) break;
        var t = node.querySelector('[role=switch]');
        if (t) { toggle = t; break; }
        node = node.parentElement;
      }
    }
    if (!toggle) toggle = document.querySelector('[role=switch]');
    if (!toggle) return false;
    var currentIsUSD = toggle.getAttribute('aria-checked') === 'true';
    var wantUSD = (currencyId === 2);
    console.log('[copier] currency: currentIsUSD=' + currentIsUSD + ' wantUSD=' + wantUSD);
    if (currentIsUSD !== wantUSD) toggle.click();
    return true;
  }

  // Project type: luk-flex luk-justify-start div containing "აირჩიეთ პროექტის ტიპი"
  // Confirmed from dropdown inspection
  var PROJECT_TYPES = {
    1:'ლვოვის', 2:'ყავლაშვილის', 3:'თუხარელის', 4:'ხრუშოვის',
    5:'ჩეხური', 6:'ქალაქური', 7:'მოსკოვის', 8:'არასტანდარტული',
    9:'დუპლექსი', 10:'ტრიპლექსი', 11:'საერთო საცხოვრებელი',
    12:'თაუნჰაუსი', 13:'ვილა', 14:'m2-ის კომპლექსი',
    15:'OPTIMA m2-ისგან', 16:'METRA PARK', 17:'იტალიური ეზო', 18:'ლენინგრადის'
  };

  async function setProjectTypeAsync(projectTypeId, filled, skipped) {
    var label = PROJECT_TYPES[projectTypeId];
    if (!label) { skipped.push('project_type(unknown:' + projectTypeId + ')'); return; }

    // Find the visible dropdown trigger div
    var trigger = null;
    var all = Array.from(document.querySelectorAll('div'));
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.offsetParent === null) continue;
      var cls = el.className || '';
      var t = (el.innerText || '').trim();
      if (cls.includes('luk-flex') && cls.includes('luk-justify-start') && t.includes('აირჩიეთ პროექტის ტიპი')) {
        trigger = el; break;
      }
    }
    if (!trigger) { skipped.push('project_type(trigger not found)'); return; }

    // Try clicking both the trigger and its parent to open the dropdown
    trigger.click();
    await wait(700);

    // Options are LI elements with class "luk-w-full luk-p-2 luk-rounded-md..."
    var found = false;
    var items = Array.from(document.querySelectorAll('li[class*=luk-w-full]'))
      .filter(function(e) { return e.offsetParent !== null; });
    console.log('[copier] project type li options:', items.map(function(e){ return (e.innerText||'').trim(); }));

    for (var j = 0; j < items.length; j++) {
      if ((items[j].innerText||'').trim() === label) {
        fullClick(items[j]);
        filled.push('project_type:' + label);
        found = true;
        break;
      }
    }
    if (!found) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      skipped.push('project_type(not found:' + label + ')');
    }
  }

  // Room label scoped to ოთახები section (div.mb-6)
  function clickRoomLabel(text) {
    var sections = document.querySelectorAll('div.mb-6, div[class="mb-6"]');
    for (var s = 0; s < sections.length; s++) {
      var secText = (sections[s].textContent || '');
      if (secText.includes('ოთახები') && !secText.includes('საძინებელი') && !secText.includes('სველი')) {
        var labels = sections[s].querySelectorAll('label');
        for (var i = 0; i < labels.length; i++) {
          if ((labels[i].innerText || '').trim() === text) {
            labels[i].click(); return true;
          }
        }
      }
    }
    // fallback: ancestor walk
    var allLabels = document.querySelectorAll('label');
    for (var i = 0; i < allLabels.length; i++) {
      if ((allLabels[i].innerText || '').trim() !== text) continue;
      var node = allLabels[i].parentElement;
      for (var j = 0; j < 8; j++) {
        if (!node) break;
        var nt = (node.textContent || '');
        if (nt.includes('ოთახები') && !nt.includes('საძინებელი') && !nt.includes('სველი წერტილი')) {
          allLabels[i].click(); return true;
        }
        node = node.parentElement;
      }
    }
    return false;
  }

  function expandAllParams() {
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var t = (btns[i].innerText || '').trim();
      if (t.includes('ყველა პარამეტრი')) { btns[i].click(); return true; }
    }
    return false;
  }

  function checkboxByLabel(labelText) {
    var boxes = document.querySelectorAll("input[type=checkbox]");
    for (var i = 0; i < boxes.length; i++) {
      var node = boxes[i].parentElement;
      for (var j = 0; j < 7; j++) {
        if (!node) break;
        if ((node.textContent || "").includes(labelText)) return boxes[i];
        node = node.parentElement;
      }
    }
    return null;
  }

  function fetchImageAsFile(url, index) {
    return new Promise(function(resolve) {
      chrome.runtime.sendMessage({ type: "FETCH_IMAGE_BASE64", url: url }, function(res) {
        if (!res || !res.ok) { resolve(null); return; }
        try {
          var binary = atob(res.base64);
          var bytes = new Uint8Array(binary.length);
          for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          var blob = new Blob([bytes], { type: res.mimeType });
          var name = url.split('/').pop().split('?')[0] || ('photo' + index + '.webp');
          resolve(new File([blob], name, { type: res.mimeType }));
        } catch(e) { resolve(null); }
      });
    });
  }

  async function injectPhotos(prefetchedFilesPromise, totalCount, statusEl) {
    await goToSection('აღწერა');
    await wait(300);
    var fileInput = document.querySelector('input[type=file]');
    if (!fileInput) return "ფოტო input ვერ მოიძებნა.";

    // Wait for pre-fetched files (they started loading at the beginning)
    statusEl.textContent = "ფოტოები სრულდება...";
    var results = await prefetchedFilesPromise;
    var files = results.filter(Boolean);

    if (files.length === 0) return "ფოტოების ჩატვირთვა ვერ მოხერხდა.";
    var dt = new DataTransfer();
    for (var j = 0; j < files.length; j++) dt.items.add(files[j]);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    fileInput.dispatchEvent(new Event('input',  { bubbles: true }));
    return "ფოტო: " + files.length + "/" + totalCount;
  }

  var REAL_ESTATE_TYPES = { 1:'ბინა', 2:'კერძო სახლი', 3:'აგარაკი', 4:'მიწის ნაკვეთი', 5:'კომერციული ფართი', 6:'სასტუმრო' };
  var DEAL_TYPES        = { 1:'იყიდება', 2:'ქირავდება', 3:'გირავდება', 7:'ქირავდება დღიურად', 10:'გაიცემა იჯარით' };
  var STATUS_TYPES      = { 1:'ძველი აშენებული', 2:'ახალი აშენებული', 3:'მშენებარე' };
  var CONDITION_TYPES   = { 1:'ახალი გარემონტებული', 2:'ძველი გარემონტებული', 3:'სარემონტო', 4:'სარემონტო', 5:'თეთრი კარკასი', 6:'შავი კარკასი', 7:'მწვანე კარკასი', 8:'თეთრი პლიუსი' };
  var BEDROOM_TYPES     = { 1:'1', 2:'2', 3:'3+', 4:'საერთო' };
  var PARKING_TYPES     = { 1:'ავტოფარეხი', 2:'პარკინგის ადგილი', 3:'პარკინგის გარეშე', 4:'ეზოს პარკინგი', 5:'მიწისქვეშა პარკინგი', 6:'ფასიანი ავტოსადგომი' };
  var HEATING_TYPES     = { 1:'ცენტრალური გათბობა', 2:'გაზის გამათბობელი', 3:'დენის გამათბობელი', 5:'ცენტრალური+იატაკის გათბობა', 6:'გათბობის გარეშე', 7:'ინდივიდუალური', 8:'იატაკის გათბობა' };
  var HOT_WATER_TYPES   = { 1:'გაზის გამაცხელებელი', 2:'ავზი', 3:'დენის გამაცხელებელი', 4:'მზის გამათბობელი', 5:'ცხელი წყლის გარეშე', 6:'ცენტრალური ცხელი წყალი', 7:'ბუნებრივი ცხელი წყალი', 8:'ინდივიდუალური' };

  var PARAM_LABELS = {
    internet:'ინტერნეტი', tv:'ტელევიზია', gas:'ბუნებრივი აირი',
    fireplace:'ბუხარი', living_room:'მისაღები', water:'წყალი',
    sewerage:'კანალიზაცია', electricity:'ელექტროენერგია', telephone:'ტელეფონი',
    kitchen:'სამზარეულო + ტექნიკა', furniture:'ავეჯი', bed:'საწოლი',
    sofa:'დივანი', table:'მაგიდა', chairs:'სკამები',
    stove:'ქურა (გაზის/ელექტრო)', oven:'ღუმელი', conditioner:'კონდინციონერი',
    refrigerator:'მაცივარი', washing_machine:'სარეცხი მანქანა',
    dishwasher:'ჭურჭლის სარეცხი მანქანა', spa:'სპა', elevator:'ლიფტი',
    truck_elevator:'სატვირთო ლიფტი', bar:'ბარი', gym:'სპორტ დარბაზი',
    grill:'მაყალი/გრილი', jacuzzi:'ჯაკუზი', "coded-door":'კარი კოდით',
    guard:'დაცვა', alarm:'სიგნალიზაცია', ventilation:'ვინტილაცია',
    concierge:'კონსიერჟი', barrier:'შლაგბაუმი', fire_system:'სახანძრო სისტემა',
    swimming_pool:'ღია აუზი', indoor_pool:'დახურული აუზი', sauna:'საუნა',
    investment:'საინვესტიციო',
  };

  function setProgress(pct) {
    var bar = document.getElementById('mh-copier-progress-bar');
    var wrap = document.getElementById('mh-copier-progress');
    if (wrap) wrap.style.display = 'block';
    if (bar) bar.style.width = pct + '%';
  }

  async function doAutofill(listing, statusEl) {
    var filled = [], skipped = [];
    setProgress(5);

    // Start fetching photos immediately in background while form fills
    var photoUrls = (listing.images || []).map(function(im) { return im.large; }).filter(Boolean);
    var photoFilesPromise = null;
    if (photoUrls.length > 0) {
      photoFilesPromise = Promise.all(photoUrls.map(function(url, i) {
        return fetch(url, { credentials: 'omit', mode: 'cors' })
          .then(function(r) { return r.ok ? r.blob() : null; })
          .then(function(blob) {
            if (!blob) return null;
            var name = url.split('/').pop().split('?')[0] || ('photo' + i + '.webp');
            return new File([blob], name, { type: blob.type });
          })
          .catch(function() {
            return new Promise(function(resolve) {
              chrome.runtime.sendMessage({ type: "FETCH_IMAGE_BASE64", url: url }, function(res) {
                if (!res || !res.ok) { resolve(null); return; }
                try {
                  var binary = atob(res.base64);
                  var bytes = new Uint8Array(binary.length);
                  for (var k = 0; k < binary.length; k++) bytes[k] = binary.charCodeAt(k);
                  var blob2 = new Blob([bytes], { type: res.mimeType });
                  var name2 = url.split('/').pop().split('?')[0] || ('photo' + i + '.webp');
                  resolve(new File([blob2], name2, { type: res.mimeType }));
                } catch(e) { resolve(null); }
              });
            });
          });
      }));
    }

    function fill(fieldName, elOrId, value) {
      if (value === null || value === undefined || value === "") { skipped.push(fieldName); return; }
      var el = typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
      if (setVal(el, value)) filled.push(fieldName);
      else skipped.push(fieldName);
    }

    // === SECTION 1: ქონების სტატუსი ===
    statusEl.textContent = "1/5: ქონების ტიპი..."; setProgress(10);
    await goToSection('ქონების სტატუსი');
    await wait(200);

    var reLabel = REAL_ESTATE_TYPES[listing.real_estate_type_id];
    if (reLabel) (await clickLabelWithRetry(reLabel, 500)) ? filled.push('real_estate_type') : skipped.push('real_estate_type:' + reLabel);
    await wait(200);

    var dealLabel = DEAL_TYPES[listing.deal_type_id];
    if (dealLabel) (await clickLabelWithRetry(dealLabel, 500)) ? filled.push('deal_type') : skipped.push('deal_type:' + dealLabel);
    await wait(200);

    var statusLabel = STATUS_TYPES[listing.status_id];
    if (statusLabel) (await clickLabelWithRetry(statusLabel, 400)) ? filled.push('status') : skipped.push('status:' + statusLabel);
    await wait(150);

    var condLabel = CONDITION_TYPES[listing.condition_id];
    if (condLabel) (await clickLabelWithRetry(condLabel, 400)) ? filled.push('condition') : skipped.push('condition:' + condLabel);
    await wait(150);

    // === SECTION 2: მდებარეობა ===
    statusEl.textContent = "2/5: მდებარეობა..."; setProgress(25);
    await fillLocation(listing, filled, skipped);

    // === SECTION 3: ფასი ===
    statusEl.textContent = "3/5: ფასი..."; setProgress(45);
    await goToSection('ფასი');
    await wait(200);

    if (listing.currency_id) { setCurrency(listing.currency_id); await wait(150); filled.push('currency'); }
    fill("total_price", "total_price", listing.total_price);

    // === SECTION 4: მახასიათებლები ===
    statusEl.textContent = "4/5: მახასიათებლები..."; setProgress(60);
    await goToSection('მახასიათებლები');
    await wait(200);

    fill("area",         ":r15:", listing.area);
    fill("floor",        ":r1g:", listing.floor);
    fill("total_floors", ":r1h:", listing.total_floors);

    // Rooms (scoped to ოთახები section)
    if (listing.room_type_id) {
      var roomText = listing.room_type_id >= 10 ? '10+' : String(listing.room_type_id);
      var roomOk = await new Promise(function(resolve) {
        var elapsed = 0;
        function attempt() {
          if (clickRoomLabel(roomText)) { resolve(true); return; }
          elapsed += 150;
          if (elapsed >= 2000) { resolve(false); return; }
          setTimeout(attempt, 150);
        }
        attempt();
      });
      roomOk ? filled.push('rooms:' + roomText) : skipped.push('rooms:' + roomText);
    }

    // Bedrooms
    var bedLabel = BEDROOM_TYPES[listing.bedroom_type_id];
    if (bedLabel) (await clickLabelWithRetry(bedLabel, 400, 'სველი წერტილი')) ? filled.push('bedrooms') : skipped.push('bedrooms:' + bedLabel);

    // Parking, heating, hot water
    var parkLabel = PARKING_TYPES[listing.parking_type_id];
    if (parkLabel) (await clickLabelWithRetry(parkLabel, 300)) ? filled.push('parking') : skipped.push('parking');
    var heatLabel = HEATING_TYPES[listing.heating_type_id];
    if (heatLabel) (await clickLabelWithRetry(heatLabel, 300)) ? filled.push('heating') : skipped.push('heating');
    var hwLabel = HOT_WATER_TYPES[listing.hot_water_type_id];
    if (hwLabel) (await clickLabelWithRetry(hwLabel, 300)) ? filled.push('hot_water') : skipped.push('hot_water');

    // Project type
    if (listing.project_type_id) await setProjectTypeAsync(listing.project_type_id, filled, skipped);

    await wait(300);

    // Expand "ყველა პარამეტრი" then tick checkboxes
    expandAllParams();
    await wait(700);

    var cbFilled = 0, cbSkipped = 0;
    var params = listing.parameters || [];
    for (var i = 0; i < params.length; i++) {
      var lbl = PARAM_LABELS[params[i].key];
      if (!lbl) { cbSkipped++; continue; }
      var cb = checkboxByLabel(lbl);
      if (cb) { if (!cb.checked) cb.click(); cbFilled++; }
      else cbSkipped++;
    }

    // === SECTION 5: აღწერა / ფოტოები ===
    statusEl.textContent = "5/5: აღწერა და ფოტოები..."; setProgress(80);
    await goToSection('აღწერა');
    await wait(200);

    var descEl = document.querySelector('textarea[placeholder="დაწერეთ დამატებითი აღწერა"]');
    fill("comment", descEl, stripHtml(listing.comment));

    var imgMsg = "";
    if (photoFilesPromise) {
      imgMsg = await injectPhotos(photoFilesPromise, photoUrls.length, statusEl);
    }

    statusEl.innerHTML =
      "შევსდა " + filled.length + " ველი + " + cbFilled + " ჩექბოქსი.<br>" +
      (skipped.length ? "გამოტოვდა: " + skipped.join(", ") + ".<br>" : "") +
      (imgMsg ? imgMsg + "<br>" : "") +
      "<b>გადაამოწმე ფორმა და გამოაქვეყნე ხელით.</b>";

    setProgress(100);
    console.log("[copier] fill report", { filled: filled, skipped: skipped, cbFilled: cbFilled });
  }

  function injectPanel() {
    if (document.getElementById("mh-copier-panel")) return;
    var panel = document.createElement("div");
    panel.id = "mh-copier-panel";
    panel.className = "mh-copier-panel";
    panel.innerHTML =
      '<div class="mh-copier-panel-head">' +
        '<span class="mh-copier-dot"></span>' +
        '<span>განცხადების კოპირება</span>' +
        '<button class="mh-copier-x">x</button>' +
      '</div>' +
      '<div class="mh-copier-body">' +
        '<div class="mh-copier-meta" id="mh-copier-meta">იტვირთება...</div>' +
        '<div class="mh-copier-progress" id="mh-copier-progress" style="display:none">' +
          '<div class="mh-copier-progress-bar" id="mh-copier-progress-bar"></div>' +
        '</div>' +
        '<button class="mh-copier-primary" id="mh-copier-fill" disabled>ფორმის შევსება</button>' +
        '<div class="mh-copier-status" id="mh-copier-status"></div>' +
        '<div class="mh-copier-note">ექსტენშენი არ აქვეყნებს - შენ ამოწმებ და თავად აქვეყნებ.</div>' +
      '</div>';
    document.body.appendChild(panel);
    panel.querySelector(".mh-copier-x").addEventListener("click", function() { panel.remove(); });

    var meta     = panel.querySelector("#mh-copier-meta");
    var fillBtn  = panel.querySelector("#mh-copier-fill");
    var statusEl = panel.querySelector("#mh-copier-status");

    chrome.runtime.sendMessage({ type: "GET_LISTING" }, function(res) {
      if (res && res.ok && res.listing) {
        var l = res.listing;
        meta.innerHTML =
          "<b>" + (l.title || "უსათაურო").slice(0, 42) + "</b><br>" +
          "ID " + l.source_id + " / " + (l.area || "?") + " m2 / " + (l.images || []).length + " ფოტო";
        fillBtn.disabled = false;
        fillBtn.addEventListener("click", function() {
          fillBtn.disabled = true;
          statusEl.textContent = "შევსება...";
          doAutofill(l, statusEl).finally(function() { fillBtn.disabled = false; });
        });

        var debugBtn = panel.querySelector("#mh-copier-debug");
        debugBtn.disabled = false;
        debugBtn.addEventListener("click", function() {
          debugBtn.disabled = true;
          statusEl.textContent = "Location debug...";
          var filled2 = [], skipped2 = [];
          fillLocation(l, filled2, skipped2).then(function() {
            // After fillLocation, log all visible inputs
            var vis = Array.from(document.querySelectorAll('input[type=text]'))
              .filter(function(e){ return e.offsetParent !== null; })
              .map(function(e, i){ return i + ': id=' + e.id + ' val="' + e.value + '"'; });
            console.log('[debug] inputs after location fill:', vis);
            console.log('[debug] filled:', filled2, 'skipped:', skipped2);
            statusEl.innerHTML = 'filled: ' + filled2.join(', ') + '<br>skipped: ' + skipped2.join(', ') + '<br>inputs: ' + vis.join('<br>');
          }).finally(function(){ debugBtn.disabled = false; });
        });
      } else {
        meta.textContent = "განცხადება არ დაგიკოპირებია. გახსენი myhome.ge განცხადება და დააჭირე კოპირებას.";
      }
    });
  }

  injectPanel();
})();