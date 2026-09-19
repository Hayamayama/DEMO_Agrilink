// Contract between the model and the UI. Two shapes are kept deliberately apart:
//  - GEMINI_RESPONSE_SCHEMA: the subset Gemini accepts as responseSchema (no maxLength/additionalProperties).
//  - ANSWER_SCHEMA: the strict ajv schema we trust before anything reaches the client.
// Lengths are enforced by clamp() after validation so a slightly-too-long string
// is trimmed instead of throwing the whole answer away.
import Ajv from 'ajv';

export const CONFIDENCE = ['low', 'medium', 'high'];
export const INTENTS = [
  'crop_diagnosis', 'weather_action', 'market_decision', 'government_support', 'general',
];

export const LIMITS = {
  text: 300,
  headline: 60,
  summary: 100,
  actionLabel: 28,
  actionDetail: 90,
  reason: 90,
  warning: 90,
  contextUsed: 40,
  sourceLabel: 40,
  followUp: 48,
  retake: 90,
  disclaimer: 90,
  actions: 3,
  reasons: 2,
  warnings: 2,
  contextUsedItems: 4,
  sources: 3,
  followUps: 2,
};

// Sent to Gemini as responseSchema. Keep it to types/enums/required only.
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, detail: { type: 'string' } },
        required: ['label', 'detail'],
      },
    },
    reasons: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: CONFIDENCE },
    needs_better_photo: { type: 'boolean' },
    retake_instruction: { type: 'string' },
    context_used: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'string' } },
    follow_ups: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'summary', 'actions', 'confidence', 'follow_ups'],
};

const ajv = new Ajv({ allErrors: false, removeAdditional: 'all', coerceTypes: false });

const str = { type: 'string' };
export const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: str,
    summary: str,
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { label: str, detail: str },
        required: ['label', 'detail'],
      },
    },
    reasons: { type: 'array', items: str },
    warnings: { type: 'array', items: str },
    confidence: { type: 'string', enum: CONFIDENCE },
    needs_better_photo: { type: 'boolean' },
    retake_instruction: { type: ['string', 'null'] },
    context_used: { type: 'array', items: str },
    sources: { type: 'array', items: str },
    follow_ups: { type: 'array', items: str },
  },
  required: ['headline', 'summary', 'actions', 'confidence', 'follow_ups'],
};

const validateAnswer = ajv.compile(ANSWER_SCHEMA);

const clamp = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : v);
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

/**
 * Validate raw model JSON and normalise it into the shape the UI renders.
 * @returns {{ok: true, answer: object} | {ok: false, reason: string}}
 */
export function normalizeAnswer(raw, { allowedSources = [] } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'not_an_object' };
  const candidate = structuredClone(raw);
  if (!validateAnswer(candidate)) {
    return { ok: false, reason: ajv.errorsText(validateAnswer.errors, { separator: '; ' }) };
  }

  const actions = list(candidate.actions, LIMITS.actions)
    .map((a) => ({ label: clamp(a.label, LIMITS.actionLabel), detail: clamp(a.detail, LIMITS.actionDetail) }))
    .filter((a) => a.label);
  if (!actions.length) return { ok: false, reason: 'no_actions' };

  const headline = clamp(candidate.headline, LIMITS.headline);
  const summary = clamp(candidate.summary, LIMITS.summary);
  if (!headline || !summary) return { ok: false, reason: 'empty_headline_or_summary' };

  const needsPhoto = candidate.needs_better_photo === true;
  return {
    ok: true,
    answer: {
      headline,
      summary,
      actions,
      reasons: list(candidate.reasons, LIMITS.reasons).map((r) => clamp(r, LIMITS.reason)).filter(Boolean),
      warnings: list(candidate.warnings, LIMITS.warnings).map((w) => clamp(w, LIMITS.warning)).filter(Boolean),
      confidence: candidate.confidence,
      needs_better_photo: needsPhoto,
      retake_instruction: needsPhoto ? clamp(candidate.retake_instruction, LIMITS.retake) || null : null,
      context_used: list(candidate.context_used, LIMITS.contextUsedItems)
        .map((c) => clamp(c, LIMITS.contextUsed)).filter(Boolean),
      // The model may not invent sources: only labels the backend actually supplied survive.
      sources: sanitizeSources(candidate.sources, allowedSources),
      follow_ups: list(candidate.follow_ups, LIMITS.followUps).map((f) => clamp(f, LIMITS.followUp)).filter(Boolean),
      disclaimer: 'AI guidance is not a substitute for a local agronomist.',
    },
  };
}

// allowedSources: [{ label, url }] the backend genuinely used. Anything else is dropped,
// including plausible-looking URLs the model produced on its own.
export function sanitizeSources(modelSources, allowedSources) {
  if (!Array.isArray(modelSources) || !allowedSources.length) return [];
  const byLabel = new Map(allowedSources.map((s) => [s.label.toLowerCase(), s]));
  const out = [];
  for (const raw of modelSources.slice(0, LIMITS.sources)) {
    const hit = byLabel.get(String(raw).toLowerCase().trim());
    if (hit && !out.some((s) => s.label === hit.label)) out.push({ label: clamp(hit.label, LIMITS.sourceLabel), url: hit.url ?? null });
  }
  return out;
}

const REQUEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    requestId: { type: 'string', minLength: 8, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' },
    conversationId: { type: ['string', 'null'], maxLength: 64, pattern: '^[A-Za-z0-9_-]*$' },
    presetId: { type: ['string', 'null'], maxLength: 40, pattern: '^[a-z0-9_]*$' },
    text: { type: ['string', 'null'], maxLength: LIMITS.text },
    language: { type: 'string', enum: ['en', 'hi'] },
    userContext: {
      type: 'object',
      additionalProperties: false,
      properties: {
        region: { type: ['string', 'null'], maxLength: 20 },
        crops: { type: 'array', items: { type: 'string', maxLength: 24 }, maxItems: 4 },
        experienceLevel: { type: ['string', 'null'], maxLength: 24 },
        market: { type: ['string', 'null'], maxLength: 40 },
      },
    },
  },
  required: ['requestId', 'language'],
};
const validateRequest = ajv.compile(REQUEST_SCHEMA);

export function normalizeRequest(body) {
  const candidate = structuredClone(body ?? {});
  if (!validateRequest(candidate)) {
    return { ok: false, reason: ajv.errorsText(validateRequest.errors, { separator: '; ' }) };
  }
  candidate.text = clamp(candidate.text ?? '', LIMITS.text);
  candidate.userContext ??= {};
  return { ok: true, request: candidate };
}
