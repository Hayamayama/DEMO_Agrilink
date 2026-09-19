# Kris 開發紀錄（Devlog）

本檔案供 CloudMosa Hackathon 組員交接與追蹤。每一筆均使用 `YYYYMMDDHHMM GMT+8`（Asia/Taipei）格式，記錄發現、目標、實際變更與後續注意事項。

> 不得在本檔案記錄 private key、密碼、token、憑證私鑰或其他機密內容。可記錄檔案位置、公開網址與非機密設定。

---

## 202609191115 GMT+8 — 建立共用 devlog

### 發現／問題

- 專案此前沒有統一記錄開發與部署決策的文件，組員難以確認 VM、手機測試與 widget URL 的最新狀態。

### 要解決什麼

- 建立可持續附加的開發紀錄，讓每次變更都有可追溯的背景、目的、做法及風險。

### 做了什麼改動

- 在專案根目錄建立 `devlog-kris.md`。
- 補登本次已完成的裝置確認、Cloud Phone 研究、VM 部署與 HTTPS 設定。

### 組員注意事項

- 後續每次改程式、部署設定或測試環境後，請在檔案末端新增一筆紀錄。
- 時戳請使用 `date '+%Y%m%d%H%M GMT+8'` 取得。

---

## 202609191115 GMT+8 — itel NEO R60+ USB 儲存區確認

### 發現／問題

- 插入的裝置掛載為 `/Volumes/NO NAME`，僅顯示約 27 MiB 的 USB Mass Storage 區。
- 可見目錄包含 `System/`、`Cool_Photo/`、`Cool_Music/`、`Cool_Video/`、`vCard/` 與 `@cstardata/`。
- 此模式不等同完整系統存取，無法直接取得韌體、SIM、簡訊或受保護系統分區。

### 要解決什麼

- 確認手機可以安全讀取的資料範圍，以及開發 widget 時是否應從 USB 檔案系統著手。

### 做了什麼改動

- 僅做唯讀檢查，未更動手機儲存資料。
- 確認可見資料量約 480 KB，主要為系統設定與預設資料，未發現使用者媒體檔。

### 組員注意事項

- 不要將 USB 儲存區誤認為 Android 檔案系統，也不要期待 `adb` 可用。
- 若未來進行低階韌體研究，先取得完整唯讀備份；不要使用不相容 loader 或任意刷機。

---

## 202609191115 GMT+8 — Cloud Phone 開發方式確認

### 發現／問題

- itel NEO R60+（it9310）為 UNISOC T127 的 feature phone，Cloud Phone 版本為 2.5.0。
- Cloud Phone widget 不是 APK；它是 CloudMosa 遠端 Chromium 瀏覽器開啟的 HTTPS 網頁。

### 要解決什麼

- 找出把 demo 顯示在手機上測試的正規方式。

### 做了什麼改動

- 確認測試流程：在 Cloud Phone Developer Console 登入後，將測試機 IMEI 加入帳號並新增 widget URL。
- 手機端可在 Cloud Phone App 的 About 頁面連按左軟鍵 7 次，啟用 Developer Mode，讓指定 IMEI 看到測試 widget。

### 組員注意事項

- Widget URL 必須是公開可存取、具有效 TLS 憑證的 HTTPS 網址。
- Cloud Phone 不支援直接用 HTTP、裸 IP 位址、Android APK 或離線檔案作為 widget。

---

## 202609191115 GMT+8 — 將 cloudphone-demo 部署至 CloudMosa Ubuntu VM

### 發現／問題

- `cloudphone-demo` 為 Next.js 15 專案，`next.config.ts` 已設定 `output: 'export'`。
- production `basePath` 是 `/cloudphone-2025meichuhackathon-demo`；若 Nginx 路徑不對應，會造成靜態資產或首頁 404。
- VM `203.116.30.130` 初始為 Ubuntu 24.04，未安裝 Node.js、npm 或 Nginx，且入站防火牆預設 DROP。

### 要解決什麼

- 建立公開可存取的靜態 widget 網頁，作為 Cloud Phone Developer Console 可填入的網址。

### 做了什麼改動

