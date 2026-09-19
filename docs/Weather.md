# Weather 模組規格（取代原 FarmPulse prompt）

> 原版是一份給 AI 的 prompt，且有多處與官方規範/proposal 不符。本文件為修正後的正式規格，實作見 `backend/services/weatherService.js`、`frontend/js/screens/weather.js`。

## 修正對照

| 原版 | 修正 | 原因 |
|---|---|---|
| App 名 FarmPulse | AgriLink | 與 proposal 一致 |
| 320×240 landscape | **240×320**（加 128×160） | Cloud Phone 官方僅支援這兩種 portrait 解析度 |
| `current=precipitation` 當降雨機率 | 用 `daily.precipitation_probability_max` | `precipitation` 是雨量 (mm)，不是機率 |
| 前端直連 Open-Meteo | 後端代理 + 30 分鐘快取 | 省額度（免費 1 萬/日）、失敗可回傳上次資料 |
| 300ms 按鍵 debounce | 只對網路請求節流，按鍵不加 | 官方指南沒有 debounce 規則；按鍵 debounce 會讓導航變鈍 |
| 使用 cloudfone-starter (Next.js) | Vanilla ES modules | 與 proposal「無 build」原則一致；官方只要求標準網頁 + HTTPS |
| 座標寫死台中 | 使用 user.lat/lng（開發時可 `?lat=&lng=`） | 個人化上下文 |

## API

`GET /api/weather?lat=&lng=` →

```json
{
  "current": { "temp": 28, "precip_mm": 0, "code": 0 },
  "daily": [{ "date": "2026-09-19", "code": 51, "tmax": 31, "tmin": 24, "rain_prob": 37, "rain_mm": 0.8, "et0": 3.88 }],
  "advice": { "action": "wait|spray|irrigate|harvest", "reason": "<=30 chars" },
  "attribution": "Weather data by Open-Meteo.com",
  "stale": false
}
```

上游：`https://api.open-meteo.com/v1/forecast?latitude=&longitude=&current=temperature_2m,precipitation,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,et0_fao_evapotranspiration&forecast_days=3&timezone=auto`

授權：免費版僅限非商業、需標示 CC-BY；商用需付費 key。

## UI（240×320；128×160 隱藏次要資訊）

- 大字現在溫度 + 天氣圖示 + 今日降雨機率。
- 3 日列（今日/明日/後日），UP/DOWN/LEFT/RIGHT 切換焦點；ENTER 切換「農事建議 ↔ 當日細節（雨量、ET0）」。
- Menu = 回主選單；Back = 返回（RSK 語意）。
- WMO code → emoji + 文字標籤（手機字型缺 emoji 時仍可讀）。
- loading / error（"Weather unavailable"）/ stale 三態。
