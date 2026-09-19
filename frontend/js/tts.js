// Cloud TTS client: fetches synthesised audio from the backend and plays it.
// Shows a toast overlay while loading/playing.

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

/**
 * Request TTS for `text` in `language`, then play the returned audio.
 * Stops any in-progress playback first.
 */
export async function readAloud(text, language = 'en') {
  stop(); // cancel anything in flight

  if (!text || !text.trim()) return;

  const controller = new AbortController();
  currentAbort = controller;

  showToast('🔊 Reading…');

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, language }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const msg = body?.error?.message || 'TTS unavailable';
      showToast(`⚠ ${msg}`);
      hideToast(2500);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    currentAudio = audio;

    audio.addEventListener('ended', () => {
      cleanup(url);
      showToast('🔊 Done');
      hideToast();
    });
    audio.addEventListener('error', () => {
      cleanup(url);
      showToast('⚠ Playback failed');
      hideToast(2500);
    });

    await audio.play();
  } catch (err) {
    if (err.name === 'AbortError') return; // intentional stop
    showToast('⚠ TTS failed');
    hideToast(2500);
  }
}

function cleanup(blobUrl) {
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  currentAudio = null;
  currentAbort = null;
}

/** Stop playback and abort any pending fetch. */
export function stop() {
  clearTimeout(hideTimer);
  if (currentAbort) { currentAbort.abort(); currentAbort = null; }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if (toastEl) toastEl.hidden = true;
}

/** @returns {boolean} Whether audio is currently playing. */
export function isPlaying() {
  return currentAudio !== null && !currentAudio.paused;
}
