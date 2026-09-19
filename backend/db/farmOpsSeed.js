import crypto from 'node:crypto';
import { createPool } from './pool.js';

const id = (key) => {
  const h = crypto.createHash('md5').update(`agrilink-farm-ops:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
export const FARM_DEMO_ID = id('green-field');

export async function seedFarmOps(pool, { demoDate = process.env.DEMO_DATE || '2026-09-19' } = {}) {
  const members = (await pool.query(`SELECT s.demo_key,p.user_id,p.display_name FROM app.forum_user_state s JOIN app.user_profiles p ON p.user_id=s.user_id WHERE s.demo_key IN ('10000001','10000002','10000003','10000004') ORDER BY s.demo_key`)).rows;
  if (members.length < 4) throw new Error('Seed Farmer Circle demo users before Today\'s Farm.');
  const [owner, manager, worker, viewer] = members;
  const farmId = FARM_DEMO_ID;
  const fieldA = id('field-a'); const fieldB = id('field-b');
  const rice = id('rice-cycle'); const veg = id('veg-cycle');
  const date = (offset) => { const d = new Date(`${demoDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
  const at = (day, hour) => `${day}T${String(hour).padStart(2, '0')}:00:00Z`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO app.farms(id,name,owner_user_id,country_code,region_code,timezone,latitude,longitude)
      VALUES ($1,'Green Field Farm',$2,'IN','IN-BR-PATNA','Asia/Kolkata',25.59410,85.13760) ON CONFLICT(id) DO NOTHING`, [farmId, owner.user_id]);
    for (const [m, role] of [[owner,'owner'],[manager,'manager'],[worker,'worker'],[viewer,'viewer']]) await client.query(`INSERT INTO app.farm_members(farm_id,user_id,role,status,accepted_at) VALUES ($1,$2,$3,'active',now()) ON CONFLICT(farm_id,user_id) DO UPDATE SET role=EXCLUDED.role,status='active'`, [farmId, m.user_id, role]);
    await client.query(`INSERT INTO app.farm_fields(id,farm_id,name,area_value,area_unit,irrigation_type) VALUES
      ($1,$3,'North Rice Field',1.8,'ha','canal'),($2,$3,'Vegetable Plot',0.6,'ha','drip') ON CONFLICT(id) DO NOTHING`, [fieldA, fieldB, farmId]);
    await client.query(`INSERT INTO app.crop_cycles(id,farm_id,field_id,crop_code,variety,planting_date,target_harvest_date,stage,template_version) VALUES
      ($1,$3,$4,'rice','Swarna',$6::date - 42,$6::date + 48,'tillering',1),
      ($2,$3,$5,'tomato','Pusa Ruby',$6::date - 25,$6::date + 55,'vegetative',1) ON CONFLICT(id) DO NOTHING`, [rice, veg, farmId, fieldA, fieldB, demoDate]);
    const tasks = [
      ['pump','Inspect irrigation pump','machinery','high','assigned',-1,fieldB,veg,worker.user_id,45],
      ['leaf','Check rice leaf spots','inspection','high','assigned',0,fieldA,rice,manager.user_id,45],
      ['water','Irrigate north plot','irrigation','normal','in_progress',0,fieldA,rice,worker.user_id,90],
      ['records','Record water reading','record','normal','completed',0,fieldA,rice,owner.user_id,20],
      ['drain','Clear drainage channel','custom','urgent','blocked',0,fieldA,rice,null,60],
      ['weeds','Inspect weeds','inspection','normal','assigned',1,fieldA,rice,manager.user_id,40],
      ['harvest','Review harvest plan','harvest','high','scheduled',6,fieldA,rice,null,60],
    ];
    for (const [key,title,type,priority,status,offset,field,cycle,assignee,minutes] of tasks) {
      const taskId=id(`task-${key}`), day=date(offset);
      await client.query(`INSERT INTO app.farm_tasks(id,farm_id,field_id,crop_cycle_id,created_by,title,type,priority,status,local_date,start_at,due_at,timezone,estimated_minutes,blocked_reason,completed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Asia/Kolkata',$13,$14,$15) ON CONFLICT(id) DO UPDATE SET local_date=EXCLUDED.local_date,start_at=EXCLUDED.start_at,due_at=EXCLUDED.due_at`,
      [taskId,farmId,field,cycle,owner.user_id,title,type,priority,status,day,at(day,9),at(day,11),minutes,status==='blocked'?'Pump repair required':null,status==='completed'?at(day,10):null]);
      if (assignee) await client.query(`INSERT INTO app.farm_task_assignments(task_id,user_id,assigned_by,status) VALUES ($1,$2,$3,$4) ON CONFLICT(task_id,user_id) DO UPDATE SET status=EXCLUDED.status`, [taskId,assignee,owner.user_id,status==='in_progress'?'accepted':status==='completed'?'completed':'assigned']);
      await client.query(`INSERT INTO app.farm_task_events(id,task_id,actor_user_id,event_type,to_status,data) VALUES ($1,$2,$3,'seeded',$4,'{"demo":true}') ON CONFLICT(id) DO NOTHING`, [id(`event-${key}`),taskId,owner.user_id,status]);
      if (status==='completed') {
        await client.query(`INSERT INTO app.farm_task_results(id,task_id,completed_by,result_code,result,note,actual_finish_at,labor_minutes) VALUES ($1,$2,$3,'normal','{"reading":"stable"}','Demo completion',now(),18) ON CONFLICT(task_id) DO NOTHING`, [id(`result-${key}`),taskId,owner.user_id]);
        await client.query(`INSERT INTO app.farm_records(id,farm_id,field_id,crop_cycle_id,task_id,actor_user_id,record_type,occurred_at,local_date,data) VALUES ($1,$2,$3,$4,$5,$6,'irrigation',now(),$7,'{"reading":"stable","demo":true}') ON CONFLICT(id) DO NOTHING`, [id(`record-${key}`),farmId,field,cycle,taskId,owner.user_id,day]);
      }
    }
    const leafTask=id('task-leaf');
    for (const [n,label] of ['Check lower leaves','Check leaf underside','Record spread level'].entries()) await client.query(`INSERT INTO app.farm_task_checklist_items(id,task_id,label,sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING`, [id(`leaf-check-${n}`),leafTask,label,n]);
    await client.query(`INSERT INTO app.farm_task_templates(id,farm_id,name,crop_code,type,title_template,priority,default_duration_minutes,offset_days,checklist,is_system)
      VALUES ($1,NULL,'Rice scouting','rice','inspection','Scout for pest signs','normal',45,45,'["Check lower leaves","Record affected area"]',true) ON CONFLICT(id) DO NOTHING`, [id('rice-template')]);
    await client.query('COMMIT');
    return { farmId, demoDate, members: members.length, tasks: tasks.length };
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = createPool();
  if (!pool) throw new Error('DATABASE_URL is required.');
  try { console.log(await seedFarmOps(pool)); } finally { await pool.end(); }
}
