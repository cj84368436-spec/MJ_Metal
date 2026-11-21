import { beforeEach, expect, it, vi } from "vitest";
import { packs } from "../src/domain";
import {
  createRoom,
  submitGuest,
  unlock,
  viewRoom,
} from "../src/mockStore";

const ids = packs[0].questions.slice(0, 5).map((q) => q.id);
const paidIds = packs[3].questions.slice(0, 5).map((q) => q.id);
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  });
});
it("유료 팩도 결제 없이 보내고, 두 좌석이 같은 결과를 보며 이미 보낸 답은 바뀌지 않는다", async () => {
  const id = createRoom(packs[3], paidIds, Array(5).fill("yes"));
  const host = viewRoom(id, null);
  expect(host.result).toBeNull();
  expect(host.unlocked).toBe(false);
  expect(id).toMatch(/^[a-z0-9]{8}$/);
  expect(() => viewRoom(id, "bad")).toThrow();
  await submitGuest(id, host.guestToken, ["yes", "maybe", "yes", "yes", "no"]);
  await submitGuest(id, host.guestToken, Array(5).fill("no"));
  expect(viewRoom(id, host.guestToken).result).toEqual(
    viewRoom(id, null).result,
  );
  expect(viewRoom(id, null).result?.matched).toBe(3);
});
it("잠금 해제 전에는 한 장만, 해제하면 겹친 카드 전부와 한마디가 열린다", async () => {
  const id = createRoom(packs[1], paidIds.map((q) => q.replace("p4", "p2")), Array(5).fill("yes"));
  const token = viewRoom(id, null).guestToken;
  await submitGuest(id, token, ["yes", "maybe", "yes", "yes", "no"]);
  const preview = viewRoom(id, null).result!;
  expect(preview.opened).toHaveLength(1);
  expect(preview.locked).toBe(2);
  expect(viewRoom(id, null).unlocked).toBe(false);
  await unlock(id, token);
  const full = viewRoom(id, null);
  expect(full.unlocked).toBe(true);
  expect(full.result?.opened).toHaveLength(3);
  expect(full.result?.locked).toBe(0);
  expect(viewRoom(id, token).result?.opened).toHaveLength(3);
});
it("무료 팩은 처음부터 겹친 카드가 모두 열린다", async () => {
  const id = createRoom(packs[0], ids, Array(5).fill("yes"));
  const token = viewRoom(id, null).guestToken;
  await submitGuest(id, token, ["yes", "yes", "no", "no", "no"]);
  const data = viewRoom(id, null);
  expect(data.unlocked).toBe(true);
  expect(data.result?.opened).toHaveLength(2);
  expect(data.result?.locked).toBe(0);
});
it("7일 경과 시 두 좌석 모두 만료된다", () => {
  const id = createRoom(packs[0], ids, Array(5).fill("yes"));
  const token = viewRoom(id, null).guestToken;
  try {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 7 * 86400000);
    expect(() => viewRoom(id, null)).toThrow(/만료/);
    expect(() => viewRoom(id, token)).toThrow(/만료/);
  } finally {
    vi.useRealTimers();
  }
});
