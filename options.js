const DEFAULT_TRIGGER_URLS = ['/u/1/app?pli=1'];

async function loadOptions() {
  const { enabled = true, triggerUrls = DEFAULT_TRIGGER_URLS, applyTemporaryChat = true, mode = 'thinking', debugMode = false, delayMs = 3000 } = await chrome.storage.sync.get({
    enabled: true,
    triggerUrls: DEFAULT_TRIGGER_URLS,
    applyTemporaryChat: true,
    mode: 'thinking',
    debugMode: false,
    delayMs: 1500,
  });

  document.getElementById('enabled').checked = enabled;
  document.getElementById('applyTemporaryChat').checked = applyTemporaryChat;
  document.getElementById('debugMode').checked = debugMode;
  document.getElementById('delayMs').value = delayMs;
  document.getElementById('mode').value = mode;
  document.getElementById('triggerUrls').value = Array.isArray(triggerUrls) ? triggerUrls.join('\n') : (triggerUrls || '');
}

function saveOptions() {
  const triggerText = document.getElementById('triggerUrls').value.trim();
  const triggerUrls = triggerText
    ? triggerText.split('\n').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_TRIGGER_URLS;

  const delayMs = parseInt(document.getElementById('delayMs').value, 10) || 0;
  chrome.storage.sync.set({
    enabled: document.getElementById('enabled').checked,
    applyTemporaryChat: document.getElementById('applyTemporaryChat').checked,
    debugMode: document.getElementById('debugMode').checked,
    delayMs: Math.max(0, Math.min(15000, delayMs)),
    mode: document.getElementById('mode').value,
    triggerUrls,
  });

  const el = document.getElementById('saved');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2000);
}

document.addEventListener('DOMContentLoaded', loadOptions);
document.getElementById('save').addEventListener('click', saveOptions);
