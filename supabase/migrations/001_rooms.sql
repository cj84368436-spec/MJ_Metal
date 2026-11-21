begin;
create schema secret_five_private;
revoke all on schema secret_five_private from public, anon, authenticated;

create table secret_five_private.rooms (
  id text primary key, pack text not null, ids text[] not null,
  host_hash bytea not null, guest_hash bytea not null,
  host_answers text[] not null, guest_answers text[], nick text not null default '',
  created_at timestamptz not null default now()
);
create table secret_five_private.passes (
  device_hash bytea not null, pack text not null, primary key(device_hash, pack)
);
create table secret_five_private.settings (test_purchases boolean not null default false);
insert into secret_five_private.settings default values;
create table secret_five_private.limits (
  bucket bytea not null, period timestamptz not null, hits integer not null,
  primary key(bucket,period)
);
create index rooms_created on secret_five_private.rooms(created_at);

-- The API role can execute this function only. No table is in the exposed schema.
create function public.secret_five(op text, args jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, secret_five_private, pg_temp as $$
declare
  r rooms%rowtype;
  rid text := args->>'id';
  p text := args->>'pack';
  device text := args->>'device';
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

  if op in ('passes','test_purchase','create') and coalesce(device,'') !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'INVALID_DEVICE';
  end if;
  if op='passes' then
    return (select coalesce(jsonb_agg(e.pack order by e.pack),'[]'::jsonb) from passes e
      where e.device_hash=sha256(convert_to(device,'UTF8')));
  end if;
  if op='test_purchase' then
    if not (select test_purchases from settings) or coalesce(p,'') not in ('pack2','pack3','pack4') then
      raise exception 'TEST_PURCHASE_DISABLED';
    end if;
    insert into passes values(sha256(convert_to(device,'UTF8')),p) on conflict do nothing;
    return 'true';
  end if;
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
    if p<>'pack1' and not exists(select from passes e where e.device_hash=sha256(convert_to(device,'UTF8')) and e.pack=p)
      then raise exception 'PACK_REQUIRED'; end if;
    delete from rooms where created_at<now()-interval '7 days';
    delete from limits where limits.period<now()-interval '2 hours';
    insert into rooms(id,pack,ids,host_hash,guest_hash,host_answers) values(rid,p,qs,
      sha256(convert_to(args->>'host','UTF8')),sha256(convert_to(args->>'guest','UTF8')),answers)
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
  elsif op<>'state' then raise exception 'INVALID_ACTION'; end if;

  if r.guest_answers is not null then
    select coalesce(array_agg(r.ids[i] order by i),'{}') into matches from generate_series(1,5) i
      where r.host_answers[i]='yes' and r.guest_answers[i]='yes';
  end if;
  -- Every room was created using the host's free or paid pack pass. Guests inherit
  -- its report inside this room only. Never return a per-question locked reason.
  return jsonb_build_object('pack',r.pack,'nick',r.nick,'created',extract(epoch from r.created_at)*1000,
    'ids',case when matches is null then r.ids end,'matched',cardinality(matches),
    'opened',matches[1:case when args->>'report'='true' then 5 else 2 end]);
end;
$$;
revoke all on function public.secret_five(text,jsonb) from public;
grant execute on function public.secret_five(text,jsonb) to anon,authenticated;
commit;
