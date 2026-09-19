import crypto from 'node:crypto';
import { createPool } from './pool.js';

const id = (key) => {
  const h = crypto.createHash('md5').update(`agrilink-farm-ops:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
export const FARM_DEMO_ID = id('green-field');

export async function seedFarmOps(pool, { demoDate = process.env.DEMO_DATE || '2026-09-19' } = {}) {
  const members = (await pool.query(`SELECT s.demo_key,p.user_id,p.display_name FROM app.forum_user_state s
    JOIN app.user_profiles p ON p.user_id=s.user_id
    WHERE s.demo_key IN ('10000001','10000002','10000003','10000004','10000005') ORDER BY s.demo_key`)).rows;
  if (members.length < 5) throw new Error('Seed Farmer Circle demo users before Today\'s Farm.');
  const byKey = new Map(members.map((m) => [m.demo_key, m]));
  const owner = byKey.get('10000001');
  const asha = byKey.get('10000002');
  const arjun = byKey.get('10000003');
  const viewer = byKey.get('10000004');
  const manager = byKey.get('10000005');
  const farmId = FARM_DEMO_ID;
  const fieldA = id('field-a'); const fieldB = id('field-b'); const vegetable = id('vegetable-plot');
  const riceA = id('rice-cycle-a'); const riceB = id('rice-cycle-b'); const tomato = id('tomato-cycle');
  const date = (offset) => { const d = new Date(`${demoDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
  const at = (day, hour, minute = 0) => `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;
  const taskId = (key) => id(`task-${key}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO app.farms(id,name,owner_user_id,country_code,region_code,timezone,latitude,longitude)
      VALUES ($1,'Green Field Cooperative',$2,'IN','IN-BR','Asia/Kolkata',25.59410,85.13760)
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,owner_user_id=EXCLUDED.owner_user_id,country_code=EXCLUDED.country_code,
        region_code=EXCLUDED.region_code,timezone=EXCLUDED.timezone,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,updated_at=now()`, [farmId, owner.user_id]);
    for (const [m, role] of [[owner,'owner'],[manager,'manager'],[asha,'worker'],[arjun,'worker'],[viewer,'viewer']]) {
      await client.query(`INSERT INTO app.farm_members(farm_id,user_id,role,status,accepted_at) VALUES ($1,$2,$3,'active',now())
        ON CONFLICT(farm_id,user_id) DO UPDATE SET role=EXCLUDED.role,status='active',removed_at=NULL`, [farmId, m.user_id, role]);
    }
    const fields = [[fieldA,'Field A',1.2,'pump'],[fieldB,'Field B',0.8,'canal'],[vegetable,'Vegetable Plot',0.3,'drip']];
    for (const [fieldId,name,area,irrigation] of fields) await client.query(`INSERT INTO app.farm_fields(id,farm_id,name,area_value,area_unit,irrigation_type)
      VALUES ($1,$2,$3,$4,'ha',$5) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,area_value=EXCLUDED.area_value,
      area_unit=EXCLUDED.area_unit,irrigation_type=EXCLUDED.irrigation_type,status='active',updated_at=now()`, [fieldId,farmId,name,area,irrigation]);
    const cycles = [
      [riceA,fieldA,'rice','Swarna',-42,48,'tillering'],[riceB,fieldB,'rice','Swarna',-35,55,'vegetative'],
      [tomato,vegetable,'tomato','Pusa Ruby',-25,55,'vegetative'],
    ];
    for (const [cycleId,fieldId,crop,variety,planted,harvest,stage] of cycles) await client.query(`INSERT INTO app.crop_cycles
      (id,farm_id,field_id,crop_code,variety,planting_date,target_harvest_date,stage,template_version,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,'active') ON CONFLICT(id) DO UPDATE SET field_id=EXCLUDED.field_id,
      crop_code=EXCLUDED.crop_code,variety=EXCLUDED.variety,planting_date=EXCLUDED.planting_date,
      target_harvest_date=EXCLUDED.target_harvest_date,stage=EXCLUDED.stage,status='active',updated_at=now()`,
    [cycleId,farmId,fieldId,crop,variety,date(planted),date(harvest),stage]);

    const tasks = [
      ['pump','Inspect pump','machinery','high','assigned',-1,fieldB,riceB,owner.user_id,45,9,10,false,null],
      ['leaf','Check rice leaf spots','inspection','high','assigned',0,fieldA,riceA,manager.user_id,60,9,10,false,null],
      ['water','Irrigate north section','irrigation','normal','in_progress',0,fieldB,riceB,arjun.user_id,90,10,12,false,null],
      ['records','Record tomato soil moisture','record','normal','completed',0,vegetable,tomato,asha.user_id,20,8,9,false,null],
      ['spray','Spray vegetable plot','spraying','urgent','blocked',0,vegetable,tomato,manager.user_id,75,14,16,false,'Rain 70% and high wind risk; manager review required.'],
      ['transport','Review transport for harvest bags','transport','normal','scheduled',0,null,null,null,30,15,16,false,null],
      ['weeds','Inspect weeds','inspection','normal','assigned',1,fieldA,riceA,manager.user_id,40,8,9,false,null],
      ['pump-service','Pump service','machinery','high','assigned',2,fieldB,riceB,owner.user_id,90,9,11,false,null],
      ['tomato-supports','Check tomato supports','inspection','normal','assigned',3,vegetable,tomato,asha.user_id,35,8,9,false,null],
      ['pest-scout','Rice pest scouting','inspection','high','assigned',4,fieldA,riceA,arjun.user_id,50,7,8,false,null],
      ['fertilizer-review','Fertilizer review','fertilizer','normal','scheduled',6,fieldB,riceB,null,45,9,10,false,null],
      ['equipment-weekly','Weekly equipment inspection','machinery','normal','assigned',8,null,null,asha.user_id,60,9,10,false,null],
      ['verify-drainage','Drainage repair review','machinery','high','completed',-1,fieldB,riceB,arjun.user_id,55,13,14,true,null],
    ];
    for (const [key,title,type,priority,status,offset,field,cycle,assignee,minutes,start,end,verification,blockedReason] of tasks) {
      const idValue=taskId(key); const day=date(offset);
      await client.query(`INSERT INTO app.farm_tasks(id,farm_id,field_id,crop_cycle_id,created_by,title,type,priority,status,
        local_date,start_at,due_at,timezone,estimated_minutes,verification_required,weather_constraints,blocked_reason,completed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Asia/Kolkata',$13,$14,$15,$16,$17)
        ON CONFLICT(id) DO UPDATE SET field_id=EXCLUDED.field_id,crop_cycle_id=EXCLUDED.crop_cycle_id,title=EXCLUDED.title,
        type=EXCLUDED.type,priority=EXCLUDED.priority,status=EXCLUDED.status,local_date=EXCLUDED.local_date,start_at=EXCLUDED.start_at,
        due_at=EXCLUDED.due_at,estimated_minutes=EXCLUDED.estimated_minutes,verification_required=EXCLUDED.verification_required,
        weather_constraints=EXCLUDED.weather_constraints,blocked_reason=EXCLUDED.blocked_reason,completed_at=EXCLUDED.completed_at,updated_at=now()`,
      [idValue,farmId,field,cycle,owner.user_id,title,type,priority,status,day,at(day,start),at(day,end),minutes,verification,
        type==='spraying'?{rainProbabilityMax:40,windSpeedMaxKph:15,lookaheadHours:6,behavior:'require_manager_override'}:null,
        blockedReason,['completed','verified'].includes(status)?at(day,end):null]);
      await client.query('DELETE FROM app.farm_task_assignments WHERE task_id=$1', [idValue]);
      if (assignee) await client.query(`INSERT INTO app.farm_task_assignments(task_id,user_id,assigned_by,status) VALUES ($1,$2,$3,$4)`,
        [idValue,assignee,owner.user_id,status==='in_progress'?'accepted':status==='completed'?'completed':'assigned']);
      await client.query(`INSERT INTO app.farm_task_events(id,task_id,actor_user_id,event_type,to_status,data)
        VALUES ($1,$2,$3,'seeded',$4,'{"demo":true}') ON CONFLICT(id) DO UPDATE SET to_status=EXCLUDED.to_status,data=EXCLUDED.data`,
      [id(`event-${key}`),idValue,owner.user_id,status]);
    }
    for (const [key,labels] of [['leaf',['Check lower leaves','Check leaf underside','Record spread level']],['equipment-weekly',['Check guards and covers','Check fuel or charge','Record unusual noise']]]) {
      for (const [n,label] of labels.entries()) await client.query(`INSERT INTO app.farm_task_checklist_items(id,task_id,label,sort_order)
        VALUES ($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label,sort_order=EXCLUDED.sort_order`, [id(`${key}-check-${n}`),taskId(key),label,n]);
    }
    const results = [
      ['records',asha.user_id,'wet',{soilMoisture:'wet'},'Soil remains wet after overnight rain.',18,0,9],
      ['verify-drainage',arjun.user_id,'repaired',{repair:'complete',flow:'normal'},'Drainage cleared; waiting for manager verification.',52,-1,14],
    ];
    for (const [key,userId,code,result,note,labor,offset,hour] of results) await client.query(`INSERT INTO app.farm_task_results
      (id,task_id,completed_by,result_code,result,note,actual_finish_at,labor_minutes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(task_id) DO UPDATE SET completed_by=EXCLUDED.completed_by,result_code=EXCLUDED.result_code,result=EXCLUDED.result,
      note=EXCLUDED.note,actual_finish_at=EXCLUDED.actual_finish_at,labor_minutes=EXCLUDED.labor_minutes`,
    [id(`result-${key}`),taskId(key),userId,code,result,note,at(date(offset),hour),labor]);
    const records = [
      ['moisture',0,vegetable,tomato,taskId('records'),asha.user_id,'soil_moisture',{level:'wet',unit:'observation'}],
      ['irrigated',-1,fieldA,riceA,null,owner.user_id,'irrigation',{durationMinutes:42,method:'pump'}],
      ['leaf-normal',-2,fieldA,riceA,null,manager.user_id,'inspection',{leafCondition:'normal'}],
      ['pump-noise',-3,fieldB,riceB,null,arjun.user_id,'problem',{issue:'pump_noise',severity:'medium'}],
      ['fertilizer',-4,fieldA,riceA,null,owner.user_id,'fertilizer',{quantity:12,unit:'kg'}],
      ['weed-low',-5,vegetable,tomato,null,asha.user_id,'inspection',{weedLevel:'low'}],
    ];
    for (const [key,offset,field,cycle,linkedTask,actor,recordType,data] of records) {
      const day=date(offset);
      await client.query(`INSERT INTO app.farm_records(id,farm_id,field_id,crop_cycle_id,task_id,actor_user_id,record_type,occurred_at,local_date,data)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET field_id=EXCLUDED.field_id,
        crop_cycle_id=EXCLUDED.crop_cycle_id,task_id=EXCLUDED.task_id,actor_user_id=EXCLUDED.actor_user_id,
        record_type=EXCLUDED.record_type,occurred_at=EXCLUDED.occurred_at,local_date=EXCLUDED.local_date,data=EXCLUDED.data`,
      [id(`record-${key}`),farmId,field,cycle,linkedTask,actor,recordType,at(day,10),day,{...data,demo:true}]);
    }
    const templates = [
      ['rice-scout','Rice scouting','rice','inspection','Scout rice leaves','normal',45,3,['Check lower leaves','Record affected area']],
      ['pump-check','Pump inspection',null,'machinery','Inspect irrigation pump','high',45,7,['Check inlet','Listen for unusual noise']],
      ['soil-moisture','Soil moisture record','tomato','record','Record tomato soil moisture','normal',20,2,['Check two locations','Record moisture level']],
    ];
    for (const [key,name,crop,type,title,priority,duration,offset,items] of templates) await client.query(`INSERT INTO app.farm_task_templates
      (id,farm_id,name,crop_code,type,title_template,priority,default_duration_minutes,offset_days,checklist,is_system)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,crop_code=EXCLUDED.crop_code,
      type=EXCLUDED.type,title_template=EXCLUDED.title_template,priority=EXCLUDED.priority,
      default_duration_minutes=EXCLUDED.default_duration_minutes,offset_days=EXCLUDED.offset_days,checklist=EXCLUDED.checklist,is_active=true,updated_at=now()`,
    [id(`template-${key}`),farmId,name,crop,type,title,priority,duration,offset,JSON.stringify(items)]);
    const weatherPayload={provider:'open-meteo',source:'demo',stale:false,timezone:'Asia/Kolkata',current:{temperatureC:31.2,rainProbability:70,windSpeedKph:18},daily:[{date:demoDate,rainProbabilityMax:70,windSpeedMaxKph:18,weatherCode:61}],summary:'Rain probability 70% after 15:00',demo:true};
    await client.query(`INSERT INTO app.farm_weather_snapshots(id,farm_id,provider,payload,fetched_at,expires_at)
      VALUES ($1,$2,'open-meteo',$3,$4,$5) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,fetched_at=EXCLUDED.fetched_at,expires_at=EXCLUDED.expires_at`,
    [id('weather-demo'),farmId,weatherPayload,at(demoDate,9),at(date(2),9)]);
    const notifications = [
      ['asha-assignment',asha.user_id,'assignment','New task assigned','Check tomato supports on 22 Sep',taskId('tomato-supports')],
      ['manager-verify',manager.user_id,'verification','Work waiting for review','Drainage repair review is ready to verify',taskId('verify-drainage')],
      ['weather-warning',manager.user_id,'weather_warning','Spray task at risk','Rain and wind may affect the vegetable plot task',taskId('spray')],
    ];
    for (const [key,userId,type,title,body,linkedTask] of notifications) await client.query(`INSERT INTO app.farm_notifications
      (id,farm_id,user_id,type,title,body,task_id,dedupe_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,type=EXCLUDED.type,title=EXCLUDED.title,body=EXCLUDED.body,task_id=EXCLUDED.task_id`,
    [id(`notification-${key}`),farmId,userId,type,title,body,linkedTask,`demo:${key}`]);
    await client.query('COMMIT');
    return {farmId,demoDate,members:5,fields:fields.length,cropCycles:cycles.length,tasks:tasks.length,records:records.length,templates:templates.length,notifications:notifications.length};
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool=createPool();
  if (!pool) throw new Error('DATABASE_URL is required.');
  try { console.log(await seedFarmOps(pool)); } finally { await pool.end(); }
}
