-- Run once in the database's SQL Editor. All planner data is private.
begin;
create schema brunch_private;
revoke all on schema brunch_private from public, anon, authenticated;

create table brunch_private.settings (
  singleton boolean primary key default true check (singleton),
  host_code text not null default gen_random_uuid()::text
);
insert into brunch_private.settings default values;

create table brunch_private.foods (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  name text not null check (length(name) between 1 and 80),
  mode text not null check (mode in ('quantity', 'interest')),
  unit text not null check (length(unit) between 1 and 24),
  active boolean not null,
  position bigint generated always as identity,
  total integer not null default 0 check (total between 0 and 10000)
);
create table brunch_private.changes (
  request_id text primary key check (request_id ~ '^[a-zA-Z0-9_-]{16,100}$'),
  food_id text not null references brunch_private.foods,
  visitor text not null,
  delta integer check (delta in (-1, 1)),
  selected boolean,
  seq bigint generated always as identity,
  check ((delta is null) <> (selected is null))
);
create index brunch_interest on brunch_private.changes (food_id, visitor, seq desc)
  where selected is not null;
alter table brunch_private.settings enable row level security;
alter table brunch_private.foods enable row level security;
alter table brunch_private.changes enable row level security;
revoke all on all tables in schema brunch_private from public, anon, authenticated;

create function brunch_private.require_host(code text) returns void
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from brunch_private.settings where host_code = code) then
    raise exception 'Der Gastgeber-Code ist ungültig.';
  end if;
end $$;

create function public.brunch_menu(p_visitor text default '', p_host text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare items jsonb;
begin
  if p_host is not null then perform brunch_private.require_host(p_host); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'name', f.name, 'mode', f.mode, 'unit', f.unit,
    'active', f.active, 'total', f.total, 'selected', coalesce((
      select c.selected from brunch_private.changes c
      where c.food_id = f.id and c.visitor = p_visitor and c.selected is not null
      order by c.seq desc limit 1
    ), false)
  ) order by f.position), '[]'::jsonb) into items
  from brunch_private.foods f where f.active or p_host is not null;
  return jsonb_build_object('foods', items, 'maximum', 10000);
end $$;

create function public.brunch_save_food(p_host text, p_input jsonb, p_visitor text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  food_name text := btrim(p_input->>'name');
  food_mode text := p_input->>'mode';
  food_unit text := case when food_mode = 'interest' then 'Personen' else btrim(p_input->>'unit') end;
begin
  perform brunch_private.require_host(p_host);
  if coalesce(p_input->>'id','') !~ '^[a-zA-Z0-9_-]{1,100}$'
    or coalesce(food_mode,'') not in ('interest','quantity')
    or jsonb_typeof(p_input->'active') is distinct from 'boolean'
    or length(coalesce(food_name,'')) not between 1 and 80
    or length(coalesce(food_unit,'')) not between 1 and 24 then
    raise exception 'Bitte Namen, Zählweise und Einheit prüfen.';
  end if;
  insert into brunch_private.foods as f (id, name, mode, unit, active)
    values (p_input->>'id', food_name, food_mode, food_unit, (p_input->>'active')::boolean)
    on conflict (id) do update set name = excluded.name, unit = excluded.unit, active = excluded.active
    where f.mode = excluded.mode;
  if not found then raise exception 'Die Zählweise eines bestehenden Eintrags bleibt erhalten.'; end if;
  return public.brunch_menu(p_visitor, p_host);
end $$;

create function public.brunch_change(p_food text, p_request text, p_visitor text default '',
  p_delta integer default null, p_selected boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  food brunch_private.foods%rowtype;
  previous brunch_private.changes%rowtype;
  was_selected boolean;
  adjustment integer;
begin
  if coalesce(p_request,'') !~ '^[a-zA-Z0-9_-]{16,100}$'
    or p_visitor is null or (p_visitor <> '' and p_visitor !~ '^[a-zA-Z0-9_-]{16,100}$')
    or (p_delta is null) = (p_selected is null) or p_delta not in (-1,1)
    or (p_selected is not null and p_visitor = '') then
    raise exception 'Diese Änderung ist ungültig.';
  end if;
  -- Serialize changes to one food, including the retry check and the new total.
  select * into food from brunch_private.foods where id = p_food for update;
  select * into previous from brunch_private.changes where request_id = p_request;
  if found then
    if (previous.food_id, previous.visitor, previous.delta, previous.selected)
        is distinct from (p_food, p_visitor, p_delta, p_selected) then
      raise exception 'Diese Anfrage wurde bereits für eine andere Auswahl verwendet.';
    end if;
    return public.brunch_menu(p_visitor);
  end if;
  if food.id is null or not food.active then
    return public.brunch_menu(p_visitor) || jsonb_build_object('notice', 'Dieser Eintrag ist nicht mehr auf der Liste.');
  end if;
  if (food.mode = 'quantity') <> (p_delta is not null) then
    raise exception 'Diese Änderung passt nicht zur Zählweise.';
  end if;
  if p_selected is null then
    adjustment := greatest(0, least(10000, food.total + p_delta)) - food.total;
  else
    select selected into was_selected from brunch_private.changes
      where food_id = p_food and visitor = p_visitor and selected is not null order by seq desc limit 1;
    adjustment := p_selected::integer - coalesce(was_selected, false)::integer;
    if food.total + adjustment > 10000 then raise exception 'Die maximale Anzahl ist erreicht.'; end if;
  end if;
  insert into brunch_private.changes (request_id, food_id, visitor, delta, selected)
    values (p_request, p_food, p_visitor, p_delta, p_selected);
  update brunch_private.foods set total = total + adjustment where id = p_food;
  return public.brunch_menu(p_visitor);
end $$;

revoke all on function public.brunch_menu(text,text), public.brunch_save_food(text,jsonb,text),
  public.brunch_change(text,text,text,integer,boolean) from public, anon, authenticated;
grant execute on function public.brunch_menu(text,text), public.brunch_save_food(text,jsonb,text),
  public.brunch_change(text,text,text,integer,boolean) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
