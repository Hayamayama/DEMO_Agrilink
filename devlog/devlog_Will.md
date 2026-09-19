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
