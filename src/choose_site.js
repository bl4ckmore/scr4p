// choose_site.js — auto-selects myhome on the choose-statement-website page

(function() {
  "use strict";

  function pickMyhome() {
    // Find all clickable options and click the one containing "myhome"
    var els = Array.from(document.querySelectorAll('a, button, div[class*=cursor], label'));
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var text = (el.innerText || '').toLowerCase();
      var href = (el.href || '').toLowerCase();
      if (text.includes('myhome') || href.includes('myhome')) {
        el.click();
        return true;
      }
    }
    return false;
  }

  // Try immediately, then retry until found
  function tryPick() {
    if (pickMyhome()) return;
    setTimeout(tryPick, 300);
  }

  setTimeout(tryPick, 500);
})();