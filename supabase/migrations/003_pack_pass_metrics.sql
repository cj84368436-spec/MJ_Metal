-- Shared mock purchases and anonymous daily experiment totals, effective from rollout.
begin;

-- Entitlements from the retired 001 experiment do not authorize this product.
create table secret_five_private.pack2_passes (
  device_hash bytea primary key
);

alter table secret_five_private.rooms
  add column guest_replay boolean not null default false,
  add column pack_purchase_proof bytea,
  add column redeal_ids text[];

create table secret_five_private.daily_metrics (
  day date not null,
  pack text not null,
  completed_rooms bigint not null default 0,
  replay_completed_rooms bigint not null default 0,
  room_purchases bigint not null default 0,
  room_krw bigint not null default 0,
  pack_purchases bigint not null default 0,
  pack_krw bigint not null default 0,
  primary key (day, pack)
);
revoke all on secret_five_private.pack2_passes, secret_five_private.daily_metrics
  from public, anon, authenticated;

create or replace function public.secret_five(op text, args jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, secret_five_private, pg_temp as $$
declare
  r rooms%rowtype;
  rid text := args->>'id';
  p text := args->>'pack';
  seat bytea := sha256(convert_to(args->>'token','UTF8'));
  device_key bytea;
  purchase_proof bytea;
  guest_replay boolean;
  metric_day date := (now() at time zone 'UTC')::date;
  price integer;
  qs text[];
  answers text[];
  matches text[];
  nick text;
  is_host boolean;
  headers jsonb := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  who text := coalesce(nullif(trim(split_part(headers->>'x-forwarded-for',',',1)),''), 'local');
  bucket_start timestamptz := date_trunc('minute',now());
  hits integer;
begin
  if octet_length(args::text)>4096 then raise exception 'INVALID_INPUT'; end if;
  if op='create' then bucket_start:=date_trunc('hour',now()); end if;
  insert into limits as l values(sha256(convert_to(who||':'||coalesce(op,'')||coalesce(args->>'token',''),'UTF8')),bucket_start,1)
    on conflict(bucket,period) do update set hits=l.hits+1 returning l.hits into hits;
  if hits > (case when op='create' then 20 else 30 end) then raise exception 'TOO_MANY'; end if;

  if coalesce(rid,'') !~ '^[a-z0-9]{8}$' then raise exception 'INVALID_ID'; end if;
  if op in ('create','answer') then
    answers:=array(select jsonb_array_elements_text(args->'answers'));
    if cardinality(answers)<>5 or array_position(answers,null) is not null
      or not (answers <@ array['yes','maybe','no']) then raise exception 'INVALID_ANSWERS'; end if;
  end if;
  if (op='create' and args ? 'device') or op='test_pack_pass' then
    if jsonb_typeof(args->'device') is distinct from 'string'
      or args->>'device' !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'INVALID_DEVICE'; end if;
    device_key:=sha256(convert_to(args->>'device','UTF8'));
  end if;
  if op='create' then
    if coalesce(p,'') !~ '^pack[1-4]$' or coalesce(args->>'host','') !~ '^[A-Za-z0-9_-]{43}$'
      or coalesce(args->>'guest','') !~ '^[A-Za-z0-9_-]{43}$' or args->>'host'=args->>'guest' then
      raise exception 'INVALID_ROOM';
    end if;
    qs:=array(select jsonb_array_elements_text(args->'ids'));
    if cardinality(qs)<>5 or (select count(distinct q) from unnest(qs) q)<>5
      or exists(select from unnest(qs) q where q !~ ('^p'||right(p,1)||'-(0[1-9]|1[0-5])$'))
      then raise exception 'INVALID_SELECTION'; end if;
    delete from rooms where created_at<now()-interval '7 days';
    delete from limits where limits.period<now()-interval '2 hours';
    -- Attribute the child once, without retaining the parent ID or its guest token.
    guest_replay:=exists(
      select from rooms parent where parent.id=args->>'parent_id' and parent.id<>rid
        and parent.pack=p and parent.guest_answers is not null
        and parent.created_at>now()-interval '7 days'
        and parent.guest_hash=sha256(convert_to(args->>'parent_guest','UTF8'))
    );
    insert into rooms(id,pack,ids,host_hash,guest_hash,host_answers,unlocked,guest_replay)
      values(rid,p,qs,sha256(convert_to(args->>'host','UTF8')),sha256(convert_to(args->>'guest','UTF8')),answers,
        p='pack1' or (p='pack2' and exists(select from pack2_passes where device_hash=device_key)), guest_replay)
      on conflict do nothing;
    if not found and not exists(select from rooms where id=rid and host_hash=sha256(convert_to(args->>'host','UTF8'))) then
      raise exception 'ID_COLLISION';
    end if;
    return 'true';
  end if;

  -- Serialize decisions on this room, including competing seats/products and retries.
  if op in ('answer','nickname','test_unlock','test_pack_pass','redeal') then
    select * into r from rooms where id=rid and seat in (host_hash,guest_hash) for update;
  else
    select * into r from rooms where id=rid and seat in (host_hash,guest_hash);
  end if;
  if not found then raise exception 'INVALID_LINK'; end if;
  if r.created_at<=now()-interval '7 days' then raise exception 'EXPIRED'; end if;
  is_host:=seat=r.host_hash;
  if op='answer' then
    if is_host then raise exception 'WRONG_SEAT'; end if;
    update rooms set guest_answers=answers where id=rid and guest_answers is null;
    if found then
      insert into daily_metrics as m(day,pack,completed_rooms,replay_completed_rooms)
        values(metric_day,r.pack,1,r.guest_replay::integer)
        on conflict(day,pack) do update set completed_rooms=m.completed_rooms+1,
          replay_completed_rooms=m.replay_completed_rooms+excluded.replay_completed_rooms;
    end if;
    return 'true';
  elsif op='nickname' then
    nick:=coalesce(args->>'nick','');
    if not is_host or (nick<>'' and (nick !~ '^[[:alnum:]가-힣]{2,6}$' or nick ~* '씨발|시발|병신|개새끼|fuck|shit')) then
      raise exception 'INVALID_NICK'; end if;
    update rooms set nick=coalesce(args->>'nick','') where id=rid;
    return 'true';
  elsif op='redeal' then
    if r.guest_answers is null then raise exception 'NO_RESULT'; end if;
    -- Both seats get the same random draw. Repeated calls cannot enumerate the complement.
    if r.redeal_ids is null then
      r.redeal_ids:=array(
        select q from (select 'p'||right(r.pack,1)||'-'||lpad(i::text,2,'0') as q
          from generate_series(1,15) i) pool
        where q<>all(r.ids) order by random() limit 5
      );
      update rooms set redeal_ids=r.redeal_ids where id=rid;
    end if;
    return to_jsonb(r.redeal_ids);
  elsif op is null or op not in ('state','test_unlock','test_pack_pass') then
    raise exception 'INVALID_ACTION';
  end if;

  if r.guest_answers is not null then
    select coalesce(array_agg(r.ids[i] order by i),'{}') into matches from generate_series(1,5) i
      where r.host_answers[i]='yes' and r.guest_answers[i]='yes';
  end if;
  if op in ('test_unlock','test_pack_pass') then
    if (select test_purchases from settings) is not true then raise exception 'TEST_PURCHASE_DISABLED'; end if;
    if args ? 'product' and (args->>'product') is distinct from
      (case when op='test_unlock' then 'room' else 'pack' end) then raise exception 'INVALID_PRODUCT'; end if;
    if op='test_pack_pass' and r.pack<>'pack2' then raise exception 'INVALID_PRODUCT'; end if;
    if r.guest_answers is null then raise exception 'NO_RESULT'; end if;
    if op='test_pack_pass' then
      -- Both inputs are fixed-width digests. Only the exact seat/device may replay this receipt.
      purchase_proof:=sha256(seat||device_key);
      if r.pack_purchase_proof=purchase_proof then return 'true'; end if;
      if r.unlocked then raise exception 'ALREADY_UNLOCKED'; end if;
    end if;
    if r.pack='pack1' or cardinality(matches)<=1 then raise exception 'NO_LOCKED_MATCHES'; end if;
    if r.unlocked then return 'true'; end if; -- Legacy room unlock retry.

    if op='test_pack_pass' then
      insert into pack2_passes(device_hash) values(device_key) on conflict do nothing;
      if not found then raise exception 'PASS_ALREADY_OWNED'; end if;
      insert into daily_metrics as m(day,pack,pack_purchases,pack_krw) values(metric_day,r.pack,1,3300)
        on conflict(day,pack) do update set pack_purchases=m.pack_purchases+1, pack_krw=m.pack_krw+excluded.pack_krw;
    else
      price:=case r.pack when 'pack4' then 1500 else 1100 end;
      insert into daily_metrics as m(day,pack,room_purchases,room_krw) values(metric_day,r.pack,1,price)
        on conflict(day,pack) do update set room_purchases=m.room_purchases+1, room_krw=m.room_krw+excluded.room_krw;
    end if;
    update rooms set unlocked=true, pack_purchase_proof=purchase_proof where id=rid;
    return 'true';
  end if;
  -- 열린 카드는 무료 팩이거나 잠금을 해제한 방이면 전부, 아니면 한 장만.
  return jsonb_build_object('pack',r.pack,'nick',r.nick,'created',extract(epoch from r.created_at)*1000,
    'ids',case when matches is null then r.ids end,'matched',cardinality(matches),
    'unlocked',(r.unlocked or r.pack='pack1'),
    'opened',case when matches is null then null
      when r.unlocked or r.pack='pack1' then matches else matches[1:1] end);
end;
$$;
revoke all on function public.secret_five(text,jsonb) from public;
grant execute on function public.secret_five(text,jsonb) to anon,authenticated;
commit;
