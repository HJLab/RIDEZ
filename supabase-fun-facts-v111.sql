-- RIDEZ v111 · Fun Facts
-- Gemmer kun beregnede, ufarlige sammendrag. Rå sensor- og positionsdata
-- udleveres ikke af de nye funktioner.

alter table public.ridez_rides
  add column if not exists fun_facts jsonb not null default '{"version":111,"items":[]}'::jsonb;

create or replace function public.ridez_update_fun_facts_v111(
  p_driver_token text,
  p_fun_facts jsonb
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  rid uuid;
  safe_items jsonb;
begin
  select id into rid
  from public.ridez_rides
  where driver_token=p_driver_token and active=true
  order by created_at desc
  limit 1;

  if rid is null then
    raise exception 'active ride not found';
  end if;

  with raw as (
    select
      case when (e->>'id') ~ '^[0-9]+$' then (e->>'id')::integer end as id,
      left(coalesce(e->>'value',''),120) as value,
      left(coalesce(e->>'detail',''),180) as detail
    from jsonb_array_elements(
      case
        when jsonb_typeof(p_fun_facts)='object'
         and jsonb_typeof(p_fun_facts->'items')='array'
        then p_fun_facts->'items'
        else '[]'::jsonb
      end
    ) e
  ), allowed as (
    select distinct on (id) id,value,detail
    from raw
    where id in (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,20,21,22,23,24,25,26,27,28,29,30,35,36,37,39,40)
      and value<>''
    order by id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id',id,'value',value,'detail',detail)
      order by id
    ),
    '[]'::jsonb
  ) into safe_items
  from allowed;

  update public.ridez_rides
  set fun_facts=jsonb_build_object('version',111,'items',safe_items)
  where id=rid;

  return true;
end
$$;

revoke all on function public.ridez_update_fun_facts_v111(text,jsonb) from public;
grant execute on function public.ridez_update_fun_facts_v111(text,jsonb) to anon;

create or replace function public.ridez_public_fun_facts_v111(
  p_public_token text
) returns jsonb
language sql
security definer
set search_path=public
as $$
  select coalesce(r.fun_facts,'{"version":111,"items":[]}'::jsonb)
  from public.ridez_rides r
  where r.public_token=p_public_token
  order by r.created_at desc
  limit 1
$$;

revoke all on function public.ridez_public_fun_facts_v111(text) from public;
grant execute on function public.ridez_public_fun_facts_v111(text) to anon;

create or replace function public.ridez_history_fun_facts_v111(
  p_owner_token text,
  p_ride_id uuid
) returns jsonb
language sql
security definer
set search_path=public
as $$
  select coalesce(r.fun_facts,'{"version":111,"items":[]}'::jsonb)
  from public.ridez_rides r
  where r.id=p_ride_id
    and r.owner_token=p_owner_token
    and r.active=false
  limit 1
$$;

revoke all on function public.ridez_history_fun_facts_v111(text,uuid) from public;
grant execute on function public.ridez_history_fun_facts_v111(text,uuid) to anon;
