# Today’s Farm — Smart Farm Operations, Calendar & Workforce Dispatch

## Copy-paste implementation master prompt

> Build a complete `Today’s Farm` module inside the existing `dogbark-MeiChu/dogbark` repository. It is a feature-phone farm operations system: daily priorities, advanced calendar, crop-cycle planning, recurring work orders, weather-aware warnings, worker assignment, execution tracking, and structured farm records.
>
> It must be fully operable at 240×320 using a directional keypad, Enter, left/right softkeys, `0–9`, `*`, and `#`. It must also remain usable at 128×160.
>
> Do not reduce this to a checklist mockup. Implement real persistence, scheduling, permissions, task generation, assignment, completion records, and calendar APIs.

---

## 1. Role and implementation rules

Act as a senior product engineer building a production-shaped farm operations product.

Before editing:

1. Inspect the repository and preserve its Vanilla JS + ES modules + Express architecture.
2. Reuse the existing router, focus system, keypad dispatcher, API layer, Weather module, authentication/session system, and SQLite connection if they exist.
3. If Farmer Circle authentication has already been implemented, reuse its `users`, sessions, Farm ID, and cookie. Do not create a second account system.
4. If authentication has not been implemented yet, isolate authorization behind middleware compatible with the Farmer Circle Master Prompt.
5. Do not migrate the application to React, Vue, TypeScript, or a large calendar library.
6. Do not break Weather, Farmer Circle, Ask AI, or browser-history behavior.

Implementation standards:

- Real backend persistence with SQLite.
- Server-authoritative permissions and task state transitions.
- Deterministic scheduling; no LLM is required.
- Weather information may affect warnings and recommended rescheduling but must not silently perform unsafe agronomic decisions.
- Every async screen requires loading, empty, error, stale-data, and retry states.
- User text is rendered with `textContent`, never unsafe HTML.
- Dates are stored in UTC, with a farm timezone used for calendar grouping.
- Complete P0/P1 flows; do not stop after scaffolding.

After implementation:

- Run automated tests.
- Start the server and verify the seeded demo.
- Report changed files, commands, test output, migrations, seed accounts, and device-dependent behavior.

---

## 2. Product definition

### Positioning

> Today’s Farm turns crop plans, weather, people, and field records into a clear daily operating plan that can be run from a keypad phone.

### Core loop

```text
Plan → Schedule → Assign → Accept → Execute → Record → Review → Adjust
```

### What makes it “smart”

Smart does not mean a chatbot. This module is smart because it combines:

- Farm and field profile.
- Crop planting date and growth stage.
- Crop-calendar templates.
- Recurring schedules.
- Task dependencies.
- Weather conditions and forecast warnings.
- Previous completion records.
- Worker availability and workload.
- Inventory/input availability when implemented.

The result is a prioritized operational plan rather than a generic to-do list.

### Main users

| Role | Typical user | Main abilities |
|---|---|---|
| Owner | Farm owner / smallholder | Full farm access, members, fields, plans, reports |
| Manager | Family lead / supervisor | Create, schedule, assign, reschedule, verify work |
| Worker | Family member / worker | View own tasks, accept, start, complete, report issue |
| Viewer | Agronomist / partner | Read calendar and records; no operational changes |

One user may own a farm and work on another farm. Permissions are scoped per farm membership.

---

## 3. Scope and priorities

### P0 — must be complete

1. Farm profile and timezone.
2. At least two fields/plots per seeded farm.
3. Crop cycles with crop, planting date, target harvest date, and stage.
4. Today dashboard with alerts, overdue tasks, due tasks, assigned tasks, and completion progress.
5. Upcoming seven-day agenda.
6. Month calendar with keypad navigation.
7. Task creation and editing.
8. Recurring tasks.
9. Task priorities, statuses, time windows, dependencies, and field association.
10. Structured completion results and farm records.
11. Reuse authenticated users.
12. Owner/manager/worker/viewer permissions.
13. Assign tasks to one or more members.
14. Worker accept/start/complete/problem-report flow.
15. Manager reassign, delay, cancel, and verify flow.
16. Weather warnings using the existing Weather service.
17. Seeded farm, team, crop cycle, calendar, tasks, and historical records.
18. Full keypad operation at 240×320 and usable 128×160 mode.

### P1 — high-value additions

1. Week workload view by worker.
2. Month summary with task-density indicators.
3. Crop timeline view from planting to harvest.
4. Checklist steps inside work orders.
5. Input quantities and cost records.
6. Work duration and labor-hour records.
7. Optional completion photo.
8. Notifications for assignment, due soon, overdue, reschedule, and completion.
9. Calendar conflict detection.
10. Worker availability and leave/unavailable dates.
11. Task templates and quick-create presets.

### P2 — after stability

1. Input inventory and low-stock blocking.
2. Equipment availability and maintenance scheduling.
3. CSV export or printable report.
4. WebSocket real-time dispatch updates.
5. Long-polling fallback.
6. Offline action queue with idempotency.

### Non-goals

- No autonomous pesticide/fertilizer prescription.
- No automatic task completion from unverified sensors.
- No payroll.
- No GPS employee surveillance.
- No complex enterprise accounting.
- No satellite NDVI requirement.
- No AI-generated tasks unless added later as an explicitly labelled suggestion layer.
- No points for spraying, fertilizing, or irrigation completion.

---

## 4. Main navigation

Change the main-menu item from `Daily Tasks` to:

```text
5  Today's Farm
```

Inside Today’s Farm:

```text
1 Today
2 Calendar
3 Upcoming
4 My Tasks
5 Records
6 Team
7 Fields & Crops
8 Templates
```

At 128×160, show five primary entries first and put Team, Fields, and Templates under `More`.

Recommended screen modules:

```text
FarmSetup
FarmSwitcher
TodayDashboard
AlertDetail
TodayTaskList
TaskDetail
TaskCreateWizard
TaskEditWizard
TaskChecklist
TaskCompleteWizard
TaskProblemReport
CalendarMenu
CalendarMonth
CalendarWeek
CalendarAgenda
CalendarDay
CropTimeline
UpcomingAgenda
MyTasks
FarmRecords
RecordDetail
TeamList
TeamMemberDetail
TeamInvite
TeamWorkload
FieldList
FieldDetail
CropCycleList
CropCycleDetail
TaskTemplateList
TaskTemplateEditor
NotificationList
```

---

## 5. Today dashboard

Today must answer four questions immediately:

1. Is there anything dangerous or weather-sensitive?
2. What is overdue?
3. What must be done today?
4. Who is responsible and what is already complete?

### 240×320 layout

```text
┌────────────────────────┐
│ TODAY'S FARM      2 / 5│
│ Green Field · 19 Sep   │
├────────────────────────┤
│ ⚠ Rain 15:00 · 70%     │
│ Spray task at risk     │
├────────────────────────┤
│ ! OVERDUE              │
│ Inspect pump · Field B │
│ Ravi · 1 day late      │
├────────────────────────┤
│ □ Check leaf spots     │
│ Field A · Meena · 09:00│
├────────────────────────┤
│ ▶ Irrigate north plot  │
│ In progress · Arjun    │
├────────────────────────┤
│ Add       Open     Back│
└────────────────────────┘
```

