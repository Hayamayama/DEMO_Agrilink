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

## 202609191156 · 實機測試前：部署方案（主辦 Ubuntu 主機）

- **發現的問題**
  - 主機已由主辦預先配置：nginx 在 80/443、certbot 已簽好 `<IP>.sslip.io` 網域憑證，官方範例放在 `/cloudphone-2025meichuhackathon-demo/`，根路徑 `/` 是空的。**不需要自己申請網域/憑證。**
  - 主機 Node 是 **18.19**（非 proposal 假設的 20），且沒裝 pm2。
  - nginx 站台設定是 certbot 管理的，不能整個覆蓋。
- **想解決什麼**：用最小改動把 AgriLink 掛到根路徑，不破壞主辦的範例站與憑證。
- **做了什麼改動**
  - 新增 `deploy/setup.sh`（可重複執行：clone/pull、`npm ci`、systemd 服務、nginx 只加一行 `include`，改前自動備份、`nginx -t` 通過才 reload）、`deploy/agrilink.service`、`deploy/agrilink.conf`。
  - 用 systemd 取代 pm2（省去多裝套件）；Node 18 已驗證程式相容。
- **給組員的注意事項**
  - 每人的主機不同（IP、私鑰都是個人的），**IP / 私鑰 / IMEI 都不要進 repo**。
  - 主機上 `git clone` 走公開 https，所以**要先 push 才能部署**。
  - 各組員本機 Node 版本可能與主機不同（主機為 18），請避免用 Node 20+ 才有的語法。
  - 主機上更新：`ssh` 進去後 `bash ~/dogbark/deploy/setup.sh`。

## 202609191158 · 已部署到主辦主機（HTTPS 可用）

- **發現的問題**：`setup.sh` 把 nginx 備份檔放進 `sites-enabled/`，nginx 會把該目錄全部載入，造成 `duplicate listen options`；`nginx -t` 失敗所以**沒有 reload，線上未受影響**。另外 `package.json` 的 `engines` 要求 Node>=20，主機是 18，只產生警告。
- **想解決什麼**：完成第一次部署並驗證公開網址。
- **做了什麼改動**
  - 備份改放 `/etc/nginx/backup/`；`setup.sh` 同步修正。
  - 部署完成：systemd 服務 `agrilink` active，nginx reload 成功。
  - 外部驗證：`/` 200、官方範例路徑 200、`/api/weather` 回真實資料、HTTP 301 轉 HTTPS。
- **給組員的注意事項**
  - **備份檔絕對不要放在 `sites-enabled/`**。
  - 後續更新：主機上 `bash ~/dogbark/deploy/setup.sh`（會 git pull 並重啟服務）；看 log：`journalctl -u agrilink -f`。
  - 下一步（需本人操作）：登入 cloudphone.tech Console 用主辦給的 `*.sslip.io` 網址註冊 widget（Name: AgriLink、80×80 PNG icon），實機用 `?debug=1` 記錄軟鍵 key 值。

## 202609191214 · 依 simulator 實測結果更新鍵位對照

- **發現的問題**（simulator 實測，用 `?debug=1`）
  - 左軟鍵 = `Escape`（kc 27）；與官方範例一致，原設定正確。
  - **右軟鍵完全沒有 keydown 事件**：由平台處理（等同 `history.back()`／根畫面關閉），與官方文件描述相符，所以 router 與 history 同步的設計是對的，不需要也不能在前端攔截。
  - 數字鍵回報 `code=DigitN`（原本只用 `e.key` 比對，可能漏接）；`*` 回報 `NumpadMultiply`（kc 106），原本 `'*'` 對不到；`#` 回報與 `3` 相同的 `Digit3`（kc 51），僅能靠 `shiftKey` 區分（尚待確認）。
  - 無獨立返回鍵。
- **想解決什麼**：讓數字、`*`、`#` 在 simulator 上也能正確對到動作。
- **做了什麼改動**：`frontend/js/keypad.js` 新增 `resolveAction()`（依序比對 `key` → `code` → `keyCode`）；加入 `Digit0-9`、`Numpad0-9`、`NumpadMultiply`、kc 106；`#` 判定 = `key==='#'` 或 `Shift+Digit3`。debug 覆蓋層改顯示 `key/code/kc/shift/對應動作`。以 Node 腳本驗證 7 個案例皆通過。
- **給組員的注意事項**
  - 別依賴前端收到右軟鍵；畫面上的 "Back" 只是標籤，實際由平台觸發返回。
  - **`#` 與 `3` 在 simulator 上可能無法區分**（若 `shiftKey` 也是 false）：T9「送出」不要只靠 `#`，需要備援（例如 Enter 或 soft key）。實機結果仍待測。
  - 尚未在實機驗證。

