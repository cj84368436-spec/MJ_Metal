import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { adBonusCards, previewCards } from "../src/domain";

const db = new PGlite();
beforeAll(async () => {
  await db.exec("create role anon; create role authenticated;");
  await db.exec(readFileSync("supabase/migrations/001_rooms.sql", "utf8"));
  await db.exec(
    readFileSync("supabase/migrations/002_result_unlock.sql", "utf8"),
  );
  // Exercise the upgrade with a completed 002 room and a retired 001 entitlement.
  const old = room("legacy01", 2);
  await complete(old);
  const opened = room("legacy02");
  await complete(opened);
  await enablePurchases();
  await call("test_unlock", credentials(opened));
  await db.exec("reset role");
  await db.query(
    "insert into secret_five_private.passes values (sha256(convert_to($1, 'UTF8')), 'pack2')",
    [token("L")],
  );
  await db.exec(
    readFileSync("supabase/migrations/003_pack_pass_metrics.sql", "utf8"),
  );
  await db.exec(readFileSync("supabase/migrations/004_rewarded_ad.sql", "utf8"));
  await db.exec(
    readFileSync("supabase/migrations/005_preview_two_and_pass.sql", "utf8"),
  );
  await db.exec("set role anon");
}, 20000);
afterAll(() => db.close());
const token = (c: string) => c.repeat(43);
const create = {
  id: "ab123456",
  host: token("H"),
  guest: token("G"),
  pack: "pack1",
  ids: ["p1-01", "p1-02", "p1-03", "p1-04", "p1-05"],
  answers: ["yes", "yes", "yes", "no", "yes"],
};
async function call(op: string, args: object) {
  const { rows } = await db.query<{ value: any }>(
    "select public.secret_five($1,$2::jsonb) as value",
    [op, JSON.stringify(args)],
  );
  return rows[0].value;
}
async function callAd(op: string, args: object) {
  const { rows } = await db.query<{ value: any }>(
    "select public.secret_five_ad($1,$2::jsonb) as value",
    [op, JSON.stringify(args)],
  );
  return rows[0].value;
}
it("두 좌석의 응답을 봉인하고 권한 없는 조회 및 원본 응답 읽기를 차단한다", async () => {
  await call("create", create);
  const seat = { id: create.id, token: create.guest };
  expect((await call("state", seat)).ids).toEqual(create.ids);
  await expect(
    call("state", { id: create.id, token: token("X") }),
  ).rejects.toThrow();
  await expect(
    db.query("select * from secret_five_private.rooms"),
  ).rejects.toThrow();
  await call("answer", {
    ...seat,
    answers: ["yes", "yes", "yes", "yes", "no"],
  });
  await call("answer", { ...seat, answers: Array(5).fill("no") });
  const preview = await call("state", seat);
  // 5.0: 무료 팩도 둘 다 YES인 카드 두 장까지만 열린다.
  expect(preview.opened).toEqual(create.ids.slice(0, 2));
  expect(preview.matched).toBe(3);
  expect(preview.unlocked).toBe(false);
  expect(preview.ids).toBeNull();
  // 응답에는 겹친 카드와 개수만 있고 상대의 원본 응답은 없다.
  expect(Object.keys(preview).sort()).toEqual([
    "created",
    "ids",
    "matched",
    "nick",
    "opened",
    "pack",
    "unlocked",
  ]);
  expect(JSON.stringify(preview)).not.toMatch(
    /p1-04|p1-05|answers|maybe|"no"|"yes"|HHHH|GGGG/,
  );
});
it("유료 팩 방도 이용권 없이 만들고, 모의 잠금 해제는 테스트 설정에서만 열린다", async () => {
  const paid = {
    ...create,
    id: "cd123456",
    pack: "pack2",
    ids: ["p2-01", "p2-02", "p2-03", "p2-04", "p2-05"],
  };
  // 보내기는 무료라서 팩 이용권 없이 방이 만들어진다.
  await call("create", paid);
  const seat = { id: paid.id, token: paid.guest };
  await expect(
    call("test_unlock", { ...seat, token: token("X") }),
  ).rejects.toThrow();
  await call("answer", { ...seat, answers: Array(5).fill("yes") });
  await expect(call("test_unlock", seat)).rejects.toThrow(/TEST_PURCHASE/);
  expect(
    (await call("state", { id: paid.id, token: paid.host })).opened,
  ).toEqual(paid.ids.slice(0, 2));
  await db.exec(
    "reset role; update secret_five_private.settings set test_purchases=true; set role anon;",
  );
  expect(await call("test_unlock", seat)).toBe(true);
  const full = await call("state", { id: paid.id, token: paid.host });
  expect(full.unlocked).toBe(true);
  const matched = paid.ids.filter((_, i) => create.answers[i] === "yes");
  expect(full.opened).toEqual(matched);
  expect((await call("state", seat)).opened).toEqual(matched);
  // 결제 후에도 상대의 원본 응답과 어긋난 카드는 내려가지 않는다.
  expect(JSON.stringify(full)).not.toMatch(/answers|maybe|"no"|"yes"/);
});

