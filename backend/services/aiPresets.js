// Preset questions. The client sends the stable `id`; the server expands it to
// `text`, so a translated label on the handset never changes what the model sees.
// Keep the ids in sync with frontend/js/screens/askAIHome.js.
export const PRESETS = [
  {
    id: 'yellow_leaves',
    label: 'Why are leaves yellow?',
    text: 'My crop leaves are turning yellow. What should I check first?',
    intent: 'crop_diagnosis',
  },
  {
    id: 'rain_spray',
    label: 'Is rain safe for spray?',
    text: 'Based on local weather, is it safe to spray today?',
    intent: 'weather_action',
  },
  {
    id: 'sell_or_wait',
    label: 'Sell rice now or wait?',
    text: 'Should I sell my rice now or wait? Explain the main trade-off.',
    intent: 'market_decision',
  },
  {
    id: 'local_support',
    label: 'Find local support',
    text: 'What local agriculture support or subsidy should I check?',
    intent: 'government_support',
  },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id);
