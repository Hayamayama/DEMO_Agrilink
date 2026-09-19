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

const screens = {
  MainMenu: mainMenu, Weather: weather, MarketPrices: marketPrices, PriceDetail: priceDetail, ComingSoon: comingSoon,
  AskAIHome: askAIHome, AskAIInput: askAIInput, AskAIThinking: askAIThinking, AskAIAnswer: askAIAnswer,
  AskAISources, AskAIMedia, AskAIPhoto, AskAIVoice, AskAIHistory,
};
const $ = (id) => document.getElementById(id);

const router = createRouter({
  screens,
  els: { status: $('status'), content: $('content'), sl: $('sk-l'), sc: $('sk-c'), sr: $('sk-r') },
});
initKeypad(router.dispatch, { debug: new URLSearchParams(location.search).has('debug') });
router.start('MainMenu');