## 202609191220 · 確認 # 鍵可與 3 區分（simulator）

- **發現的問題**：前一筆擔心 `#` 與 `3` 無法區分。實測 `#` 為 `key="#" code="Digit3" kc=51 shift=false`，`key` 欄位就是 `#`，能與 `3` 分開；先前誤判是因為只看了 `code`/`kc`。
- **想解決什麼**：確認 `#`/`*`/數字在部署版上正確對應。
- **做了什麼改動**：無邏輯變更（`resolveAction` 先比 `key` 所以 `#`→HASH 已正確）；只更新 `keypad.js` 註解。已部署版本 `4f083e7` 驗證 `#`→HASH。
- **給組員的注意事項**
  - 判斷按鍵請**優先用 `e.key`**，`code`/`keyCode` 只當備援（`#` 的 `code` 與 `3` 相同）。
  - 上一筆「T9 送出不要只靠 `#`」的顧慮在 simulator 上解除；**實機仍待驗證**，備援 Enter 仍建議保留。

## 202609191221 · 實機驗證準備：新增 keytest 測試頁

- **發現的問題**：實機上進 app 再看頂端小字逐鍵記錄很不方便；右軟鍵不送 keydown，需要觀察平台實際觸發了什麼；字型（emoji/印地語/孟加拉語）與 viewport 實際尺寸也尚未驗證。
- **想解決什麼**：一頁看完實機所有關鍵資訊，並與 simulator 結果對照。
- **做了什麼改動**：新增 `frontend/keytest.html`（無依賴、無 build）：顯示 keydown/keyup 最近 9 筆（key/code/kc/shift）、viewport 與 dpr、emoji + 印地語 + 孟加拉語字型渲染、UA，並監聽 popstate / pagehide / visibilitychange（用來看右軟鍵實際做了什麼；頁面載入時先 pushState 讓它有 history 可返回）。
- **給組員的注意事項**
  - 測試網址：部署後 `/keytest.html`。
  - 記錄格式：每按一個鍵抄最後一行；右軟鍵看有沒有 `EVENT popstate` 或 `EVENT pagehide`。
  - 若 emoji/印地語顯示成方框，代表實機缺字型，天氣頁要靠文字標籤，i18n 只主打 en。

## 202609191225 · keytest 字太小 → 放大重排

- **發現的問題**：`keytest.html` 原本 11px，在 240×320 上完全看不清（主 app 用 16px 才可讀）。
- **想解決什麼**：實機上一眼就能讀到按鍵值。
- **做了什麼改動**：`frontend/keytest.html` 字級改 16px；最新一次 keydown 用 22px 綠底大字獨立顯示；歷史只留 6 筆；viewport / 字型資訊縮成兩行。本機以 240×320 截圖確認可讀。
- **給組員的注意事項**
  - 手機上寫的字級請以 **≥16px** 為底線（128×160 才縮到約 10px，且僅限次要資訊）。
  - 瀏覽器工具模擬按鍵時 `code` 會是空字串、`kc=0`，那是模擬工具的限制，不是頁面 bug；實機才有真值。

## 202609191254 · 確認右軟鍵行為：觸發 popstate

- **發現的問題**：右軟鍵不送 keydown，不知道平台實際怎麼處理。
- **想解決什麼**：確認 router 與 history 同步的設計可行。
- **做了什麼改動**：無程式碼變更。keytest 實測：按右軟鍵 → 出現 `EVENT popstate`（頁面載入時已 `pushState`，所以有 history 可返回），與官方「有 history 就返回」的描述一致。
- **給組員的注意事項**
  - 右軟鍵 = 瀏覽器返回 → 觸發 `popstate`。**每個畫面切換都要用 `router.push`（會 pushState）**，不要自己改 DOM 換畫面，否則右軟鍵會直接跳出整個 widget。
  - 畫面內的子狀態（例如彈窗、下拉選單）若希望右軟鍵先關掉它，也要自己 `pushState`，並在 `popstate` 時關閉。
  - 根畫面（主選單）按右軟鍵 = 離開 widget（預期行為）。
  - 這筆記錄未標明是 simulator 還是實機，實機需再確認一次。
