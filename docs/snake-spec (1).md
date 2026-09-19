# 🐍 CloudArena Snake — 多人對戰貪食蛇 完整開發規格書

> **一句話定位**：兩支低價 keypad phone 透過 Cloud Phone session 即時對戰；玩家只按方向鍵，authoritative game server 統一判定狀態、碰撞與勝負，Cloud Chromium 負責 Canvas 畫面。這證明低階裝置不必安裝原生遊戲，也能取得可集中更新的即時多人 Web 體驗。
>
> **目標**：作為 AgriLink 的 P3 留存模組（AgriGames），或可獨立 demo。

---

## 目錄

1. [遊戲概覽](#1-遊戲概覽)
2. [視覺設計規格](#2-視覺設計規格)
3. [系統架構](#3-系統架構)
4. [遊戲狀態機](#4-遊戲狀態機)
5. [Server 端遊戲引擎](#5-server-端遊戲引擎)
6. [Client 端渲染引擎](#6-client-端渲染引擎)
7. [WebSocket 協議](#7-websocket-協議)
8. [Keypad 操控](#8-keypad-操控)
9. [畫面逐頁 Spec](#9-畫面逐頁-spec)
10. [單人模式](#10-單人模式)
11. [計分與積分整合](#11-計分與積分整合)
12. [音效與觸覺回饋](#12-音效與觸覺回饋)
13. [雙解析度適配](#13-雙解析度適配)
14. [檔案結構](#14-檔案結構)
15. [API / 路由](#15-api--路由)
16. [資料模型](#16-資料模型)
17. [開發任務拆解](#17-開發任務拆解)
18. [驗收標準](#18-驗收標準)
19. [Demo 腳本](#19-demo-腳本)

---

## 1. 遊戲概覽

### 玩法

- 經典貪食蛇 + **即時雙人 PvP 對戰**。
- 兩條蛇在同一張地圖上移動，吃食物長大，撞牆/撞自己/撞對方 = 死亡。
- 最後存活者獲勝；若同一 authoritative tick 內雙方死亡，結果一律為平手。
- 支援**單人練習模式**（無需配對，離線可玩）。

### 核心設計原則

| 原則 | 說明 |
|---|---|
| **Server-authoritative PvP** | 多人對戰的邏輯、隨機數、碰撞、分數與勝負全部由 Game Server 決定。Cloud browser client 只送輸入並渲染狀態。 |
| **Keypad-only** | 四方向鍵控制方向，Enter 確認，Soft keys 操作選單。零觸控依賴。 |
| **Recoverable sync** | 平時傳 delta，開局、重連、tick 缺口與週期校正使用 snapshot；不能因錯過一次狀態就永久分歧。 |
| **Low app-protocol bandwidth** | Game Server 與 Cloud Chromium 間平時傳 delta；另須把 Cloud Phone 的畫面串流流量與此數字分開說明。 |
| **Readable first** | 先確保小螢幕辨識與輸入回饋，再加入有限的 Canvas 特效；不是 ASCII art，也不堆疊模糊效果。 |

---

## 2. 視覺設計規格

### 2.1 配色方案

```
背景底色        #0a0a1a   (深太空藍，近黑)
網格線          #151530   (極淡線，營造科技感)
Player 1 蛇     頭: #00e676 → 身: #00c853 → 尾: #00a844  (亮綠漸層)
Player 2 蛇     頭: #ff5252 → 身: #e53935 → 尾: #c62828  (紅漸層)
食物            #ffd740   (金黃，帶 glow 動畫)
特殊食物        #e040fb   (紫色，閃爍)
牆壁            #37474f
文字            #ffffff
得分/HUD        #b0bec5
死亡閃爍        紅色 overlay 閃爍 3 次
```

### 2.2 網格尺寸

多人模式使用固定的 **canonical logical board：16 欄 × 17 列**。Server 座標與裝置像素完全分離，確保 240×320 與 128×160 可以看到同一個 room state。

| 解析度 | Canvas | 邏輯格 | 建議縮放 | HUD／留白 |
|---|---|---|---|---|
| 240×320 | 240×320 | 16×17 | 每格 14px，棋盤 224×238，水平置中 | 頂部 HUD 28px；底部狀態 24px；其餘置中留白 |
| 128×160 | 128×160 | 16×17 | 每格 8px，棋盤 128×136 | HUD 疊加在頂端半透明條；無底部 soft-key bar |

不得讓 client 根據自己的解析度改變 `GRID_W/GRID_H`。解析度只影響 rendering transform，不影響遊戲規則、座標或碰撞。

### 2.3 蛇的視覺

- **頭**：圓角方塊 + 兩個白色小眼睛（朝移動方向）。死亡時眼睛變 ✕✕。
- **身體**：每節方塊，顏色沿身體從頭到尾漸層（越靠尾越暗）。
- **轉彎**：轉彎處的兩節用圓角連接（不是直角鋸齒）。
- **移動**：每 tick 不是瞬間跳格，而是做 **插值動畫**（在兩個 tick 之間平滑滑動），讓移動看起來流暢。

### 2.4 食物視覺

- **普通食物**：金黃圓形，帶 **脈動 glow** 動畫（CSS `box-shadow` 或 Canvas `shadowBlur` 每幀 ±2px）。
- **特殊食物**（可選）：紫色星形，閃爍 + 旋轉，吃了 +3 長度或暫時加速。
- **食物出現動畫**：從 0 scale 彈出（ease-out-back）。

### 2.5 背景

- 深色底 + 極淡網格線（`strokeStyle = '#151530'`），營造 Tron/科技感。
- 可選：背景緩慢移動的微粒效果（5-10 個半透明小圓點緩慢漂移），增加生命感但不影響效能。

### 2.6 特效

| 事件 | 效果 |
|---|---|
| 吃到食物 | 食物位置爆出 4-6 個小粒子（食物顏色），0.3s 淡出 |
| 蛇死亡 | 蛇身從頭到尾逐節閃爍紅色 → 消失（0.5s） + 畫面短暫紅色 overlay 閃 |
| 得分 | 分數 +1 飄出動畫（`+1` 文字從食物位置往上飄 0.5s 淡出） |
| 倒數開始 | 畫面中央大字 `3` → `2` → `1` → `GO!`，每個停 0.8s，帶縮放動畫 |
| 勝利 | `YOU WIN` 金色文字 + 撒花粒子（10-15 個彩色方塊下落） |
| 落敗 | `YOU LOSE` 紅色文字 + 畫面灰階化 0.5s |

---

## 3. 系統架構

```text
Physical keypad phone A                 Physical keypad phone B
  keypad input / streamed screen          keypad input / streamed screen
             ↕                                      ↕
Cloud Phone session A                    Cloud Phone session B
Cloud Chromium + Canvas renderer         Cloud Chromium + Canvas renderer
             \                                      /
              \       authenticated WebSocket      /
               └───────────────┬──────────────────┘
                               ↓
                    AgriLink Game Server
              Auth → Queue → Room → Engine → Results
                               ↓
                       SQLite / audit log
```

Important distinction:

- The physical phone does not directly own the WebSocket game simulation.
- Key events reach the Cloud Phone browser session; that browser sends authenticated game inputs.
- The Game Server owns the multiplayer truth.
- Canvas rendering occurs in the browser session and the Cloud Phone platform delivers the resulting screen to the handset.
- `2–5 KB/s` estimates below refer only to WebSocket application messages, not total Cloud Phone screen-stream traffic.

### 為什麼 Server-authoritative？

1. **防作弊**：Client 只能送「我想往哪走」，不能自己決定「我吃到食物了」。
2. **一致性**：兩個 Client 看到的遊戲狀態完全相同（由 Server 單一真相源廣播）。
3. **證明 CloudMosa 價值**：Snake 本身不是低階裝置無法計算的遊戲；真正價值是不用安裝裝置專屬原生遊戲，就能得到跨裝置、即時同步、集中更新的多人 Web 體驗。

---

## 4. 遊戲狀態機

```
         ┌──────────┐
         │  LOBBY   │  ← 主選單：選單人/多人
         └────┬─────┘
              │ 選多人
              ▼
         ┌──────────┐
         │ MATCHING  │  ← 等待對手（顯示動畫）
         └────┬─────┘
              │ 配對成功
              ▼
         ┌──────────┐
         │ COUNTDOWN │  ← 3-2-1-GO! (3.2s)
         └────┬─────┘
              │
              ▼
         ┌──────────┐
         │ PLAYING   │  ← 遊戲進行中（tick loop）
         └──┬────┬──┘
            │    │ socket 暫時中斷
            │    ▼
            │ ┌──────────────┐
            │ │ RECONNECTING │ ← 最多等待 3 秒，對手畫面顯示狀態
            │ └──────┬───────┘
            │        ├─ 成功：送 snapshot，回 PLAYING
            │        └─ 逾時：對手勝利或 no contest
              │ 死亡／逾時
              ▼
         ┌──────────┐
         │ GAME_OVER │  ← 顯示結果 3s
         └────┬─────┘
              │ Enter
              ▼
         ┌──────────┐
         │ RESULT    │  ← 詳細戰績 + 積分 + 再來一局
         └────┬─────┘
              │ 選擇
              ▼
         回到 LOBBY 或 MATCHING
```

每個狀態對應一個 Client 畫面。Server 廣播狀態切換事件，Client 被動跟隨。PvP 不允許單一玩家暫停；`RECONNECTING` 是 Server 控制的短暫 grace period，不是 pause 功能。

---

## 5. Server 端遊戲引擎

### 5.1 Tick Loop

```js
const TICK_MS = 150;
const GRID_W = 16; // canonical logical board; independent from pixels
const GRID_H = 17;
const SNAPSHOT_EVERY_TICKS = 10;

class GameEngine {
  constructor(room, seed) {
    this.room = room;
    this.seed = seed;
    this.rng = createSeededRng(seed);
    this.state = 'COUNTDOWN';
    this.tick = 0;
    this.snakes = {};
    this.foods = [];
    this.timer = null;
    this.nextTickAt = 0;
  }

  start() {
    this.snakes[this.room.p1] = new Snake(
      this.room.p1,
      [{ x: 3, y: 8 }, { x: 2, y: 8 }, { x: 1, y: 8 }],
      'RIGHT', 1
    );
    this.snakes[this.room.p2] = new Snake(
      this.room.p2,
      [{ x: 12, y: 8 }, { x: 13, y: 8 }, { x: 14, y: 8 }],
      'LEFT', 2
    );
    this.spawnFood();
    this.spawnFood();
    this.countdown();
  }

  countdown() {
    this.state = 'COUNTDOWN';
    const startsAt = Date.now() + 3200;
    this.broadcast({ type: 'snake:countdown', startsAt, seed: this.seed });
    this.timer = setTimeout(() => {
      this.state = 'PLAYING';
      this.nextTickAt = performance.now() + TICK_MS;
      this.broadcastSnapshot('game_start');
      this.scheduleNextTick();
    }, Math.max(0, startsAt - Date.now()));
  }

  scheduleNextTick() {
    if (this.state !== 'PLAYING') return;
    const delay = Math.max(0, this.nextTickAt - performance.now());
    this.timer = setTimeout(() => {
      // Run exactly one authoritative step, then schedule against a monotonic
      // deadline. Do not chain setInterval drift into game time.
      this.update();
      this.nextTickAt += TICK_MS;
      this.scheduleNextTick();
    }, delay);
  }

  update() {
    if (this.state !== 'PLAYING') return;
    this.tick++;
    const active = Object.values(this.snakes).filter(s => s.alive);
    const events = [];

    // Phase 1 — freeze the old state and compute every intent first.
    const intents = new Map();
    for (const snake of active) {
      snake.applyNextQueuedInput();
      const head = snake.nextHead();
      const food = this.foods.find(f => sameCell(f, head)) || null;
      intents.set(snake.id, {
        snake,
        head,
        food,
        tailVacates: snake.growCounter <= 0 && !food,
      });
    }

    // Phase 2 — evaluate collisions against the same frozen state.
    const dead = new Set();
    for (const intent of intents.values()) {
      if (outsideBoard(intent.head)) dead.add(intent.snake.id);
    }

    const [a, b] = active.map(s => intents.get(s.id));
    if (a && b) {
      // Both choose the same destination or swap head cells in one tick.
      if (sameCell(a.head, b.head) ||
          (sameCell(a.head, b.snake.body[0]) && sameCell(b.head, a.snake.body[0]))) {
        dead.add(a.snake.id);
        dead.add(b.snake.id);
      }
    }

    for (const intent of intents.values()) {
      for (const otherIntent of intents.values()) {
        const body = otherIntent.snake.body;
        const blockerCount = body.length - (otherIntent.tailVacates ? 1 : 0);
        for (let i = 0; i < blockerCount; i++) {
          // A snake's old head is handled naturally as body occupancy. Head
          // swap has an explicit rule above so both players receive the same result.
          if (sameCell(intent.head, body[i])) dead.add(intent.snake.id);
        }
      }
    }

    // Phase 3 — apply survivors simultaneously. Dead snakes do not consume food.
    const consumedFoodIds = new Set();
    for (const intent of intents.values()) {
      const snake = intent.snake;
      if (dead.has(snake.id)) {
        snake.alive = false;
        events.push({ type: 'death', player: snake.playerNum, head: intent.head });
        continue;
      }

      snake.body.unshift(intent.head);
      let removeTail = null;
      if (intent.food) {
        const value = intent.food.value ?? 1;
        snake.score += value;
        snake.growCounter += Math.max(0, value - 1);
        consumedFoodIds.add(intent.food.id);
        events.push({
          type: 'eat', player: snake.playerNum,
          pos: intent.head, foodType: intent.food.foodType,
        });
      } else if (snake.growCounter > 0) {
        snake.growCounter--;
      } else {
        removeTail = snake.body.pop();
      }
      events.push({ type: 'move', player: snake.playerNum, head: intent.head, removeTail });
    }

    if (consumedFoodIds.size) {
      this.foods = this.foods.filter(f => !consumedFoodIds.has(f.id));
      for (let i = 0; i < consumedFoodIds.size; i++) this.spawnFood();
    }

    const alive = Object.values(this.snakes).filter(s => s.alive);
    if (alive.length <= 1) {
      this.endGame(alive[0] || null);
      return;
    }

    // Phase 4 — send delta plus authoritative timing metadata.
    this.broadcast({
      type: 'snake:tick',
      tick: this.tick,
      serverTime: Date.now(),
      nextTickAt: Date.now() + TICK_MS,
      events,
      foods: this.foods,
      scores: this.getScores(),
      inputAck: this.getInputAcks(),
    });

    if (this.tick % SNAPSHOT_EVERY_TICKS === 0) {
      this.broadcastSnapshot('periodic');
    }
  }

  broadcastSnapshot(reason) {
    this.broadcast({
      type: 'snake:snapshot',
      reason,
      roomId: this.room.id,
      tick: this.tick,
      serverTime: Date.now(),
      board: { cols: GRID_W, rows: GRID_H },
      snakes: Object.fromEntries(Object.values(this.snakes).map(s => [s.playerNum, s.serialize()])),
      foods: this.foods,
      scores: this.getScores(),
    });
  }

  spawnFood() {
    const free = [];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!this.isOccupied({ x, y })) free.push({ x, y });
      }
    }
    if (!free.length) return;
    const pos = free[Math.floor(this.rng() * free.length)];
    const isSpecial = this.rng() < 0.15;
    this.foods.push({
      id: crypto.randomUUID(),
      x: pos.x, y: pos.y,
      foodType: isSpecial ? 'special' : 'normal',
      value: isSpecial ? 3 : 1,
    });
  }

  isOccupied(pos) {
    for (const s of Object.values(this.snakes)) {
      for (const seg of s.body) {
        if (seg.x === pos.x && seg.y === pos.y) return true;
      }
    }
    for (const f of this.foods) {
      if (f.x === pos.x && f.y === pos.y) return true;
    }
    return false;
  }

  endGame(winner) {
    clearTimeout(this.timer);
    this.state = 'GAME_OVER';
    // If both die in the same authoritative tick, the result is a draw.
    this.broadcast({
      type: 'snake:game_over',
      state: 'GAME_OVER',
      winner: winner ? winner.playerNum : 0,
      reason: winner ? 'collision' : 'simultaneous_death',
      scores: this.getScores(),
      lengths: this.getLengths(),
    });
    this.room.persistAuthoritativeResult({ winner, tick: this.tick });
    this.room.scheduleCleanup();
  }

  getScores() {
    const s = {};
    for (const [id, snake] of Object.entries(this.snakes)) {
      s[snake.playerNum] = snake.score;
    }
    return s;
  }

  getLengths() {
    const l = {};
    for (const [id, snake] of Object.entries(this.snakes)) {
      l[snake.playerNum] = snake.body.length;
    }
    return l;
  }

  getInputAcks() {
    const acks = {};
    for (const snake of Object.values(this.snakes)) {
      acks[snake.playerNum] = snake.lastAcceptedInputSeq;
    }
    return acks;
  }

  setDirection(playerId, input) {
    const snake = this.snakes[playerId];
    if (snake && snake.alive) snake.enqueueDirection(input);
  }

  finishByForfeit(winnerPlayerNum, loserPlayerNum) {
    if (this.state === 'GAME_OVER') return;
    clearTimeout(this.timer);
    this.state = 'GAME_OVER';
    const message = {
      type: 'snake:game_over',
      state: 'GAME_OVER',
      winner: winnerPlayerNum,
      loser: loserPlayerNum,
      reason: winnerPlayerNum ? 'disconnect_forfeit' : 'no_contest',
      scores: this.getScores(),
      lengths: this.getLengths(),
    };
    this.broadcast(message);
    this.room.persistAuthoritativeResult({
      winnerPlayerNum, loserPlayerNum,
      reason: message.reason, tick: this.tick,
    });
    this.room.scheduleCleanup();
  }

  broadcast(msg) {
    this.room.broadcast(msg);
  }
}

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function outsideBoard(pos) {
  return pos.x < 0 || pos.x >= GRID_W || pos.y < 0 || pos.y >= GRID_H;
}
```

Implementation requirements omitted from the compact example but mandatory:

- `createSeededRng(seed)` must be deterministic and covered by tests; do not use `Math.random()` for authoritative food placement.
- Each room stores its seed and final input/event log for reproducible debugging.
- Server processing order must never decide which player wins a simultaneous collision.
- A simultaneous death is a draw. Do not contradict this rule by later comparing length.
- Limit timer catch-up after an event-loop stall; if the server is severely delayed, send a snapshot and timing warning rather than running a long burst of ticks.

### 5.2 Snake Class

```js
const OPPOSITES = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };

class Snake {
  constructor(id, body, direction, playerNum) {
    this.id = id;
    this.body = body;           // [{x,y}, ...] body[0] = 頭
    this.direction = direction;
    this.inputQueue = [];       // at most two validated future turns
    this.lastAcceptedInputSeq = 0;
    this.playerNum = playerNum;  // 1 or 2
    this.alive = true;
    this.score = 0;
    this.growCounter = 0;
  }

  enqueueDirection({ direction, inputSeq }) {
    if (!Number.isInteger(inputSeq) || inputSeq <= this.lastAcceptedInputSeq) return;
    if (!Object.hasOwn(OPPOSITES, direction)) return;
    if (this.inputQueue.length >= 2) return;

    const projected = this.inputQueue.at(-1)?.direction || this.direction;
    if (direction === projected || OPPOSITES[direction] === projected) return;

    this.inputQueue.push({ direction, inputSeq });
    this.lastAcceptedInputSeq = inputSeq;
  }

  applyNextQueuedInput() {
    const next = this.inputQueue.shift();
    if (next) this.direction = next.direction;
  }

  nextHead() {
    const head = this.body[0];
    switch (this.direction) {
      case 'UP':    return { x: head.x,     y: head.y - 1 };
      case 'DOWN':  return { x: head.x,     y: head.y + 1 };
      case 'LEFT':  return { x: head.x - 1, y: head.y     };
      case 'RIGHT': return { x: head.x + 1, y: head.y     };
    }
  }

  serialize() {
    return {
      body: this.body,
      direction: this.direction,
      alive: this.alive,
      score: this.score,
      inputAck: this.lastAcceptedInputSeq,
    };
  }
}
```

Why queue two inputs: if a snake is moving right and the user quickly presses `UP` then `LEFT` within one 150 ms window, both turns are valid in sequence. A single `pendingDir` would keep only `LEFT`, reject it as a direct reversal of `RIGHT`, and make the controls feel broken.

### 5.3 Room Manager

```js
class RoomManager {
  constructor() {
    this.waitingQueue = [];           // [{ ws, userId, sessionId, joinedAt }]
    this.rooms = new Map();           // roomId → Room
    this.roomByUser = new Map();      // userId → roomId
  }

  join(ws, identity) {
    const { userId, sessionId } = identity; // identity comes from authenticated WS handshake
    if (!userId || !sessionId || ws.readyState !== WebSocket.OPEN) return;
    if (this.roomByUser.has(userId)) return sendError(ws, 'ALREADY_IN_ROOM');

    this.cancelWait(ws);
    this.waitingQueue = this.waitingQueue.filter(e =>
      e.ws.readyState === WebSocket.OPEN && e.userId !== userId
    );

    const index = this.waitingQueue.findIndex(e => e.userId !== userId);
    if (index < 0) {
      this.waitingQueue.push({ ws, userId, sessionId, joinedAt: Date.now() });
      return send(ws, { type: 'snake:matching' });
    }

    const [opponent] = this.waitingQueue.splice(index, 1);
    const room = new Room(crypto.randomUUID(), opponent, { ws, userId, sessionId }, this);
    this.rooms.set(room.id, room);
    this.roomByUser.set(opponent.userId, room.id);
    this.roomByUser.set(userId, room.id);
    room.start();
  }

  cancelWait(ws) {
    this.waitingQueue = this.waitingQueue.filter(e => e.ws !== ws);
  }

  handleDisconnect(ws) {
    this.cancelWait(ws);
    const room = [...this.rooms.values()].find(r => r.hasSocket(ws));
    if (room) room.beginReconnectGrace(ws, 3000);
  }

  removeRoom(room) {
    this.rooms.delete(room.id);
    for (const player of room.players.values()) this.roomByUser.delete(player.userId);
  }
}

class Room {
  constructor(id, p1, p2, manager) {
    this.id = id;
    this.p1 = 'p1';
    this.p2 = 'p2';
    this.manager = manager;
    this.players = new Map([
      ['p1', { ...p1, playerNum: 1, connected: true }],
      ['p2', { ...p2, playerNum: 2, connected: true }],
    ]);
    this.engine = null;
    this.seed = crypto.randomBytes(16).toString('hex');
    this.cleanupTimer = null;
  }

  start() {
    for (const [slot, p] of this.players) {
      send(p.ws, {
        type: 'snake:matched', roomId: this.id,
        playerNum: p.playerNum, board: { cols: GRID_W, rows: GRID_H },
      });
    }
    this.engine = new GameEngine(this, this.seed);
    this.engine.start();
  }

  hasSocket(ws) {
    return [...this.players.values()].some(p => p.ws === ws);
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.connected && p.ws?.readyState === WebSocket.OPEN) p.ws.send(data);
    }
  }

  handleInput(ws, input) {
    if (!this.engine || this.engine.state !== 'PLAYING') return;
    const entry = [...this.players.entries()].find(([, p]) => p.ws === ws);
    if (!entry) return;
    const [slot] = entry;
    this.engine.setDirection(slot, input);
  }

  beginReconnectGrace(ws, graceMs) {
    const entry = [...this.players.entries()].find(([, p]) => p.ws === ws);
    if (!entry || this.engine?.state === 'GAME_OVER') return;
    const [slot, player] = entry;
    player.connected = false;
    this.broadcast({ type: 'snake:reconnecting', playerNum: player.playerNum, graceMs });
    player.reconnectTimer = setTimeout(() => this.forfeitDisconnected(slot), graceMs);
  }

  reconnect(slot, ws, authenticatedSessionId) {
    const player = this.players.get(slot);
    if (!player || player.sessionId !== authenticatedSessionId || player.connected) return false;
    clearTimeout(player.reconnectTimer);
    player.ws = ws;
    player.connected = true;
    this.engine.broadcastSnapshot('reconnect');
    this.broadcast({ type: 'snake:reconnected', playerNum: player.playerNum });
    return true;
  }

  forfeitDisconnected(slot) {
    if (this.engine?.state === 'GAME_OVER') return;
    const loser = this.players.get(slot);
    const winner = [...this.players.entries()].find(([s]) => s !== slot)?.[1];
    this.engine.finishByForfeit(winner?.playerNum ?? 0, loser?.playerNum ?? 0);
  }

  persistAuthoritativeResult(result) {
    // Server-only transaction: insert match/result and update leaderboard.
    // Never accept PvP score, winner or points from a client REST body.
    persistSnakeMatchTransaction(this, result);
  }

  scheduleCleanup() {
    clearTimeout(this.cleanupTimer);
    this.cleanupTimer = setTimeout(() => this.manager.removeRoom(this), 30_000);
  }
}
```

Mandatory production guards:

- Authenticate the WebSocket upgrade with the existing short-lived session token and validate `Origin`.
- One waiting-queue entry and one active room maximum per user.
- Never match a user with another tab/session belonging to the same user.
- Drop dead sockets before matching.
- Apply per-socket input rate limits and maximum message size.
- Heartbeat with ping/pong; terminate stale sockets.
- Reconnect requires the same authenticated user/session binding, not merely a guessable room ID.
- Finished/abandoned rooms have a TTL and are removed from all maps.
- `rematch` requires both players to opt in and creates a fresh seed/match ID.

---

## 6. Client 端渲染引擎

### 6.1 Canvas Setup

```js
// renderer.js
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const LOGICAL_COLS = 16;
const LOGICAL_ROWS = 17;

function createLayout(viewWidth, viewHeight) {
  const isQQVGA = viewWidth <= 160 || viewHeight <= 180;
  const cell = isQQVGA ? 8 : 14;
  const boardWidth = LOGICAL_COLS * cell;
  const boardHeight = LOGICAL_ROWS * cell;
  const hudHeight = isQQVGA ? 12 : 28;
  return {
    isQQVGA,
    cell,
    boardWidth,
    boardHeight,
    originX: Math.floor((viewWidth - boardWidth) / 2),
    originY: isQQVGA ? 12 : 42,
    hudHeight,
    width: viewWidth,
    height: viewHeight,
  };
}

canvas.width = window.innerWidth <= 160 ? 128 : 240;
canvas.height = window.innerHeight <= 180 ? 160 : 320;
const layout = createLayout(canvas.width, canvas.height);

function gridToPixel(cell) {
  return {
    x: layout.originX + cell.x * layout.cell,
    y: layout.originY + cell.y * layout.cell,
  };
}
```

All draw functions must use `gridToPixel()` and `layout.cell`; they must not redefine `COLS`, `ROWS` or game rules based on screen size.

### 6.2 渲染流程（每個 requestAnimationFrame）

```
1. 清除畫面
2. 繪製背景 + 網格
3. 繪製食物（含 glow 動畫）
4. 繪製兩條蛇（含漸層、眼睛、轉彎圓角）
5. 繪製粒子效果
6. 繪製 HUD（分數、對手分數）
7. 繪製 Overlay（倒數 / GAME_OVER / 等待配對）
```

Client state rules:

- A `snake:snapshot` replaces local authoritative state completely.
- A `snake:tick` is applied only when `tick === localTick + 1`.
- If a tick gap is detected, freeze interpolation, show `SYNCING…`, send `snake:resync_request`, and wait for a snapshot.
- Store two authoritative render states with server timestamps and interpolate only visual positions between them.
- Never predict food, collision, score or winner on the client.
- Input may be shown optimistically as a tiny keypad feedback indicator, but the snake direction follows acknowledged authoritative state.

### 6.3 蛇渲染細節

```js
function drawSnake(snake, playerNum) {
  const colors = playerNum === 1
    ? { head: '#00e676', body: '#00c853', tail: '#00a844' }
    : { head: '#ff5252', body: '#e53935', tail: '#c62828' };

  const len = snake.length;
  snake.forEach((seg, i) => {
    const ratio = i / Math.max(len - 1, 1); // 0 = 頭, 1 = 尾
    const color = lerpColor(colors.head, colors.tail, ratio);

    const { x, y } = gridToPixel(seg);
    const CELL = layout.cell;
    const r = 2; // 圓角半徑

    // 圓角方塊
    ctx.fillStyle = color;
    roundRect(ctx, x + 0.5, y + 0.5, CELL - 1, CELL - 1, r);

    // 頭部：眼睛
    if (i === 0) {
      drawEyes(ctx, seg, snake.direction || 'RIGHT', x, y, playerNum, snake.alive);
    }
  });
}

function drawEyes(ctx, head, dir, x, y, playerNum, alive) {
  const CELL = layout.cell;
  const eyeSize = 2;
  const offsets = {
    UP:    [{ ex: 3, ey: 3 }, { ex: CELL - 5, ey: 3 }],
    DOWN:  [{ ex: 3, ey: CELL - 5 }, { ex: CELL - 5, ey: CELL - 5 }],
    LEFT:  [{ ex: 3, ey: 3 }, { ex: 3, ey: CELL - 5 }],
    RIGHT: [{ ex: CELL - 5, ey: 3 }, { ex: CELL - 5, ey: CELL - 5 }],
  };
  const eyes = offsets[dir] || offsets.RIGHT;
  ctx.fillStyle = alive ? '#fff' : '#f44336';
  eyes.forEach(e => {
    if (alive) {
      ctx.beginPath();
      ctx.arc(x + e.ex + 1, y + e.ey + 1, eyeSize, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Dead eyes: ✕
      ctx.strokeStyle = '#f44336';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + e.ex - 1, y + e.ey - 1);
      ctx.lineTo(x + e.ex + 3, y + e.ey + 3);
      ctx.moveTo(x + e.ex + 3, y + e.ey - 1);
      ctx.lineTo(x + e.ex - 1, y + e.ey + 3);
      ctx.stroke();
    }
  });
}
```

### 6.4 食物渲染

```js
function drawFoods(foods, tick) {
  foods.forEach(f => {
    const CELL = layout.cell;
    const p = gridToPixel(f);
    const x = p.x + CELL / 2;
    const y = p.y + CELL / 2;
    const pulse = Math.sin(tick * 0.15) * 2 + 4; // 脈動半徑 2~6

    if (f.foodType === 'special') {
      // 紫色星形 + 閃爍
      ctx.fillStyle = '#e040fb';
      drawStar(ctx, x, y, 5, CELL / 2 - 1, CELL / 4);
      ctx.shadowColor = '#e040fb';
      ctx.shadowBlur = pulse + 4;
    } else {
      // 金黃圓形 + glow
      ctx.fillStyle = '#ffd740';
      ctx.shadowColor = '#ffd740';
      ctx.shadowBlur = pulse;
      ctx.beginPath();
      ctx.arc(x, y, CELL / 2 - 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  });
}
```

### 6.5 粒子系統

```js
class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  emit(x, y, color, count = 6) {
    const CELL = layout.cell;
    const p = gridToPixel({ x, y });
    count = layout.isQQVGA ? Math.min(count, 3) : Math.min(count, 6);
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: p.x + CELL / 2,
        y: p.y + CELL / 2,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1.0,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  update() {
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.05;
      return p.life > 0;
    });
  }

  draw(ctx) {
    this.particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
  }
}
```

### 6.6 HUD 渲染

```
┌──────────────────────────────────────┐
│ P1: 12          ⚡ 3:42        P2: 8 │  ← 頂部 HUD
├──────────────────────────────────────┤
│                                      │
│            GAME AREA                 │
│           (Canvas)                   │
│                                      │
├──────────────────────────────────────┤
│ Menu       PvP: no pause      Back  │  ← QVGA status only
└──────────────────────────────────────┘
```

```js
function drawHUD(scores, myNum, elapsed) {
  // 頂部背景
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, layout.width, layout.hudHeight);

  ctx.font = 'bold 11px Arial';
  // P1 分數（綠色）
  ctx.fillStyle = '#00e676';
  ctx.textAlign = 'left';
  ctx.fillText(`P1: ${scores[1] || 0}`, 4, 14);

  // 時間
  ctx.fillStyle = '#b0bec5';
  ctx.textAlign = 'center';
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  ctx.fillText(`⚡ ${mins}:${String(secs).padStart(2, '0')}`, 120, 14);

  // P2 分數（紅色）
  ctx.fillStyle = '#ff5252';
  ctx.textAlign = 'right';
  ctx.fillText(`P2: ${scores[2] || 0}`, 236, 14);
}
```

P0 visual budget:

- Keep player colors, clear eyes, one food pulse and at most 4–6 eat particles.
- Disable background particles, rotating special-food animation and confetti until device tests prove stable.
- Avoid repeated full-board gradients or large `shadowBlur` regions on every frame.
- Target a stable perceived 30 FPS in the Cloud Phone stream; do not claim local browser FPS alone proves end-to-end smoothness.

---

## 7. WebSocket 協議

### Client → Server

```jsonc
// 加入配對
{ "type": "snake:join", "protocolVersion": 1 }

// 方向輸入。inputSeq 在此 socket/session 中單調增加。
{
  "type": "snake:input",
  "roomId": "abc123",
  "inputSeq": 18,
  "direction": "UP",
  "clientTime": 1789792012000
}

// 發現 tick 不連續或 reconnect 後要求完整狀態
{ "type": "snake:resync_request", "roomId": "abc123", "lastTick": 41 }

// 取消等待
{ "type": "snake:cancel" }

// 再來一局；雙方都同意才建立新 match/seed
{ "type": "snake:rematch", "roomId": "abc123", "accept": true }
```

Every inbound message must pass authentication, JSON schema validation, room membership checks, maximum-size limits and per-socket rate limits. Ignore duplicate/out-of-order `inputSeq` values.

### Server → Client

```jsonc
// 等待配對中
{ "type": "snake:matching" }

// 配對成功
{
  "type": "snake:matched",
  "playerNum": 1,
  "roomId": "abc123",
  "board": { "cols": 16, "rows": 17 }
}

// 使用 server absolute time，兩端顯示同一倒數；不要各自猜 3.2 秒。
{ "type": "snake:countdown", "startsAt": 1789792015200 }

// 開局、重連、週期校正與 resync 的完整狀態
{
  "type": "snake:snapshot",
  "reason": "game_start",
  "roomId": "abc123",
  "tick": 0,
  "serverTime": 1789792015200,
  "board": { "cols": 16, "rows": 17 },
  "snakes": {
    "1": {
      "body": [{"x":3,"y":8},{"x":2,"y":8},{"x":1,"y":8}],
      "direction": "RIGHT", "alive": true, "score": 0, "inputAck": 0
    },
    "2": {
      "body": [{"x":12,"y":8},{"x":13,"y":8},{"x":14,"y":8}],
      "direction": "LEFT", "alive": true, "score": 0, "inputAck": 0
    }
  },
  "foods": [{"id":"food_1","x":8,"y":4,"foodType":"normal","value":1}],
  "scores": { "1": 0, "2": 0 }
}

// 遊戲 tick（核心 — 每 150ms 一次）
{
  "type": "snake:tick",
  "tick": 42,
  "serverTime": 1789792021500,
  "nextTickAt": 1789792021650,
  "events": [
    { "type": "move", "player": 1, "head": {"x":10,"y":5}, "removeTail": {"x":7,"y":5} },
    { "type": "move", "player": 2, "head": {"x":15,"y":12}, "removeTail": {"x":18,"y":12} },
    { "type": "eat", "player": 1, "pos": {"x":10,"y":5}, "foodType": "normal" }
  ],
  "foods": [{"id":"food_2","x":3,"y":7,"foodType":"normal","value":1}],
  "scores": { "1": 5, "2": 3 },
  "inputAck": { "1": 18, "2": 14 }
}

// 死亡
{
  "type": "snake:tick",
  "tick": 43,
  "events": [
    { "type": "death", "player": 2, "head": {"x":0,"y":12} }
  ]
}

// 遊戲結束
{
  "type": "snake:game_over",
  "state": "GAME_OVER",
  "winner": 1,
  "reason": "collision",
  "scores": { "1": 12, "2": 8 },
  "lengths": { "1": 15, "2": 11 }
}

// 同 tick 雙方死亡一律 draw
{
  "type": "snake:game_over",
  "winner": 0,
  "reason": "simultaneous_death"
}

// 短暫斷線與恢復
{ "type": "snake:reconnecting", "playerNum": 2, "graceMs": 3000 }
{ "type": "snake:reconnected", "playerNum": 2 }

// 穩定錯誤 envelope
{
  "type": "snake:error",
  "code": "INVALID_INPUT",
  "message": "Direction input was rejected.",
  "retryable": false
}
```

### 頻寬估算

- 每個 tick 訊息約 200-400 bytes JSON。
- 150ms/tick = 6.67 msg/s。
- Snapshot 約 1–3 KB，開局、重連、要求 resync 及每 10 ticks 週期校正。
- **約 2–5 KB/s** 是 Game Server ↔ Cloud Chromium 的應用協議估算，不包含 Cloud Phone 畫面串流；Demo 不得把它描述成實體手機的全部 data usage。

---

## 8. Keypad 操控

### 遊戲中

| 按鍵 | 動作 |
|---|---|
| ↑ ↓ ← → | 改變蛇的方向（即時送 WS） |
| Enter | Solo：暫停；PvP：無作用 |
| SOFT_L | PvP：開啟退出確認，不得立即中止 |
| SOFT_R / BACK | PvP 遊戲中忽略，避免誤觸 |

### 選單中

| 按鍵 | 動作 |
|---|---|
| ↑ ↓ | 切換選項 |
| Enter / NUM_1-9 | 選擇 |
| SOFT_R / BACK | 返回 |

### 重要：方向鍵輸入佇列

- Client 每次按鍵都送遞增 `inputSeq`，Server 回傳 `inputAck`。
- 每位玩家最多保留兩個合法未消耗方向；每 tick 最多消耗一個。
- 驗證方向時以 queue 最後一個 projected direction 為準，不只看當前方向。
- 禁止 180 度轉、重複方向、過期序號與超量輸入。
- Client 可顯示短暫按鍵回饋，但不可自行決定 authoritative direction。

---

## 9. 畫面逐頁 Spec

### 9.1 Lobby（主選單）

```
┌────────────────────────┐
│    🐍 CLOUD ARENA      │
│                        │
│    ┌──────────────┐    │
│    │  蛇在此動畫   │    │  ← 兩條蛇交叉動畫 (裝飾)
│    └──────────────┘    │
│                        │
│  1  🎮 Single Player   │  ← focusable
│  2  ⚔️  PvP Battle     │  ← focusable
│  3  🏆 Leaderboard     │  ← focusable
│                        │
│ Menu    Select    Back │
└────────────────────────┘
```

- 背景：深色 + 兩條小蛇在畫面頂部做裝飾性移動動畫（純 Client 端，無邏輯）。
- Enter / NUM_1 → 單人模式。
- Enter / NUM_2 → 送 `snake:join`，進入 MATCHING。

### 9.2 Matching（等待配對）

```
┌────────────────────────┐
│     FINDING OPPONENT   │
│                        │
│         ⏳              │  ← 旋轉動畫
│                        │
│   Searching for a      │
│   worthy opponent...   │
│                        │
│        [12s]           │  ← 等待時間
│                        │
│ Cancel               │
└────────────────────────┘
```

- 等待動畫：三個點循環 `...` 或旋轉蛇 emoji。
- SOFT_L = Cancel → 送 `snake:cancel`，回 Lobby。
- 收到 `snake:matched` 後等待 `snake:countdown`，再以 `startsAt` 對齊 COUNTDOWN。

### 9.3 Countdown

```
┌────────────────────────┐
│  P1 🟢          🔴 P2  │
│                        │
│                        │
│           3            │  ← 大字，帶 scale 動畫
│                        │
│                        │
│     GET READY!         │
└────────────────────────┘
```

- 根據 Server `startsAt` 與校正後 server time 顯示 3 → 2 → 1 → GO；不得由兩端各自啟動獨立 3.2 秒 timer。
- 數字帶 scale-in-out 動畫（從 2x 縮到 1x，ease-out）。
- GO! 閃爍金色。
- 此時兩條蛇已就位（可見），不可操作。

### 9.4 Playing（遊戲進行中）

- 見 §6 完整渲染規格。
- Canvas 佔滿 content area。
- HUD 用 Canvas 繪製（不是 DOM，避免 z-index 問題）。

### 9.5 Game Over

```
┌────────────────────────┐
│                        │
│    🎉 YOU WIN! 🎉      │  ← 金色，帶撒花粒子
│    (or: YOU LOSE 💀)   │  ← 紅色，畫面灰階
│                        │
│    Score: 12           │
│    Length: 15          │
│    Time: 2:34          │
│                        │
│    Opponent: 8 (len 11)│
│                        │
│  1  Rematch            │  ← focusable
│  2  Back to Menu       │  ← focusable
│                        │
│ Menu    Select         │
└────────────────────────┘
```

- 勝利：P0 使用金色文字與少量靜態裝飾；confetti 只有真機測試穩定後才開啟。
- 落敗：紅色文字 + Canvas 加灰階 filter（`ctx.filter = 'grayscale(0.7)'`）。
- 平手：「DRAW! 🤝」白色文字。
- 顯示 3 秒後出現選項。

---

## 10. 單人模式

- 無需 WebSocket / 配對。
- **遊戲邏輯跑在 Client 端**（不需要 server-authoritative，因為沒有對手）。
- 抽出共用的純函數規則與 renderer；Solo 使用 client adapter，PvP 使用 server adapter。不要直接把含 Room/WebSocket 的 `GameEngine` 搬到 browser。
- 無碰撞對手，但可加牆壁障礙（Level 2+）。
- 單人最高分預設只記錄在 localStorage，標示 `Local best`。
- Competition P0 不把 client 自報的 Solo 分數放進可信全域排行榜或發放經濟價值積分。
- 死亡 → Game Over 畫面（顯示分數 + 歷史最高）。

### 單人難度遞增

| Level | TICK_MS | 障礙 | 食物 |
|---|---|---|---|
| 1 (Easy) | 200ms | 無牆 | 普通 |
| 2 (Medium) | 150ms | 4 面牆磚 | 普通 + 特殊 |
| 3 (Hard) | 120ms | 隨機牆磚 | 普通 + 特殊 + 毒食物(碰到縮短) |

---

## 11. 計分、結果可信度與留存指標

### PvP server-authoritative results

PvP 結束時由 Game Server 在同一 transaction 寫入 match、兩位玩家結果與排行榜統計。Client 只能讀取結果，不能提交 `won`、`score`、`length` 或 `pointsEarned`。

```text
Game Server
  → finalize authoritative state
  → insert snake_matches
  → insert snake_player_results × 2
  → update snake_leaderboard
  → commit
  → broadcast snake:game_over
```

If AgriLink points are added later, award them inside this server transaction with daily caps and idempotency. Do not award points merely for repeatedly opening/abandoning matches.

### Solo score policy

P0:

- Store local best on device/session only.
- No global leaderboard and no AgriLink points.

P2 options:

- Server-issued seed plus uploaded input replay, re-simulated by Server.
- Or run ranked Solo authoritatively on Server.

Never accept a bare client REST body claiming a high score.

### Leaderboard

```
GET /api/snake/leaderboard?mode=pvp&limit=10
→ {
  "entries": [
    { "rank": 1, "name": "Raj Kumar", "wins": 23, "score": 340 },
    { "rank": 2, "name": "Demo Farmer", "wins": 18, "score": 280 },
    ...
  ]
}
```

### Carrier/business validation

Do not claim that three daily games automatically increase ARPU or reduce churn. Treat this as a measurable hypothesis. Suggested metrics:

- Match completion rate.
- Median match duration.
- D1/D7 return rate for players.
- Matches per active player.
- Rematch rate.
- Cloud Phone streamed MB per completed match, measured by the platform when available.
- Game-related session retention compared with non-game users, only after a valid experiment.

---

## 12. 音效與觸覺回饋

Cloud Phone 的音效支援取決於裝置。**不要依賴音效作為核心反饋。**

- 如果 `AudioContext` 可用，用極短的合成音效（不載入音檔）：
  - 吃食物：短促高音 beep (100ms, 880Hz)
  - 死亡：低沉 buzz (200ms, 220Hz)
  - 倒數：中音 tick (50ms, 440Hz)
- 包在 `try-catch` 中。失敗 → 靜默，遊戲照跑。
- **不載入任何外部音檔**（省頻寬、避免 CSP 問題）。

---

## 13. 雙解析度適配

Game rules always use a 16×17 canonical board. Client detection returns rendering values only:

```js
function detectLayout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w <= 160 || h <= 180) {
    return { cell: 8, cols: 16, rows: 17, originX: 0, originY: 12, width: 128, height: 160 };
  }
  return { cell: 14, cols: 16, rows: 17, originX: 8, originY: 42, width: 240, height: 320 };
}
```

`cols/rows` must match the server snapshot and may not be replaced by device-specific values. At 128×160:

- 字級縮小到 9px。
- 粒子最多 3 個並停用背景粒子、confetti 與大面積 shadow blur。
- 眼睛簡化為 1px 白點。
- HUD 使用 12px 半透明 overlay，不另占棋盤邏輯空間。

---

## 14. 檔案結構

```
frontend/js/screens/snake/
├── snakeLobby.js          # 主選單畫面
├── snakeGame.js           # 遊戲畫面（含 Canvas）
├── snakeRenderer.js       # Canvas 渲染引擎（蛇、食物、粒子、HUD）
├── snakeClientEngine.js   # 單人模式 client-side 遊戲邏輯
├── snakeParticles.js      # 粒子系統
└── snakeUtils.js          # 顏色插值、圓角矩形、星形繪製等 helper

shared/snake/
├── snakeRules.js          # 純規則、碰撞與 canonical board constants
├── snakeProtocol.js       # message schema/version constants
└── seededRng.js           # authoritative deterministic RNG

backend/ws/
├── snakeHub.js            # auth、rate limit、message routing
├── snakeRoomManager.js    # queue、room lifecycle、reconnect、cleanup
└── snakeGameEngine.js     # authoritative tick、snapshot、result
```

### 與現有 AgriLink 整合

- `mainMenu.js` 加一個選項 `6 🐍 Arena`，data-screen = `SnakeLobby`。
- `main.js` 新增 `router.register('SnakeLobby', snakeLobby)` 和 `router.register('SnakeGame', snakeGame)`。
- `server.js` 的 WS handler 加 `snake:*` 事件分流到 `snakeHub.js`。

---

## 15. API / 路由

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/snake/matches/:id` | 讀取自己參與的 authoritative match result |
| GET | `/api/snake/leaderboard` | 排行榜 |
| GET | `/api/snake/stats` | 個人戰績（勝/負/最高分） |

There is no public `POST /api/snake/result` for PvP. Game Server persists results internally. If an unranked Solo telemetry endpoint is later added, it must not modify trusted rankings or points.

WebSocket 事件：見 §7。

---

## 16. 資料模型

```sql
CREATE TABLE IF NOT EXISTS snake_matches (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK(mode IN ('pvp_ranked','pvp_unranked')),
  seed TEXT NOT NULL,
  protocol_version INTEGER NOT NULL,
  tick_ms INTEGER NOT NULL,
  final_tick INTEGER NOT NULL,
  winner_user_id TEXT,
  end_reason TEXT NOT NULL CHECK(end_reason IN ('collision','simultaneous_death','disconnect_forfeit','no_contest')),
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS snake_player_results (
  match_id TEXT NOT NULL REFERENCES snake_matches(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  player_num INTEGER NOT NULL CHECK(player_num IN (1,2)),
  score INTEGER NOT NULL CHECK(score >= 0),
  final_length INTEGER NOT NULL CHECK(final_length >= 0),
  outcome TEXT NOT NULL CHECK(outcome IN ('win','loss','draw','no_contest')),
  disconnected INTEGER NOT NULL DEFAULT 0 CHECK(disconnected IN (0,1)),
  PRIMARY KEY (match_id, user_id),
  UNIQUE (match_id, player_num)
);

CREATE TABLE IF NOT EXISTS snake_leaderboard (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  pvp_wins INTEGER DEFAULT 0,
  pvp_losses INTEGER DEFAULT 0,
  pvp_draws INTEGER DEFAULT 0,
  best_score INTEGER DEFAULT 0,
  best_length INTEGER DEFAULT 0,
  total_games INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snake_match_events (
  match_id TEXT NOT NULL REFERENCES snake_matches(id),
  tick INTEGER NOT NULL,
  event_index INTEGER NOT NULL,
  event_json TEXT NOT NULL,
  PRIMARY KEY (match_id, tick, event_index)
);
```

`snake_match_events` may be retained only for demo/debug windows and pruned later. Do not store unnecessary long-lived identity or raw network metadata.

---

## 17. 開發任務拆解

### Phase 1: Shared rules + 單人可玩（3–4 小時）

- [ ] `snakeRenderer.js`：Canvas 初始化 + 背景/網格 + 蛇繪製（含眼睛、漸層）+ 食物（含 glow）+ HUD
- [ ] `shared/snake/snakeRules.js`：canonical board、two-phase collision、seeded RNG tests
- [ ] `snakeClientEngine.js`：單人 adapter（tick loop、碰撞、食物生成、local score）
- [ ] `snakeGame.js`：畫面殼（Canvas mount + keypad 綁定 + 狀態切換 Countdown/Playing/GameOver）
- [ ] `snakeLobby.js`：選單（Single / PvP / Leaderboard）
- [ ] 整合進 AgriLink router

**此時可交付**：單人貪食蛇，好看、全 keypad 操控、有動畫特效。

### Phase 2: 正確的多人核心（5–7 小時）

- [ ] `snakeHub.js`：authenticated WS routing、schema validation、rate limit、heartbeat
- [ ] RoomManager：queue dedupe、self-match prevention、TTL、cleanup
- [ ] Server GameEngine：two-phase tick、seed、snapshot/delta、authoritative result
- [ ] Client sync：tick gap detection、resync、timestamp interpolation、input sequence/ack
- [ ] Reconnect grace 3 秒 + snapshot recovery
- [ ] QVGA 雙瀏覽器端到端對戰

**此時可交付**：兩支手機即時對戰。

### Phase 3: 真機與雙解析度打磨（3–4 小時）

- [ ] 128×160 使用相同 16×17 logical board
- [ ] 兩支真機 key mapping、screen stream latency 與 reconnect 測試
- [ ] 排行榜畫面
- [ ] Server-only result persistence
- [ ] 視覺效果 budget 與降級策略
- [ ] 音效（最後才做，可選）

總估時約 11–15 個工程小時，不把排行榜、音效、積分或特殊食物排在多人同步正確性之前。

---

## 18. 驗收標準

### 單人

- [ ] 方向鍵控制蛇移動，反應即時
- [ ] 蛇有漸層色 + 眼睛（朝移動方向）
- [ ] 食物有 glow 脈動動畫
- [ ] 吃食物有粒子爆炸 + 分數飄字
- [ ] 撞牆/撞自己 → 死亡動畫 → Game Over
- [ ] 倒數 3-2-1-GO 有縮放動畫
- [ ] HUD 顯示分數、時間
- [ ] 全程 keypad 操控，零觸控

### 多人

- [ ] 兩個瀏覽器/裝置可配對成功
- [ ] 兩條蛇在同一地圖即時移動
- [ ] 撞對方的身體 = 死亡
- [ ] 同格 head-on → 雙方同 tick 死亡並顯示 DRAW
- [ ] head swap → 雙方同 tick 死亡並顯示 DRAW
- [ ] 移入本 tick 正常離開的尾格不誤判；尾巴不離開時正確判定碰撞
- [ ] 雙方同時接近同一食物時結果不受 object iteration order 影響
- [ ] 快速 `UP → LEFT` 的兩個合法轉彎不會因 last-input overwrite 消失
- [ ] 重複、過期、非法反向與過量 input 被 Server 拒絕或忽略
- [ ] Client 發現 tick gap 會停止套用 delta、要求 resync 並以 snapshot 恢復
- [ ] 對手短暫斷線顯示 reconnecting；3 秒內恢復後送 snapshot 繼續
- [ ] 對手超過 grace period → authoritative disconnect forfeit 或 no contest
- [ ] 遊戲結束顯示雙方分數
- [ ] PvP 結果由 Server 寫入；偽造 REST score 不影響排行榜
- [ ] Rematch 必須雙方同意並使用新 match ID／seed
- [ ] Finished room 在 TTL 後從所有 maps 清除
- [ ] **兩支 itel NEO R60+ 桌上即時對戰 —— 這是全場高潮**

### Network and security

- [ ] WS upgrade 使用短期 authenticated session 並驗證 Origin
- [ ] 每個 user 最多一個 queue entry 與一個 active room
- [ ] 同一 user 的兩個 session 不會互相配對
- [ ] Dead socket 不會被配對
- [ ] Oversized／invalid JSON／unknown event 不會讓 process crash
- [ ] Input rate limit 生效且正常快速按鍵仍可玩
- [ ] Snapshot 能在任意 tick 重建兩端相同的 board hash
- [ ] 固定 seed＋固定 input log 重播 1,000 次得到相同 final state

### Required automated collision cases

```text
wall collision
self body collision
own vacating tail allowed
own non-vacating tail blocked
opponent body collision
opponent vacating tail allowed
same-cell head-on draw
head-swap draw
simultaneous independent deaths draw
food growth 1 and growth 3
full board food spawn returns safely
iteration order P1/P2 swap produces identical result
```

### 視覺

- [ ] 深色科技風背景 + 淡網格
- [ ] 蛇身漸層流暢
- [ ] 食物 glow 可見
- [ ] 粒子效果不影響幀率（目標 ≥30 FPS 渲染）
- [ ] 240×320 和 128×160 使用相同 logical board 皆可玩
- [ ] 在 128×160 上食物、兩條蛇、分數與 reconnect overlay 均可辨識
- [ ] 真機畫面串流下沒有因過量 glow、confetti 或背景粒子而明顯糊化

---

## 19. Demo 腳本

> **60 秒。在 AgriLink 主 demo 完成後，作為 encore 彩蛋。**

**設置**：兩支 itel NEO R60+ 已開在 AgriLink 主選單。

1. **（10s）**「AgriLink 還有一個留存引擎。」按 6 進入 CloudArena。
2. **（5s）** 兩支手機都選 PvP Battle。畫面顯示 "FINDING OPPONENT..."
3. **（3s）** 配對成功 → 3-2-1-GO! 倒數。
4. **（30s）** **遞一支給評審，你操作另一支。當場對戰。** 評審按方向鍵控制蛇，吃食物、互相追。評審手上的蛇吃到食物時，粒子爆開、分數飄字。
5. **（5s）** 有一方死亡 → 死亡動畫 → 結果畫面。
6. **（7s）**「這不是說功能機以前不能跑 Snake；差別是現在不需安裝原生遊戲，就能在 Cloud Phone 上取得跨裝置、統一更新、伺服器判定的即時多人 Web 體驗。」

> **評審親手體驗即時對戰的觸覺衝擊，是任何 slide 或影片都比不上的。**

Business follow-up line, only if asked:

> “We treat engagement as a hypothesis, not a promise. A carrier pilot would measure completion, rematch, D1/D7 return and streamed megabytes per completed match before claiming ARPU or churn impact.”

### Demo safety gate

- 兩支真機已登入不同測試帳號並停在 Lobby，不依賴現場重新輸入帳密。
- 使用獨立 demo matchmaking pool，避免被陌生測試 session 配走。
- Demo reset endpoint/script 能清 queue、room 與測試排行榜，但必須受管理者權限保護。
- 上台前連續完成 10 次腳本，其中至少 3 次使用真機。
- 若 PvP 現場失敗，明確切換為 Server-seeded Daily Run 或預錄備援；不得把錄影稱為 live。
- 不保證哪位玩家在 30 秒內自然死亡；準備受控 demo arena／縮小安全區或主持人主動撞牆，且規則對雙方一致。

---

## 附錄：Helper 函數

```js
// 顏色插值（hex）
function lerpColor(a, b, t) {
  const ah = parseInt(a.replace('#', ''), 16);
  const bh = parseInt(b.replace('#', ''), 16);
  const ar = (ah >> 16), ag = (ah >> 8 & 0xff), ab = (ah & 0xff);
  const br = (bh >> 16), bg = (bh >> 8 & 0xff), bb = (bh & 0xff);
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return `#${((rr << 16) | (rg << 8) | rb).toString(16).padStart(6, '0')}`;
}

// 圓角矩形
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

// 星形
function drawStar(ctx, cx, cy, spikes, outerR, innerR) {
  let rot = Math.PI / 2 * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerR);
  ctx.closePath();
  ctx.fill();
}
```

---

*文件版本 v1.1 · CloudArena Snake · fairness, sync and Cloud Phone architecture revision · dogbark-MeiChu*
