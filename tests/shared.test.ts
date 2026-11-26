import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

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
  // 무료 팩은 처음부터 겹친 카드가 모두 열린다.
  expect(preview.opened).toEqual(create.ids.slice(0, 3));
  expect(preview.matched).toBe(3);
  expect(preview.unlocked).toBe(true);
  expect(preview.ids).toBeNull();
  expect(JSON.stringify(preview)).not.toMatch(/p1-04|p1-05|answers|HHHH|GGGG/);
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
  ).toEqual(paid.ids.slice(0, 1));
  await db.exec(
    "reset role; update secret_five_private.settings set test_purchases=true; set role anon;",
  );
  expect(await call("test_unlock", seat)).toBe(true);
  const full = await call("state", { id: paid.id, token: paid.host });
  expect(full.unlocked).toBe(true);
  const matched = paid.ids.filter((_, i) => create.answers[i] === "yes");
  expect(full.opened).toEqual(matched);
  expect((await call("state", seat)).opened).toEqual(matched);
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

it.each(["host", "guest"] as const)(
  "grants the %s buyer one pack2 pass and counts one purchase",
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
      [0, 2, device, true],
      [1, 2, otherDevice, false],
      [2, 2, undefined, false],
      [3, 3, device, false],
      [4, 4, device, false],
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
        pack_krw: 3300,
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
  for (const n of [0, 1]) {
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
  await expect(call("test_unlock", credentials(free))).rejects.toThrow(
    /NO_LOCKED_MATCHES/,
  );
  const premium = room("premium4", 4);
  await complete(premium);
  await expect(
    call("test_pack_pass", { ...credentials(premium), device }),
  ).rejects.toThrow(/INVALID_PRODUCT/);
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

it("prevents duplicate grants for one device in independently created rooms", async () => {
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
  expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
  const loser = outcomes[0].status === "rejected" ? first : second;
  await call("create", { ...loser, device }); // An old create retry cannot upgrade a room.
  expect((await call("state", credentials(loser))).unlocked).toBe(false);
  expect(await metrics()).toMatchObject([
    { completed_rooms: 2, pack_purchases: 1, pack_krw: 3300 },
  ]);
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