const yes = Array(5).fill("yes");
function room(id: string, pack = 2) {
  return {
    ...create,
    id,
    pack: `pack${pack}`,
    ids: [1, 2, 3, 4, 5].map((n) => `p${pack}-0${n}`),
  };
}
type Room = ReturnType<typeof room>;
function credentials(r: Room, seat: "host" | "guest" = "guest") {
  return { id: r.id, token: r[seat] };
}
async function complete(r: Room, extra = {}, answers = yes) {
  await call("create", { ...r, ...extra });
  await call("answer", { ...credentials(r), answers });
}
async function admin(sql: string) {
  await db.exec("reset role");
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec("set role anon");
  }
}
const enablePurchases = () =>
  admin("update secret_five_private.settings set test_purchases=true");
const metrics = () =>
  admin(`select pack, completed_rooms, replay_completed_rooms,
  room_purchases, room_krw, pack_purchases, pack_krw
  from secret_five_private.daily_metrics where day=(now() at time zone 'UTC')::date order by pack`);

beforeEach(async () => {
  await admin(
    "truncate secret_five_private.limits, secret_five_private.daily_metrics",
  );
  await admin("update secret_five_private.settings set test_purchases=false");
});

it("서버의 무료 미리보기와 광고 카드 수가 앱 설정과 같다", async () => {
  // 앱(domain.ts)은 두 장 무료 + 광고 한 장으로 화면을 그린다. 서버도 같아야 한다.
  expect(previewCards).toBe(2);
  expect(adBonusCards).toBe(1);
  const r = room("sync0001");
  await complete(r);
  const matched = r.ids.filter((_, i) => r.answers[i] === "yes");
  const view = await call("state", credentials(r));
  expect(view.matched).toBe(matched.length);
  expect(view.opened).toEqual(matched.slice(0, previewCards));
  expect(await callAd("ad_reward", credentials(r))).toEqual({
    bonus: true,
    card: matched[previewCards],
  });
});

it("방 코드는 8자 소문자·숫자이고 코드만으로는 방을 열 수 없다", async () => {
  const r = room("code0001");
  await call("create", r);
  for (const bad of ["code001", "code00001", "CODE0001", "code-001", ""])
    await expect(call("state", { id: bad, token: r.guest })).rejects.toThrow(
      /INVALID_ID/,
    );
  // 없는 코드와 남의 좌석 토큰은 같은 오류로 돌려준다.
  await expect(
    call("state", { id: "code0002", token: r.guest }),
  ).rejects.toThrow(/INVALID_LINK/);
  await expect(call("state", { id: r.id, token: token("Y") })).rejects.toThrow(
    /INVALID_LINK/,
  );
});

it("state는 겹친 카드와 개수만 내보내고 어긋난 카드는 감춘다", async () => {
  const one = room("hidden01");
  await complete(one, {}, ["yes", "no", "no", "no", "no"]);
  const view = await call("state", credentials(one));
  expect(view.matched).toBe(1);
  expect(view.opened).toEqual([one.ids[0]]);
  // 호스트가 YES를 골라도 상대가 NO·MAYBE였던 카드는 id조차 내려가지 않는다.
  expect(JSON.stringify(view)).not.toMatch(/p2-0[2-5]/);
  const none = room("hidden02");
  await complete(none, {}, ["no", "maybe", "no", "yes", "no"]);
  const empty = await call("state", credentials(none));
  expect(empty.matched).toBe(0);
  expect(empty.opened).toEqual([]);
  expect(empty.ids).toBeNull();
});

