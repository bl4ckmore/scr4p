// background.js — v0.2
// Handles storage and image upload+fetch in background (no CORS restrictions)

const UPLOAD_URL = "https://static-statements.tnet.ge/v1/files/upload-image";

// Keep service worker alive during long operations
var keepAliveInterval = null;
function startKeepAlive() {
  if (keepAliveInterval) return;
  keepAliveInterval = setInterval(function() {
    chrome.storage.local.get('_ping', function() {});
  }, 20000);
}
function stopKeepAlive() {
  if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "SAVE_LISTING") {
    chrome.storage.local.set({ copiedListing: msg.payload, copiedAt: Date.now() }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "GET_LISTING") {
    chrome.storage.local.get(["copiedListing", "copiedAt"], (res) => {
      sendResponse({ ok: true, listing: res.copiedListing || null, copiedAt: res.copiedAt || null });
    });
    return true;
  }

  if (msg.type === "CLEAR_LISTING") {
    chrome.storage.local.remove(["copiedListing", "copiedAt"], () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "UPLOAD_IMAGES") {
    uploadAll(msg.imageUrls || [], msg.jwt)
      .then((results) => sendResponse({ ok: true, results }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg.type === "DOWNLOAD_PHOTOS") {
    downloadAllPhotos(msg.listingId, msg.imageUrls)
      .then(function(count) { sendResponse({ ok: true, count: count }); })
      .catch(function(e) { sendResponse({ ok: false, error: String(e) }); });
    return true;
  }

  // Fetch single image as base64
  if (msg.type === "FETCH_IMAGE_BASE64") {
    fetchBase64(msg.url)
      .then((data) => sendResponse({ ok: true, base64: data.base64, mimeType: data.mimeType }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  // Fetch ALL images as base64 in parallel — much faster than one by one
  if (msg.type === "FETCH_ALL_IMAGES_BASE64") {
    Promise.all((msg.urls || []).map(function(url) {
      return fetchBase64(url).catch(function(e) { return null; });
    })).then(function(results) {
      sendResponse({ ok: true, results: results });
    });
    return true;
  }
});

async function fetchBase64(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("fetch failed: " + resp.status);
  const blob = await resp.blob();
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return { base64, mimeType: blob.type || 'image/webp' };
}

async function uploadAll(urls, jwt) {
  const out = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const r = await uploadOne(urls[i], jwt, i === 0);
      out.push({ src: urls[i], ok: true, response: r });
    } catch (e) {
      out.push({ src: urls[i], ok: false, error: String(e) });
    }
  }
  return out;
}

async function uploadOne(srcUrl, jwt, isMain) {
  const imgResp = await fetch(srcUrl);
  if (!imgResp.ok) throw new Error("fetch source image failed: " + imgResp.status);
  const blob = await imgResp.blob();
  const name = (srcUrl.split("/").pop() || "image.webp").split("?")[0];

  const fd = new FormData();
  fd.append("image", blob, name);
  fd.append("type", "1");

  const headers = {
    "global-authorization": jwt,
    "x-website-key": "myhome",
    "x-referrer-key": "myhome",
    "locale": "ka"
  };

  const up = await fetch(UPLOAD_URL, {
    method: "POST",
    headers,
    body: fd,
    credentials: "omit"
  });

  const text = await up.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!up.ok) throw new Error("upload failed " + up.status + ": " + text.slice(0, 300));
  return { isMain, status: up.status, data: json };
}

async function fetchConvertAndDownload(url, folder, index) {
  // Fetch in background (no CORS), convert to JPEG, download as data URL
  var resp = await fetch(url);
  if (!resp.ok) throw new Error('fetch failed: ' + resp.status);
  var blob = await resp.blob();

  // Convert webp -> JPEG via OffscreenCanvas
  var bitmap = await createImageBitmap(blob);
  var canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  var jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });

  // Convert blob to base64 data URL
  var buffer = await jpegBlob.arrayBuffer();
  var bytes = new Uint8Array(buffer);
  var binary = '';
  for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  var dataUrl = 'data:image/jpeg;base64,' + btoa(binary);

  var filename = folder + '/' + index + '.jpg';
  return new Promise(function(resolve) {
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      conflictAction: 'overwrite',
      saveAs: false
    }, function(downloadId) {
      if (chrome.runtime.lastError) {
        console.warn('[copier] download error:', chrome.runtime.lastError.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

async function downloadAllPhotos(listingId, imageUrls) {
  var folder = 'myhome/' + listingId;
  startKeepAlive();
  try {
    // Download up to 3 photos in parallel for speed
    var BATCH = 3;
    var count = 0;
    for (var i = 0; i < imageUrls.length; i += BATCH) {
      var batch = imageUrls.slice(i, i + BATCH);
      var results = await Promise.all(batch.map(function(url, j) {
        if (!url) return Promise.resolve(false);
        return fetchConvertAndDownload(url, folder, i + j + 1).catch(function(e) {
          console.warn('[copier] failed photo', i + j + 1, e.message);
          return false;
        });
      }));
      count += results.filter(Boolean).length;
    }
    return count;
  } finally {
    stopKeepAlive();
  }
}