### 128×160 layout

```text
┌──────────────┐
│ TODAY   2/5  │
│⚠ Rain 15:00 │
├──────────────┤
│! Pump check │
│  Ravi · late│
├──────────────┤
│□ Leaf spots │
│  Meena 09:00│
├──────────────┤
│Add Open Back│
└──────────────┘
```

### Today sections

Order:

1. Safety/weather alerts.
2. Blocked tasks.
3. Overdue tasks.
4. In-progress tasks.
5. Due today.
6. Unassigned tasks.
7. Completed today, collapsed by default.

Do not show more than one alert card at a time; show `+2 more alerts` when needed.

### Progress

Progress is operational, not gamified:

```text
2 / 5 complete
1 in progress
1 blocked
1 not started
```

Never treat blocked/cancelled work as completed.

---

## 6. Task model

### Task types

```text
inspection
irrigation
fertilizer
spraying
weeding
planting
harvest
machinery
livestock
transport
market
record
custom
```

### Priority

```text
low
normal
high
urgent
```

### Status lifecycle

```text
draft
scheduled
assigned
accepted
in_progress
completed
verified
skipped
delayed
blocked
cancelled
```

Allowed transitions must be validated server-side.

```text
draft → scheduled
scheduled → assigned | cancelled
assigned → accepted | delayed | cancelled
accepted → in_progress | delayed
in_progress → completed | blocked | delayed
completed → verified | in_progress
blocked → assigned | scheduled | cancelled
delayed → scheduled | assigned | cancelled
```

Owner/manager may complete an unassigned personal task directly, but the action must still create an audit event.

### Required fields

- Farm.
- Title.
- Type.
- Priority.
- Start date/time.
- Due date/time.
- Farm timezone.
- Status.

### Optional fields

- Field/plot.
- Crop cycle.
- Description.
- Assigned member(s).
- Estimated duration.
- Recurrence rule.
- Dependency tasks.
- Checklist.
- Weather constraints.
- Input requirements.
- Equipment requirement.
- Verification required.
- Reminder offsets.
- Completion schema.

---

## 7. Task detail screen

```text
┌────────────────────────┐
│ HIGH · INSPECTION      │
├────────────────────────┤
│ Check rice leaf spots  │
│ Field A · Rice Day 42  │
│ Due 10:00–12:00        │
│ Assigned: Meena        │
│                        │
│ Checklist        1 / 3 │
│ ✓ Check lower leaves   │
│ □ Check leaf underside │
│ □ Record spread level  │
│                        │
│ Weather: Rain after 3pm│
├────────────────────────┤
│ Start     Update   Back│
└────────────────────────┘
```

Show only relevant actions for the current role/status.

Worker actions:

- Accept.
- Start.
- Complete.
- Report problem.
- Request delay.

Manager actions:

- Edit.
- Assign/reassign.
- Reschedule.
- Block/unblock.
- Cancel.
- Verify completion.

---

## 8. Complex calendar

Implement a real calendar, but adapt it to the device rather than copying a desktop calendar.

### Calendar views

```text
1 Agenda
2 Week
3 Month
4 Crop Timeline
5 Team Workload
```

### Month view at 240×320

```text
┌────────────────────────┐
│ SEPTEMBER 2026         │
│ Su Mo Tu We Th Fr Sa   │
├────────────────────────┤
│       1  2  3  4  5   │
│  6  7  8  9 10 11 12  │
│ 13 14 15 16 17 18[19] │
│ 20 21 22 23 24 25 26  │
│ 27 28 29 30           │
│                        │
│ 19 Sep · 5 tasks       │
│ ●●● 2 due · 1 blocked │
├────────────────────────┤
│ View      Day      Back│
└────────────────────────┘
```

Calendar indicators:

- One dot: 1–2 tasks.
- Two dots: 3–4 tasks.
- Three dots: 5+ tasks.
- `!` urgent/overdue.
- `×` blocked.
- `✓` all scheduled work completed.

Do not attempt to render task titles in the month grid.

Month keypad behavior:

| Key | Action |
|---|---|
| Left / Right | Previous/next day |
| Up / Down | Previous/next week |
| Enter | Open selected day agenda |
| `2` / `8` | Previous/next month shortcut |
| `5` | Jump to today |
| `1` | Agenda view |
| `3` | Week view |
| `#` | Calendar filters |
| `*` | Add task on selected day |

### Week view

Do not use seven thin columns. Use a vertical seven-day workload list:

```text
MON 21   4 tasks · 6h
  ! Spray · blocked
  □ Inspect weeds

TUE 22   2 tasks · 3h
  □ Pump service

WED 23   No tasks
```

Left/right moves weeks. Up/down moves days/tasks. Enter opens a day or task.

### Agenda view

Agenda supports any date range and is the fallback view at 128×160.

```text
TODAY · 19 SEP
09:00  Inspect leaves
14:00  Irrigate Field B

TOMORROW · 20 SEP
08:00  Check pump

22 SEP
All day  Fertilizer reminder
```

### Crop timeline

Shows crop-cycle milestones rather than clock appointments:

```text
Rice · Field A
Planted 8 Aug

✓ Day 1   Planting
✓ Day 14  Weed check
● Day 42  Leaf inspection
○ Day 50  Fertilizer review
○ Day 90  Harvest prep
```

### Calendar filters

- Field.
- Crop cycle.
- Task type.
- Status.
- Priority.
- Assignee.
- My tasks only.
- Include/exclude completed.

Filters persist per user and farm.

### Timezone and dates

- Store instants in UTC.
- Store farm IANA timezone, e.g. `Asia/Kolkata`.
- Date-only tasks must remain date-only and not shift across timezone conversion.
- “Today” is calculated in the farm timezone.
- Relative labels use farm time.
- Handle daylight-saving time for farms in applicable regions.

---

## 9. Upcoming view

Upcoming defaults to seven days but allows:

```text
1 Next 7 days
2 Next 30 days
3 Overdue
4 Unassigned
5 Weather-sensitive
```

### 240×320

```text
┌────────────────────────┐
│ UPCOMING · 7 DAYS      │
├────────────────────────┤
│ TOMORROW               │
│ □ Inspect weeds        │
│ Field A · Meena        │
│                        │
│ 22 SEP                 │
│ □ Check pump           │
│ Field B · Ravi         │
│                        │
│ 25 SEP                 │
│ ⚠ Fertilizer reminder  │
│ Unassigned             │
├────────────────────────┤
│ Add       Open     Back│
└────────────────────────┘
```

Group by local farm date. Within a day sort urgent, blocked, high priority, then start time.

---

## 10. Recurrence engine

Support recurring work without importing a full calendar framework.

### Required recurrence patterns

```text
Once
Daily
Every N days
Weekly on selected weekdays
Every N weeks
Monthly on day N
Crop-stage relative
```

Examples:

```text
Inspect irrigation pump every 7 days
Check livestock water daily at 07:00
Scout leaves every 3 days until harvest
Prepare harvest 10 days before target harvest
```

Store a constrained recurrence rule rather than arbitrary cron:

