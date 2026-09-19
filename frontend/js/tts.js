// Native TTS client: fetches translated text from backend and plays it using browser API.
// Shows a toast overlay while loading/playing.

let currentUtterance = null;
let currentAbort = null;
let isSpeaking = false;
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
 * Request translation for `text` in `language` from backend, then play it via native TTS.
 * Stops any in-progress playback first.
 */
export async function readAloud(text, language = 'en') {
  stop(); // cancel anything in flight

  if (!text || !text.trim()) return;

  if (!('speechSynthesis' in window)) {
    showToast('⚠ Native TTS not supported');
    hideToast(2500);
    return;
  }

  const controller = new AbortController();
  currentAbort = controller;

  showToast('🔊 Translating…');

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, language }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const msg = body?.error?.message || 'Translation unavailable';
      showToast(`⚠ ${msg}`);
      hideToast(2500);
      return;
    }

    const { text: translatedText } = await res.json();
    
    if (!translatedText) {
      showToast('⚠ Translation failed');
      hideToast(2500);
      return;
    }

    showToast('🔊 Reading…');

    const utterance = new SpeechSynthesisUtterance(translatedText);
    utterance.lang = language;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      isSpeaking = true;
    };

    utterance.onend = () => {
      isSpeaking = false;
      currentUtterance = null;
      showToast('🔊 Done');
      hideToast();
    };

    utterance.onerror = (e) => {
      isSpeaking = false;
      currentUtterance = null;
      showToast('⚠ Playback failed');
      console.error('SpeechSynthesisError:', e);
      hideToast(2500);
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
    
  } catch (err) {
    if (err.name === 'AbortError') return; // intentional stop
    showToast('⚠ TTS failed');
    hideToast(2500);
  }
}

/** Stop playback and abort any pending fetch. */
export function stop() {
  clearTimeout(hideTimer);
  if (currentAbort) { currentAbort.abort(); currentAbort = null; }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
  currentUtterance = null;
  if (toastEl) toastEl.hidden = true;
}

/** @returns {boolean} Whether audio is currently playing. */
export function isPlaying() {
  if ('speechSynthesis' in window) {
    return window.speechSynthesis.speaking || isSpeaking;
  }
  return false;
}
