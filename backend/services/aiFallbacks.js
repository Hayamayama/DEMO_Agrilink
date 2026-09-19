// Deterministic answers used when Gemini is unavailable, times out, or keeps
// returning invalid JSON. They are intentionally cautious checklists, never a
// diagnosis, and they are flagged to the UI so the farmer sees it is offline advice.
import { PRESETS } from './aiPresets.js';

const base = {
  confidence: 'low',
  needs_better_photo: false,
  retake_instruction: null,
  sources: [],
  disclaimer: 'AI guidance is not a substitute for a local agronomist.',
};

const CHECKLISTS = {
  crop_diagnosis: {
    headline: 'Check water, then the oldest leaves',
    summary: 'Offline checklist while AI is unavailable.',
    actions: [
      { label: 'Check soil moisture', detail: 'Dig 5cm. If it stays wet, pause watering.' },
      { label: 'Inspect lower leaves', detail: 'Note whether old or new leaves yellow first.' },
      { label: 'Check leaf undersides', detail: 'Look for insects, spots or webbing.' },
    ],
    reasons: ['Waterlogged roots and nutrient shortage look alike from above.'],
    warnings: ['Do not add fertiliser before checking soil condition.'],
    follow_ups: ['Which leaves yellow first?', 'Has the field flooded recently?'],
  },
  weather_action: {
    headline: 'Spray only on a dry, calm day',
    summary: 'Offline checklist while AI is unavailable.',
    actions: [
      { label: 'Check rain forecast', detail: 'Open Weather. Avoid spraying if rain is likely.' },
      { label: 'Check wind', detail: 'Strong wind causes drift. Spray early morning.' },
      { label: 'Read the label', detail: 'Follow the rain-fast time printed on the product.' },
    ],
    reasons: ['Rain within a few hours washes most products off the leaf.'],
    warnings: ['Always wear gloves and a mask when spraying.'],
    follow_ups: ['What is the forecast today?', 'Which product am I spraying?'],
  },
  market_decision: {
    headline: 'Compare markets before you sell',
    summary: 'Offline checklist while AI is unavailable.',
    actions: [
      { label: 'Open Market Prices', detail: 'Compare nearby markets for the same crop.' },
      { label: 'Subtract transport', detail: 'A higher price far away can earn less.' },
      { label: 'Check the trend', detail: 'Compare today against the 7-day average.' },
    ],
    reasons: ['Net profit depends on distance as much as on price.'],
    warnings: ['Prices shown in the demo are sample data.'],
    follow_ups: ['Which market pays most today?', 'What is the trend this week?'],
  },
  government_support: {
    headline: 'Ask your local agriculture office first',
    summary: 'Offline checklist while AI is unavailable.',
    actions: [
      { label: 'Visit the block office', detail: 'Ask for schemes open to your land size.' },
      { label: 'Carry documents', detail: 'Land record, ID and bank passbook.' },
      { label: 'Ask Farmer Circle', detail: 'Neighbours often know what was approved recently.' },
    ],
    reasons: ['Scheme names and deadlines change and cannot be confirmed offline.'],
    warnings: ['Never pay an agent a fee to apply for a public scheme.'],
    follow_ups: ['What documents do I need?', 'Who else in my village applied?'],
  },
  general: {
    headline: 'AI is offline. Try these steps',
    summary: 'Offline checklist while AI is unavailable.',
    actions: [
      { label: 'Retry in a moment', detail: 'Press # to ask the question again.' },
      { label: 'Check Weather', detail: 'Local forecast still works offline-cached.' },
      { label: 'Ask Farmer Circle', detail: 'Send the question to nearby farmers.' },
    ],
    reasons: ['The AI service could not be reached for this request.'],
    warnings: [],
    follow_ups: ['Is rain expected today?', 'What price is rice today?'],
  },
};

export function intentFor({ presetId, text = '' } = {}) {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (preset) return preset.intent;
  const t = text.toLowerCase();
  if (/(price|sell|market|mandi|rate)/.test(t)) return 'market_decision';
  if (/(rain|spray|weather|wind|irrigat)/.test(t)) return 'weather_action';
  if (/(subsid|scheme|government|loan|support)/.test(t)) return 'government_support';
  if (/(leaf|leaves|pest|disease|yellow|spot|wilt|rot|insect)/.test(t)) return 'crop_diagnosis';
  return 'general';
}

export function fallbackAnswer({ presetId, text, contextUsed = [] } = {}) {
  const intent = intentFor({ presetId, text });
  return {
    intent,
    answer: { ...base, ...structuredClone(CHECKLISTS[intent]), context_used: contextUsed.slice(0, 4) },
  };
}