```json
{
  "frequency": "weekly",
  "interval": 1,
  "weekdays": [1, 4],
  "until": "2026-12-31",
  "maxOccurrences": null
}
```

Rules:

- Generate occurrences within a rolling horizon, e.g. 60 days.
- Each occurrence is a real task row with stable ID.
- Editing “this task” changes one occurrence.
- Editing “this and future” updates the series and regenerates future unstarted occurrences.
- Completed/in-progress/history rows must never be rewritten.
- Deleting a series cancels future tasks, not past records.
- Use idempotent generation to avoid duplicates.

---

## 11. Crop-calendar task generation

### Farm setup

Collect:

- Farm name.
- Country/region.
- IANA timezone.
- Fields/plots.
- Primary crop(s).
- Planting date.
- Target harvest date when known.
- Irrigation type.

### Crop templates

Store editable templates as data, not code.

Example rice template:

```json
{
  "crop": "rice",
  "version": 1,
  "milestones": [
    {
      "offsetDays": 0,
      "title": "Record planting",
      "type": "record",
      "priority": "normal"
    },
    {
      "offsetDays": 7,
      "title": "Check establishment",
      "type": "inspection",
      "completionSchema": "establishment_check"
    },
    {
      "offsetDays": 14,
      "title": "Inspect weeds",
      "type": "inspection",
      "completionSchema": "weed_check"
    },
    {
      "offsetDays": 30,
      "title": "Check leaf condition",
      "type": "inspection",
      "completionSchema": "leaf_check"
    },
    {
      "offsetDays": 45,
      "title": "Scout for pest signs",
      "type": "inspection",
      "completionSchema": "pest_check"
    }
  ]
}
```

Safety requirements:

- Templates are general workflow defaults, not universal agronomic prescriptions.
- Do not generate chemical names, dosages, or mandatory applications.
- Owner/manager reviews generated tasks before activation.
- Store template version on generated tasks.
- Changing template version does not silently rewrite active crop cycles.

---

## 12. Weather-aware operations

Reuse the existing Weather backend. Use **Open-Meteo as the default weather provider** for the hackathon build. Do not call Open-Meteo directly from the widget or from every screen.

### Required provider: Open-Meteo

Open-Meteo is the preferred competition provider because it supports global forecasts and does not require an API key for the intended non-commercial demo usage. Keep the provider behind a server adapter so it can be replaced later without changing widget screens.

Default upstream endpoint:

```text
GET https://api.open-meteo.com/v1/forecast
```

Required query parameters:

```text
latitude={farm.latitude}
longitude={farm.longitude}
current=temperature_2m,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m
hourly=temperature_2m,precipitation_probability,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m
daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max
forecast_days=7
timezone=auto
```

Example upstream request:

```http
GET https://api.open-meteo.com/v1/forecast?latitude=25.033&longitude=121.565&current=temperature_2m,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max&forecast_days=7&timezone=auto
```

Do not hard-code Taiwan coordinates. Read latitude, longitude, and timezone from the selected farm. If coordinates are unavailable, ask the owner/manager to select a location or enter coordinates; do not silently guess.

### Server-side provider adapter

Create a provider boundary:

```text
Widget
  -> GET /api/farms/:farmId/weather
  -> weatherService.getFarmWeather(farmId)
  -> openMeteoProvider.getForecast(latitude, longitude, timezone)
  -> normalized weather response
```

Suggested files:

```text
backend/services/weatherService.js
backend/providers/openMeteoProvider.js
backend/repositories/weatherCacheRepository.js
backend/routes/weatherRoutes.js
```

The frontend must consume only the normalized AgriLink response. It must not depend on Open-Meteo field names.

Normalized response contract:

```json
{
  "farmId": "farm_demo_001",
  "provider": "open-meteo",
  "timezone": "Asia/Kolkata",
  "location": {
    "latitude": 25.5941,
    "longitude": 85.1376
  },
  "current": {
    "observedAt": "2026-09-19T09:00:00+05:30",
    "temperatureC": 31.2,
    "precipitationMm": 0,
    "weatherCode": 2,
    "windSpeedKph": 9.4,
    "windGustKph": 16.1
  },
  "hourly": [
    {
      "time": "2026-09-19T10:00:00+05:30",
      "temperatureC": 31.8,
      "rainProbability": 68,
      "precipitationMm": 1.2,
      "weatherCode": 61,
      "windSpeedKph": 11.3,
      "windGustKph": 19.6
    }
  ],
  "daily": [
    {
      "date": "2026-09-19",
      "temperatureMinC": 25.1,
      "temperatureMaxC": 33.4,
      "rainProbabilityMax": 78,
      "precipitationSumMm": 8.6,
      "weatherCode": 61,
      "windSpeedMaxKph": 18.2,
      "windGustMaxKph": 29.5
    }
  ],
  "fetchedAt": "2026-09-19T09:04:12+05:30",
  "source": "live",
  "stale": false
}
```

Validation rules:

- Clamp rain probability to `0..100`.
- Preserve `0` as a valid value; never treat it as missing.
- Convert missing upstream values to `null`, not zero.
- Store all upstream timestamps and the farm timezone.
- Reject invalid coordinates before making the upstream request.
- Treat unknown WMO weather codes as `unknown`; do not crash rendering.
- Use one shared mapping from WMO weather codes to compact labels/icons.

### Internal weather endpoint

```http
GET /api/farms/:farmId/weather?days=7&refresh=false
```

Behavior:

1. Authorize that the signed-in user belongs to the farm.
2. Return a fresh cached response if its age is within 15 minutes.
3. Otherwise call Open-Meteo with a 5-second timeout.
4. Normalize and persist a successful response.
5. If the upstream call fails, return the most recent cached response with `source: "cache"` and `stale: true`.
6. If neither live nor cached data exists, return a controlled `WEATHER_UNAVAILABLE` response. The rest of Today’s Farm must remain usable.

Success response:

```json
{
  "ok": true,
  "data": { "provider": "open-meteo", "source": "live", "stale": false }
}
```

No-data failure:

```json
{
  "ok": false,
  "error": {
    "code": "WEATHER_UNAVAILABLE",
    "message": "Weather is temporarily unavailable. Tasks are still available.",
    "retryable": true
  }
}
```

Never expose raw upstream errors or stack traces to the widget.

### Weather cache persistence

Add a cache table or equivalent repository:

```sql
CREATE TABLE weather_snapshots (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'open-meteo',
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  timezone TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (farm_id) REFERENCES farms(id)
);

CREATE INDEX idx_weather_snapshots_farm_fetched
  ON weather_snapshots (farm_id, fetched_at DESC);
```

Retention rules:

- Fresh-cache TTL: 15 minutes.
- Keep the latest successful snapshot for at least 48 hours as an offline fallback.
- Delete older redundant snapshots with a scheduled cleanup job.
- Do not make a separate Open-Meteo request for every task card.

### Demo and offline fallback

Seed one clearly labelled demo weather snapshot. Use it only when the app is running in demo mode and neither live nor cached data is available.

```text
DEMO WEATHER
Rain risk 78% · Wind 18 km/h
```

