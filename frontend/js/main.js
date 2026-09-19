import { initKeypad } from './keypad.js';
import { createRouter } from './router.js';
import mainMenu from './screens/mainMenu.js';
import weather from './screens/weather.js';
import marketPrices from './screens/marketPrices.js';
import priceDetail from './screens/priceDetail.js';
import comingSoon from './screens/comingSoon.js';
import askAIHome from './screens/askAIHome.js';
import askAIInput from './screens/askAIInput.js';
import askAIThinking from './screens/askAIThinking.js';
import askAIAnswer, { AskAISources } from './screens/askAIAnswer.js';
import { AskAIMedia, AskAIPhoto, AskAIVoice, AskAIHistory } from './screens/askAIMedia.js';
import { AuthWelcome, AuthPhone, AuthPin, ProfileName, ProfileVillage, ProfileRegion, AuthResult, Settings, ProfileSummary, LanguageSettings, CropSettings } from './screens/identity.js';
import { getJSON } from './api.js';
import { identity } from './state.js';

const screens = {
  MainMenu: mainMenu, Weather: weather, MarketPrices: marketPrices, PriceDetail: priceDetail, ComingSoon: comingSoon,
  AskAIHome: askAIHome, AskAIInput: askAIInput, AskAIThinking: askAIThinking, AskAIAnswer: askAIAnswer,
  AskAISources, AskAIMedia, AskAIPhoto, AskAIVoice, AskAIHistory,
  AuthWelcome, AuthPhone, AuthPin, ProfileName, ProfileVillage, ProfileRegion, AuthResult, Settings, ProfileSummary, LanguageSettings, CropSettings,
};
const $ = (id) => document.getElementById(id);

const router = createRouter({
  screens,
  els: { status: $('status'), content: $('content'), sl: $('sk-l'), sc: $('sk-c'), sr: $('sk-r') },
});
initKeypad(router.dispatch, { debug: new URLSearchParams(location.search).has('debug') });
try {
  const session = await getJSON('/api/auth/session');
  identity.profile = session.user;
  router.start(session.user ? 'MainMenu' : 'AuthWelcome');
} catch {
  // A local price-only demo may intentionally run without PostgreSQL/auth.
  router.start('AuthWelcome');
}
