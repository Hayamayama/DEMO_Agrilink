# CloudMosa × 梅竹黑客松：已取得材料與開發備忘

建立時間：2026-09-17（距活動兩天）

## 已保存的公開材料

| 材料 | 本機位置 | 取得狀態 |
| --- | --- | --- |
| 官方範例原始碼 | `cloudphone-demo/` | 已以 Git 完整下載（`a9ac9ee`） |
| 公開展示站首頁快照 | `cloudphone-materials/demo-site.html` | 已保存 HTML；其 CSS／JS 仍引用公開站，連網版見下方連結 |
| 技術文件 | https://developer.cloudphone.tech/ | 目前站方回傳 HTTP 503，尚無法下載 |
| Dev Program / Simulator | https://www.cloudphone.tech/auth/sign-in | 需以 email 登入；匿名頁面沒有可下載內容 |

公開展示站：https://cloudmosa.github.io/cloudphone-2025meichuhackathon-demo/

支援聯絡信箱：`cloudphone+meichu@cloudmosa.com`

## 簡報中明示的交付限制

- 以現代 Web 應用開發標準實作 Widget。
- 目標解析度為 **240 × 320**；**128 × 160** 是加分支援。
- 必須能用 Keypad：四方向鍵、Enter、左右功能鍵，以及 `0–9`、`*`、`#`。
- 比賽期間會提供 itel NEO R60+ 作為開發測試裝置。
- 另會提供可部署 Web App 的乾淨 Ubuntu 24.04 主機（SSH 帳號／key 與 root）。

> 注意：範例專案 README 中把低解析度版本標為 QQVGA `160 × 120`，但說明會投影片寫的是加分 `128 × 160`。實作時應以簡報的 `128 × 160` 為優先，並向主辦確認實機方向與 viewport 行為。

## 範例專案快速導覽

這是一個 Next.js 15 + React 19 + Tailwind CSS 4 的靜態匯出專案。`next.config.ts` 已設為 `output: 'export'`，建置後輸出在 `out/`，並預先配置 GitHub Pages 的 base path。

主要檔案：

- `app/page.tsx`：示範畫面。
- `app/components/KeyboardHandler.tsx`：全域鍵盤事件；目前映射 `Escape`→左功能鍵、`F12`→右功能鍵、`Enter`→確認、方向鍵→導航。
- `app/components/Navigation.tsx`：底部左右功能鍵與 Enter 的視覺回饋。
- `app/components/Keypad.tsx`：方向鍵視覺回饋。
- `app/components/NavigationContext.tsx`：按鍵高亮狀態。
- `app/globals.css`：已有小於 320px 與 240px 的字級調整，但尚未涵蓋投影片要求的 `128 × 160` 規則。

## 建議的第一輪改造順序

1. 先在 `240 × 320` 固定 viewport 完成單一、清楚的核心流程；保留底部左右功能鍵提示。
2. 把資料輸入完全納入 keypad：數字、`*`、`#`，並確保焦點、返回、確認都有可見回饋。
3. 加入 `128 × 160` 的 layout／字級／捲動測試，避免只靠 browser 的縮放。
4. 在主辦提供的 itel 實機測試實際 key code、可視區高度、字型與 network 行為；必要時修正範例中的 `Escape`／`F12` 桌面模擬對應。
5. 採靜態匯出或 Ubuntu 主機上的簡單部署流程；避免在比賽最後才處理 base path、asset path 或 HTTPS。

## 尚待取得

- 登入 Dev Program 後的 Simulator 使用方式、App/Widget 打包與上傳規格。
- `developer.cloudphone.tech` 恢復後的 API、manifest、生命週期、鍵盤事件與部署文件。
- itel NEO R60+ 的實際鍵碼與瀏覽器能力；這是高風險假設，應在開賽第一時間驗證。
