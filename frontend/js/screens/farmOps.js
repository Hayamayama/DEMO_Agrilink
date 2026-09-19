import { el } from '../dom.js';
import { farmOps, identity } from '../state.js';
import * as api from '../farmOps/farmOpsApi.js';

const STATUS = { scheduled:'□ Scheduled',assigned:'→ Assigned',accepted:'→ Accepted',in_progress:'▶ In progress',completed:'✓ Completed',verified:'✓✓ Verified',blocked:'× Blocked',delayed:'– Delayed',cancelled:'– Cancelled' };
const dateShift = (iso, days) => { const d=new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); };
const niceDate = (iso) => new Intl.DateTimeFormat('en', { day:'numeric', month:'short', timeZone:'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const requestId = () => globalThis.crypto?.randomUUID?.() || `farm-${Date.now()}-${Math.random()}`;
const message = (text, cls='ops-empty') => el(cls, text);
const taskRow = (t) => {
  const row=el(`item ops-task-row priority-${t.priority || 'normal'}`); row.dataset.id=t.id;
  const mark=el('ops-task-status', (STATUS[t.status] || t.status || '□').split(' ')[0]);
  const body=el('ops-task-body'); body.append(el('ops-task-title',t.title),el('ops-task-meta',`${t.fieldName || 'No field'} · ${t.assignments?.[0]?.name || 'Unassigned'}`));
  row.append(mark,body); return row;
};
const section = (root, title, items) => {
  if (!items?.length) return;
  root.append(el('ops-section-title', `${title} · ${items.length}`));
  items.forEach((t)=>root.append(taskRow(t)));
};

function asyncScreen({ name, title=name, load, renderData, softLeft, onKey, onEnter, initialFocus }) {
  let state={ status:'idle', data:null, error:null };
  async function fetchData(ctx) { state={...state,status:'loading',error:null}; ctx.rerender(); try { state={status:'ready',data:await load(ctx),error:null}; } catch(e) { state={...state,status:'error',error:e.message}; } ctx.rerender(); }
  return { name,title,softLeft,softRight:{label:'Back',handler:(ctx)=>ctx.router.pop()},
    onShow(ctx){ if(state.status==='idle') fetchData(ctx); }, onHide(){ state={status:'idle',data:null,error:null}; },
    render(ctx){ if(state.status==='loading'&&!state.data)return message('Loading…'); if(state.status==='error')return message(`${state.error || 'Unable to load'} · Enter to retry`,'ops-error'); return state.data?renderData(state.data,ctx):message('Loading…'); },
    initialFocus(ctx){ return initialFocus?.(ctx,state.data); },
    onKey(action,ctx){ if(state.status==='error'&&action==='ENTER'){fetchData(ctx);return true;} return onKey?.(action,ctx,state.data)===true; },
    onEnter(node,ctx,i){ return onEnter?.(node,ctx,i,state.data); }, refresh(ctx){fetchData(ctx);},
  };
}

export const FarmGate = asyncScreen({
  name:'FarmGate',title:"Today's Farm",load:()=>api.farms(),
  renderData(data){ const root=el('list'); if(!data.items.length)return message('No farm membership yet.'); data.items.forEach((f,i)=>{const r=el('item ops-team-row');r.dataset.farm=f.id;r.append(el('',`${i+1}  ${f.name}`),el('ops-task-meta',`${f.role} · ${f.open_tasks} open`));root.append(r);});return root; },
  onEnter(node,ctx,_i,data){ const f=data.items.find((x)=>x.id===node?.dataset.farm)||data.items[0]; if(!f)return; farmOps.activeFarmId=f.id;farmOps.activeFarm=f;ctx.router.replace('TodayDashboard'); },
});

function ensureFarm(ctx){ if(!farmOps.activeFarmId){ctx.router.replace('FarmGate');return false;}return true; }
export const TodayDashboard = asyncScreen({
  name:'TodayDashboard',title:()=>"Today's Farm",softLeft:{label:'Add',handler:(ctx)=>ctx.router.push('FarmTaskCreate')},
  load(ctx){ if(!ensureFarm(ctx)) return Promise.reject(new Error('Choose a farm')); return api.today(farmOps.activeFarmId,farmOps.activeDate); },
  renderData(data){ const root=el('ops-page'); root.append(el('ops-date-switcher',`${data.farm.name} · ${niceDate(data.date)}`),el('ops-progress',`${data.summary.completed} / ${data.summary.total} complete · ${data.summary.inProgress} active · ${data.summary.blocked} blocked`)); if(data.alerts?.[0])root.append(el('ops-alert',data.alerts[0].message)); section(root,'OVERDUE',data.sections.overdue);section(root,'BLOCKED',data.sections.blocked);section(root,'IN PROGRESS',data.sections.inProgress);section(root,'DUE TODAY',data.sections.due);section(root,'UNASSIGNED',data.sections.unassigned);section(root,'COMPLETED',data.sections.completed); if(!root.querySelector('.ops-task-row'))root.append(message('No work scheduled. Press Add.')); return root; },
  onKey(action,ctx){ const map={NUM_1:'TodayDashboard',NUM_2:'FarmCalendar',NUM_3:'FarmUpcoming',NUM_4:'MyFarmTasks',NUM_5:'FarmRecords'}; if(map[action]){ctx.router.push(map[action]);return true;} if(action==='LEFT'||action==='RIGHT'){farmOps.activeDate=dateShift(farmOps.activeDate,action==='LEFT'?-1:1);ctx.router.replace('TodayDashboard');return true;} },
  onEnter(node,ctx){const id=node?.dataset.id;if(id)ctx.router.push('FarmTaskDetail',{id});},
});

export const FarmUpcoming = asyncScreen({ name:'FarmUpcoming',title:'Upcoming',softLeft:{label:'Add',handler:(ctx)=>ctx.router.push('FarmTaskCreate')},
  load:()=>api.upcoming(farmOps.activeFarmId,farmOps.activeDate,7),
  renderData(data){const root=el('ops-page');let day='';for(const t of data.items){if(t.localDate!==day){day=t.localDate;root.append(el('ops-agenda-day',`${day===farmOps.activeDate?'TODAY':niceDate(day)} · ${day}`));}root.append(taskRow(t));}return data.items.length?root:message('Nothing scheduled in the next 7 days.');},
  onEnter(node,ctx){if(node?.dataset.id)ctx.router.push('FarmTaskDetail',{id:node.dataset.id});},
});

export const MyFarmTasks = asyncScreen({ name:'MyFarmTasks',title:'My Tasks',load:()=>api.tasks(farmOps.activeFarmId,`mine=true&from=${dateShift(farmOps.activeDate,-30)}&to=${dateShift(farmOps.activeDate,30)}`),
  renderData(data){const root=el('list');data.items.forEach((t)=>root.append(taskRow(t)));return data.items.length?root:message('No tasks assigned to you.');},
  onEnter(node,ctx){if(node?.dataset.id)ctx.router.push('FarmTaskDetail',{id:node.dataset.id});},
});

function monthBounds(date){const d=new Date(`${date}T00:00:00Z`);const first=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1));const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0));return [first.toISOString().slice(0,10),last.toISOString().slice(0,10)];}
export const FarmCalendar = asyncScreen({ name:'FarmCalendar',title:'Calendar',
  load(){const [from,to]=monthBounds(farmOps.activeDate);return api.calendar(farmOps.activeFarmId,from,to);},
  renderData(data){const root=el('ops-page');const [from]=monthBounds(farmOps.activeDate);root.append(el('ops-date-switcher',new Intl.DateTimeFormat('en',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${from}T00:00:00Z`))));const grid=el('ops-calendar-grid');['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(x=>grid.append(el('ops-calendar-label',x)));const firstDay=new Date(`${from}T00:00:00Z`).getUTCDay();for(let i=0;i<firstDay;i++)grid.append(el('ops-calendar-day blank',''));const by=new Map(data.days.map(x=>[x.date,x]));const [,to]=monthBounds(farmOps.activeDate);for(let d=from;d<=to;d=dateShift(d,1)){const s=by.get(d);const cell=el(`item ops-calendar-day${d===farmOps.activeDate?' selected':''}`);cell.dataset.date=d;cell.textContent=String(Number(d.slice(-2)));if(s)cell.append(el('ops-calendar-dots',s.blocked?'×':s.completed===s.total?'✓':'•'.repeat(Math.min(3,Math.ceil(s.total/2)))));grid.append(cell);}root.append(grid);const s=by.get(farmOps.activeDate);root.append(el('ops-calendar-summary',`${niceDate(farmOps.activeDate)} · ${s?.total||0} tasks · ${s?.estimated_minutes||0} min`));return root;},
  initialFocus:()=>Number(farmOps.activeDate.slice(-2))-1,
  onKey(action,ctx){if(['LEFT','RIGHT','UP','DOWN'].includes(action)){const n={LEFT:-1,RIGHT:1,UP:-7,DOWN:7}[action];farmOps.activeDate=dateShift(farmOps.activeDate,n);ctx.router.replace('FarmCalendar');return true;}if(action==='NUM_5'){farmOps.activeDate=new Date().toISOString().slice(0,10);ctx.router.replace('FarmCalendar');return true;}if(action==='STAR'){ctx.router.push('FarmTaskCreate');return true;}},
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
  renderData(data){const t=data.item,root=el('ops-page');root.append(el(`ops-priority priority-${t.priority}`,`${t.priority.toUpperCase()} · ${t.type.toUpperCase()}`),el('ops-detail-title',t.title),el('ops-task-meta',`${t.fieldName||'No field'} · ${niceDate(t.localDate)}`),el('ops-task-meta',STATUS[t.status]||t.status));if(t.description)root.append(el('ops-description',t.description));if(data.checklist.length){root.append(el('ops-section-title',`CHECKLIST · ${data.checklist.filter(x=>x.completed_at).length}/${data.checklist.length}`));for(const c of data.checklist){const r=el('item ops-checklist');r.dataset.item=c.id;r.dataset.done=c.completed_at?'1':'';r.textContent=`${c.completed_at?'✓':'□'} ${c.label}`;root.append(r);}}const a=actionFor(t,farmOps.activeFarm?.role);if(a){const r=el('item ops-action',`${a[1]} task`);r.dataset.action=a[0];root.append(r);}if(t.status==='in_progress'&&t.assignments?.some((x)=>x.userId===identity.profile?.id)){const r=el('item ops-action','Report problem');r.dataset.action='block';root.append(r);}root.append(el('ops-section-title','HISTORY'));data.events.slice(-4).reverse().forEach(e=>root.append(el('ops-history',`${new Date(e.created_at).toLocaleString()} · ${e.to_status||e.event_type}`)));return root;},
  async onEnter(node,ctx){if(detailActionBusy)return;if(node?.dataset.item){detailActionBusy=true;try{await api.toggleChecklist(ctx.params.id,node.dataset.item,node.dataset.done!=='1');ctx.router.replace('FarmTaskDetail',{id:ctx.params.id});}finally{detailActionBusy=false;}return;}const action=node?.dataset.action;if(action){detailActionBusy=true;try{await api.transition(ctx.params.id,action,action==='complete'?{resultCode:'done',result:{source:'keypad'},note:'Completed from Today’s Farm'}:action==='block'?{reason:'Problem reported by worker'}:{});ctx.router.replace('FarmTaskDetail',{id:ctx.params.id});}catch(e){alert(e.message);}finally{detailActionBusy=false;}}},
});

const PRESETS=[['Field inspection','inspection','normal'],['Irrigation check','irrigation','high'],['Pump maintenance','machinery','high'],['Farm record','record','normal']];
export const FarmTaskCreate = { name:'FarmTaskCreate',title:'Quick Add',numericSelect:true,softRight:{label:'Back',handler:(ctx)=>ctx.router.pop()},
  render(){const root=el('list');PRESETS.forEach((p,i)=>{const r=el('item');r.textContent=`${i+1}  ${p[0]}`;root.append(r);});root.append(message('Creates for the selected farm date.'));return root;},
  async onEnter(_node,ctx,i){const p=PRESETS[i];if(!p)return;try{const out=await api.createTask(farmOps.activeFarmId,{requestId:requestId(),title:p[0],type:p[1],priority:p[2],localDate:farmOps.activeDate,isAllDay:true});ctx.router.replace('FarmTaskDetail',{id:out.id});}catch(e){alert(e.message);}},
};

export const FarmRecords = asyncScreen({name:'FarmRecords',title:'Farm Records',load:()=>api.records(farmOps.activeFarmId),renderData(data){const root=el('list');data.items.forEach(r=>{const x=el('item ops-record-row');x.append(el('',r.task_title||r.record_type),el('ops-task-meta',`${String(r.local_date).slice(0,10)} · ${r.actor_name||'System'}`));root.append(x);});return data.items.length?root:message('No farm records yet. Completing work creates records.');}});
export const FarmTeam = asyncScreen({name:'FarmTeam',title:'Team',load:()=>api.members(farmOps.activeFarmId),renderData(data){const root=el('list');data.items.forEach(m=>{const x=el('item ops-team-row');x.append(el('',m.display_name),el('ops-task-meta',`${m.role} · ${m.open_tasks} tasks · ${m.workload_minutes} min`));root.append(x);});return root;}});
export const FarmFields = asyncScreen({name:'FarmFields',title:'Fields & Crops',load:()=>api.fields(farmOps.activeFarmId),renderData(data){const root=el('list');data.items.forEach(f=>{const x=el('item ops-field-row');x.append(el('',f.name),el('ops-task-meta',`${f.area_value||'?'} ${f.area_unit||''} · ${f.cycles.map(c=>`${c.cropCode} ${c.stage||''}`).join(', ')||'No active crop'}`));root.append(x);});return root;}});

export const farmOpsScreens={FarmGate,TodayDashboard,FarmUpcoming,MyFarmTasks,FarmCalendar,FarmTaskDetail,FarmTaskCreate,FarmRecords,FarmTeam,FarmFields};