Never label seeded demo weather as live. During judging, display a compact source/status label in the weather detail screen:

```text
LIVE · Updated 4 min ago
CACHED · Updated 2 hr ago
DEMO DATA
```

The demo must continue working if Open-Meteo is temporarily unreachable.

### Weather data used

- Current condition.
- Rain probability.
- Expected rainfall.
- Temperature.
- Wind speed/gust when available.
- Severe-weather warning when available.
- Data timestamp and stale flag.

### Weather constraint model

Tasks may include configurable constraints:

```json
{
  "rainProbabilityMax": 40,
  "windSpeedMaxKph": 15,
  "temperatureMinC": 10,
  "temperatureMaxC": 34,
  "lookaheadHours": 6,
  "behavior": "warn"
}
```

Allowed behavior:

```text
inform
warn
require_manager_override
```

Default to `warn`. Never automatically cancel a farm operation solely because a generic rule matched.

### Warning example

```text
SPRAY TASK AT RISK
Rain probability: 70%
Window: next 6 hours

1 Keep schedule
2 Delay 1 day
3 Choose new time
4 Ask manager
```

Record the user’s choice and weather snapshot in the audit trail.

### Stale weather

If Weather API fails:

- Use last successful cached value when available.
- Label `WEATHER CACHED` with timestamp.
- Never present cached weather as current.
- Do not block completion based on stale weather.

---

## 13. Workforce and assignment

### Farm membership

Reuse authenticated users. A farm owner adds a member using Farm ID.

Invite flow:

1. Manager enters eight-digit Farm ID.
2. Server verifies account exists without exposing unnecessary profile details.
3. Manager selects farm role: Manager, Worker, Viewer.
4. Invitee receives in-app invitation.
5. Invitee accepts or declines.
6. Membership becomes active only after acceptance.

Do not let managers assign tasks to unrelated users without accepted membership.

### Assignment modes

- One assignee.
- Multiple assignees with shared completion.
- Multiple assignees with individual confirmation.
- Unassigned task.

For P0, implement one primary assignee plus optional helper list. Expand only if the data model remains clear.

### Assignment lifecycle

```text
Manager assigns
→ Worker notified
→ Worker accepts or requests reassignment
→ Worker starts
→ Worker completes / reports problem
→ Manager verifies if required
```

### Worker task inbox

`My Tasks` filters:

```text
1 Due today
2 Accepted
3 In progress
4 Needs action
5 Completed
```

### Workload view

```text
TEAM · WEEK 21–27 SEP

Ravi       6 tasks · 12h
Meena      5 tasks · 8h
Arjun      8 tasks · 18h !
Unassigned 3 tasks · 5h
```

Flag possible overload when estimated duration exceeds a configurable daily/weekly threshold. This is a planning warning, not payroll or performance scoring.

### Availability

Member may set:

- Normal working days.
- Available time window.
- Unavailable date.
- Leave period.

Assignment to unavailable members requires manager confirmation.

### Conflict detection

Warn when:

- Same member has overlapping tasks.
- Same equipment is allocated twice, P2.
- Field operation overlaps a blocking operation.
- Task depends on incomplete prerequisite.
- Required input is unavailable, P2.

Allow override by manager with a required reason.

---

## 14. Structured completion results

A task is not merely checked off. Completion captures what happened.

### Common completion fields

- Actual start.
- Actual finish.
- Completed by.
- Result code.
- Short note.
- Problem flag.
- Optional photo.
- Quantities/cost when applicable.
- Weather snapshot.
- Verification status.

### Inspection

```text
Result
1 Normal
2 Minor issue
3 Serious issue
4 Could not inspect
```

Optional structured observations:

```text
soil_moisture: dry | normal | wet | flooded
leaf_condition: normal | yellow | spots | curled | damaged
pest_level: none | low | medium | high | unknown
weed_level: none | low | medium | high
```

### Irrigation

```text
1 Completed
2 Partially completed
3 Not needed
4 Delayed
5 Equipment problem
```

Capture duration and optional water estimate.

### Fertilizer / spraying

Capture:

- Completed/partial/delayed.
- Product selected from farm inventory or plain label.
- Quantity and unit.
- Area covered.
- Operator.
- PPE checklist acknowledgement.
- Weather snapshot.

Do not recommend dosage. Record what the authorized user reports.

### Machinery

```text
1 Normal
2 Noise
3 Leak
4 Will not start
5 Service required
```

Problem result may create a linked follow-up maintenance task.

### Problem routing

After `Problem found`:

```text
WHAT NEXT?
1 Create follow-up task
2 Reassign to manager
3 Post to Farmer Circle
4 Ask AI
5 Record only
```

When opening Farmer Circle, prefill community/tag/title locally but require user confirmation. When opening Ask AI, pass only user-approved context.

---

## 15. Records

Records are an immutable operational history derived from task activity and explicit manual records.

### Records screen

```text
┌────────────────────────┐
│ FARM RECORDS           │
│ Field A · September    │
├────────────────────────┤
│ 19 Sep  Soil: Wet      │
│         Meena · 09:14  │
│ 18 Sep  Irrigated      │
│         42 min · Ravi  │
│ 17 Sep  Leaf: Normal   │
│         Field A        │
│ 15 Sep  Fertilized     │
│         12 kg recorded │
├────────────────────────┤
│ Filter    Open     Back│
└────────────────────────┘
```

### Record types

```text
task_status
inspection
operation
input_usage
harvest
labor
cost
weather_snapshot
problem
note
moderation/audit
```

### Record rules

- Completed records are append-only.
- Corrections create a new revision with reason and author.
- Do not overwrite original values silently.
- Store source task, field, crop cycle, member, and timestamp.
- Manager verification is separate from completion.
- Hidden/deleted user accounts must not erase farm audit history; display an anonymized former member where required.

### Record filters

- Date range.
- Field.
- Crop cycle.
- Task type.
- Member.
- Result/problem.
- Input/cost records.
- Verified/unverified.

### Summaries

Provide deterministic summaries:

```text
This week
12 tasks completed
3 inspections
2 irrigation operations
18.5 labor hours
1 unresolved problem
```

Do not present yield or efficiency causality without appropriate data.

---

## 16. Task creation wizard

### Step sequence

```text
1 Task type
2 Title/template
3 Farm field
4 Crop cycle
5 Date and time window
6 Priority
7 Assignee(s)
8 Recurrence
9 Checklist
10 Weather constraints
11 Dependencies
12 Verification
13 Preview and create
```

Allow manager to skip optional steps through `# Next`.

### Quick create

Common presets:

```text
1 Inspect crop
2 Irrigate
3 Check equipment
4 Weed field
5 Record input
6 Custom task
```

Quick create should take fewer than ten keypad actions when defaults exist.

### Draft behavior

- Store draft server-side after user has chosen farm and title, or session-side before that.
- Back preserves completed steps.
- Cancel asks whether to discard draft.
- Submit uses idempotency key.

---

## 17. Checklists and dependencies

### Checklist

Task may contain up to ten ordered steps.

Each step:

- Label.
- Required or optional.
- Completed by/time.

Completion is blocked until required steps are complete unless manager overrides with a reason.