it.each(["host", "guest"] as const)(
  "전 팩 패스를 산 %s 좌석의 기기는 이 방과 이후 네 팩 방을 모두 연다",
  async (seat) => {
    const r = room(seat === "host" ? "buyhost1" : "buyguest");
    const device = token(seat === "host" ? "A" : "B");
    const otherDevice = token("C");
    await complete(r);
    const buyer = { ...credentials(r, seat), device };
    await expect(call("test_pack_pass", buyer)).rejects.toThrow(
      /TEST_PURCHASE_DISABLED/,
    );
    await enablePurchases();
    expect(await call("test_pack_pass", buyer)).toBe(true);
    // 같은 좌석·기기의 재시도는 영수증으로 통과하고 다시 과금하지 않는다.
    expect(await call("test_pack_pass", buyer)).toBe(true);
    const other = credentials(r, seat === "host" ? "guest" : "host");
    expect((await call("state", other)).opened).toEqual(
      r.ids.filter((_, i) => r.answers[i] === "yes"),
    );
    await expect(call("test_pack_pass", { ...other, device })).rejects.toThrow(
      /ALREADY_UNLOCKED/,
    );
    await expect(
      call("test_pack_pass", { ...buyer, device: otherDevice }),
    ).rejects.toThrow(/ALREADY_UNLOCKED/);
    expect(await call("test_unlock", other)).toBe(true);
    const suffix = seat[0];
    for (const [i, pack, supplied, unlocked] of [
      [0, 1, device, true],
      [1, 2, device, true],
      [2, 3, device, true],
      [3, 4, device, true],
      [4, 2, otherDevice, false],
      [5, 3, undefined, false],
    ] as const) {
      const child = room(`next${suffix}00${i}`, pack);
      await call("create", { ...child, device: supplied });
      expect((await call("state", credentials(child))).unlocked).toBe(unlocked);
    }
    expect(await metrics()).toEqual([
      {
        pack: "pack2",
        completed_rooms: 1,
        replay_completed_rooms: 0,
        room_purchases: 0,
        room_krw: 0,
        pack_purchases: 1,
        pack_krw: 1900,
      },
    ]);
  },
);

it("validates the operation, seat, device, completion and paid matches before granting", async () => {
  await enablePurchases();
  const device = token("D");
  const r = room("validate");
  await expect(call("create", { ...r, device: "short" })).rejects.toThrow(
    /INVALID_DEVICE/,
  );
  await call("create", r);
  const buyer = { ...credentials(r), device };
  for (const op of ["test_unlock", "test_pack_pass"]) {
    await expect(call(op, buyer)).rejects.toThrow(/NO_RESULT/);
    await expect(call(op, { ...buyer, token: token("X") })).rejects.toThrow(
      /INVALID_LINK/,
    );
  }
  await call("answer", { ...buyer, answers: yes });
  for (const bad of [undefined, "", token("+"), token("D") + "D"])
    await expect(
      call("test_pack_pass", { ...buyer, device: bad }),
    ).rejects.toThrow(/INVALID_DEVICE/);
  await expect(
    call("test_unlock", { ...buyer, product: "pack" }),
  ).rejects.toThrow(/INVALID_PRODUCT/);
  // 잠글 카드가 없으면(두 장 이하) 결제도 없다. 무료 팩도 같다.
  for (const n of [0, 1, 2]) {
    const few = room(`matches${n}`);
    await complete(
      few,
      {},
      Array.from({ length: 5 }, (_, i) => (i < n ? "yes" : "no")),
    );
    for (const op of ["test_unlock", "test_pack_pass"])
      await expect(call(op, { ...credentials(few), device })).rejects.toThrow(
        /NO_LOCKED_MATCHES/,
      );
  }
  const free = room("free0001", 1);
  await complete(free);
  expect(await call("test_unlock", credentials(free))).toBe(true);
  expect(await metrics()).toContainEqual({
    pack: "pack1",
    completed_rooms: 1,
    replay_completed_rooms: 0,
    room_purchases: 1,
    room_krw: 1100,
    pack_purchases: 0,
    pack_krw: 0,
  });
  const premium = room("premium4", 4);
  await complete(premium);
  expect(
    await call("test_unlock", { ...credentials(premium), product: "room" }),
  ).toBe(true);
  expect(await call("test_unlock", credentials(premium))).toBe(true);
  expect(await metrics()).toContainEqual({
    pack: "pack4",
    completed_rooms: 1,
    replay_completed_rooms: 0,
    room_purchases: 1,
    room_krw: 1496,
    pack_purchases: 0,
    pack_krw: 0,
  });
  // 전 팩 패스는 어느 팩 방에서 사도 1,900원으로 집계된다.
  const pass4 = room("pass0004", 4);
  await complete(pass4);
  expect(await call("test_pack_pass", { ...credentials(pass4), device })).toBe(
    true,
  );
  expect(await metrics()).toContainEqual({
    pack: "pack4",
    completed_rooms: 2,
    replay_completed_rooms: 0,
    room_purchases: 1,
    room_krw: 1496,
    pack_purchases: 1,
    pack_krw: 1900,
  });
});

