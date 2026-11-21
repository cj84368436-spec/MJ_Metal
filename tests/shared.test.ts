import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
beforeAll(async () => {
  await db.exec("create role anon; create role authenticated;");
  await db.exec(readFileSync("supabase/migrations/001_rooms.sql", "utf8"));
  await db.exec("set role anon");
}, 20000);
afterAll(() => db.close());
const token = (c: string) => c.repeat(43);
const create = {
  id: "ab123456",
  host: token("H"),
  guest: token("G"),
  device: token("D"),
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
  const preview = await call("state", { ...seat, report: false });
  expect(preview.opened).toEqual(create.ids.slice(0, 2));
  expect(preview.matched).toBe(3);
  expect(preview.ids).toBeNull();
  expect(JSON.stringify(preview)).not.toMatch(/p1-04|p1-05|answers|HHHH|DDDD/);
  expect(
    (await call("state", { id: create.id, token: create.host, report: true }))
      .opened,
  ).toEqual(create.ids.slice(0, 3));
});
it("유료 방을 만들 때 서버에서 이용권을 확인하고 모의 지급은 테스트 설정에서만 허용한다", async () => {
  const paid = {
    ...create,
    id: "cd123456",
    pack: "pack2",
    ids: create.ids.map((s) => s.replace("p1", "p2")),
  };
  await expect(call("create", paid)).rejects.toThrow();
  await expect(
    call("test_purchase", { device: create.device, pack: "pack2" }),
  ).rejects.toThrow();
  await db.exec(
    "reset role; update secret_five_private.settings set test_purchases=true; set role anon;",
  );
  for (let i = 0; i < 2; i++)
    await call("test_purchase", { device: create.device, pack: "pack2" });
  expect(await call("passes", { device: create.device })).toEqual(["pack2"]);
  await call("create", paid);
});