### Dependencies

Types:

```text
finish_before_start
finish_before_finish
blocks_until_verified
```

P0 may implement only `finish_before_start`, but schema should allow expansion.

Example:

```text
Repair pump
  ↓ must finish first
Irrigate Field B
```

When prerequisite is incomplete:

- Dependent task status displays Blocked.
- Worker may view but not start.
- Manager may override with documented reason.

---

## 18. Notifications

Required notification events:

- Farm invitation.
- Task assigned.
- Assignment accepted/declined.
- Task due soon.
- Task overdue.
- Task blocked.
- Delay requested.
- Task completed.
- Completion needs verification.
- Task reassigned or cancelled.
- Weather warning affects assigned task.

Notification screen:

```text
● Task assigned
  Inspect Field A · 2m

● Weather warning
  Spray task · Rain 70%

  Completion verified
  Pump inspection · 1h
```

Deduplicate reminders. A recurring scheduler must not send the same due-soon notification repeatedly.

---

## 19. Permissions matrix

| Action | Owner | Manager | Worker | Viewer |
|---|---:|---:|---:|---:|
| View farm/calendar/records | yes | yes | scoped | yes |
| Edit farm profile | yes | no | no | no |
| Manage membership | yes | limited | no | no |
| Create task | yes | yes | optional own draft | no |
| Assign/reassign | yes | yes | no | no |
| Accept/start own task | yes | yes | yes | no |
| Complete assigned task | yes | yes | yes | no |
| Verify completion | yes | yes | no | no |
| Cancel any task | yes | yes | no | no |
| Edit crop cycle/templates | yes | yes | no | no |
| View costs | yes | configurable | own/scoped | configurable |

Server must derive farm role from active membership for every write request.

---

## 20. Database schema

Reuse existing `users` and sessions. Add migrations or idempotent schema initialization.

Suggested schema:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE farms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  country_code TEXT NOT NULL,
  region_code TEXT NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE farm_members (
  farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'worker', 'viewer')),
  status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'declined', 'removed')),
  invited_by TEXT REFERENCES users(id),
  invited_at TEXT,
  accepted_at TEXT,
  removed_at TEXT,
  PRIMARY KEY (farm_id, user_id)
);

CREATE TABLE fields (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  area_value REAL,
  area_unit TEXT CHECK (area_unit IN ('ha', 'acre', 'm2')),
  irrigation_type TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (farm_id, name)
);

