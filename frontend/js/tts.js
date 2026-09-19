let currentAudio = null;
let currentAbort = null;
let toastEl = null;
let hideTimer = null;

function showToast(text) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'tts-toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(hideTimer);
}

function hideToast(delay = 1200) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (toastEl) toastEl.hidden = true; }, delay);
}

export async function readAloud(text, language = 'en') {
  stop();

  if (!text || !text.trim()) return;

  const controller = new AbortController();
  currentAbort = controller;

  showToast('Connecting to TTS Service...');

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, language }),
      signal: controller.signal,
    });

    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await res.json().catch(() => null);
      const errCode = body?.error?.code || 'ERR_UNKNOWN';
      showToast(`TTS Failed: ${errCode}`);
      hideToast(3000);
      return;
    }

    if (!res.ok) {
      showToast('TTS Failed: Network Error');
      hideToast(2000);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    
    currentAudio.onplay = () => {
      showToast('Playing Audio...');
    };

    currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      hideToast(0);
    };

    currentAudio.onerror = (e) => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      showToast('Audio Playback Error');
      console.error('Audio element error:', e);
      hideToast(3000);
    };

    currentAudio.crossOrigin = 'anonymous';

    try {
      await currentAudio.play();
    } catch (playErr) {
      console.error('Play error (Auto-play blocked?):', playErr);
      showToast('Auto-play blocked by browser');
      hideToast(3000);
    }
    
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('TTS Fetch failed:', err);
    showToast('TTS Network Request Failed');
    hideToast(3000);
  }
}

export function stop() {
  clearTimeout(hideTimer);
  if (currentAbort) { 
    currentAbort.abort(); 
    currentAbort = null; 
  }
  
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  
  if (toastEl) toastEl.hidden = true;
}

export function isPlaying() {
  return currentAudio && !currentAudio.paused;
}
