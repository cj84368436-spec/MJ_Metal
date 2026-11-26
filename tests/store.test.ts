import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { packs } from "../src/domain";

// 앱이 공유 모드에서 어떤 RPC 경로를 부르는지 확인한다.
// 광고 보상(ad_*)은 004 마이그레이션의 `secret_five_ad`, 나머지는 `secret_five`다.
const ENDPOINT = "https://store-test.supabase.co";
const TOKEN = "g".repeat(43);
const pack2 = packs.find((p) => p.id === "pack2")!;
const ids = pack2.questions.slice(0, 5).map((q) => q.id);
const seat = "room0001";

type Call = { fn: string; op: string };
type Reply = { ok: boolean; status?: number; body: unknown };
let calls: Call[] = [];
let reply: (fn: string, op: string) => Reply;
let store: typeof import("../src/store");

const snapshot = (extra: object = {}) => ({
  pack: "pack2",
  nick: "",
  created: Date.now(),
  matched: 4,
  ids,
  opened: [ids[0]],
  unlocked: false,
  ...extra,
});

beforeAll(async () => {
  vi.stubEnv("VITE_SUPABASE_URL", ENDPOINT);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  vi.stubEnv("VITE_DATA_MODE", "shared");
  store = await import("../src/store");
  // 공유 모드로 열리지 않으면 아래 검사가 모의 저장소를 보게 되어 의미가 없다.
  expect(store.shared).toBe(true);
});

beforeEach(() => {
  calls = [];
  reply = () => ({ ok: false, status: 400, body: { message: "UNEXPECTED" } });
  const local = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => local.set(k, v),
  });
  const session = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => session.get(k) ?? null,
    setItem: (k: string, v: string) => session.set(k, v),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      const fn = String(url).split("/rest/v1/rpc/")[1];
      const body = JSON.parse(init.body) as { op: string };
      calls.push({ fn, op: body.op });
      const r = reply(fn, body.op);
      return {
        ok: r.ok,
        status: r.status ?? (r.ok ? 200 : 400),
        json: async () => r.body,
      };
    }),
  );
});

function adCalls(op: string) {
  return calls.filter((c) => c.op === op);
}

it("결과 화면의 광고 상태를 secret_five_ad로 조회한다", async () => {
  reply = (fn, op) => {
    if (fn === "secret_five" && op === "state")
      return { ok: true, body: snapshot() };
    if (fn === "secret_five_ad" && op === "ad_state")
      return { ok: true, body: { bonus: false, card: null } };
    return { ok: false, status: 400, body: { message: "UNEXPECTED" } };
  };
  const data = await store.viewRoom(seat, TOKEN);
  expect(calls).toEqual([
    { fn: "secret_five", op: "state" },
    { fn: "secret_five_ad", op: "ad_state" },
  ]);
  expect(adCalls("ad_state")).toEqual([
    { fn: "secret_five_ad", op: "ad_state" },
  ]);
  expect(data.ad).toBe("available");
  // 광고 카드는 아직 열리지 않았다.
  expect(data.result?.opened.map((q) => q.id)).toEqual([ids[0]]);
});

it("광고로 열린 카드는 결과에 광고 카드로 얹고 상태를 used로 바꾼다", async () => {
  reply = (fn, op) => {
    if (fn === "secret_five" && op === "state")
      return { ok: true, body: snapshot() };
    if (fn === "secret_five_ad" && op === "ad_state")
      return { ok: true, body: { bonus: true, card: ids[3] } };
    return { ok: false, status: 400, body: { message: "UNEXPECTED" } };
  };
  const data = await store.viewRoom(seat, TOKEN);
  expect(data.ad).toBe("used");
  expect(data.result?.adBonusId).toBe(ids[3]);
  expect(data.result?.opened.map((q) => q.id)).toEqual([ids[0], ids[3]]);
  expect(data.result?.locked).toBe(2);
});

it("광고 보상 기록은 secret_five_ad의 ad_reward로 보낸다", async () => {
  reply = (fn, op) => {
    if (fn === "secret_five_ad" && op === "ad_reward")
      return { ok: true, body: { bonus: true, card: ids[1] } };
    return { ok: false, status: 400, body: { message: "UNEXPECTED" } };
  };
  await store.claimAdBonus(seat, TOKEN);
  expect(calls).toEqual([{ fn: "secret_five_ad", op: "ad_reward" }]);
});

it("광고가 아닌 호출은 그대로 secret_five로 보낸다", async () => {
  reply = (fn, op) => {
    if (fn === "secret_five" && (op === "answer" || op === "test_unlock"))
      return { ok: true, body: true };
    return { ok: false, status: 400, body: { message: "UNEXPECTED" } };
  };
  await store.submitGuest(seat, TOKEN, ["yes", "no", "yes", "no", "yes"]);
  await store.unlockRoom(seat, TOKEN);
  expect(calls).toEqual([
    { fn: "secret_five", op: "answer" },
    { fn: "secret_five", op: "test_unlock" },
  ]);
});

it("004가 없는 서버(함수 없음)에서는 광고를 숨기고 다시 묻지 않는다", async () => {
  reply = (fn, op) => {
    if (fn === "secret_five" && op === "state")
      return { ok: true, body: snapshot() };
    if (fn === "secret_five_ad")
      return {
        ok: false,
        status: 404,
        body: {
          code: "PGRST202",
          message:
            "Could not find the function public.secret_five_ad(op, args) in the schema cache",
        },
      };
    return { ok: false, status: 400, body: { message: "UNEXPECTED" } };
  };
  expect((await store.viewRoom(seat, TOKEN)).ad).toBe("none");
  const first = adCalls("ad_state").length;
  expect(first).toBe(1);
  // 한 번 확인한 서버는 기억하고 광고 버튼을 다시 묻지 않는다.
  expect((await store.viewRoom(seat, TOKEN)).ad).toBe("none");
  expect(adCalls("ad_state")).toHaveLength(1);
});