it("preserves the first unlock and never trades a room unlock for a pass", async () => {
  const r = room("roomrace");
  await complete(r);
  await enablePurchases();
  const device = token("E");
  const outcomes = await Promise.allSettled([
    call("test_unlock", credentials(r)),
    call("test_pack_pass", { ...credentials(r, "host"), device }),
  ]);
  expect(outcomes[0]).toMatchObject({ status: "fulfilled", value: true });
  expect(outcomes[1]).toMatchObject({
    status: "rejected",
    reason: expect.objectContaining({ message: "ALREADY_UNLOCKED" }),
  });
  const next = room("afterbuy");
  await call("create", { ...next, device });
  expect((await call("state", credentials(next))).unlocked).toBe(false);
  expect(await metrics()).toEqual([
    {
      pack: "pack2",
      completed_rooms: 1,
      replay_completed_rooms: 0,
      room_purchases: 1,
      room_krw: 1100,
      pack_purchases: 0,
      pack_krw: 0,
    },
  ]);
});

it("003의 pack2 전용 이용권은 그 기기의 pack2 방에서만 계속 인정한다", async () => {
  const device = token("P");
  await db.exec("reset role");
  try {
    await db.query(
      "insert into secret_five_private.pack2_passes(device_hash) values (sha256(convert_to($1,'UTF8')))",
      [device],
    );
  } finally {
    await db.exec("set role anon");
  }
  for (const [id, pack, unlocked] of [
    ["oldpass2", 2, true],
    ["oldpass3", 3, false],
    ["oldpass1", 1, false],
  ] as const) {
    const r = room(id, pack);
    await call("create", { ...r, device });
    expect((await call("state", credentials(r))).unlocked).toBe(unlocked);
  }
});

it("한 기기의 전 팩 패스는 여러 방을 열지만 주문은 한 번만 기록한다", async () => {
  const first = room("device01"),
    second = room("device02");
  const device = token("F");
  await complete(first);
  await complete(second);
  await enablePurchases();
  const attempts = [first, second].map((r) =>
    call("test_pack_pass", { ...credentials(r), device }),
  );
  const outcomes = await Promise.allSettled(attempts);
  expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(2);
  // 패스를 이미 가진 기기는 새 주문 없이 그 방만 연다.
  expect((await call("state", credentials(first))).unlocked).toBe(true);
  expect((await call("state", credentials(second))).unlocked).toBe(true);
  expect(await metrics()).toMatchObject([
    { completed_rooms: 2, pack_purchases: 1, pack_krw: 1900 },
  ]);
  // 다른 기기는 같은 방을 열 수 없다.
  const third = room("device03");
  await complete(third);
  await call("test_unlock", credentials(third));
  await expect(
    call("test_pack_pass", { ...credentials(third), device: token("Q") }),
  ).rejects.toThrow(/ALREADY_UNLOCKED/);
});

it("attributes only completed, same-pack guest referrals and keeps anonymous totals after expiry", async () => {
  const parent = room("parent01");
  const ref = { parent_id: parent.id, parent_guest: parent.guest };
  await call("create", parent);
  await complete(room("pending1"), ref);
  await call("answer", { ...credentials(parent), answers: yes });
  const replay = room("replay01");
  await call("create", { ...replay, ...ref });
  await call("create", replay);
  expect(await metrics()).toMatchObject([
    { completed_rooms: 2, replay_completed_rooms: 0 },
  ]);
  await Promise.all(
    [yes, Array(5).fill("no")].map((answers) =>
      call("answer", { ...credentials(replay), answers }),
    ),
  );
  await complete(room("badseat1"), { ...ref, parent_guest: parent.host });
  await complete(room("badpack1", 3), ref);
  await complete(room("missing1"), { ...ref, parent_id: "absent01" });
  await call("create", { ...room("badseat1"), ...ref });
  await admin(
    "update secret_five_private.rooms set created_at=now()-interval '8 days' where id='parent01'",
  );
  await complete(room("expired1"), ref);
  expect(await metrics()).toMatchObject([
    { pack: "pack2", completed_rooms: 6, replay_completed_rooms: 1 },
    { pack: "pack3", completed_rooms: 1, replay_completed_rooms: 0 },
  ]);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`reset role; set role ${role}`);
    await expect(
      db.query("select * from secret_five_private.daily_metrics"),
    ).rejects.toThrow(/permission denied/);
  }
  await db.exec("reset role; set role anon");
});

