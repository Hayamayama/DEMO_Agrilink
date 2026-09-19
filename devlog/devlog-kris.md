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