- 使用本機 SSH 私鑰連線至 `ubuntu@203.116.30.130`，並以 `rsync` 上傳專案至 `/home/ubuntu/cloudphone-demo/`。
- VM 安裝 `nodejs`、`npm`、`nginx`；執行 `npm ci` 與 `npm run build`，成功產出約 1.2 MB 的 `out/` 靜態檔。
- 靜態檔部署至 `/var/www/cloudphone-2025meichuhackathon-demo/`。
- 建立 Nginx site `cloudphone-demo`，以 `/cloudphone-2025meichuhackathon-demo/` 提供網站。
- 開放並以 `netfilter-persistent` 保存 TCP 80 規則。

### 組員注意事項

- 更新程式後必須重新執行 build，並將新的 `out/` 內容複製到 `/var/www/cloudphone-2025meichuhackathon-demo/`，再 reload Nginx。
- 不要上傳 `node_modules`、`.next` 或 `out`；VM 應由 lockfile 重建依賴與輸出。
- 詳細指令請參考 `cloudphone-demo/DEPLOYMENT_ZH_TW.md`。

---

## 202609191115 GMT+8 — Widget HTTPS URL 與 Let’s Encrypt 憑證

### 發現／問題

- HTTP 測試網址可連線，但 Cloud Phone Console 只能接受 HTTPS URL。
- 團隊暫無自有網域；直接使用 VM IP 也無法作為標準 HTTPS hostname。

### 要解決什麼

- 為測試環境取得可公開驗證、可直接貼入 Cloud Phone Console 的 HTTPS URL。

### 做了什麼改動

- 使用 `sslip.io` 的 IP 內嵌 hostname：`203-116-30-130.sslip.io`，已確認其 DNS 解析至 VM 公網 IP。
- 開放並持久化 TCP 443。
- 安裝 `certbot` 與 `python3-certbot-nginx`，透過 Let’s Encrypt 簽發憑證並設定 HTTP→HTTPS redirect。
- 外網驗證 HTTPS 首頁回傳 `200 OK`。
- 目前可用 widget URL：

  ```text
  https://203-116-30-130.sslip.io/cloudphone-2025meichuhackathon-demo/
  ```

- 憑證到期日為 2026-12-18；Certbot 已設定自動續期排程。

### 組員注意事項

- 此 `sslip.io` hostname 適合 hackathon／測試，不應視為長期正式網域。
- 正式上線時應改用團隊持有網域，更新 Nginx `server_name`、DNS A record、TLS 憑證與 Cloud Phone Console 的 widget URL。
- TCP 80 與 443 現已公開；不得把敏感測試資料或管理介面放進此靜態網站。

---

## 202609191204 GMT+8 — 確認 Agrilink 已部署服務的公開 URL

### 發現／問題

- VM 上新增了 `/home/ubuntu/dogbark` 專案與已啟用的 `agrilink.service`。
- Agrilink Node.js backend 運行在 `127.0.0.1:3000`，不應直接對公網開放該埠。

### 要解決什麼

- 確認 Agrilink 對外可使用的網址，並釐清它與 Cloud Phone demo 的路由關係。

### 做了什麼改動

- 以唯讀方式檢查 systemd、Nginx 與本機 HTTP 回應。
- 確認 Nginx HTTPS 根路徑 `/` 已反向代理至 `http://127.0.0.1:3000`，且回應為 `200 OK`。
- Agrilink 公開 URL：

  ```text
  https://203-116-30-130.sslip.io/
  ```

### 組員注意事項

- Cloud Phone demo 仍位於同一網域的 `/cloudphone-2025meichuhackathon-demo/`；較長的路徑優先匹配，因此不受 Agrilink 根路徑代理影響。
- Agrilink 由 `agrilink.service` 管理。檢查狀態請用 `sudo systemctl status agrilink`；更新後應重啟該 service，不要直接手動執行 `node server.js` 佔用 3000 埠。

---

## 202609191247 GMT+8 — 自架 PostgreSQL 與基礎 schema 上線

### 發現／問題

- AgriLink 的核心流程是多人共享狀態：刊登、表達興趣、通知、登入與點數都會有同時寫入需求；proposal 中的 SQLite 設計不再是目前後端的正確基礎。
- VM 當時未安裝 PostgreSQL 或 Docker，但既有 Nginx（80/443）與 `agrilink.service`（127.0.0.1:3000）正在服務，資料庫部署不得干擾現有網站。

### 要解決什麼

