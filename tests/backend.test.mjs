import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { guestCall, openPlanner } from '../local-db.mjs';
import { liveConfig, renderPage } from '../page.mjs';

test('shared planner transactions and permissions, followed by a database restart', async t => {
  const path = await mkdtemp(join(tmpdir(),'brunch-test-'));
  let db = await openPlanner(path);
  t.after(async () => {await db.close();await rm(path,{recursive:true,force:true});});
  const call = (name, args={}) => guestCall(db,'brunch_'+name,args);
  const host = (await db.query('select host_code from brunch_private.settings')).rows[0].host_code;
  const alice=randomUUID(), bob=randomUUID();
  const food = (id,mode) => ({id,name:id,mode,unit:'Tassen',active:true});
  const save = (input, code=host) => call('save_food',{p_host:code,p_input:input});
  const change = (id, visitor, values, req=randomUUID()) => call('change',{p_food:id,p_visitor:visitor,p_request:req,...values});
  const count = async (id) => (await call('menu')).foods.find(f=>f.id===id)?.total;
  const tea=food('Tee','interest'), coffee=food('Kaffee','quantity');
  await t.test('guests cannot read private tables or edit the menu', async () => {
    assert.deepEqual((await call('menu')).foods,[]);
    for (const key of [null,'','wrong']) await assert.rejects(save(tea,key),/Gastgeber-Code/);
    await assert.rejects(call('menu',{p_host:'wrong'}),/Gastgeber-Code/);
    await assert.rejects(db.transaction(async tx=>{
      await tx.exec('set local role anon');await tx.query('select host_code from brunch_private.settings');
    }),/permission denied/);
    await save(tea);await save(coffee);await save(coffee);
    assert.equal((await call('menu')).foods.length,2);
    await assert.rejects(save({...tea,mode:'quantity'}),/Zählweise/);
  });
  await t.test('quantity changes persist once per request, including retries at zero', async () => {
    const minus=randomUUID(), plus=randomUUID();
    await change('Kaffee',alice,{p_delta:-1},minus);
    await Promise.all([change('Kaffee',alice,{p_delta:1},plus),change('Kaffee',bob,{p_delta:1})]);
    await change('Kaffee',alice,{p_delta:1},plus);await change('Kaffee',alice,{p_delta:-1},minus);
    assert.equal(await count('Kaffee'),2);
    await assert.rejects(change('Kaffee',alice,{p_delta:-1},plus),/andere Auswahl/);
    await assert.rejects(change('Kaffee',alice,{p_delta:2}),/ungültig/);
    await assert.rejects(change('Kaffee',alice,{p_selected:true}),/Zählweise/);
    await db.query("update brunch_private.foods set total=10000 where id='Kaffee'");
    await change('Kaffee',bob,{p_delta:1});assert.equal(await count('Kaffee'),10000);
    await change('Kaffee',bob,{p_delta:-1});assert.equal(await count('Kaffee'),9999);
  });
  await t.test('two people can choose tea, withdraw individually, and retry without double counting', async () => {
    const first=randomUUID();
    await change('Tee',alice,{p_selected:true},first);
    await change('Tee',alice,{p_selected:true});
    await change('Tee',bob,{p_selected:true});assert.equal(await count('Tee'),2);
    await change('Tee',alice,{p_selected:false});await change('Tee',alice,{p_selected:true},first);
    const result = await call('menu',{p_visitor:bob});assert.equal(result.foods[0].selected,true);
    assert.equal(await count('Tee'),1);assert.ok(!JSON.stringify(result).includes(alice));
    await assert.rejects(change('Tee','',{p_selected:true}),/ungültig/);
    await assert.rejects(change('Tee',alice,{p_delta:1}),/Zählweise/);
    await save({...tea,name:'Schwarzer Tee',active:false});assert.equal(await count('Tee'),undefined);
    assert.match((await change('Tee',alice,{p_selected:true})).notice,/Liste/);
    assert.equal((await call('menu',{p_host:host})).foods[0].total,1);
    await save(tea);
  });
  await db.close(); db = await openPlanner(path);
  assert.equal(await count('Kaffee'),9999);assert.equal(await count('Tee'),1);
  assert.equal((await call('menu',{p_visitor:bob})).foods[0].selected,true);
  assert.equal((await call('menu',{p_host:host})).foods.length,2);
});

test('production page contains a public key only and never uses a local counter', async () => {
  const url='https://unit-test.supabase.co', key='sb_publishable_test';
  assert.throws(()=>liveConfig(url,'sb_secret_abc'));
  assert.throws(()=>liveConfig('http://unit-test.supabase.co',key));
  const html=await renderPage(liveConfig(url,key));
  assert.ok(html.includes(url+'/rest/v1/rpc/'));
  assert.doesNotMatch(html,/<!-- (CLIENT|CONFIG) -->|google\.script|Google Sheets|demoSnapshot/);
});
