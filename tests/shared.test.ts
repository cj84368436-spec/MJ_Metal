import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
beforeAll(async () => {
  await db.exec("create role anon; create role authenticated;");
  await db.exec(readFileSync("supabase/migrations/001_rooms.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/002_result_unlock.sql", "utf8"));
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
  expect((await call("state", { id: paid.id, token: paid.host })).opened).toEqual(
    paid.ids.slice(0, 1),
  );
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