CREATE TABLE crop_cycles (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL REFERENCES fields(id),
  crop_code TEXT NOT NULL,
  variety TEXT,
  planting_date TEXT NOT NULL,
  target_harvest_date TEXT,
  actual_harvest_date TEXT,
  stage TEXT,
  template_id TEXT,
  template_version INTEGER,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('planned', 'active', 'harvested', 'cancelled', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE task_templates (
  id TEXT PRIMARY KEY,
  farm_id TEXT REFERENCES farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  crop_code TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  type TEXT NOT NULL,
  title_template TEXT NOT NULL,
  description_template TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  default_duration_minutes INTEGER,
  offset_days INTEGER,
  recurrence_json TEXT,
  checklist_json TEXT,
  completion_schema TEXT,
  weather_constraints_json TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE task_series (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  recurrence_json TEXT NOT NULL,
  timezone TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  generation_horizon_days INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE farm_tasks (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  field_id TEXT REFERENCES fields(id),
  crop_cycle_id TEXT REFERENCES crop_cycles(id),
  template_id TEXT REFERENCES task_templates(id),
  template_version INTEGER,
  series_id TEXT REFERENCES task_series(id),
  occurrence_key TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL,
  is_all_day INTEGER NOT NULL DEFAULT 0,
  local_date TEXT NOT NULL,
  start_at TEXT,
  due_at TEXT,
  timezone TEXT NOT NULL,
  estimated_minutes INTEGER,
  verification_required INTEGER NOT NULL DEFAULT 0,
  weather_constraints_json TEXT,
  blocked_reason TEXT,
  delayed_reason TEXT,
  cancelled_reason TEXT,
  completed_at TEXT,
  verified_at TEXT,
  verified_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (farm_id, created_by, request_id),
  UNIQUE (series_id, occurrence_key)
);

CREATE TABLE task_assignments (
  task_id TEXT NOT NULL REFERENCES farm_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  assignment_role TEXT NOT NULL DEFAULT 'primary'
    CHECK (assignment_role IN ('primary', 'helper')),
  status TEXT NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'accepted', 'declined', 'completed', 'removed')),
  assigned_by TEXT NOT NULL REFERENCES users(id),
  assigned_at TEXT NOT NULL,
  responded_at TEXT,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE task_checklist_items (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES farm_tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT,
  completed_by TEXT REFERENCES users(id)
);

CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL REFERENCES farm_tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES farm_tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'finish_before_start',
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

CREATE TABLE task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES farm_tasks(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  data_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE task_results (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE REFERENCES farm_tasks(id) ON DELETE CASCADE,
  completed_by TEXT NOT NULL REFERENCES users(id),
  result_code TEXT NOT NULL,
  result_json TEXT NOT NULL,
  note TEXT,
  actual_start_at TEXT,
  actual_finish_at TEXT,
  labor_minutes INTEGER,
  weather_snapshot_json TEXT,
  problem_flag INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  corrected_at TEXT,
  corrected_by TEXT REFERENCES users(id),
  correction_reason TEXT
);

CREATE TABLE farm_records (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  field_id TEXT REFERENCES fields(id),
  crop_cycle_id TEXT REFERENCES crop_cycles(id),
  task_id TEXT REFERENCES farm_tasks(id),
  actor_user_id TEXT REFERENCES users(id),
  record_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  data_json TEXT NOT NULL,
  revision_of TEXT REFERENCES farm_records(id),
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE member_availability (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('available', 'unavailable', 'leave')),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE farm_notifications (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  task_id TEXT REFERENCES farm_tasks(id) ON DELETE CASCADE,
  dedupe_key TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, dedupe_key)
);

CREATE INDEX idx_tasks_today
  ON farm_tasks (farm_id, local_date, status, priority);
CREATE INDEX idx_tasks_assignee
  ON task_assignments (user_id, status);
CREATE INDEX idx_tasks_due
  ON farm_tasks (farm_id, due_at, status);
CREATE INDEX idx_records_farm_date
  ON farm_records (farm_id, local_date DESC);
CREATE INDEX idx_crop_cycles_field
  ON crop_cycles (field_id, status);
```

Validate all JSON columns when writing and parsing. Consider normalized tables later only when queries require them.

---

## 21. API contract

All write routes require authentication and farm membership. All changes create task events/audit entries.

### Farms and membership

```text
GET    /api/farms
POST   /api/farms
GET    /api/farms/:farmId
PATCH  /api/farms/:farmId
GET    /api/farms/:farmId/members
POST   /api/farms/:farmId/invitations
POST   /api/farm-invitations/:id/accept
POST   /api/farm-invitations/:id/decline
PATCH  /api/farms/:farmId/members/:userId
DELETE /api/farms/:farmId/members/:userId
```

### Fields and crop cycles

```text
GET    /api/farms/:farmId/fields
POST   /api/farms/:farmId/fields
GET    /api/fields/:fieldId
PATCH  /api/fields/:fieldId
POST   /api/fields/:fieldId/crop-cycles
GET    /api/crop-cycles/:cycleId
PATCH  /api/crop-cycles/:cycleId
POST   /api/crop-cycles/:cycleId/generate-tasks
```

Task generation must return a preview before activation:

```json
{
  "mode": "preview",
  "templateId": "rice-basic-v1",
  "tasks": [
    {
      "title": "Check establishment",
      "localDate": "2026-08-15",
      "type": "inspection"
    }
  ]
}
```

### Today and calendar

```text
GET /api/farms/:farmId/today?date=2026-09-19
GET /api/farms/:farmId/calendar?from=2026-09-01&to=2026-09-30&...
GET /api/farms/:farmId/upcoming?days=7&...
GET /api/farms/:farmId/workload?from=&to=
```

Today response:

```json
{
  "ok": true,
  "farm": {
    "id": "farm_green",
    "name": "Green Field",
    "timezone": "Asia/Kolkata"
  },
  "date": "2026-09-19",
  "weather": {
    "summary": "Rain likely after 15:00",
    "stale": false,
    "observedAt": "2026-09-19T02:30:00Z"
  },
  "alerts": [],
  "sections": {
    "blocked": [],
    "overdue": [],
    "inProgress": [],
    "due": [],
    "unassigned": [],
    "completed": []
  },
  "summary": {
    "total": 5,
    "completed": 2,
    "inProgress": 1,
    "blocked": 1,
    "pending": 1
  }
}
```

Month calendar response should return day summaries separately from task details:

```json
{
  "days": [
    {
      "date": "2026-09-19",
      "total": 5,
      "completed": 2,
      "overdue": 1,
      "blocked": 1,
      "urgent": 0,
      "estimatedMinutes": 310
    }
  ]
}
```

### Tasks

```text
POST   /api/farms/:farmId/tasks
GET    /api/tasks/:taskId
PATCH  /api/tasks/:taskId
DELETE /api/tasks/:taskId
POST   /api/tasks/:taskId/assignments
DELETE /api/tasks/:taskId/assignments/:userId
POST   /api/tasks/:taskId/accept
POST   /api/tasks/:taskId/decline
POST   /api/tasks/:taskId/start
POST   /api/tasks/:taskId/complete
POST   /api/tasks/:taskId/verify
POST   /api/tasks/:taskId/delay
POST   /api/tasks/:taskId/block
POST   /api/tasks/:taskId/unblock
POST   /api/tasks/:taskId/cancel
PUT    /api/tasks/:taskId/checklist/:itemId
```

Create request:

```json
{
  "requestId": "uuid",
  "fieldId": "field_a",
  "cropCycleId": "rice_2026_a",
  "title": "Check rice leaf spots",
  "description": "Inspect lower and upper leaves in three areas.",
  "type": "inspection",
  "priority": "high",
  "localDate": "2026-09-19",
  "startAt": "2026-09-19T03:30:00Z",
  "dueAt": "2026-09-19T06:30:00Z",
  "assignees": [{ "userId": "user_meena", "role": "primary" }],
  "estimatedMinutes": 45,
  "checklist": [
    { "label": "Check lower leaves", "required": true },
    { "label": "Check leaf underside", "required": true },
    { "label": "Record spread level", "required": true }
  ],
  "weatherConstraints": null,
  "verificationRequired": false
}
```

Completion request:

```json
{
  "requestId": "uuid",
  "resultCode": "minor_issue",
  "result": {
    "leafCondition": "spots",
    "pestLevel": "low",
    "spread": "one_area"
  },
  "note": "Spots mostly on older leaves.",
  "actualStartAt": "2026-09-19T03:40:00Z",
  "actualFinishAt": "2026-09-19T04:12:00Z",
  "problemFlag": true
}
```

### Series/templates

```text
GET    /api/farms/:farmId/task-templates
POST   /api/farms/:farmId/task-templates
PATCH  /api/task-templates/:id
POST   /api/task-series
PATCH  /api/task-series/:id
POST   /api/task-series/:id/pause
POST   /api/task-series/:id/resume
DELETE /api/task-series/:id
```

### Records

```text
GET  /api/farms/:farmId/records?from=&to=&field=&type=&member=&...
GET  /api/farm-records/:recordId
POST /api/farm-records/:recordId/corrections
GET  /api/farms/:farmId/records/summary?from=&to=
```

### Notifications

```text
GET  /api/farm-notifications
POST /api/farm-notifications/:id/read
POST /api/farm-notifications/read-all
```

---

## 22. Error model

Use a stable envelope:

```json
{
  "ok": false,
  "error": {
    "code": "TASK_DEPENDENCY_BLOCKED",
    "message": "Finish Pump Repair before starting this task.",
    "field": null,
    "retryable": false,
    "details": {
      "blockingTaskId": "task_123"
    }
  }
}
```

Stable codes:

```text
VALIDATION_ERROR
AUTH_REQUIRED
FARM_ACCESS_DENIED
ROLE_REQUIRED
NOT_FOUND
INVALID_STATUS_TRANSITION
TASK_LOCKED
TASK_DEPENDENCY_BLOCKED
CHECKLIST_INCOMPLETE
ASSIGNEE_UNAVAILABLE
SCHEDULE_CONFLICT
WEATHER_OVERRIDE_REQUIRED
DUPLICATE_REQUEST
SERIES_CONFLICT
STALE_VERSION
RATE_LIMITED
INTERNAL_ERROR
```

Use optimistic concurrency/version number for task edits to avoid managers overwriting each other.

---

## 23. Seed demo

Seed data must be deterministic and idempotent.

### Farm

```text
Green Field Cooperative
Region: IN-BR
Timezone: Asia/Kolkata
```

### Fields

```text
Field A · 1.2 ha · Pump irrigation
Field B · 0.8 ha · Canal irrigation
Vegetable Plot · 0.3 ha · Drip irrigation
```

### Team

Reuse/create demo users compatible with Farmer Circle:

```text
Ravi K.   · Owner
Meena S.  · Manager
Arjun P.  · Worker
Asha P.   · Worker
```

### Crop cycles

```text
Field A · Rice · planted 8 Aug 2026 · active · Day 42 on 19 Sep
Field B · Rice · planted 15 Aug 2026 · active
Vegetable Plot · Tomato · planted 25 Aug 2026 · active
```

### Seed tasks for 19 Sep 2026

1. Weather warning: rain probability 70% after 15:00.
2. `Inspect pump` — Field B — assigned Ravi — overdue one day — high.
3. `Check rice leaf spots` — Field A — assigned Meena — 09:00–10:00 — high.
4. `Irrigate north section` — Field B — assigned Arjun — in progress.
5. `Record tomato soil moisture` — Vegetable Plot — assigned Asha — completed: wet.
6. `Spray vegetable plot` — Vegetable Plot — assigned Meena — blocked/warning due rain and wind.
7. `Review transport for harvest bags` — unassigned — normal.

### Upcoming

```text
20 Sep  Inspect weeds · Field A · Meena
21 Sep  Pump service · Field B · Ravi
22 Sep  Check tomato supports · Vegetable Plot · Asha
23 Sep  Rice pest scouting · Field A · Arjun
25 Sep  Fertilizer review · Field B · Unassigned
27 Sep  Weekly equipment inspection · recurring
```

### Historical records

```text
19 Sep  Soil moisture: Wet · Vegetable Plot · Asha
18 Sep  Irrigated · Field A · 42 minutes · Ravi
17 Sep  Leaf inspection: Normal · Field A · Meena
16 Sep  Pump noise reported · Field B · Arjun
15 Sep  Fertilizer operation recorded · Field A · 12 kg · Ravi
14 Sep  Weed level: Low · Vegetable Plot · Asha
```

### Assignment demo

Seed one unaccepted task assigned to Asha and one manager verification waiting state. This enables the demo to show both worker and manager views.

### Date handling

If the live demo occurs after these fixed dates, either regenerate relative to a configured demo date or allow `DEMO_DATE=2026-09-19`. Do not mix fixed task dates with the actual system date silently.

---

## 24. Frontend state

Extend the lightweight state model:

```js
{
  auth: {
    loaded: false,
    user: null
  },
  farmOps: {
    activeFarmId: null,
    activeDate: null,
    calendarView: 'agenda',
    filters: {},
    focusedTaskId: null,
    draftTask: null,
    cachedToday: new Map(),
    pendingIntent: null
  }
}
```

Only cache non-sensitive presentation data. Server remains authoritative.

Restore:

- Active farm.
- Selected date.
- Calendar view.
- Feed/filter state.
- Focused task when returning from detail.

Do not store session tokens or sensitive records in localStorage.

---

## 25. Keypad behavior

### Today

| Key | Action |
|---|---|
| Up / Down | Move through alerts/tasks |
| Enter | Open focused item |
| Left / Right | Previous/next day |
| `1` | Today |
| `2` | Calendar |
| `3` | Upcoming |
| `4` | My Tasks |
| `5` | Records |
| `#` | Filter/options |
| `*` | Notifications |
| Left softkey | Add task |
| Right softkey | Back |

### Task detail

| Key | Action |
|---|---|
| Up / Down | Move fields/checklist/actions |
| Enter | Toggle/open focused element |
| `1` | Accept/start depending status |
| `2` | Complete/update |
| `3` | Report problem |
| `#` | More actions |
| `*` | Show audit history |

### Calendar month

Use the navigation defined in the calendar section. Ensure keys do not conflict with browser/platform behavior.

### Forms

- Digits directly select numbered choices.
- Multi-tap handles text.
- `*` deletes in text mode.
- `#` advances when valid.
- Right softkey returns to previous step and preserves input.

---

## 26. Visual design

Today’s Farm should look like an operations product rather than a game.

Suggested tokens:

```css
:root {
  --ops-bg: #07180c;
  --ops-surface: #102719;
  --ops-surface-2: #183622;
  --ops-text: #f5faf5;
  --ops-dim: #a9c1ad;
  --ops-accent: #ffd84d;
  --ops-info: #65b7ff;
  --ops-success: #63dc8c;
  --ops-warning: #ffb454;
  --ops-danger: #ff6b62;
  --ops-blocked: #ba8cff;
  --ops-line: #285136;
}
```

Required components:

```text
.ops-header
.ops-date-switcher
.ops-weather-strip
.ops-section-title
.ops-task-row
.ops-task-status
.ops-priority
.ops-assignee
.ops-progress
.ops-calendar-grid
.ops-calendar-day
.ops-calendar-dots
.ops-agenda-day
.ops-checklist
.ops-result-field
.ops-team-row
.ops-workload-bar
.ops-record-row
.ops-timeline
.ops-alert
.ops-empty
.ops-error
```

Status representation must combine symbol and text/color:

```text
□ Scheduled
→ Assigned
✓ Completed
✓✓ Verified
▶ In progress
! Overdue
× Blocked
– Cancelled
```

No horizontal scrolling. Keep softkeys visible. Use no heavy chart library.

---

## 27. 128×160 strategy

Complexity is allowed, but information is progressively disclosed.

- Default calendar is Agenda, not Month.
- Month view remains accessible but shows only date numbers and one status mark.
- Team workload displays one member per row without bars.
- Hide descriptions/secondary metadata in lists.
- Task detail splits into pages: Summary, Checklist, Result, History.
- Filters live in a separate screen.
- Show at most two task rows at a time.
- Preserve every operation through navigation; do not remove capabilities solely because the screen is smaller.

---

## 28. Repository implementation map

Inspect current files and adapt naming. Suggested additions:

```text
backend/
  db/
    farmOpsSchema.sql
    farmOpsSeed.js
  middleware/
    farmAccess.js
  routes/
    farms.js
    farmTasks.js
    farmRecords.js
    farmNotifications.js
  services/
    farmService.js
    cropCycleService.js
    taskService.js
    taskStateMachine.js
    recurrenceService.js
    calendarService.js
    assignmentService.js
    weatherRulesService.js
    recordService.js
    notificationService.js
  tests/
    farmAccess.test.js
    taskStateMachine.test.js
    recurrence.test.js
    calendar.test.js
    assignment.test.js
    farmRecords.test.js

frontend/
  css/
    todays-farm.css
  js/
    farmOps/
      farmOpsApi.js
      farmOpsState.js
      farmOpsUtils.js
      calendarUtils.js
      taskForms.js
    screens/
      todayDashboard.js
      taskList.js
      taskDetail.js
      taskCreate.js
      taskComplete.js
      calendarMenu.js
      calendarMonth.js
      calendarWeek.js
      calendarAgenda.js
      cropTimeline.js
      upcomingAgenda.js
      myTasks.js
      farmRecords.js
      teamList.js
      teamWorkload.js
      fieldList.js
      cropCycleDetail.js
      taskTemplates.js
```

Modify:

| Existing file | Change |
|---|---|
| `frontend/js/screens/mainMenu.js` | Rename Daily Tasks to Today’s Farm and route correctly |
| `frontend/js/main.js` | Register Today’s Farm screens |
| `frontend/js/router.js` | Add minimal cleanup/state restoration support if needed |
| `frontend/js/api.js` | Reuse authenticated JSON helpers and structured errors |
| `frontend/js/state.js` | Add farm operations state |
| `frontend/index.html` | Load Today’s Farm stylesheet |
| `frontend/css/responsive.css` | Add compact operations rules |
| `backend/server.js` | Register new routers and scheduled service safely |
| `backend/package.json` | Add only needed dependencies |
| `backend/.env.example` | Add farm-ops configuration |
| `.gitignore` | Ignore runtime DB/temp uploads; preserve current rules |

Do not introduce a second SQLite database if the project already has one.

---

## 29. Scheduler

Implement a lightweight server scheduler or explicit tick service for:

- Recurrence generation.
- Due-soon notifications.
- Overdue status derivation/alerts.
- Weather-warning refresh.
- Expired invitation cleanup.

Rules:

- Every scheduled operation must be idempotent.
- Multiple server instances must not create duplicate occurrences/notifications; use DB uniqueness and a lock strategy.
- Do not require the scheduler for correctness of API reads: Today endpoint should still derive overdue state correctly.
- In tests, inject clock/time rather than depending on real current time.

---

## 30. Security and multi-tenant isolation

- Authenticate every write route.
- Verify active farm membership on every farm-scoped read and write unless explicitly public.
- Never trust farm ID, role, assignee, or owner fields from the client.
- Prevent IDOR: knowing a task ID must not grant access.
- Use parameterized SQL.
- Validate time ranges, timezone, recurrence size, checklist count, JSON schemas, and text lengths.
- Rate-limit task/invite/photo endpoints.
- Photo upload, if implemented, validates MIME and file signature, strips metadata, and stores outside executable paths.
- Session and PIN security reuse the Farmer Circle authentication specification.
- Audit owner/manager changes.
- Do not expose worker private data beyond display name, availability, and operational role.
- Never use IMEI for membership, attendance, or tracking.

---

## 31. Testing requirements

### State machine

- Every allowed transition succeeds.
- Every disallowed transition returns `INVALID_STATUS_TRANSITION`.
- Worker cannot verify own task.
- Cancelled/completed task cannot restart without authorized correction.
- Required checklist blocks completion.

### Recurrence

- Daily/every-N-days/weekly/monthly generation.
- Crop-stage offsets.
- Timezone correctness.
- Idempotent repeated generation.
- Editing one occurrence.
- Editing this-and-future.
- Cancelling series preserves history.

### Calendar

- Month boundaries.
- Leap year.
- Week grouping.
- Farm timezone.
- Date-only tasks.
- Filter combinations.
- Month summary counts match task list.

### Assignment

- Only farm members can be assigned.
- Worker accepts/declines.
- Unavailable member warning.
- Overlap conflict.
- Reassignment audit.
- Role enforcement.

### Weather

- Fresh warning.
- Cached/stale weather label.
- Provider outage does not white-screen.
- Warning never silently cancels task.
- Manager override records reason and snapshot.

### Records

- Completion creates record.
- Revision preserves original.
- Filters and summaries.
- Correct member/field/crop links.
- Deleted account does not erase audit history.

### API/integration

- Farm isolation between two users/farms.
- Idempotent create and complete requests.
- Optimistic concurrency stale edit rejection.
- Permission matrix.
- Notification deduplication.
- Seed idempotency.

### Manual keypad

- Today navigation.
- Add/open/update/back.
- Calendar day/week/month navigation.
- Worker accept/start/complete.
- Manager assign/verify.
- Result selection.
- Back restores date/filter/focus.
- 240×320 and 128×160.

---

## 32. Definition of Done

### Core operations

- [ ] Farm, fields, crop cycles, and members persist.
- [ ] Today groups alert/blocked/overdue/in-progress/due/unassigned/completed correctly.
- [ ] Seven-day and 30-day Upcoming work.
- [ ] Agenda, Week, Month, and Crop Timeline calendar views work.
- [ ] Month counts reconcile with task details.
- [ ] Task create/edit/cancel/reschedule work.
- [ ] Recurring tasks generate idempotently.
- [ ] Dependencies block correctly.
- [ ] Checklists work.
- [ ] Structured completion results create immutable records.
- [ ] Record corrections preserve history.

### Workforce

- [ ] Owner can invite using Farm ID.
- [ ] Invitee must accept membership.
- [ ] Manager can assign/reassign.
- [ ] Worker sees My Tasks and can accept/start/complete/report.
- [ ] Manager can verify.
- [ ] Availability/conflict warnings work.
- [ ] Farm permissions are enforced server-side.

### Weather

- [ ] Existing Weather backend is reused.
- [ ] Weather-sensitive tasks show clear warnings.
- [ ] Stale weather is visibly labelled.
- [ ] No task is silently cancelled by generic weather logic.
- [ ] Override decisions are audited.

### UI/device

- [ ] Main menu opens Today’s Farm, not Coming Soon.
- [ ] All P0 operations work without pointer/touch.
- [ ] 240×320 has polished Today and Calendar screens.
- [ ] 128×160 retains complete flow via progressive disclosure.
- [ ] Focus and softkey labels are always correct.
- [ ] No horizontal overflow or clipped softkeys.
- [ ] Loading/empty/error/stale/conflict/permission states are implemented.

### Engineering

- [ ] Tests pass.
- [ ] Database migration/init is safe and idempotent.
- [ ] Seed is safe and idempotent.
- [ ] API write operations use idempotency where appropriate.
- [ ] Task edits use optimistic concurrency.
- [ ] Scheduler cannot duplicate occurrences/notifications.
- [ ] Existing modules still work.

---

## 33. Recommended build order

1. Reuse/finish authentication and SQLite foundation.
2. Add farms, memberships, fields, and crop cycles.
3. Add task schema and server-side state machine.
4. Seed farm/team/tasks/records.
5. Build Today endpoint and dashboard.
6. Build task detail and worker completion flow.
7. Build task creation and manager assignment.
8. Build Records and structured completion schemas.
9. Build Upcoming and Agenda.
10. Build Month, Week, and Crop Timeline.
11. Build recurrence engine.
12. Build weather warnings.
13. Build workload, availability, and conflicts.
14. Build notifications.
15. Polish 240×320, then 128×160.
16. Run full test matrix and device acceptance.

Do not start with the month grid. The task state model and Today flow are the foundation.

---

## 34. Demo scenario

### Beat 1 — Operational overview

Open Today’s Farm:

- Rice Day 42.
- Two of five tasks complete.
- One pump task overdue.
- Rain warning affects afternoon spraying.

Explain: “This is not a reminder list. It combines crop stage, weather, fields, and people.”

### Beat 2 — Worker dispatch

On manager device:

- Open unassigned `Fertilizer review`.
- Assign it to Asha.

On worker device/session:

- Assignment notification appears.
- Asha accepts and task moves to My Tasks.

### Beat 3 — Structured field result

- Open `Check rice leaf spots`.
- Complete checklist.
- Select `Minor issue` and `spots`.
- Mark Problem Found.
- Create a linked follow-up task or open Farmer Circle with prefilled Crop Talk context.

### Beat 4 — Calendar complexity

- Open Month view and move by keypad.
- Select 22 Sep and open day agenda.
- Switch to Team Workload and show Arjun overloaded.
- Reassign one task.

### Beat 5 — Records

- Open Records.
- Show irrigation duration, inspection outcome, operator, and linked task history.

Closing line:

> “Enterprise smart-farming platforms assume tablets, sensors, and large farms. Today’s Farm brings the same plan–assign–record loop to a low-cost keypad phone.”

---

## Final delivery instruction

Implement the complete P0 feature and as much P1 as is safely achievable inside the existing repository. Do not return only a plan or scaffolding. Reuse authentication, Weather, router, keypad, state, and database infrastructure. Seed the specified demo farm. Run tests and provide exact startup, seed, demo-account, and verification commands.

---

*Today’s Farm Master Prompt · smart operations, advanced calendar, workforce dispatch, and structured records for Cloud Phone.*