- 在同一台 Ubuntu VM 建立只供後端使用、不可由公網直接連線的 PostgreSQL authoritative store。
- 建立登入／個人化／市集的最小可用資料結構，並保留安全 migration 與權限分工。

### 做了什麼改動

- 安裝 PostgreSQL 16，建立 `agrilink` database；資料庫只監聽 `127.0.0.1:5432`，沒有開放 5432 防火牆規則。
- 建立兩個非 superuser 角色：`agrilink_migrator` 負責 schema migration、`agrilink_app` 供 Node application 讀寫；實際憑證僅保存在 VM 權限 `600` 的設定檔，未進 Git、未記錄於本檔。
- 撤除 `public` schema 的預設建表權限，只授予 application role 對 `app` schema 的必要權限。
- 套用 `001_foundation` 與 `002_marketplace`：建立地區、使用者／身份、profile、作物、刊登、interest、通知與 outbox event 等表與索引。
- 新增／維護 PostgreSQL 設計與交接文件：`docs/POSTGRESQL_SCHEMA_PLAN.md`；環境變數範例只保留無密碼的 `DATABASE_URL` 格式。

### 組員注意事項

- Browser／Cloud Phone 前端不可直接使用資料庫帳密；所有資料存取必須經 Node API／WebSocket。
- PostgreSQL superuser 採 VM 本機 peer authentication；日常應用請使用 `agrilink_app`，schema 變更只使用 `agrilink_migrator`。
- 不要在部署過程中重啟或手動搶佔 3000 埠；資料庫本身與 Nginx 路由無直接衝突。

---

## 202609191325 GMT+8 — Market Prices migration 003 套用與驗證

### 發現／問題

- 組員新增 Market Prices API／畫面後，需要把市場與每日行情資料從記憶體假資料切換為 PostgreSQL 的可追溯資料來源。

### 要解決什麼

- 將市場／行情結構安全加入既有 `app` schema，並保持 demo 資料與真實資料來源可區分。

### 做了什麼改動

- 拉取並 review `backend/db/migrations/003_market_prices.sql` 後，以 migrator role 套用至共用 VM database。
- 新增 `app.markets`、`app.market_prices`、作物／市場／日期查詢索引，以及 app role 的必要讀寫權限。
- VM `app.schema_migrations` 已記錄 `003_market_prices`；application role 已可讀取新表。

### 組員注意事項

- 行情資料必須保留 `source` 與 `is_sample`，不能把 sample 資料說成即時市場資料。
- schema 已存在不代表 production 已有資料；seed／外部同步仍須分別執行與驗證。

---

## 202609191505 GMT+8 — Identity / Admin migration 004 狀態確認

### 發現／問題

- Keypad-first login 與管理功能需要持久化 credentials、session、application settings 與 audit log。

### 要解決什麼

- 確認新 identity/admin schema 已在共用 VM 套用，而非只存在於 Git。

### 做了什麼改動

- 驗證 VM migration ledger 已包含 `004_identity_admin.sql`，並確認 `agrilink.service` 為 active。
- 此 migration 新增 user role、`auth_credentials`、`auth_sessions`、`app_settings` 與 `admin_audit_log`，並授予 application role 所需權限。

### 組員注意事項

- credentials 僅存 phone lookup hash 與 PIN hash；禁止加入明碼電話號碼、PIN 或 session secret 欄位。
- 登入／管理相關變更應一併寫 audit log，且不可把 session token 輸出到 console、devlog 或 Git。

---

## 202609191530 GMT+8 — PostgreSQL GUI 連線與 migration ledger 稽核

### 發現／問題

- 需要讓組員能以 GUI 檢視資料庫，又不能為 TablePlus／pgAdmin 對公網開放 5432。
- 現有 migration ledger 的版本格式不一致：`001_foundation`、`002_marketplace`、`003_market_prices` 沒有 `.sql`，但 `004_identity_admin.sql` 含副檔名。

### 要解決什麼

- 提供安全的開發者 GUI 存取方式，並在 migration runner 造成重複套用前標記命名風險。

### 做了什麼改動

