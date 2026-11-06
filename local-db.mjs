import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

export async function openPlanner(directory) {
  const db = await PGlite.create(directory);
  try {
    const {rows} = await db.query("select to_regnamespace('brunch_private') as existing");
    if (!rows[0].existing) {
      await db.exec('create role anon; create role authenticated;');
      await db.exec(await readFile(new URL('./supabase/brunch.sql', import.meta.url), 'utf8'));
    }
    return db;
  } catch (error) { await db.close(); throw error; }
}

const routes = {
  brunch_menu: ['p_visitor','p_host'],
  brunch_save_food: ['p_host','p_input','p_visitor'],
  brunch_change: ['p_food','p_request','p_visitor','p_delta','p_selected']
};
export async function guestCall(db, name, input) {
  if (!Object.hasOwn(routes, name)) throw Error('Unbekannte Aktion.');
  const keys = routes[name];
  const values = keys.map(key => key === 'p_visitor' ? input[key] ?? '' : input[key] ?? null);
  return db.transaction(async tx => {
    await tx.exec('set local role anon');
    const slots = keys.map((_, i) => '$' + (i + 1)).join(',');
    const {rows} = await tx.query('select public.' + name + '(' + slots + ') as result', values);
    return rows[0].result;
  });
}
