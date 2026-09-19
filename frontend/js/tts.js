import { t } from './i18n/index.js';

let currentAudio = null;
let currentAbort = null;
let currentUtterance = null;
let isSpeaking = false;
let toastEl = null;
let hideTimer = null;
let session = 0;

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

function isCurrent(id) {
  return id === session;
}

function playNativeTTS(text, language, id) {
  if (!('speechSynthesis' in window)) {
    showToast(t('Speech is not available on this phone.'));
    hideToast(2500);
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.onstart = () => {
    if (!isCurrent(id)) return;
    isSpeaking = true;
    showToast(t('Reading'));
  };
  utterance.onend = () => {
    if (!isCurrent(id)) return;
    isSpeaking = false;
    currentUtterance = null;
    showToast(t('Done'));
    hideToast();
  };
  utterance.onerror = () => {
    if (!isCurrent(id)) return;
    isSpeaking = false;
    currentUtterance = null;
    showToast(t('Playback failed'));
    hideToast(2500);
  };
  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export async function readAloud(text, language = 'en') {
  stop();
  if (!text || !text.trim()) return;

  const id = ++session;
  const controller = new AbortController();
  currentAbort = controller;
  showToast(t('Preparing audio'));

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, language }),
      signal: controller.signal,
    });
    if (!isCurrent(id) || controller.signal.aborted) return;

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (!isCurrent(id) || controller.signal.aborted) return;
      currentAbort = null;
      if (body?.error?.code === 'TTS_FALLBACK_NATIVE' && body.error.fallbackText) {
        playNativeTTS(body.error.fallbackText, language, id);
        return;
      }
      showToast(t(body?.error?.message || 'Audio is unavailable.'));
      hideToast(2500);
      return;
    }

    const blob = await res.blob();
    if (!isCurrent(id) || controller.signal.aborted) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onplay = () => {
      if (!isCurrent(id)) return;
      isSpeaking = true;
      showToast(t('Reading'));
    };
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (!isCurrent(id)) return;
      isSpeaking = false;
      currentAudio = null;
      currentAbort = null;
      showToast(t('Done'));
      hideToast();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (!isCurrent(id)) return;
      isSpeaking = false;
      currentAudio = null;
      currentAbort = null;
      showToast(t('Playback failed'));
      hideToast(2500);
    };
    try {
      await audio.play();
    } catch (err) {
      if (!isCurrent(id) || controller.signal.aborted) return;
      currentAudio = null;
      currentAbort = null;
      showToast(t('Playback failed'));
      hideToast(2500);
      console.error('TTS playback failed:', err);
    }
  } catch (err) {
    if (!isCurrent(id) || err.name === 'AbortError') return;
    currentAbort = null;
    showToast(t('Audio is unavailable.'));
    hideToast(2500);
  }
}

export function stop() {
  session += 1;
  clearTimeout(hideTimer);
  if (currentAbort) currentAbort.abort();
  currentAbort = null;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
  }
  currentAudio = null;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  currentUtterance = null;
  isSpeaking = false;
  if (toastEl) toastEl.hidden = true;
}

export function isPlaying() {
  return Boolean(currentAbort || (currentAudio && !currentAudio.paused) || currentUtterance || isSpeaking);
}