- 驗證可用 TablePlus 的 SSH tunnel 連線：Over SSH 模式下，database host 填 VM 端 `127.0.0.1`、port 填 `5432`、database 為 `agrilink`；不要同時使用手動 5433 tunnel 與 TablePlus Over SSH。
- 核對 VM PostgreSQL 16.15、`agrilink.service` active 與四筆 migration ledger。
- 更新本 devlog，補齊 PostgreSQL 上線、001–004 migration、權限邊界與 GUI 操作交接。

### 組員注意事項

- **在修正 ledger 前，不要直接執行 `npm run db:migrate`。** 現行 `backend/db/migrate.js` 以完整檔名（如 `001_foundation.sql`）檢查 migration；前三筆 ledger 缺少 `.sql`，runner 可能誤判未執行並嘗試重跑已存在的 schema。
- 修復時需統一一種格式：要麼將既有前三筆 ledger 改為完整檔名，要麼修改 runner 一律以不含副檔名的 version 比對；先在 VM 備份／transaction 驗證，再恢復自動 migration。
- GUI 僅用 `agrilink_app`；migration 與 schema 管理仍使用 migrator role。不要將 VM 憑證複製到 repo、截圖或聊天室。

---

## 202609191609 GMT+8 — 修正 migration runner 的版本比對

### 發現／問題

- VM ledger 同時有 `001_foundation`（無副檔名）與 `004_identity_admin.sql`（含副檔名）；舊版 `migrate.js` 以完整檔名比對，會把 001–003 當成未套用而重跑。

### 要解決什麼

- 讓 `npm run db:migrate` 可以安全地在共用 VM 上套用 `005_forum.sql`。

### 做了什麼改動

- `backend/db/migrate.js` 以去掉 `.sql` 的 version 比對 ledger，新紀錄一律寫入不含副檔名的 version；抽出 `runMigrations()` 供測試使用。
- 新增 `backend/tests/migrate.test.js`（PGlite），重現 VM 的混合格式 ledger，確認只會套用 005 且重跑不重複。全部 100 項測試通過。

### 組員注意事項

- 既有 ledger 不需要改；新舊兩種格式都會被視為已套用。
- VM 仍須以 migrator role 執行 `npm run db:migrate` 套用 005，執行前先備份資料庫。

---

## 202609191656 GMT+8 — 修正 Local Market「Send offer 沒反應」

### 發現／問題

- 實機（itel）對別人的 listing 按 Send offer 後看似沒反應。nginx log 顯示第一次 POST 已成功（201），之後對同一 listing 重送 7 次皆為 409 `CONFLICT`（每人對同一標的只能有一筆進行中 offer）。
- 詳情頁不知道使用者已出價，仍顯示「Make offer」；表單的錯誤訊息畫在「Send offer」下方，且焦點跳回最後編輯的欄位，240×320 下錯誤文字在畫面外。

### 做了什麼改動

- 後端 `marketService.detail`：非擁有者會拿到 `myOfferId`（進行中 offer 的 id，沒有則為 null）；測試補上。
- 前端：詳情頁有 `myOfferId` 時改顯示「View my offer」並開啟該 offer。
- `MarketForm`：錯誤訊息改放在送出列正上方；非欄位錯誤時焦點停在送出列，確保訊息在畫面上。
- 本機 dev server 240×320 實測：出價成功 → 返回詳情顯示 View my offer；賣方下架後送出，畫面顯示「Not found. It may have been removed.」。

### 組員注意事項

- 所有使用 `MarketForm` 的表單（出價、還價、刊登、排定取貨）都套用新的錯誤顯示位置。

---

## 202609191708 GMT+8 — Local Market：把「我發出的 offer」放到首頁

### 發現／問題

- 實機發出 offer 後進 My Offers 看不到。該頁固定開啟 incoming（別人給我、等我回覆的），自己發出的要按左軟鍵「Sent」才看得到；nginx log 顯示手機從未請求 `role=outgoing`。
- My Deals 空白屬正常：offer 需被對方接受並雙方確認才會成立 deal；seed 示範帳號不會自動回覆。

### 做了什麼改動

- Local Market 首頁改為 `5 Offers to Answer`（保留 n new 徽章）、`6 Offers I Sent`、`7 My Deals`。
- 空清單提示改為說明原因（沒有待回覆／尚未發出 offer／offer 被接受後才會出現 deal）。
- 本機 240×320 實測三個入口。

### 組員注意事項

- My Deals 的數字快捷鍵由 6 改為 7。