it("redeals five different same-pack cards to either seat of a completed legacy room", async () => {
  const old = room("legacy01");
  const next = (await call("redeal", credentials(old))) as string[];
  expect(await call("redeal", credentials(old, "host"))).toEqual(next);
  expect(next).toHaveLength(5);
  expect(new Set(next).size).toBe(5);
  for (const id of next) {
    expect(id).toMatch(/^p2-(0[1-9]|1[0-5])$/);
    expect(old.ids).not.toContain(id);
  }
  await expect(
    call("redeal", { ...credentials(old), token: token("X") }),
  ).rejects.toThrow(/INVALID_LINK/);
  const fresh = room("retired1");
  await call("create", { ...fresh, device: token("L") });
  expect((await call("state", credentials(fresh))).unlocked).toBe(false);
  await expect(call("redeal", credentials(fresh))).rejects.toThrow(/NO_RESULT/);
  await admin(
    "update secret_five_private.rooms set created_at=now()-interval '8 days' where id='legacy01'",
  );
  await expect(call("redeal", credentials(old))).rejects.toThrow(/EXPIRED/);
});

it("keeps pre-migration room unlocks without issuing a pass or recounting historical events", async () => {
  const old = room("legacy02");
  await enablePurchases();
  expect((await call("state", credentials(old))).unlocked).toBe(true);
  await expect(
    call("test_pack_pass", { ...credentials(old), device: token("Z") }),
  ).rejects.toThrow(/ALREADY_UNLOCKED/);
  expect(await call("test_unlock", credentials(old))).toBe(true);
  await call("answer", { ...credentials(old), answers: yes });
  expect(await metrics()).toEqual([]);
});

it("광고 보상은 방마다 한 번만, 무료 두 장 다음 겹친 카드 하나를 내보낸다", async () => {
  const r = room("reward01");
  await complete(r);
  const seat = credentials(r);
  await expect(
    callAd("ad_reward", { ...seat, token: token("X") }),
  ).rejects.toThrow(/INVALID_LINK/);
  await expect(callAd("open", seat)).rejects.toThrow(/INVALID_ACTION/);
  expect(await callAd("ad_state", seat)).toEqual({ bonus: false, card: null });
  const matched = r.ids.filter((_, i) => r.answers[i] === "yes");
  expect(matched).toHaveLength(4);
  expect(await callAd("ad_reward", seat)).toEqual({
    bonus: true,
    card: matched[2],
  });
  // 두 번째 시청은 카드를 더 주지 않고, 반대 좌석도 같은 한 장을 본다.
  expect(await callAd("ad_reward", credentials(r, "host"))).toEqual({
    bonus: true,
    card: matched[2],
  });
  expect((await call("state", credentials(r, "host"))).opened).toEqual(
    matched.slice(0, 2),
  );
  // 결제로 방을 다 열면 광고 카드는 따로 내보내지 않는다.
  await enablePurchases();
  await call("test_unlock", seat);
  expect(await callAd("ad_state", seat)).toEqual({ bonus: true, card: null });
});

it("광고 보상은 결과와 잠긴 카드 조건을 확인한다", async () => {
  const early = room("reward02");
  await call("create", early);
  await expect(callAd("ad_reward", credentials(early))).rejects.toThrow(
    /NO_RESULT/,
  );
  // 겹친 카드가 두 장이면 잠글 카드가 없어 광고도 결제도 없다. 무료 팩도 같다.
  for (const [id, pack] of [
    ["reward03", 2],
    ["reward04", 1],
  ] as const) {
    const few = room(id, pack);
    await complete(few, {}, ["yes", "yes", "no", "no", "no"]);
    await expect(callAd("ad_reward", credentials(few))).rejects.toThrow(
      /NO_LOCKED_MATCHES/,
    );
    expect(await callAd("ad_state", credentials(few))).toEqual({
      bonus: false,
      card: null,
    });
  }
  // 무료 팩도 세 장 이상이면 광고로 한 장이 열린다.
  const free = room("reward05", 1);
  await complete(free);
  const matched = free.ids.filter((_, i) => free.answers[i] === "yes");
  expect(await callAd("ad_reward", credentials(free))).toEqual({
    bonus: true,
    card: matched[2],
  });
});
