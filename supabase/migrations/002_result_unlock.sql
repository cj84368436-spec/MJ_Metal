-- 3.0 결과 잠금 해제 모델
--
-- 보내기(방 만들기)는 모든 팩에서 무료가 되었다. 대신 두 사람이 답을 마친 뒤
-- 결과 화면에서 겹친 카드 한 장은 무료로 열리고, 나머지 겹친 카드와 카드별
-- 한마디는 그 방에서 한 번 잠금 해제(모의 결제)해야 보인다. 무료 팩(pack1)은
-- 처음부터 전부 열린다. 상대의 답과 서로 다른 카드는 어떤 경우에도 내보내지 않는다.
begin;

alter table secret_five_private.rooms
  add column if not exists unlocked boolean not null default false;

-- 방을 만들 때 이용권을 확인하던 단계와 팩 이용권 RPC는 없어졌다. 표는 지우지
-- 않고 남겨 둔다(기존 데이터 보존). 새 코드는 이 표를 읽지 않는다.

create or replace function public.secret_five(op text, args jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, secret_five_private, pg_temp as $$
declare
  r rooms%rowtype;
  rid text := args->>'id';
  p text := args->>'pack';
  seat bytea := sha256(convert_to(args->>'token','UTF8'));
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
    insert into rooms(id,pack,ids,host_hash,guest_hash,host_answers,unlocked) values(rid,p,qs,
      sha256(convert_to(args->>'host','UTF8')),sha256(convert_to(args->>'guest','UTF8')),answers,p='pack1')
      on conflict do nothing;
    if not found and not exists(select from rooms where id=rid and host_hash=sha256(convert_to(args->>'host','UTF8'))) then
      raise exception 'ID_COLLISION';
    end if;
    return 'true';
  end if;

  select * into r from rooms where id=rid;
  if not found or seat is null or seat not in (r.host_hash,r.guest_hash) then raise exception 'INVALID_LINK'; end if;
  if r.created_at<=now()-interval '7 days' then raise exception 'EXPIRED'; end if;
  is_host:=seat=r.host_hash;
  if op='answer' then
    if is_host then raise exception 'WRONG_SEAT'; end if;
    update rooms set guest_answers=answers where id=rid and guest_answers is null;
    return 'true';
  elsif op='nickname' then
    nick:=coalesce(args->>'nick','');
    if not is_host or (nick<>'' and (nick !~ '^[[:alnum:]가-힣]{2,6}$' or nick ~* '씨발|시발|병신|개새끼|fuck|shit')) then
      raise exception 'INVALID_NICK'; end if;
    update rooms set nick=coalesce(args->>'nick','') where id=rid;
    return 'true';
  elsif op='test_unlock' then
    -- 모의 결제. 테스트 DB에서만 켜지며, 실제 출시에서는 영수증 검증으로 바꾼다.
    if not (select test_purchases from settings) then raise exception 'TEST_PURCHASE_DISABLED'; end if;
    if r.guest_answers is null then raise exception 'NO_RESULT'; end if;
    update rooms set unlocked=true where id=rid;
    return 'true';
  elsif op<>'state' then raise exception 'INVALID_ACTION'; end if;

  if r.guest_answers is not null then
    select coalesce(array_agg(r.ids[i] order by i),'{}') into matches from generate_series(1,5) i
      where r.host_answers[i]='yes' and r.guest_answers[i]='yes';
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
