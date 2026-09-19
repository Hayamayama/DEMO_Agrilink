import { initKeypad } from './keypad.js';
import { createRouter } from './router.js';
import mainMenu from './screens/mainMenu.js';
import weather from './screens/weather.js';
import marketPrices from './screens/marketPrices.js';
import priceDetail from './screens/priceDetail.js';
import comingSoon from './screens/comingSoon.js';

const screens = { MainMenu: mainMenu, Weather: weather, MarketPrices: marketPrices, PriceDetail: priceDetail, ComingSoon: comingSoon };
const $ = (id) => document.getElementById(id);

const router = createRouter({
  screens,
  els: { status: $('status'), content: $('content'), sl: $('sk-l'), sc: $('sk-c'), sr: $('sk-r') },
});
initKeypad(router.dispatch, { debug: new URLSearchParams(location.search).has('debug') });
router.start('MainMenu');
