# AgriLink — Cloud Phone Widget 完整開發規格書 (proposal.md)

> **一句話定位**：功能機上第一個「農民彼此連起來」的即時社群市集 —— 用 CloudMosa 的雲端運算，把數十億孤立的功能機用戶，串成一個去中間商的交易＋互助網路。
>
> **Team**: dogbark-MeiChu · **Track**: CloudMosa (雲端運算 / 網頁開發 / 數位平權) · **Repo**: https://github.com/dogbark-MeiChu/2026meichu

---

## 目錄

1. [產品定位與評審敘事](#1-產品定位與評審敘事)
2. [市場與痛點分析](#2-市場與痛點分析)
3. [產品總覽與資訊架構](#3-產品總覽與資訊架構)
4. [技術規格與限制](#4-技術規格與限制)
5. [系統架構](#5-系統架構)
6. [Keypad 導航框架 (核心)](#6-keypad-導航框架-核心)
7. [畫面規格 (逐頁 spec)](#7-畫面規格-逐頁-spec)
8. [資料模型 (Data Models)](#8-資料模型-data-models)
9. [API 規格](#9-api-規格)
10. [即時通訊 (WebSocket)](#10-即時通訊-websocket)
11. [AI / LLM 整合規格](#11-ai--llm-整合規格)
12. [自製 T9 輸入引擎](#12-自製-t9-輸入引擎)
13. [多語言 (i18n)](#13-多語言-i18n)
14. [雙解析度適配](#14-雙解析度適配)
15. [開發優先級與時程](#15-開發優先級與時程)
16. [Demo 腳本 (得分關鍵)](#16-demo-腳本-得分關鍵)
17. [部署與上架流程](#17-部署與上架流程)
18. [驗收標準 (Definition of Done)](#18-驗收標準-definition-of-done)
19. [評分維度對照表](#19-評分維度對照表)
20. [風險登記表](#20-風險登記表)
21. [附錄 A：AgriGames 連線遊戲 (P3 留存模組)](#附錄-aagrigames-連線遊戲-p3-留存模組)

---

## 1. 產品定位與評審敘事

### 核心洞察

CloudMosa 的 Cloud Phone 首頁已經有 Gemini、ChatGPT、YouTube、新聞、天氣、Facebook —— **所有現有 app 都是「一個人、單向、消費內容」**。沒有任何一個 widget 讓功能機用戶**彼此即時連動**。

AgriLink 打開的是一個全新的 app category：**Cloud Phone 上第一個多用戶協作應用**。這件事只有在「完整運算都在雲端」時才成立 —— 16MB RAM 的本地功能機，永遠跑不了即時多用戶狀態同步。

### 給評審的一句話

> 「我們沒有再做一個 AI 聊天機器人。我們用 CloudMosa 的雲端能力，做了首頁上不存在的東西 —— 讓兩支 $15 的功能機，透過同一台雲端伺服器，即時交易、互助、連線。」

### 為什麼四個維度都吃分（詳見 §19）

- **實作難度**：即時多用戶市集、WebSocket、AI 個人化上下文、自製 T9、積分系統、雙解析度。
- **創意性**：反直覺 —— 沒人想到在功能機上做即時社群市集。
- **可行性**：重運算本來就在雲端，前端只是 HTML/CSS/JS，一個週末可完成 P0+P1。
- **題目契合度**：直擊 CloudMosa 前三大市場 (IN/VN/BD) 最大用戶群的痛點，對電信商 = data usage↑ / ARPU↑ / churn↓。

---

## 2. 市場與痛點分析

### 目標用戶（對齊 CloudMosa 官方 top countries）

| 角色 | 說明 | 在 app 中的行為 |
|---|---|---|
| 小農 (primary) | 印度、越南、孟加拉功能機用戶 | 查行情、發布賣貨、發問、互助 |
| 商販 / 中盤 | 想直接找貨源 | 瀏覽賣貨、聯繫農民 |
| 加工廠 / 餐廳 | 穩定採購 | 篩選區域與作物 |

### 真實痛點（不是「查不到資訊」，是「資訊不對稱造成經濟損失」）

1. **中間商壓價**：農民不知道市場真實價格，被剝一層利潤。
2. **地區價差資訊落差**：隔壁市場多賣 20%，但沒人告訴他，且不知扣掉運費後是否划算。
3. **孤立無援**：病蟲害、天氣、種植問題，只能問鄰居，缺乏知識沉澱。
4. **政府補助漏接**：截止後才聽說。

> **關鍵差異化**：這些痛點 Gemini「查得到通用答案」，但解決不了 —— 因為它們需要**用戶之間的即時連結**與**個人化上下文（你在哪、種什麼）**。這正是通用 AI app 做不到、AgriLink 才成立的地方。

---

## 3. 產品總覽與資訊架構

### 主選單

```
┌────────────────────────┐
│ AGRILINK          ● 3  │   ← 標題列 + 通知數
├────────────────────────┤
│ 1  Market Prices       │
│ 2  Sell / Buy          │
│ 3  Farmer Circle       │
│ 4  Ask AI              │
│ 5  Daily Tasks         │
├────────────────────────┤
│ Menu    Select    More │   ← soft key 列
└────────────────────────┘
```

### 畫面樹 (Screen Tree)

```
SplashScreen
└── MainMenu
    ├── MarketPrices
    │   ├── PriceDetail (含 AI 分析 + 淨利計算)
    │   └── SetPriceAlert
    ├── Marketplace
    │   ├── ListingFeed (即時)
    │   ├── ListingDetail → ContactSeller
    │   └── CreateListing (預設選單，免打字)
    ├── FarmerCircle (論壇)
    │   ├── CategoryList
    │   ├── PostList (依區域)
    │   ├── PostDetail → ReplyList
    │   └── CreatePost (含 T9 輸入)
    ├── AskAI
    │   ├── PresetQuestions
    │   ├── FreeInput (T9)
    │   └── AIAnswer
    ├── DailyTasks
    │   └── RedeemPoints
    ├── Notifications
    └── Settings (語言 / 個人資料 / 作物)
```

---

## 4. 技術規格與限制

### 官方硬性規範（必須全部符合）

| 項目 | 規格 | 備註 |
|---|---|---|
| 開發標準 | 現代網頁應用 (HTML5 / CSS3 / JS) | — |
| 主解析度 | **240×320 (QVGA)** | 必做 |
| 加分解析度 | **128×160** | 必做（P1，加分項） |
| 輸入 | 四方向鍵、Enter、左右功能鍵 (soft keys)、0-9、`*`、`#` | 全靠 KeyboardEvent |
| 部署 | 公開 HTTPS URL | 非 GitHub repo 網址 |
| 測試機 | itel NEO R60+ | 比賽期間提供 |
| Server | Ubuntu 24.04, root, SSH | 比賽提供 |
| 右軟鍵 (RSK) | 官方語意：有 history 就「返回」，否則「關閉頁面」 | router 需與 `history` 同步（見 §6.4） |
| 左軟鍵 (LSK) | 官方語意：menu / options / settings | 本 app 用作回主選單 |

### 自訂技術原則

1. **前端零重依賴**：Vanilla JS + ES modules，無 build step（降低出錯面，加快 demo 迭代）。可用極小型 utility，禁用大型框架。
2. **所有互動 100% 可用 keypad 完成**：不得有任何需要滑鼠/觸控才能觸發的功能。
3. **Server-authoritative**：所有狀態（市集、論壇、積分、遊戲）以伺服器為準，前端只渲染。
4. **AI 輸出必經 JSON schema 驗證**：LLM 不得直接吐 HTML 到畫面（避免 UI 破版、focus 壞掉、prompt injection）。
5. **Graceful degradation**：網路 / AI / WS 失敗都要有 fallback 畫面，demo 絕不白屏。

---

## 5. 系統架構

```
┌─────────────┐      WebSocket / HTTPS      ┌──────────────────────┐
│  Cloud Phone │  ◄─────────────────────►   │  Ubuntu 24.04 Server │
│  (Chromium)  │                            │                      │
│              │   keydown → action         │  ┌────────────────┐  │
│  AgriLink    │   ───────────────►         │  │ Node.js        │  │
│  Frontend    │                            │  │ Express + ws   │  │
│  (HTML/JS)   │   ◄─── state/render        │  ├────────────────┤  │
└─────────────┘                            │  │ SQLite         │  │
                                            │  │ (better-sqlite3)│ │
      (itel NEO R60+                        │  ├────────────────┤  │
       240×320 / 128×160)                   │  │ AI Adapter     │──┼──► LLM API
                                            │  │ (Gemini/OpenAI) │  │   (Gemini/GPT)
                                            │  ├────────────────┤  │
                                            │  │ Price/Weather  │──┼──► External APIs
                                            │  │ Adapter        │  │   (or mock data)
                                            │  └────────────────┘  │
                                            │  nginx + Let's Encrypt│
                                            └──────────────────────┘
```

### 技術棧

| 層 | 技術 | 理由 |
|---|---|---|
| Frontend | Vanilla JS (ES modules) + CSS | 輕量、無 build、快速迭代 |
| Backend | Node.js 20 + Express | 團隊熟悉、生態成熟 |
| Realtime | `ws` (WebSocket) + long-polling fallback | 市集/論壇/遊戲即時同步 |
| DB | SQLite via `better-sqlite3` | 檔案型、零設定、demo 與小規模生產皆可 |
| AI | Adapter pattern，預設 Gemini API（免費額度） | provider 可切換 |
| Proxy/TLS | nginx + certbot (Let's Encrypt) | 提供公開 HTTPS URL |
| Process | pm2 | 自動重啟、log 管理 |

### 目錄結構

```
2026meichu/
├── frontend/
│   ├── index.html
│   ├── css/
│   │   ├── base.css          # 變數、reset、字型
│   │   ├── layout.css        # 三段式版面 (status/content/softkey)
│   │   └── responsive.css    # 240×320 / 128×160
│   ├── js/
│   │   ├── main.js           # 進入點、啟動
│   │   ├── router.js         # 畫面堆疊 (screen stack)
│   │   ├── keypad.js         # keydown → action 分發 (§6)
│   │   ├── focus.js          # 焦點管理 (§6)
│   │   ├── t9.js             # 自製 T9 引擎 (§12)
│   │   ├── api.js            # REST 封裝
│   │   ├── ws.js             # WebSocket 封裝
│   │   ├── i18n.js           # 多語言 (§13)
│   │   ├── state.js          # 前端狀態
│   │   └── screens/          # 每個畫面一個模組
│   │       ├── mainMenu.js
│   │       ├── marketPrices.js
│   │       ├── marketplace.js
│   │       ├── farmerCircle.js
│   │       ├── askAI.js
│   │       ├── dailyTasks.js
│   │       └── notifications.js
│   └── assets/
│       └── icon-80.png       # widget icon (80×80 PNG, <1MB)
├── backend/
│   ├── server.js             # Express + ws 啟動
│   ├── db.js                 # SQLite schema + 初始化
│   ├── seed.js               # demo 假資料
│   ├── routes/
│   │   ├── auth.js
│   │   ├── prices.js
│   │   ├── listings.js
│   │   ├── forum.js
│   │   ├── ai.js
│   │   └── tasks.js
│   ├── services/
│   │   ├── aiAdapter.js      # LLM 呼叫 + schema 驗證 (§11)
│   │   ├── priceService.js
│   │   └── matchService.js
│   └── ws/
│       └── hub.js            # WS 房間 / 廣播
├── locales/
│   ├── en.json
│   ├── hi.json
│   └── bn.json
├── deploy/
│   ├── nginx.conf
│   └── setup.sh
├── proposal.md               # 本文件
└── README.md
```

---

## 6. Keypad 導航框架 (核心)

> 這是整個 app 的地基。所有畫面都建立在這套抽象上。**先做完這一層再做任何畫面。**

### 6.1 按鍵對照 (Keymap)

集中管理於 `keypad.js`，因為不同裝置/模擬器的 `KeyboardEvent.key` 值可能不同，**上機第一件事就是用模擬器 console 印出實際 key 值校正此表**。

```js
// keypad.js — 需在 simulator 上確認實際值後修正
export const KEYMAP = {
  // D-pad
  'ArrowUp':    'UP',
  'ArrowDown':  'DOWN',
  'ArrowLeft':  'LEFT',
  'ArrowRight': 'RIGHT',
  // 確認
  'Enter':      'ENTER',
  // Soft keys (KaiOS 類裝置常見值，需上機確認)
  'SoftLeft':   'SOFT_L',
  'SoftRight':  'SOFT_R',
  // 數字 / 符號
  '0':'NUM_0','1':'NUM_1','2':'NUM_2','3':'NUM_3','4':'NUM_4',
  '5':'NUM_5','6':'NUM_6','7':'NUM_7','8':'NUM_8','9':'NUM_9',
  '*':'STAR','#':'HASH',
  // Back（部分裝置有獨立 Backspace / 返回鍵）
  'Backspace':  'BACK',
};
```

### 6.2 焦點模型 (Focus Model)

每個畫面宣告一組 **focusable items**（DOM 節點）。導航規則：

- `UP` / `DOWN`：在 focusable list 中上下移動焦點（到頭尾時可循環或停住，統一設為**停住**避免混淆）。
- `LEFT` / `RIGHT`：預設無作用；在水平元件（如分頁、數值調整器）中由畫面自行覆寫。
- `ENTER`：觸發目前焦點項目的 `onSelect`。
- `NUM_1..NUM_9`：若畫面有編號選單，直接跳選對應項（快捷鍵）。
- `SOFT_L`：左功能鍵，畫面自訂（通常 = "Menu" 回主選單）。
- `SOFT_R`：右功能鍵，畫面自訂（通常 = "Back" 或 "More/通知"）。
- `BACK` / `SOFT_R(Back)`：pop 畫面堆疊。

### 6.3 標準介面 (每個 Screen 必須實作)

```js
// screens/*.js 統一介面
export default {
  name: 'MarketPrices',
  render(ctx) { /* 回傳 DOM，掛好 focusable 標記 */ },
  onKey(action, ctx) { /* 可選：覆寫預設行為，回傳 true 表示已處理 */ },
  onEnter(item, ctx) { /* 焦點項目被 Enter */ },
  softLeft: { label: 'Menu', handler(ctx){ ctx.router.reset('MainMenu'); } },
  softRight:{ label: 'Back', handler(ctx){ ctx.router.pop(); } },
  onShow(ctx) {},   // 進入畫面 (可訂閱 WS)
  onHide(ctx) {},   // 離開畫面 (取消訂閱)
};
```

### 6.4 Router（畫面堆疊）

```js
// router.js
router.push(name, params)   // 疊上新畫面
router.pop()                // 返回上一層（實作為 history.back()，使 RSK 在根畫面時由平台關閉頁面）
router.reset(name)          // 清空堆疊，回到指定畫面 (主選單用)
router.replace(name, params)
```

### 6.5 焦點視覺規範

- 焦點項目：反白（背景色 = `--focus-bg`，文字 = `--focus-fg`），**必須**有明顯對比（小螢幕上尤其重要）。
- 每個列表項目高度固定，一頁最多顯示 N 項（240×320 約 4–5 項，128×160 約 3 項），超過自動捲動使焦點項目保持可見。
- Soft key 列永遠固定在底部，顯示當前 L / center(Enter 動作) / R 三個標籤。

### 6.6 驗收（Definition of Done）

- [ ] 主選單可用方向鍵上下移動、Enter 進入、數字鍵快捷跳選。
- [ ] 任一深層畫面可用 soft key 一鍵回主選單。
- [ ] 焦點永遠可見、對比明顯、不會跑出畫面。
- [ ] console 已印出並校正過所有實際 key 值。

---

## 7. 畫面規格 (逐頁 spec)

> 每頁包含：線框圖、focusable 項目、按鍵行為、狀態（loading / empty / error）、資料來源。

### 7.1 SplashScreen

- 顯示 AgriLink logo + tagline 1.5 秒，或按任意鍵跳過。
- 背景載入：呼叫 `POST /api/auth/session`（用 dev token / IMEI 識別），取回 user profile。
- 失敗 → 進 guest mode（可瀏覽，發文/賣貨時提示需身分）。

---

### 7.2 MarketPrices（市場行情）

**這不是「顯示今天米價」（Google 就會）—— 是決策工具。**

```
┌────────────────────────┐
│ MARKET PRICES          │
├────────────────────────┤
│ Crop: Rice        [<>] │  ← LEFT/RIGHT 切換作物
├────────────────────────┤
│ Your area   ₹2,140/qt  │
│ Market B    ₹2,280/qt ▲│  ← focusable
│ Market C    ₹2,190/qt ▲│
├────────────────────────┤
│ AI: Price trending up. │
│ Consider waiting 2 days│
├────────────────────────┤
│ Menu   Detail    Alert │
└────────────────────────┘
```

- **Focusable**：作物切換器、各市場列、`Set Alert`。
- **LEFT/RIGHT**（焦點在切換器時）：切換作物，重新拉價格。
- **ENTER**（焦點在市場列）→ `PriceDetail`。
- **SOFT_R = Alert** → `SetPriceAlert`。
- **AI 分析**：呼叫 `GET /api/prices/analysis`，回傳 `sell_now|wait|hold` + 一句理由（≤80 字）。
- 狀態：loading（骨架文字）、error（顯示快取價格 + "Live data unavailable"）。
- 資料來源：真實 API 若可用；否則 `seed.js` 內建各作物 × 各市場的擬真資料 + 日內波動模擬。

**PriceDetail**：顯示選定市場的 7 日趨勢（用文字條 `▁▂▃▅▇` 或簡易 SVG）、**淨利計算器**：

```
NET PROFIT CALCULATOR
Sell at Market B:  ₹2,280/qt
Your area price:   ₹2,140/qt
Transport (~15km): -₹42/qt
──────────────────────────
Net gain:          +₹98/qt
For 5 qt:          +₹490
```

> 這個「扣掉運費後淨賺多少」是通用 app 做不到的 —— 需要用戶的位置與作物上下文。**Demo 必講這頁。**

---

### 7.3 Marketplace（賣貨 / 買貨 — 即時 P2P 市集）

**去中間商的資訊撮合，不是電商。**

#### ListingFeed（即時列表）

```
┌────────────────────────┐
│ LISTINGS NEAR YOU   ●  │  ← ● = 有新貨即時進來
├────────────────────────┤
│ 1 Rice  5qt ₹2,200     │
│   Rampur · 2h ago      │
│ 2 Wheat 3qt ₹1,850     │
│   Dhanpur · 5h ago     │
│ 3 Onion 10qt ₹1,500    │
│   Keshav · 1d ago      │
├────────────────────────┤
│ Menu  Contact   +Post  │
└────────────────────────┘
```

- **即時**：訂閱 WS `listing:new`（同區域），新貨從頂端滑入 + 通知點閃動。**這是 demo 的即時性證明。**
- **Focusable**：每則 listing。
- **ENTER** → `ListingDetail`。
- **SOFT_R = +Post** → `CreateListing`。
- 篩選：`*` 開啟篩選（作物 / 區域），`#` 清除篩選。
- Empty state：「No listings yet. Be the first to post!」

#### CreateListing（免打字，全預設選單）

```
POST A LISTING
Crop:    [ Rice      ] ← ENTER 開下拉，方向鍵選
Amount:  [ 5 ] [qt]    ← LEFT/RIGHT 加減數量
Price:   [ ₹2,200/qt ] ← 數字鍵直接輸入，或 ±
Village: [ Rampur    ] ← 預設用 profile，可改

[Enter] Post   [Back] Cancel
```

- 送出 → `POST /api/listings` → 伺服器廣播 `listing:new` 給同區域用戶。
- 完成任務「Post a listing」（+積分，見 §7.6）。

#### ListingDetail → ContactSeller

- 顯示完整資訊 + 賣家村莊 + 發布時間。
- **ENTER = "I'm interested"** → `POST /api/listings/:id/interest` → 賣家收到 WS 通知 `listing:matched`。
- 不做真實金流。只做「表達興趣 + 配對通知」，把撮合完成，交易在線下進行。

---

### 7.4 FarmerCircle（農友圈 — 極簡論壇）

**用戶生成內容 = 信任感 + 黏著度。農民教農民，比 AI 更被信任。**

#### CategoryList

```
FARMER CIRCLE
1 🐛 Pest & Disease   (24)
2 🌱 Growing Tips     (18)
3 💰 Market News      (11)
4 ☔ Weather Talk     (7)
[Enter] Open  [Menu]
```

#### PostList（依區域排序，可切「My area / All」）

```
[PEST] Bore worm in rice
  12 replies · ★45 · 3h
[TIPS] Best time to sow
  wheat in Nov?
  8 replies · ★23 · 1d
[1] Read [2] New [★] Like
```

- **Focusable**：每則貼文。
- **ENTER** → `PostDetail`。
- **NUM_2 / SOFT_R = New** → `CreatePost`（用 T9，§12）。

#### PostDetail → ReplyList

- 顯示貼文全文（≤160 字，功能機螢幕的自然限制）+ 回覆列表。
- **`*` = Like**（+1，樂觀更新，失敗回滾）。
- **`#` / SOFT_R = Reply** → T9 輸入回覆。
- 即時：訂閱 WS `forum:reply`，新回覆即時出現。

#### CreatePost

- 選分類（方向鍵）→ 標題（T9）→ 內文（T9，≤160 字，即時顯示剩餘字數）→ `#` 送出。
- 送出 → `POST /api/forum` → 廣播給同區域。完成任務「Reply/Post in circle」。

---

### 7.5 AskAI（有上下文的 AI —— 跟首頁 Gemini 的關鍵差異）

> **差異化**：首頁 Gemini 不知道你是誰。AgriLink AI 知道你的**位置、作物、歷史提問**，回答是個人化的。

```
ASK AGRILINK AI
1 Choose a question
2 Type with T9
3 Recent questions
[Enter] Select  [Menu]
```

#### PresetQuestions（保證 demo 成功）

```
1 When should I sell?
2 Will it rain today?
3 Why are my leaves yellow?
4 Find government aid
```

- 選一題 → 帶入 user context 呼叫 `POST /api/ai/ask` → `AIAnswer`。

#### FreeInput（T9 自由輸入，技術加分）

- 用 §12 自製 multi-tap T9 打字，`#` 送出。

#### AIAnswer

```
Q: Why are leaves yellow?

Likely: Nitrogen deficiency
or early blight.

DO:
• Check soil moisture
• Apply urea if dry-yellow
• Photo a leaf for Circle

Severity: MEDIUM
[Back] Ask again
```

- 內容來自 `POST /api/ai/ask`，**經 JSON schema 驗證**後由固定元件渲染（§11）。
- Fallback：AI 逾時/失敗 → 顯示預存的通用建議 + 「Ask the Farmer Circle instead」導流到論壇。

---

### 7.6 DailyTasks（黏著度引擎 —— 你要的留存機制）

> **不是靠遊戲好玩留住人，是靠對用戶有實際經濟利益的行為獎勵。** 這是 LinkedIn 式留存邏輯，直接拉 daily active 與 data usage。

```
DAILY TASKS        2/3 done
✓ Check today's price   +10
✓ Reply in Circle       +15
○ Post a listing        +20
──────────────────────────
Streak: 5 days 🔥
Points: 230
[1] Redeem points [Menu]
```

- 任務完成由**伺服器驗證**（不是前端說了算）：例如 `Check price` 需真的呼叫過該區作物的 analysis API。
- **RedeemPoints**：積分兌換有實際價值的東西 ——
  - 「Boost my listing (置頂賣貨 24h)」= 200 pts
  - 「Deep AI market report」= 150 pts
- Streak：連續登入天數，斷了歸零；里程碑（7/30 天）給 bonus。

> 商業敘事：streak + 每日任務 = 每天開 app = 每天用 data = 電信商 ARPU↑ churn↓（對齊 CloudMosa 的 Viettel case：+40% ARPU / -30% churn）。

---

### 7.7 Notifications

- 匯集：新配對 (listing matched)、論壇回覆、價格警報、任務提醒。
- WS 即時推入；離線期間的存 DB，上線補推。
- **SOFT_R** 從任何畫面可快速進入（右功能鍵長駐 "More/通知"）。

---

### 7.8 Settings

- 語言（en / hi / bn）→ 切換即時重繪 i18n。
- 我的作物（多選，影響行情與 AI 上下文）。
- 我的村莊 / 區域（影響市集與論壇範圍）。

---

## 8. 資料模型 (Data Models)

SQLite schema（`backend/db.js`）：

```sql
CREATE TABLE users (
  id           TEXT PRIMARY KEY,      -- uuid
  imei         TEXT,                  -- 白名單測試機識別（可空）
  name         TEXT,
  village      TEXT,
  region_code  TEXT,                  -- e.g. "IN-UP-01"
  lat          REAL,
  lng          REAL,
  crops        TEXT,                  -- JSON array: ["rice","wheat"]
  language     TEXT DEFAULT 'en',     -- en|hi|bn
  points       INTEGER DEFAULT 0,
  streak_count INTEGER DEFAULT 0,
  last_active  TEXT,                  -- ISO date
  created_at   TEXT
);

CREATE TABLE listings (
  id           TEXT PRIMARY KEY,
  seller_id    TEXT REFERENCES users(id),
  crop         TEXT,
  quantity     REAL,
  unit         TEXT DEFAULT 'qt',
  price        REAL,
  price_unit   TEXT DEFAULT 'INR/qt',
  village      TEXT,
  region_code  TEXT,
  status       TEXT DEFAULT 'active', -- active|matched|closed
  boosted_until TEXT,                 -- 置頂到期
  created_at   TEXT,
  expires_at   TEXT
);

CREATE TABLE interests (
  id          TEXT PRIMARY KEY,
  listing_id  TEXT REFERENCES listings(id),
  buyer_id    TEXT REFERENCES users(id),
  status      TEXT DEFAULT 'pending', -- pending|accepted|declined
  created_at  TEXT
);

CREATE TABLE forum_posts (
  id          TEXT PRIMARY KEY,
  author_id   TEXT REFERENCES users(id),
  category    TEXT,                   -- pest|tips|market|weather
  title       TEXT,
  body        TEXT,                   -- <=160 chars
  region_code TEXT,
  likes       INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  created_at  TEXT
);

CREATE TABLE forum_replies (
  id         TEXT PRIMARY KEY,
  post_id    TEXT REFERENCES forum_posts(id),
  author_id  TEXT REFERENCES users(id),
  body       TEXT,
  created_at TEXT
);

CREATE TABLE market_prices (
  id          TEXT PRIMARY KEY,
  crop        TEXT,
  market_id   TEXT,
  market_name TEXT,
  region_code TEXT,
  price       REAL,
  unit        TEXT,
  date        TEXT,
  source      TEXT
);

CREATE TABLE tasks (               -- 任務定義（靜態）
  id      TEXT PRIMARY KEY,
  label   TEXT,
  points  INTEGER,
  verify  TEXT                     -- verify rule key
);

CREATE TABLE task_completions (
  user_id  TEXT REFERENCES users(id),
  task_id  TEXT REFERENCES tasks(id),
  date     TEXT,                   -- 每天一次
  PRIMARY KEY (user_id, task_id, date)
);

CREATE TABLE points_ledger (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id),
  delta      INTEGER,
  reason     TEXT,
  created_at TEXT
);

CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id),
  type       TEXT,                 -- match|reply|price_alert|task
  payload    TEXT,                 -- JSON
  read       INTEGER DEFAULT 0,
  created_at TEXT
);

CREATE TABLE ai_logs (            -- 供 demo 展示與除錯
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  raw_input  TEXT,
  intent     TEXT,
  response   TEXT,                 -- validated JSON
  created_at TEXT
);
```

---

## 9. API 規格

Base URL：`https://<your-domain>/api`
所有回應 JSON；錯誤統一格式 `{ "error": { "code": "...", "message": "..." } }`。

### 認證

| Method | Path | 說明 |
|---|---|---|
| POST | `/auth/session` | body `{ imei?, devToken? }` → `{ user }`。demo 用簡化識別 |
| GET | `/me` | 目前使用者 |
| PATCH | `/me` | 更新 name / crops / village / language |

### 行情

| Method | Path | 說明 |
|---|---|---|
| GET | `/prices?crop=&region=` | 各市場價格陣列 |
| GET | `/prices/analysis?crop=&region=` | AI 決策：`{ recommendation, reason, trend, confidence }` |
| GET | `/prices/net-profit?crop=&from=&to=&qty=` | 淨利計算 |
| POST | `/prices/alert` | body `{ crop, target, direction }` |

### 天氣

| Method | Path | 說明 |
|---|---|---|
| GET | `/weather?lat=&lng=` | Open-Meteo 後端代理（30 分鐘快取，上游失敗回傳最後成功值 `stale:true`）→ `{ current, daily[3], advice, attribution }`。建議 (`advice`) 由規則依真實數據產生，非 LLM 猜測 |

### 市集

| Method | Path | 說明 |
|---|---|---|
| GET | `/listings?crop=&region=&limit=&cursor=` | 分頁列表（依 boosted → created_at） |
| POST | `/listings` | 建立，觸發 WS `listing:new` |
| GET | `/listings/:id` | 詳情 |
| POST | `/listings/:id/interest` | 表達興趣，觸發 WS `listing:matched` 給賣家 |
| POST | `/listings/:id/boost` | 扣積分置頂 |

### 論壇

| Method | Path | 說明 |
|---|---|---|
| GET | `/forum?category=&region=&scope=my_area\|all` | 貼文列表 |
| GET | `/forum/:id` | 貼文 + 回覆 |
| POST | `/forum` | 發文 |
| POST | `/forum/:id/reply` | 回覆，觸發 WS `forum:reply` |
| POST | `/forum/:id/like` | 按讚 |

### AI

| Method | Path | 說明 |
|---|---|---|
| POST | `/ai/ask` | body `{ presetId? , text? }` → 分類 → 回答 → **schema 驗證** → `{ intent, answer }`（§11） |

### 任務 / 積分

| Method | Path | 說明 |
|---|---|---|
| GET | `/tasks/today` | 今日任務 + 完成狀態 + streak + points |
| POST | `/tasks/:id/complete` | 伺服器驗證後給分 |
| POST | `/points/redeem` | body `{ item }` |

### i18n / 通知

| Method | Path | 說明 |
|---|---|---|
| GET | `/i18n/:lang` | 該語言字串包（前端啟動時抓） |
| GET | `/notifications` | 未讀 + 已讀 |
| POST | `/notifications/:id/read` | 標記已讀 |

---

## 10. 即時通訊 (WebSocket)

### 連線

`wss://<your-domain>/ws?token=<session>` —— 連上後伺服器把該用戶加入其 `region_code` 房間與個人房間。

### Fallback

WS 連不上 → 自動降級為每 5 秒 `GET /api/sync?since=<ts>` long-polling。前端對兩者用同一套事件 handler，畫面無感知差異。**demo 網路不穩時的保命設計。**

### 事件（server → client）

```jsonc
// 同區域有新賣貨
{ "type": "listing:new", "data": { /* listing */ } }

// 你的賣貨被表達興趣
{ "type": "listing:matched", "data": { "listingId": "...", "buyer": {...} } }

// 你追蹤的貼文有新回覆
{ "type": "forum:reply", "data": { "postId": "...", "reply": {...} } }

// 通用通知
{ "type": "notification", "data": { /* notification */ } }
```

### 事件（client → server）

```jsonc
{ "type": "subscribe", "channels": ["region:IN-UP-01", "post:123"] }
{ "type": "unsubscribe", "channels": ["post:123"] }
{ "type": "ping" }   // 每 30s 心跳
```

---

## 11. AI / LLM 整合規格

### 原則

1. LLM 出現在**四個地方**，不是只有一個聊天框：
   - **問題分類**：把自由輸入映射到 intent。
   - **行情決策**：sell/wait/hold + 理由。
   - **短答生成**：把長資料壓成適合 128×160 的三行。
   - **翻譯在地化**：結果轉 hi / bn / vi。
2. **LLM 絕不直接吐 HTML/文字上畫面**。一律要求輸出 JSON → schema 驗證 → 固定元件渲染。驗證失敗則 fallback。
3. **上下文注入**：每次呼叫帶入 `{ region, crops, recent_intents }`，這是與首頁通用 AI 的關鍵差異。

### Adapter 介面（`aiAdapter.js`）

```js
async function ask({ userContext, presetId, text, targetLang }) → validatedJSON
// provider 可切：gemini | openai，由 env AI_PROVIDER 決定
```

### JSON Schemas（回傳前一律驗證，建議用 ajv）

**問題分類**
```json
{
  "intent": "market_compare | crop_diagnosis | weather | gov_aid | general",
  "entities": { "crop": "string|null", "region": "string|null" }
}
```

**行情決策 (`/prices/analysis`)**
```json
{
  "recommendation": "sell_now | wait | hold",
  "trend": "up | down | flat",
  "confidence": 0.0,
  "reason": "string (<= 80 chars)"
}
```

**作物診斷 (`crop_diagnosis`)**
```json
{
  "intent": "crop_diagnosis",
  "likely_causes": ["string (<=40 chars)"],
  "actions": [{ "label": "string", "detail": "string (<=60 chars)" }],
  "severity": "low | medium | high",
  "disclaimer": "string"
}
```

### Prompt 範本（system）

```
You are AgriLink, an assistant for smallholder farmers using a feature phone
with a 240x320 screen. The user is in {region}, grows {crops}.
Rules:
- Respond ONLY with valid JSON matching the given schema. No markdown, no prose.
- Keep every string within its char limit (screen is tiny).
- Be practical and specific to {region} and {crops}.
- If unsure, set severity/confidence conservatively.
```

### 錯誤處理

- 逾時（>6s）、非法 JSON、schema 不符 → 記 log，回傳預存 fallback（該 intent 的通用建議）+ 前端導流論壇。
- Rate limit：每 user 每分鐘上限 N 次，超過用快取答案。

---

## 12. 自製 T9 輸入引擎

> 官方只保證方向鍵 / Enter / soft key / 標準 KeyboardEvent，**未保證各裝置原生 T9 IME 對 HTML input 行為一致** → 不能把 demo 壓在原生 T9 上。自製 multi-tap 更穩，且「自製 keypad text engine」直接計入實作難度。

### 鍵位

```
1 → . , ? !     2 → a b c     3 → d e f
4 → g h i       5 → j k l     6 → m n o
7 → p q r s     8 → t u v     9 → w x y z
0 → (space)     * → delete    # → send/confirm
```

### Multi-tap 規則

- 連按同鍵循環字母（`2`→a, `2 2`→b, `2 2 2`→c, 再按回 a）。
- 停頓 **700ms** 或按下**不同鍵** → 確認目前字母、游標前進。
- `0` = 空格；`*` = 刪除；`#` = 送出。
- 長按數字鍵（>500ms）= 直接輸入該數字本身（給價格等場景）。
- 即時顯示：目前字、剩餘字數（有上限的欄位如論壇 160 字）。

### 進階（P2 加分）：Predictive T9

- 使用者輸入按鍵序列（如 `7246`），對照英文字典輸出候選：`RAIN / PAIN / SAIN`，方向鍵選字。
- 先做 multi-tap，行有餘力再做 predictive。**Hindi/Bengali 第一版不做自製 T9**：改用「預設問題 + AI 回覆翻譯」路線。

### 模組介面

```js
const t9 = new T9Input({
  maxLength: 160,
  onChange: (text) => render(text),
  onCommit: (text) => submit(text),   // '#'
});
t9.handleKey(action);  // 由 keypad 分發進來
```

---

## 13. 多語言 (i18n)

- 字串外部化到 `locales/{en,hi,bn}.json`，前端啟動抓 `GET /api/i18n/:lang`。
- 所有 UI 文案、soft key 標籤、預設問題皆走 i18n key，禁止 hardcode。
- AI 回覆走「生成英文 → 翻譯目標語」或直接要求 LLM 以目標語輸出（仍受 schema 約束）。
- 字型：確認模擬器 / itel NEO R60+ 對 Devanagari (Hindi) / Bengali 字型支援；不支援時 demo 主打 en，hi/bn 作展示。
- **第一版驗收語言**：English 完整；Hindi 覆蓋主選單 + 預設問題 + AI 回覆。

---

## 14. 雙解析度適配

| 解析度 | 狀態 | 策略 |
|---|---|---|
| 240×320 (QVGA) | 必做 (主) | 基準設計 |
| 128×160 | 必做 (加分) | 128×160 恰為 240×320 的一半 |

### 做法

- 版面三段式：`status bar (top)` / `content (scroll)` / `softkey bar (bottom)`，皆用 flex，高度用比例而非固定 px。
- 用 JS 依 `window.innerWidth/Height` 設 CSS 變數 `--scale`，字級、間距、列高皆以變數推導。
- `responsive.css` 用 media query：`@media (max-width: 160px)` 時縮小字級、每頁顯示更少列、精簡次要資訊（如隱藏時間戳只留相對時間）。
- 所有互動元件在 128×160 下仍須焦點清楚、可捲動、soft key 可見。

### 驗收（用模擬器三組）

- [ ] 240×320 / India / English —— 基本驗收
- [ ] 240×320 / India / Hindi —— 在地化驗收
- [ ] 128×160 / India / English —— 加分驗收

---

## 15. 開發優先級與時程

假設週末約 30 小時（Fri 晚 → Sun 中午）。

### 優先級

| 優先級 | 功能 | 理由 |
|---|---|---|
| **P0** | Keypad 框架 + Router + 焦點系統 | 地基，先做 |
| **P0** | 主選單 | 一切入口 |
| **P0** | MarketPrices + AI 分析 + 淨利計算 | Demo 必講頁 |
| **P0** | AskAI（預設問題 + AI schema 驗證） | 核心 AI 展示 |
| **P0** | 部署出公開 HTTPS + 註冊 widget | 沒這個等於沒交件 |
| **P1** | Marketplace（含即時 WS listing:new） | 即時性 wow 證明 |
| **P1** | FarmerCircle（讀取 + 發文/回覆） | 社群差異化 |
| **P1** | DailyTasks + 積分 + streak | 留存敘事 |
| **P1** | 自製 multi-tap T9 (English) | 實作難度加分 |
| **P1** | 128×160 適配 | 官方加分項 |
| **P2** | Predictive T9 | 錦上添花 |
| **P2** | Hindi i18n 完整 | 在地化加分 |
| **P3** | AgriGames 連線遊戲（附錄 A） | 最後才碰，留存彩蛋 |
| ❌ | 真實金流、圖片辨識（除非現場確認相機可用） | 砍 / 標 optional |

### 建議時程

| 時段 | 目標 |
|---|---|
| Fri 晚 | 環境 + 部署管線打通（server 起得來、HTTPS OK、widget 註冊成功、hello world 上模擬器）+ keypad 框架校正 key 值 |
| Sat 上午 | 主選單 + MarketPrices（含 AI 分析、淨利） |
| Sat 下午 | AskAI（schema 驗證） + Marketplace（含 WS 即時） |
| Sat 晚 | FarmerCircle + DailyTasks/積分 |
| Sun 上午 | T9 + 128×160 適配 + Hindi + 打磨焦點/空狀態/錯誤態 |
| Sun 中午前 | **Demo 彩排 ×3** + 假資料 seed 到位 + 網路 fallback 測試 |

### 分工建議（依團隊人數調整）

- **Frontend A**：keypad 框架 / router / focus / T9（地基，最關鍵）。
- **Frontend B**：各畫面 UI + i18n + 雙解析度。
- **Backend**：Express + SQLite + WS hub + seed。
- **AI/整合**：aiAdapter + schema 驗證 + prompt 調校 + 部署/nginx/TLS。

（人少則 Frontend A 兼 T9、Backend 兼 AI。）

---

## 16. Demo 腳本 (得分關鍵)

> 3 分鐘。目標：讓評審**親眼看到功能機做「它不該做得到的事」**（即時多用戶）。

**開場（15s）**：「Cloud Phone 首頁已經有 Gemini、YouTube、新聞 —— 但它們全是一個人單向看內容。我們做了首頁上不存在的東西：讓功能機用戶**彼此即時連起來**。」

**Beat 1 — 決策工具（40s）**：開 MarketPrices → 切到 Rice → 展示三個市場比價 + AI「建議再等兩天」+ 進 PriceDetail 展示**淨利計算器**「運到 B 市場扣運費淨賺 ₹490」。→「這個 Gemini 做不到，因為它不知道你在哪、種什麼。」

**Beat 2 — 即時市集（60s，全場高潮）**：**兩支 itel NEO R60+ 同時擺桌上。** 評審手上一支開著 ListingFeed。你在另一支發布一則賣貨 → **評審手上那支即時跳出新貨 + 通知閃動**。評審按「I'm interested」→ **你這支即時收到配對通知**。→「兩支 $15 的功能機，透過同一台雲端伺服器即時同步。本地 16MB RAM 永遠做不到 —— 這就是 CloudMosa 雲端架構的價值。」

**Beat 3 — 社群 + AI（30s）**：進 FarmerCircle 看農民互助貼文 → 進 AskAI 用**自製 T9** 打一個問題 → AI 回覆（結構化、在地化）。快速切 Hindi 展示 i18n，切 128×160 展示加分解析度。

**Beat 4 — 留存敘事（20s）**：秀 DailyTasks + streak 🔥 →「每日任務 + 積分讓農民每天開 app = 每天用 data = 電信商 ARPU↑ churn↓，正是 CloudMosa 的 Viettel 案例：+40% ARPU、-30% churn。」

**收尾（15s）**：「AgriLink 不只是一個 app，是證明 Cloud Phone 可以承載**多用戶協作**這整個新品類。」

> **Demo 保命規則**：全程用 seed 假資料 + 已測網站，AI 有 fallback，WS 有 long-polling 備援。絕不現場賭沒測過的東西。

---

## 17. 部署與上架流程

### 17.1 Server（Ubuntu 24.04，比賽提供）

```bash
# SSH 進去
ssh root@<server-ip>            # 或用提供的 key

# 安裝
apt update && apt install -y nginx certbot python3-certbot-nginx curl
# Ubuntu 24.04 的 apt nodejs 版本過舊，改用 NodeSource 安裝 Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
npm i -g pm2

# 專案
git clone https://github.com/dogbark-MeiChu/2026meichu.git
cd 2026meichu/backend
npm install
cp .env.example .env            # 填 AI_PROVIDER / API key 等
node seed.js                    # 灌 demo 假資料
pm2 start server.js --name agrilink
pm2 save
```

### 17.2 nginx + HTTPS（產出公開 HTTPS URL）

```nginx
# /etc/nginx/sites-available/agrilink
server {
  server_name <your-domain>;
  location / { root /root/2026meichu/frontend; try_files $uri /index.html; }
  location /api/ { proxy_pass http://127.0.0.1:3000; }
  location /ws  { proxy_pass http://127.0.0.1:3000;
                  proxy_http_version 1.1;
                  proxy_set_header Upgrade $http_upgrade;
                  proxy_set_header Connection "upgrade"; }
}
```

```bash
ln -s /etc/nginx/sites-available/agrilink /etc/nginx/sites-enabled/
certbot --nginx -d <your-domain>     # 自動配 Let's Encrypt HTTPS
nginx -t && systemctl reload nginx
```

> 若無法取得網域，改用比賽提供的 HTTPS endpoint / 或 GitHub Pages 放純前端 + server 只跑 API（但 WS/AI 需 HTTPS，故優先走 server 網域）。

### 17.3 註冊 Widget（Cloud Phone Console）

1. 登入 https://www.cloudphone.tech/auth/sign-in（Email magic link）。
2. `Widget list` → `＋`：
   - **Name**: `AgriLink`
   - **URL**: `https://<your-domain>/`（**已部署的公開 HTTPS，不是 GitHub repo**）
   - **Icon**: 上傳 80×80 PNG（<1MB）。
3. `Launch simulator` 或按 widget 的 `Debug` 測試。
4. 拿到 itel NEO R60+ 後，手機撥號輸入 `*#06#` 取 15 位 IMEI → 填入 `IMEI list`（雙 SIM 用逗號分隔、不加空格/破折號）。

> ⚠️ IMEI 不要貼到公開 GitHub / 簡報。

---

## 18. 驗收標準 (Definition of Done)

### 全域

- [ ] 所有功能 100% 可用 keypad 完成，無需觸控/滑鼠。
- [ ] 任一畫面可一鍵回主選單；返回鍵正確 pop 堆疊。
- [ ] 每個畫面都有 loading / empty / error 三態，絕不白屏。
- [ ] 240×320、128×160 皆可用、焦點清楚。
- [ ] 已部署公開 HTTPS，已在 Console 註冊，模擬器可開。

### 逐功能

- [ ] **MarketPrices**：可切作物、顯示多市場比價、AI 決策一句、淨利計算正確。
- [ ] **Marketplace**：可發布 → 另一 session 即時看到；可表達興趣 → 賣家即時收通知。
- [ ] **FarmerCircle**：可瀏覽分類/貼文、發文、回覆、按讚；新回覆即時出現。
- [ ] **AskAI**：預設問題與 T9 自由輸入皆可；AI 回覆經 schema 驗證；失敗有 fallback。
- [ ] **DailyTasks**：任務由伺服器驗證、積分正確累加、streak 正確、可兌換。
- [ ] **T9**：multi-tap 循環/確認/刪除/送出正確；有字數上限提示。
- [ ] **i18n**：en 完整；hi 覆蓋主選單 + 預設問題 + AI 回覆。

---

## 19. 評分維度對照表

| 維度 (25% each) | AgriLink 如何吃分 |
|---|---|
| **實作難度 (很重要)** | 即時多用戶市集 (WebSocket + server-authoritative)、AI 個人化上下文注入 + JSON schema 驗證、自製 multi-tap T9 引擎、積分/streak 系統、雙解析度、多語言。遠超「呼叫 API 印結果」。 |
| **創意性** | Cloud Phone 上**第一個多用戶協作 app**，打開全新品類。反直覺（功能機做即時社群市集）= 高創意分。 |
| **可行性 (也很重要)** | 重運算本就在雲端；前端純 HTML/JS；SQLite + Node 零基礎設施；市集只做撮合不做金流；AI 用免費額度。P0+P1 週末可完成，且有 fallback 確保 demo 穩。 |
| **題目契合度** | 直擊 CloudMosa 前三大市場 (IN/VN/BD) 最大用戶群痛點；對電信商 = data usage↑/ARPU↑/churn↓（對齊官方 Viettel/Grameenphone case）；完美命中 #數位平權 mission；**放大 CloudMosa 雲端核心**而非另做無關 app。 |

---

## 20. 風險登記表

| 風險 | 影響 | 緩解 |
|---|---|---|
| Soft key / 特殊鍵的 `KeyboardEvent.key` 值與預期不同 | 導航失效 | 上機第一步用 console 校正 KEYMAP；集中管理 |
| 原生 T9 IME 行為不一致 | 打字壞掉 | 自製 multi-tap，不依賴原生 IME |
| Demo 現場網路不穩 | WS 斷線 | long-polling fallback；關鍵 demo 用 seed 資料 |
| AI 逾時 / 亂回 | AI 頁失效 | schema 驗證 + 預存 fallback + 導流論壇 |
| 相機/硬體 API 不保證可用 | 圖片辨識做不了 | 砍掉或標 optional，用預載樣本並註明 |
| Hindi/Bengali 字型不支援 | 在地化展示不出來 | 先確認；不支援則主打 en，hi/bn 作示意 |
| 時間不夠 | 功能做不完 | 嚴守 P0→P1→P2 優先級；P3 遊戲最後才碰 |
| Open-Meteo 免費版僅限非商業（1 萬次/日）、需標示 CC-BY | 商用上線違規 | 比賽/demo 使用；商用改付費 key；後端快取降低呼叫量；UI 保留 attribution |
| Agmarknet (data.gov.in) 資料延遲一天/偶爾掛掉 | 行情空白 | 每日排程寫入 DB，app 只讀 DB；失敗沿用昨日資料並標 cached；seed 保底 |
| 越南/孟加拉沒有開放即時價格 API | 無真實資料 | 第一版僅 IN 用真實資料；VN/BD 用 seed 並標「sample」，不對外宣稱為真實 |
| 只做出「單人 app」 | 失去核心差異 | **即時多用戶 (Marketplace WS) 屬 P1 高優先，是整個 thesis 的證明，不可砍** |

---

## 附錄 A：AgriGames 連線遊戲 (P3 留存模組)

> **定位**：不是主打功能，是「留存彩蛋」。**確定 P0+P1 全部穩了才碰。** 若時間不足，直接不做，不影響核心敘事。

### 概念

在 DailyTasks / 積分生態裡加一個「農閒小遊戲」，農民用積分參與、贏了拿積分，強化每日回訪。用同一套 WS hub，複用既有即時基礎建設。

### 建議遊戲：雙人搶答 (Crop Quiz Duel)

- 兩玩家同時看到同一題（常識/在地農業知識/簡單數學），數字鍵搶答，倒數計時。
- 全部邏輯 server-authoritative：出題、計時、判分、廣播結果。手機只送答案、收畫面。
- 教育場景 → 順帶吃「社會影響力」敘事。
- 比即時貪食蛇更好實作（不需逐幀物理同步，只需回合制狀態），週末風險更低。

### 若要更炫（時間充裕才選）：雙人貪食蛇對戰

- 同張 240×320 地圖、兩玩家 d-pad 操作、server 每 tick 廣播狀態、撞到對方判負。
- 視覺衝擊最強，但即時同步難度與風險最高 —— **只在核心全部完成且有餘力時做**。

### WS 事件（複用 hub）

```jsonc
{ "type": "game:invite",  "data": { "roomId": "...", "from": {...} } }
{ "type": "game:start",   "data": { "roomId": "...", "question": {...} } }
{ "type": "game:answer",  "data": { "roomId": "...", "choice": 2, "ts": 1234 } }
{ "type": "game:result",  "data": { "roomId": "...", "scores": {...} } }
```

### 驗收

- [ ] 兩 session 可配對進同一房間。
- [ ] 出題/計時/判分皆 server 端；前端只渲染。
- [ ] 贏家積分正確入帳，串回 DailyTasks 生態。

---

*文件版本 v1.0 · 供 dogbark-MeiChu 團隊開發使用*
