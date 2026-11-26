-- 4.0 보상형 광고
--
-- 결과 화면에서 광고를 한 번 보면 그 방의 겹친 카드 한 장이 더 열린다. 방마다
-- 한 번만 쓸 수 있고, 두 좌석이 같은 결과를 본다. 결제 잠금 해제와는 별개라서
-- 광고로 한 장을 연 뒤에도 남은 카드는 결제로 연다.
--
-- 이 파일은 001~003을 바꾸지 않는다. `secret_five`는 그대로 두고 광고 보상만
-- 다루는 `secret_five_ad`를 따로 만든다. 새 앱은 이 함수가 없으면(004 미적용)
-- 광고 버튼을 숨기고 결제 안내만 보여준다.
--
-- 실제 출시에서는 광고 완료를 토스 쪽 보상 확인(서버 간 검증)으로 바꿔야 한다.
-- 지금은 앱이 광고를 본 뒤 호출하는 신뢰 방식이다(test_unlock과 같은 단계).
begin;

alter table secret_five_private.rooms
  add column if not exists ad_bonus boolean not null default false;

create or replace function public.secret_five_ad(op text, args jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, secret_five_private, pg_temp as $$
declare
  r rooms%rowtype;
  rid text := args->>'id';
  seat bytea := sha256(convert_to(args->>'token','UTF8'));
  matches text[];
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

  if op='ad_reward' then
    if r.guest_answers is null then raise exception 'NO_RESULT'; end if;
    if r.unlocked or r.pack='pack1' or cardinality(matches)<=1 then raise exception 'NO_LOCKED_MATCHES'; end if;
    -- 한 방에 한 번. 두 좌석이 동시에 불러도 한 번만 열린다.
    update rooms set ad_bonus=true where id=rid and ad_bonus=false;
    r.ad_bonus:=true;
  end if;

  -- 광고로 여는 카드는 겹친 카드 중 무료로 열린 첫 장 다음 한 장이다.
  return jsonb_build_object(
    'bonus',r.ad_bonus,
    'card',case when r.unlocked or r.pack='pack1' or cardinality(coalesce(matches,'{}'))<=1 then null
      when r.ad_bonus then matches[2] else null end);
end;
$$;
revoke all on function public.secret_five_ad(text,jsonb) from public;
grant execute on function public.secret_five_ad(text,jsonb) to anon,authenticated;
commit;
