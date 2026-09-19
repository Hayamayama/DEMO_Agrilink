# Devlog — Yoyo

時間格式：`YYYYMMDDHHMM`（GMT+8）。每個開發步驟一筆，新的加在最下面。
欄位：**發現的問題** / **想解決什麼** / **做了什麼改動** / **給組員的注意事項**。

> 前 4 筆為補記（當天研究與初版實作），時間以檔案最後修改時間推估。

---

## 202609191110 · 研究 + 規劃（未動程式碼）

- **發現的問題**
  - `docs/Weather.md` 是一份 AI prompt，與官方規範/proposal 多處矛盾：320×240（官方只有 240×320 與 128×160）、專案名 FarmPulse、把 `current=precipitation`（雨量 mm）當降雨機率、URL markdown 語法壞掉、時數與 proposal 不同、引用 Next.js 的 cloudfone-starter（與 Vanilla 原則衝突）。
  - 官方 dev-guidelines **沒有** debounce 規則。
  - Open-Meteo 免費版僅限非商業（1 萬次/日）、需 CC-BY 標示。
  - Agmarknet（data.gov.in）有開放 API，但**越南/孟加拉沒有**同等級開放即時價格 API（FAO FPMA 只有國家級月價）。
- **想解決什麼**：先確認能用的 API 與限制，再決定架構，避免做到一半才發現不合規。
- **做了什麼改動**：無程式碼；計畫存於 `~/.claude/plans/proposal-md-weather-md-research-api-whimsical-lynx.md`（在 Yoyo 本機，不在 repo）。
- **給組員的注意事項**
  - 解析度以 **240×320 / 128×160** 為準。
  - 不用 cloudfone-starter，維持 Vanilla ES modules。
  - 真實行情資料只有印度；VN/BD 用 seed 並標「sample」，**簡報不要說成真實資料**。

## 202609191125 · 後端骨架 + 天氣服務

- **發現的問題**：前端直連 Open-Meteo 會吃額度、遇網路問題無 fallback。
- **想解決什麼**：後端代理 + 快取 + 失敗回傳最後成功值；建議由規則產生而非 LLM 猜。
- **做了什麼改動**
  - 新增 `backend/`（Express、`server.js`、`routes/weather.js`、`services/weatherService.js`、單元測試 4 項全過、`.env.example`）。
  - `GET /api/weather?lat=&lng=`：同座標 30 分鐘快取；上游失敗回 `stale:true`；座標驗證失敗回 400。
  - 降雨機率改取 `daily.precipitation_probability_max`；加入 `et0_fao_evapotranspiration`。
  - 新增 `.gitignore`（`node_modules/`、`.env`）。
- **給組員的注意事項**
  - `cd backend && npm install && npm start`（預設 :3000，`PORT` 可改）；`npm test` 跑測試。
  - 目前**尚未使用 better-sqlite3**（避免原生編譯風險），DB 相關功能開始時再加。
  - **API key 一律放 `backend/.env`，不要 commit**（repo 是 public）。

## 202609191130 · 前端 keypad 框架 + 主選單 + 天氣頁

- **發現的問題**：軟鍵在不同裝置的 `KeyboardEvent.key` 值不確定；官方 RSK 語意是「有 history 返回，否則關閉頁面」。
- **想解決什麼**：先做地基（keypad / focus / router / 版面），並讓 RSK 行為符合官方。
- **做了什麼改動**
  - 新增 `frontend/`：`index.html`、`css/{base,layout,responsive}.css`、`js/{keypad,focus,router,api,state,main}.js`、`screens/{mainMenu,weather,comingSoon}.js`。
  - router 的 push/pop 與 `history` 同步（`pop()` = `history.back()`）。
  - 主選單數字鍵 1–6 直接跳選；其餘 5 項為 `ComingSoon` 佔位。
  - 天氣頁：溫度、降雨機率、3 日預報、Enter 切換「建議 ↔ 細節」。
  - 修 bug：天氣載入失敗時會無限重試（加 `tried` 旗標）。
- **給組員的注意事項**
  - **新畫面照 `screens/weather.js` 的介面寫**（`name/title/render/onKey/onEnter/softLeft/softRight/onShow/onHide`），在 `js/main.js` 的 `screens` 註冊，在 `mainMenu.js` 的 `ITEMS` 加入口。
  - 列表項目加 class `item` 即可被焦點系統管理；次要資訊加 `hide-small`（128×160 會隱藏）。
  - **軟鍵值尚未在模擬器確認**：開 `/?debug=1` 頂端會顯示實際 key/keyCode，確認後修 `frontend/js/keypad.js` 的 `KEYMAP`（目前 F1/F2 只是猜的備援）。
  - 位置目前寫死 Rampur（28.8, 79.03），可用 `?lat=&lng=` 覆寫；等 `/api/auth/session` 做好再改讀 profile。

## 202609191132 · 128×160 調整 + 文件修正

- **發現的問題**：128×160 下大字溫度過大，農事建議被切掉一行。
- **想解決什麼**：小螢幕仍能看到關鍵資訊；文件與實作、官方規範一致。
- **做了什麼改動**
  - `responsive.css` 縮小字級/列高/間距；建議文字縮短（≤ ~30 字）。
  - `docs/proposal.md`：Node 安裝改 NodeSource（Ubuntu 24.04 的 apt 版本過舊）、補 RSK/LSK 官方語意、新增 `GET /weather`、風險表新增 3 項（Open-Meteo 非商業、Agmarknet 延遲、VN/BD 無開放 API）。
  - `docs/Weather.md`：改寫為正式規格（含修正對照表），取代原 prompt。
- **給組員的注意事項**
  - 請以修正後的 `docs/Weather.md` 為準，不要再用舊 prompt 生程式。
  - 目前驗證過：Chrome 模擬 240×320 與 128×160、鍵盤完整走一遍；**尚未**在 Cloud Phone simulator / 實機測過。
  - 這批變更**尚未 commit**。

## 202609191146 · push 整合 + devlog 歸位

- **發現的問題**：第一次 push 被拒絕，Kris 已先推 commit，並把 `Weather.md`、`proposal.md` 搬進 `docs/`；devlog 也有了專屬 `devlog/` 資料夾。
- **想解決什麼**：不覆蓋組員的內容，把我們的變更整合進去；統一 devlog 位置與文件路徑。
- **做了什麼改動**
  - `git rebase origin/main`，無衝突，我對兩份文件的修改自動套用到 `docs/` 新路徑；已 push（`7239c62`）。
  - `devlog-Yoyo.md` 移到 `devlog/devlog-Yoyo.md`，內文的 `Weather.md` / `proposal.md` 路徑改為 `docs/` 開頭。
- **給組員的注意事項**
  - 文件都在 `docs/`，devlog 都放 `devlog/`。
  - push 前先 `git pull --rebase origin main`，避免像這次被拒絕。

## 202609191148 · 實機測試前：校正桌面軟鍵對應

- **發現的問題**：`docs/HACKATHON_PREP.md` 指出官方範例把桌面模擬的 `Escape`→左軟鍵、`F12`→右軟鍵；我原本把 `Escape` 對到 BACK，與官方衝突。
- **想解決什麼**：讓 Cloud Phone simulator / 桌面測試時軟鍵行為與官方一致。
- **做了什麼改動**：`frontend/js/keypad.js`：`Escape`→`SOFT_L`、`F12`→`SOFT_R`（`Backspace` 仍為 BACK，`SoftLeft/SoftRight` 保留）。
- **給組員的注意事項**：實機的真實 key 值仍未驗證，測試時開 `?debug=1` 記錄後回填 `KEYMAP`。
