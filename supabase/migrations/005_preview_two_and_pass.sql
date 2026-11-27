-- 5.0 결제 규칙
--
-- 두 사람이 답을 마치면 결과 화면에서 둘 다 yes인 카드를 **두 장까지 무료**로 열고,
-- 나머지 '통한 카드'와 카드별 한마디는 그 방에서 한 번 단건 결제하거나 전 팩
-- 자유이용 패스로 연다. 무료 팩(pack1)도 예외가 아니다(단건 1,100원).
--
-- 이 파일은 001~004를 지우지 않고 함수만 다시 정의한다.
--   · `secret_five`     : state의 무료 미리보기 2장, test_unlock의 무료 팩 허용,
--                         test_pack_pass의 전 팩·1,900원 규칙
--   · `secret_five_ad`  : 무료 두 장 다음 한 장(겹친 카드의 세 번째)을 광고로 연다
--
-- 003에서 만든 pack2 전용 3,300원 이용권(`pack2_passes`)은 이미 산 기기를 위해
-- pack2에서만 계속 인정하고, 5.0 패스는 새 표(`all_passes`)로 네 팩 모두에 적용한다.
begin;

create table if not exists secret_five_private.all_passes (
  device_hash bytea primary key
);
revoke all on secret_five_private.all_passes from public, anon, authenticated;

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
    -- 무료 팩도 만들 때부터 열리지 않는다. 패스만 미리 연다(003의 pack2 이용권은 인정).
    insert into rooms(id,pack,ids,host_hash,guest_hash,host_answers,unlocked,guest_replay)
      values(rid,p,qs,sha256(convert_to(args->>'host','UTF8')),sha256(convert_to(args->>'guest','UTF8')),answers,
        (device_key is not null and exists(select from all_passes where device_hash=device_key))
          or (p='pack2' and device_key is not null
            and exists(select from pack2_passes where device_hash=device_key)),
        guest_replay)
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
    if r.guest_answers is null then raise exception 'NO_RESULT'; end if;
    if op='test_pack_pass' then
      -- Both inputs are fixed-width digests. Only the exact seat/device may replay this receipt.
      purchase_proof:=sha256(seat||device_key);
      if r.pack_purchase_proof=purchase_proof then return 'true'; end if;
      if r.unlocked then raise exception 'ALREADY_UNLOCKED'; end if;
    end if;
    -- 무료 두 장 다음에 잠글 카드가 있어야 결제할 것이 있다. 무료 팩도 같다.
    if cardinality(matches)<=2 then raise exception 'NO_LOCKED_MATCHES'; end if;
    if r.unlocked then return 'true'; end if; -- Legacy room unlock retry.

    if op='test_pack_pass' then
      insert into all_passes(device_hash) values(device_key) on conflict do nothing;
      -- 이미 패스를 가진 기기는 새 주문을 만들지 않고 이 방만 연다.
      if found then
        insert into daily_metrics as m(day,pack,pack_purchases,pack_krw) values(metric_day,r.pack,1,1900)
          on conflict(day,pack) do update set pack_purchases=m.pack_purchases+1, pack_krw=m.pack_krw+excluded.pack_krw;
      end if;
    else
      price:=case r.pack when 'pack4' then 1496 else 1100 end;
      insert into daily_metrics as m(day,pack,room_purchases,room_krw) values(metric_day,r.pack,1,price)
        on conflict(day,pack) do update set room_purchases=m.room_purchases+1, room_krw=m.room_krw+excluded.room_krw;
    end if;
    update rooms set unlocked=true, pack_purchase_proof=purchase_proof where id=rid;
    return 'true';
  end if;
  -- 열린 카드는 잠금을 해제한 방이면 전부, 아니면 두 장까지다(무료 팩도 같다).
  -- 상대의 원본 응답, 서로 다른 카드, 카드별 잠금 사유는 어떤 경우에도 내보내지 않는다.
  return jsonb_build_object('pack',r.pack,'nick',r.nick,'created',extract(epoch from r.created_at)*1000,
    'ids',case when matches is null then r.ids end,'matched',cardinality(matches),
    'unlocked',r.unlocked,
    'opened',case when matches is null then null
      when r.unlocked then matches else matches[1:2] end);
end;
$$;
revoke all on function public.secret_five(text,jsonb) from public;
grant execute on function public.secret_five(text,jsonb) to anon,authenticated;

create or replace function public.secret_five_ad(op text, args jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, secret_five_private, pg_temp as $$
declare
  r rooms%rowtype;
  rid text := args->>'id';
  seat bytea := sha256(convert_to(args->>'token','UTF8'));
  matches text[];
  locked integer;
  headers jsonb := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  who text := coalesce(nullif(trim(split_part(headers->>'x-forwarded-for',',',1)),''), 'local');
  bucket_start timestamptz := date_trunc('minute',now());
  hits integer;
begin
  if octet_length(args::text)>4096 then raise exception 'INVALID_INPUT'; end if;
  if op is null or op not in ('ad_state','ad_reward') then raise exception 'INVALID_ACTION'; end if;
  insert into limits as l values(sha256(convert_to(who||':'||op||coalesce(args->>'token',''),'UTF8')),bucket_start,1)
    on conflict(bucket,period) do update set hits=l.hits+1 returning l.hits into hits;
  if hits > 30 then raise exception 'TOO_MANY'; end if;

  if coalesce(rid,'') !~ '^[a-z0-9]{8}$' then raise exception 'INVALID_ID'; end if;
  select * into r from rooms where id=rid;
  if not found or seat is null or seat not in (r.host_hash,r.guest_hash) then raise exception 'INVALID_LINK'; end if;
  if r.created_at<=now()-interval '7 days' then raise exception 'EXPIRED'; end if;

  if r.guest_answers is not null then
    select coalesce(array_agg(r.ids[i] order by i),'{}') into matches from generate_series(1,5) i
      where r.host_answers[i]='yes' and r.guest_answers[i]='yes';
  end if;
  -- 잠긴 카드 수 = 겹친 카드 - 무료 2장. 결제로 연 방은 광고로 열 것이 없다.
  locked:=case when r.unlocked then 0
    else greatest(cardinality(coalesce(matches,'{}'))-2,0) end;

  if op='ad_reward' then
    if r.guest_answers is null then raise exception 'NO_RESULT'; end if;
    if locked<=0 then raise exception 'NO_LOCKED_MATCHES'; end if;
    -- 한 방에 한 번. 두 좌석이 동시에 불러도 한 번만 열린다.
    update rooms set ad_bonus=true where id=rid and ad_bonus=false;
    r.ad_bonus:=true;
  end if;

  -- 광고로 여는 카드는 무료 두 장 다음, 겹친 카드 중 세 번째다.
  return jsonb_build_object(
    'bonus',r.ad_bonus,
    'card',case when locked>0 and r.ad_bonus then matches[3] else null end);
end;
$$;
revoke all on function public.secret_five_ad(text,jsonb) from public;
grant execute on function public.secret_five_ad(text,jsonb) to anon,authenticated;
commit;
