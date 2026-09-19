# Codex 開發紀錄

## 2026-09-19 — Today’s Farm addendum v1.0 實作

- **規格比對**：`TODAYS_FARM_OPERATIONS_MASTER_PROMPT (2).md` 是疊加在原 master prompt 上的 addendum，不是替代全文。新增範圍為 Agmarknet 即時價格、噴藥安全規則、Today 統一入口，以及 Farmer Circle 專家／官方／AI／翻譯能力。
- **價格資料**：新增 Mandi Price API provider、PostgreSQL `app.price_snapshots` 快取與 60 分鐘 TTL、live → cache → demo fallback。保留原 `/api/prices` CEDA 介面；Today’s Farm 使用 `/api/farms/:farmId/prices`。價格只顯示事實、運費後差額與趨勢，不再提供 sell/wait 建議。
- **噴藥安全**：新增 deterministic rules engine、Stull Delta-T 計算、7 個完整因素與固定 disclaimer；Today 與 `/spray-assessment` 會顯示 `optimal/caution/unsuitable`，不會自動取消任務。spraying/fertilizer 完成時會保存最近天氣快照。
- **Today 畫面**：回應加入 `weather`、`sprayAssessment`、`marketSnapshot`、`communityActivity`；240×320 顯示完整列，128×160 壓縮市場／天氣並隱藏社群列。
- **Farmer Circle**：migration 011 加入 verified expert、reply source、原文語言與翻譯快取。回覆排序為 expert → official → human → AI；AI 明確標示並置底。支援 `GET /api/forum/posts/:id?lang=hi`、Hindi 預快取、`*` 切換原文；seed 擴充至 20 posts、3 位 verified experts、3 篇政府公告、2 篇 AI 回覆與 5 篇 Hindi 翻譯。
- **Demo seeds**：Today’s Farm 改為 Uttar Pradesh / Lucknow 地點，加入 rice/wheat/onion 價格快照與完整 spray weather seed。既有 `Test_Admin` owner 邏輯保留。
- **合併相容性**：兩次 rebase 遠端 main 共 20 個新 commits，保留新增的 farm/team/shortcut、全州 mandi sync 與 browser speech 流程；Google Translate 測試改用 provider injection，避免測試直接連外並保留既有 cache 行為。
- **驗證**：已用真實 Mandi API 與 Open-Meteo 在 Mac local 驗證 Today 回應（5 個今日任務、7 個 spray factors、market cache、community activity）；完整 backend 測試 160/160 通過。commit/push 與 VM 部署狀態會在完成後補記。
