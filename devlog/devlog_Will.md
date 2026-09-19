# 2026-09-19 15:16 npm start 自動管理 Selenium scraper
- **發現的問題**：原本必須手動另開 Flask；Selenium 啟動慢，Node 不知道 scraper 是否可用，也無法在結束時清除 Python 與 ChromeDriver 子程序。本機附帶的 Python venv 還綁定到不存在的 Python 路徑。
- **做了什麼改動**：新增 `scraperManager.js`，由 `server.js` 在啟動 Express 前自動啟動 `PriceScrap/agmarknetAPI/APIwebScraping.py`、輪詢 `/health`，並在 SIGINT/SIGTERM 時停止其程序樹。新增 Flask `/health` 與 `PRICE_SCRAPER_MANAGED`、`PRICE_SCRAPER_PYTHON` 設定；若 venv 立即失敗會自動嘗試系統 `python`，仍失敗時讓 Node 以 mock 模式啟動。
- **給組員的注意事項**：正式機器需先有可用 Python、`requirements.txt` 依賴，以及 Selenium 可使用的 Chrome/ChromeDriver；這是一次性的環境安裝，不需要每次手動啟動 Flask。若使用外部 scraper，設 `PRICE_SCRAPER_MANAGED=false` 與 `PRICE_SCRAPER_URL`。本次 Node 測試共 8 項皆通過；本機 venv 與系統 Python 依賴不足，尚未實測 live Selenium 查價。

# 2026-09-19 15:38 雲端即時語音播報 Cloud TTS Broadcaster
- **功能目的**：小農可能有識字率限制或老花眼，240×320 小螢幕看長篇建議會疲勞。按 `#` 鍵即可將當前畫面的文字送到雲端合成語音，串流回手機播放。
- **做了什麼改動**：
  - **後端**：新增 `services/ttsService.js`（利用現有 Gemini API Key 呼叫 `gemini-2.5-flash-preview-tts` 模型合成語音）、`routes/tts.js`（`POST /api/tts` 端點，接受 `{ text, language }` 回傳原始音訊，附帶每分鐘 30 次／每日 500 次速率限制）。`server.js` 掛載 `/api/tts`。`.env.example` 新增 TTS 相關設定文件。新增 `services/ttsService.test.js` 單元測試（6 項情境）。
  - **前端**：新增 `js/screenText.js`（從 `#content` DOM 擷取可見文字）、`js/tts.js`（呼叫 `/api/tts`、播放音訊、顯示「🔊 Reading…」浮動提示）。`router.js` 的 `dispatch` 函式新增全域 `HASH` 處理：登入後按 `#` 觸發 TTS；再按一次 `#` 停止播放。
  - **畫面調整**：`weather.js` 的地區切換從 `#` 改為 `*` 鍵（含提示文字更新）；`askAIAnswer.js` 移除 `#` 新問題功能（已有 Follow-up / 按鍵 1）；`askAIHome.js` 移除 `#` 開始打字功能。
  - **CSS**：`layout.css` 新增 `.tts-toast` 樣式（固定於畫面頂端的綠底黃字浮動提示）。
- **# 鍵衝突處理策略**：登入流程中的 T9 輸入畫面（`identity.js` 的 ProfileName/ProfileVillage、`askAIInput.js`）會在自身的 `onKey` 中消費 `HASH` 事件（回傳 `true`），因此全域 TTS 處理不會觸發。登入前（`identity.profile === null`）全域處理也不會觸發。
- **給組員的注意事項**：不需要新的 API Key，直接使用現有 `GEMINI_API_KEY`。Weather 畫面切換地區改按 `*`，請更新操作文件。前端 `tts.js` 透過 `blob:` URL 播放音訊，CSP 的 `media-src 'self' blob:` 已涵蓋。

# 2026-09-19 16:29 合併 TTS 功能至最新 v1
- **做了什麼改動**：在取得最新的 `dogbark_v1` 後，重新將上述 TTS 服務的所有變更乾淨地疊加（Merge）到目前的 codebase 上。所有最新功能皆保留，不會發生衝突。

# 2026-09-19 17:04 v2 保留最新功能並確認 TTS 整合
- **發現的問題**：`dogbark_v1` 含 TTS，而目標 `dogbark_v2` 需保留後續的 Local Market 與 Today’s Farm 程式碼；直接以舊版覆蓋會遺失 v2 的最新功能。
- **做了什麼改動**：確認 `dogbark_v2` 的最新 HEAD 為 `8fa5224`，且 TTS 整合 commit `a511e6f` 已在其歷史中。比對 v1/v2 的 `ttsService.js`、`routes/tts.js`、`tts.js`、`screenText.js` 雜湊一致，並確認 v2 `server.js` 已掛載 `/api/tts`、`router.js` 已支援登入後 `#` 朗讀／再次 `#` 停止。因此保留 v2 的 Local Market 與 Today’s Farm 程式碼，不以 v1 覆蓋。執行 v2 測試：TTS suite 7 項通過，整體已有 63 項通過。
- **給組員的注意事項**：目前 `npm test` 另有 9 項既有環境／測試設定失敗：缺少 dev dependency `@electric-sql/pglite`，以及 `test/t9.test.js` 將前端 ESM 視為 CommonJS；這些與 TTS 合併無關。另保留未追蹤的 `backend/testTts.js`，未擅自刪除。部署前請在 v2 的 `backend/.env` 設定 `GEMINI_API_KEY` 與可用的 `TTS_MODEL`。

# 2026-09-19 17:26 移除 API 依賴並改用 Native Web Speech API (v3 測試版)
- **做了什麼改動**：在 `dogbark_v3` 中修改 `frontend/js/tts.js`，完全移除對後端 `/api/tts` (Gemini API) 的依賴。改為使用瀏覽器內建的 `window.speechSynthesis` 原生語音 API 來朗讀文字。
- **功能目的**：作為不依賴任何 API Key 或網路穩定度的測試版本，確保開發團隊或評審能在任何瀏覽器與裝置上直接按下 `#` 鍵，立刻且保證能聽到畫面內容的語音廣播。完全免除任何 400 或 429 的報錯風險。

# 2026-09-19 17:28 略過登入流程 (供 v3 本地測試)
- **做了什麼改動**：修改 `dogbark_v3/frontend/js/main.js`，強制寫入一個預設的 `identity.profile` 並直接跳轉到 `MainMenu`。
- **給組員的注意事項**：這只是為了方便在本地直接測試 TTS 而做的暫時改動。上線正式環境前請務必將此檔案復原。

# 2026-09-19 17:34 完全替換 Gemini API 為免費的 Google Translate 語音
- **做了什麼改動**：
  1. 安裝 `google-translate-api-x` 套件。
  2. 完全重寫 `backend/services/ttsService.js`。現在不再依賴 `gemini-1.5-flash-8b`，而是將前端傳來的英文文字在後端翻譯，並直接透過 `google-translate-api-x` 下載免費的 Google 語音 MP3 回傳給前端。
  3. 復原 `frontend/js/tts.js`，恢復使用 `fetch('/api/tts')`。
- **功能目的**：徹底解決 Gemini API 的 Rate Limit 與需要 API Key 的痛點，同時保留了「由雲端負責合成高品質語音，不佔用邊緣設備運算資源」的原始設計初衷 (Option A)。
