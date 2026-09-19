import { t as tr, dateLocale } from '../i18n/index.js';
import { el } from '../dom.js';
import { farmOps, identity } from '../state.js';
import * as api from '../farmOps/farmOpsApi.js';

const STATUS = { scheduled:tr('□ Scheduled'),assigned:tr('→ Assigned'),accepted:tr('→ Accepted'),in_progress:tr('▶ In progress'),completed:tr('✓ Completed'),verified:tr('✓✓ Verified'),blocked:tr('× Blocked'),delayed:tr('– Delayed'),cancelled:tr('– Cancelled') };
const dateShift = (iso, days) => { const d=new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); };
const niceDate = (iso) => new Intl.DateTimeFormat(dateLocale, { day:'numeric', month:'short', timeZone:'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const requestId = () => globalThis.crypto?.randomUUID?.() || `farm-${Date.now()}-${Math.random()}`;
const message = (text, cls='ops-empty') => el(cls, tr(text));
// "Today" in the farm's timezone: Cloud Phone renders in CloudMosa's cloud, whose clock and zone are not the farmer's.
const farmToday = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
// Errors go to the shared toast bar; native alert() dialogs are not verified on Cloud Phone keypads.
let flashTimer=null;
const flash = (text) => { const t=document.getElementById('toast'); if(!t)return; t.textContent=`⚠ ${tr(text)}`; t.hidden=false; clearTimeout(flashTimer); flashTimer=setTimeout(()=>{t.hidden=true;},4000); };
function openFarm(ctx, f) { farmOps.activeFarmId=f.id; farmOps.activeFarm=f; farmOps.activeDate=new URLSearchParams(location.search).get('demoDate')||farmToday(f.timezone); ctx.router.replace('TodayDashboard'); }
const taskRow = (t) => {
  const row=el(`item ops-task-row priority-${t.priority || 'normal'}`); row.dataset.id=t.id;
  const mark=el('ops-task-status', (STATUS[t.status] || t.status || '□').split(' ')[0]);
  const body=el('ops-task-body'); body.append(el('ops-task-title',t.title),el('ops-task-meta',`${t.fieldName || tr('No field')} · ${t.assignments?.[0]?.name || tr('Unassigned')}`));
  row.append(mark,body); return row;
};
const section = (root, title, items) => {
  if (!items?.length) return;
  root.append(el('ops-section-title', `${tr(title)} · ${items.length}`));
  items.forEach((t)=>root.append(taskRow(t)));
};
const weatherRow = (data) => {
  if (!data.weather) return null;
  const w=data.weather.current||{}, a=data.sprayAssessment;
  const temp=Math.round(w.temperatureC??w.temp??0), wind=Math.round(w.windSpeedKph??w.wind_speed??0), humidity=Math.round(w.relativeHumidity??w.humidity??0);
  const row=el(`ops-live-row ops-weather ops-${a?.overall||'unknown'}`);
  row.append(el('ops-live-main',`☀ ${temp}°C · ${tr('W')} ${wind}km/h · ${tr('H')} ${humidity}%`),
    el('ops-live-meta',a?`${tr('SPRAY')}: ${tr(a.overall.toUpperCase())} · ${a.bestWindow.from}–${a.bestWindow.to}`:tr('No spray task')));
  return row;
};
const marketRow = (m) => {
  if(!m)return null; const arrow=String(m.trend7d).startsWith('-')?'▼':'▲';
  const row=el('ops-live-row ops-market');
  row.append(el('ops-live-main',`📊 ${m.crop.toUpperCase()} ₹${Math.round(m.localPrice)}/${tr('qt')} ${arrow}${m.trend7d}`),
    el('ops-live-meta',m.bestNearbyMarket?`${m.bestNearbyMarket}: ${m.netGainPerUnit>=0?'+':''}₹${m.netGainPerUnit??'?'} /${tr('qt')} ${tr('net')} · ${m.source}`:`${tr('Source:')} ${m.provider} · ${m.source}`));
  return row;
};

function asyncScreen({ name, title=name, load, renderData, softLeft, onKey, onEnter, initialFocus }) {
  let state={ status:'idle', data:null, error:null };
  async function fetchData(ctx) { state={...state,status:'loading',error:null}; ctx.rerender(); try { state={status:'ready',data:await load(ctx),error:null}; } catch(e) { state={...state,status:'error',error:e.message}; } ctx.rerender(); }
  return { name,title,softLeft,softRight:{label:'Back',handler:(ctx)=>ctx.router.pop()},
    onShow(ctx){ if(state.status==='idle') fetchData(ctx); }, onHide(){ state={status:'idle',data:null,error:null}; },
    render(ctx){ if(state.status==='loading'&&!state.data)return message('Loading…'); if(state.status==='error')return message(`${state.error ? tr(state.error) : tr('Unable to load')} · ${tr('Enter to retry')}`,'ops-error'); return state.data?renderData(state.data,ctx):message('Loading…'); },
    initialFocus(ctx){ return initialFocus?.(ctx,state.data); },
    onKey(action,ctx){ if(state.status==='error'&&action==='ENTER'){fetchData(ctx);return true;} return onKey?.(action,ctx,state.data)===true; },
    onEnter(node,ctx,i){ return onEnter?.(node,ctx,i,state.data); }, refresh(ctx){fetchData(ctx);},
  };
}

export const FarmGate = asyncScreen({
  name:'FarmGate',title:"Today's Farm",load:()=>api.farms(),
  renderData(data){ const root=el('list'); if(!data.items.length){ root.append(message('You have no farm yet. Start one to plan daily work.')); const r=el('item ops-action',`1  ${tr('Create my farm')}`); r.dataset.create='1'; root.append(r); return root; } data.items.forEach((f,i)=>{const r=el('item ops-team-row');r.dataset.farm=f.id;r.append(el('',`${i+1}  ${f.name}`),el('ops-task-meta',`${tr(f.role)} · ${tr('{n} open',{n:f.open_tasks})}`));root.append(r);});return root; },
  onKey(action,ctx){ if(action==='NUM_1'){ const n=ctx.focus.items[0]; if(n?.dataset.create){ createFarm(ctx); return true; } } },
  async onEnter(node,ctx,_i,data){ if(node?.dataset.create) return createFarm(ctx); const f=data.items.find((x)=>x.id===node?.dataset.farm)||data.items[0]; if(!f)return; openFarm(ctx,f); },
});

let creatingFarm=false;
async function createFarm(ctx){ if(creatingFarm)return; creatingFarm=true; try{ const out=await api.createFarm(); const f=(await api.farms()).items.find((x)=>x.id===out.id); if(f) openFarm(ctx,f); }catch(e){ flash(e.message); }finally{ creatingFarm=false; } }
function ensureFarm(ctx){ if(!farmOps.activeFarmId){ctx.router.replace('FarmGate');return false;}return true; }
export const TodayDashboard = asyncScreen({
  name:'TodayDashboard',title:()=>"Today's Farm",softLeft:{label:'Add',handler:(ctx)=>ctx.router.push('FarmTaskCreate')},
  load(ctx){ if(!ensureFarm(ctx)) return Promise.reject(new Error(tr('Choose a farm'))); return api.today(farmOps.activeFarmId,farmOps.activeDate); },
  renderData(data){ const root=el('ops-page'); root.append(el('ops-date-switcher',`${data.farm.name} · ${niceDate(data.date)}`),el('ops-progress',tr('{done} / {total} complete · {active} active · {blocked} blocked',{done:data.summary.completed,total:data.summary.total,active:data.summary.inProgress,blocked:data.summary.blocked}))); const wr=weatherRow(data),mr=marketRow(data.marketSnapshot);if(wr)root.append(wr);if(mr)root.append(mr);if(data.alerts?.[0])root.append(el('ops-alert',data.alerts[0].message)); section(root,'OVERDUE',data.sections.overdue);section(root,'BLOCKED',data.sections.blocked);section(root,'IN PROGRESS',data.sections.inProgress);section(root,'DUE TODAY',data.sections.dueToday||data.sections.due);section(root,'UNASSIGNED',data.sections.unassigned);const c=data.communityActivity;if(c&&(c.unreadReplies||c.newPostsToday)){const row=el('item ops-community',tr('🌾 Circle: {replies} new replies · {posts} posts',{replies:c.unreadReplies,posts:c.newPostsToday}));row.dataset.route='FarmerCircleHome';root.append(row);}section(root,'COMPLETED',data.sections.completedToday||data.sections.completed); if(!root.querySelector('.ops-task-row'))root.append(message('No work scheduled. Press Add.')); root.append(el('ops-task-meta',tr('◄► day · 2 Calendar · 3 Next 7 days · 4 Mine · 5 Records · 6 Team · 7 Fields'))); return root; },
  onKey(action,ctx){ const map={NUM_2:'FarmCalendar',NUM_3:'FarmUpcoming',NUM_4:'MyFarmTasks',NUM_5:'FarmRecords',NUM_6:'FarmTeam',NUM_7:'FarmFields'}; if(map[action]){ctx.router.push(map[action]);return true;} if(action==='LEFT'||action==='RIGHT'){farmOps.activeDate=dateShift(farmOps.activeDate,action==='LEFT'?-1:1);ctx.router.replace('TodayDashboard');return true;} },
  onEnter(node,ctx){if(node?.dataset.route)return ctx.router.push(node.dataset.route);const id=node?.dataset.id;if(id)ctx.router.push('FarmTaskDetail',{id});},
});

export const FarmUpcoming = asyncScreen({ name:'FarmUpcoming',title:'Upcoming',softLeft:{label:'Add',handler:(ctx)=>ctx.router.push('FarmTaskCreate')},
  load:()=>api.upcoming(farmOps.activeFarmId,farmOps.activeDate,7),
  renderData(data){const root=el('ops-page');let day='';for(const t of data.items){if(t.localDate!==day){day=t.localDate;root.append(el('ops-agenda-day',`${day===farmOps.activeDate?tr('TODAY'):niceDate(day)} · ${day}`));}root.append(taskRow(t));}return data.items.length?root:message('Nothing scheduled in the next 7 days.');},
  onEnter(node,ctx){if(node?.dataset.id)ctx.router.push('FarmTaskDetail',{id:node.dataset.id});},
});

export const MyFarmTasks = asyncScreen({ name:'MyFarmTasks',title:'My Tasks',load:()=>api.tasks(farmOps.activeFarmId,`mine=true&from=${dateShift(farmOps.activeDate,-30)}&to=${dateShift(farmOps.activeDate,30)}`),
  renderData(data){const root=el('list');data.items.forEach((t)=>root.append(taskRow(t)));return data.items.length?root:message('No tasks assigned to you.');},
  onEnter(node,ctx){if(node?.dataset.id)ctx.router.push('FarmTaskDetail',{id:node.dataset.id});},
});

function monthBounds(date){const d=new Date(`${date}T00:00:00Z`);const first=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1));const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0));return [first.toISOString().slice(0,10),last.toISOString().slice(0,10)];}
export const FarmCalendar = asyncScreen({ name:'FarmCalendar',title:'Calendar',
  load(){const [from,to]=monthBounds(farmOps.activeDate);return api.calendar(farmOps.activeFarmId,from,to);},
  renderData(data){const root=el('ops-page');const [from]=monthBounds(farmOps.activeDate);root.append(el('ops-date-switcher',new Intl.DateTimeFormat(dateLocale,{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${from}T00:00:00Z`))));const grid=el('ops-calendar-grid');['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(x=>grid.append(el('ops-calendar-label',tr(x))));const firstDay=new Date(`${from}T00:00:00Z`).getUTCDay();for(let i=0;i<firstDay;i++)grid.append(el('ops-calendar-day blank',''));const by=new Map(data.days.map(x=>[x.date,x]));const [,to]=monthBounds(farmOps.activeDate);for(let d=from;d<=to;d=dateShift(d,1)){const s=by.get(d);const cell=el(`item ops-calendar-day${d===farmOps.activeDate?' selected':''}`);cell.dataset.date=d;cell.textContent=String(Number(d.slice(-2)));if(s)cell.append(el('ops-calendar-dots',s.blocked?'×':s.completed===s.total?'✓':'•'.repeat(Math.min(3,Math.ceil(s.total/2)))));grid.append(cell);}root.append(grid);const s=by.get(farmOps.activeDate);root.append(el('ops-calendar-summary',tr('{date} · {n} tasks · {min} min',{date:niceDate(farmOps.activeDate),n:s?.total||0,min:s?.estimated_minutes||0})));return root;},
  initialFocus:()=>Number(farmOps.activeDate.slice(-2))-1,
  onKey(action,ctx){if(['LEFT','RIGHT','UP','DOWN'].includes(action)){const n={LEFT:-1,RIGHT:1,UP:-7,DOWN:7}[action];farmOps.activeDate=dateShift(farmOps.activeDate,n);ctx.router.replace('FarmCalendar');return true;}if(action==='NUM_5'){farmOps.activeDate=farmToday(farmOps.activeFarm?.timezone);ctx.router.replace('FarmCalendar');return true;}if(action==='STAR'){ctx.router.push('FarmTaskCreate');return true;}},
  onEnter(node,ctx){if(node?.dataset.date){farmOps.activeDate=node.dataset.date;ctx.router.push('TodayDashboard');}},
});

let detailActionBusy=false;
const actionFor=(task,role)=> {
  if(task.status==='completed'&&['owner','manager'].includes(role))return ['verify','Verify'];
  const mine=task.assignments?.some((a)=>a.userId===identity.profile?.id);
  if(!mine)return null;
  return task.status==='assigned'?['accept','Accept']:task.status==='accepted'?['start','Start']:task.status==='in_progress'?['complete','Complete']:null;
};
export const FarmTaskDetail = asyncScreen({ name:'FarmTaskDetail',title:'Task Detail',
  load:(ctx)=>api.detail(ctx.params.id),
  renderData(data){const t=data.item,root=el('ops-page');root.append(el(`ops-priority priority-${t.priority}`,`${tr(t.priority.toUpperCase())} · ${tr(t.type.toUpperCase())}`),el('ops-detail-title',t.title),el('ops-task-meta',`${t.fieldName||tr('No field')} · ${niceDate(t.localDate)}`),el('ops-task-meta',STATUS[t.status]||t.status));if(t.description)root.append(el('ops-description',t.description));const spray=data.sprayAssessment;if(spray){root.append(el('ops-section-title',`${tr('SPRAY CONDITIONS')} · ${tr(spray.overall.toUpperCase())}`));for(const f of spray.factors){root.append(el(`ops-spray-factor ops-${f.status}`,`${tr(f.param)}: ${f.value}${f.unit||''} · ${tr(f.status)}`));}root.append(el('ops-description',tr(spray.disclaimer)));}if(data.checklist.length){root.append(el('ops-section-title',`${tr('CHECKLIST')} · ${data.checklist.filter(x=>x.completed_at).length}/${data.checklist.length}`));for(const c of data.checklist){const r=el('item ops-checklist');r.dataset.item=c.id;r.dataset.done=c.completed_at?'1':'';r.textContent=`${c.completed_at?'✓':'□'} ${c.label}`;root.append(r);}}const a=actionFor(t,farmOps.activeFarm?.role);if(a){const r=el('item ops-action',tr(a[1]+' task'));r.dataset.action=a[0];root.append(r);}if(t.status==='in_progress'&&t.assignments?.some((x)=>x.userId===identity.profile?.id)){const r=el('item ops-action',tr('Report problem'));r.dataset.action='block';root.append(r);}root.append(el('ops-section-title',tr('HISTORY')));data.events.slice(-4).reverse().forEach(e=>root.append(el('ops-history',`${new Date(e.created_at).toLocaleString(dateLocale)} · ${e.to_status?tr(STATUS[e.to_status]||e.to_status):e.event_type}`)));return root;},
  async onEnter(node,ctx){if(detailActionBusy)return;if(node?.dataset.item){detailActionBusy=true;try{await api.toggleChecklist(ctx.params.id,node.dataset.item,node.dataset.done!=='1');ctx.router.replace('FarmTaskDetail',{id:ctx.params.id});}catch(e){flash(e.message);}finally{detailActionBusy=false;}return;}const action=node?.dataset.action;if(action){detailActionBusy=true;try{await api.transition(ctx.params.id,action,action==='complete'?{resultCode:'done',result:{source:'keypad'},note:'Completed from Today’s Farm'}:action==='block'?{reason:'Problem reported by worker'}:{});ctx.router.replace('FarmTaskDetail',{id:ctx.params.id});}catch(e){flash(e.message);}finally{detailActionBusy=false;}}},
});

const PRESETS=[['Field inspection','inspection','normal'],['Irrigation check','irrigation','high'],['Pump maintenance','machinery','high'],['Farm record','record','normal']];
export const FarmTaskCreate = { name:'FarmTaskCreate',title:'Quick Add',numericSelect:true,softRight:{label:'Back',handler:(ctx)=>ctx.router.pop()},
  render(){const root=el('list');PRESETS.forEach((p,i)=>{const r=el('item');r.textContent=`${i+1}  ${tr(p[0])}`;root.append(r);});root.append(message('Creates for the selected farm date, assigned to you.'));return root;},
  async onEnter(_node,ctx,i){const p=PRESETS[i];if(!p)return;try{const out=await api.createTask(farmOps.activeFarmId,{requestId:requestId(),title:p[0],type:p[1],priority:p[2],localDate:farmOps.activeDate,isAllDay:true,assignees:identity.profile?.id?[{userId:identity.profile.id}]:[]});ctx.router.replace('FarmTaskDetail',{id:out.id});}catch(e){flash(e.message);}},
};

export const FarmRecords = asyncScreen({name:'FarmRecords',title:'Farm Records',load:()=>api.records(farmOps.activeFarmId),renderData(data){const root=el('list');data.items.forEach(r=>{const x=el('item ops-record-row');x.append(el('',r.task_title||r.record_type),el('ops-task-meta',`${String(r.local_date).slice(0,10)} · ${r.actor_name||tr('System')}`));root.append(x);});return data.items.length?root:message('No farm records yet. Completing work creates records.');}});
export const FarmTeam = asyncScreen({name:'FarmTeam',title:'Team',load:()=>api.members(farmOps.activeFarmId),renderData(data){const root=el('list');data.items.forEach(m=>{const x=el('item ops-team-row');x.append(el('',m.display_name),el('ops-task-meta',`${tr(m.role)} · ${tr('{n} tasks',{n:m.open_tasks})} · ${m.workload_minutes} min`));root.append(x);});return root;}});
export const FarmFields = asyncScreen({name:'FarmFields',title:'Fields & Crops',load:()=>api.fields(farmOps.activeFarmId),renderData(data){const root=el('list');data.items.forEach(f=>{const x=el('item ops-field-row');x.append(el('',f.name),el('ops-task-meta',`${f.area_value||'?'} ${f.area_unit||''} · ${f.cycles.map(c=>`${c.cropCode} ${c.stage||''}`).join(', ')||tr('No active crop')}`));root.append(x);});return root;}});

export const farmOpsScreens={FarmGate,TodayDashboard,FarmUpcoming,MyFarmTasks,FarmCalendar,FarmTaskDetail,FarmTaskCreate,FarmRecords,FarmTeam,FarmFields};
