// Puente entre la página de la app (hook.js) y el service worker de la extensión.
const pending = new Map();

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data.source !== 'liga-fitboxers') return;
  const msg = e.data;
  if (msg.kind === 'capture') {
    chrome.runtime.sendMessage({ type: 'capture', request: msg.request, response: msg.response, capturedAt: msg.capturedAt });
  } else if (msg.kind === 'result' && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'sync-page' && msg?.type !== 'profiles-page') return false;
  const id = crypto.randomUUID();
  pending.set(id, sendResponse);
  window.postMessage({ source: 'liga-fitboxers-cmd', id, cmd: msg.type === 'sync-page' ? 'sync' : 'profiles', day: msg.day, ids: msg.ids }, location.origin);
  return true;
});
