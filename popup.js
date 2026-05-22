const statusEl = document.getElementById("status");
chrome.runtime.sendMessage({ type: "GET_LISTING" }, (res) => {
  if (res && res.ok && res.listing) {
    const l = res.listing;
    const when = res.copiedAt ? new Date(res.copiedAt).toLocaleString() : "";
    statusEl.innerHTML = `დაკოპირებულია: <b>${(l.title || "უსათაურო").slice(0, 36)}</b><br>` +
      `ID ${l.source_id} · ${(l.images || []).length} ფოტო<br><small>${when}</small>`;
  } else {
    statusEl.textContent = "ჯერ არცერთი განცხადება არ არის დაკოპირებული.";
  }
});
document.getElementById("clear").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_LISTING" }, () => {
    statusEl.textContent = "გასუფთავდა.";
  });
});
