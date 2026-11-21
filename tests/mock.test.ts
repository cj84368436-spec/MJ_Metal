import { beforeEach, expect, it, vi } from "vitest";
import { packs } from "../src/domain";
import {
  createRoom,
  owned,
  pay,
  submitGuest,
  viewRoom,
} from "../src/mockStore";

const ids = packs[0].questions.slice(0, 5).map((q) => q.id);
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  });
});
it("같은 브라우저의 두 역할은 같은 결과를 보고 이미 보낸 답은 바뀌지 않는다", async () => {
  const id = createRoom(packs[0], ids, Array(5).fill("yes"));
  const host = viewRoom(id, null);
  expect(host.result).toBeNull();
  expect(id).toMatch(/^[a-z0-9]{8}$/);
  expect(() => viewRoom(id, "bad")).toThrow();
  await submitGuest(id, host.guestToken, ["yes", "maybe", "yes", "yes", "no"]);
  await submitGuest(id, host.guestToken, Array(5).fill("no"));
  expect(viewRoom(id, host.guestToken).result).toEqual(
    viewRoom(id, null).result,
  );
  expect(viewRoom(id, null).result?.matched).toBe(3);
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
it("유료 팩 생성 시 이용권을 확인하고 중복 지급 후에도 보유 상태를 복원한다", () => {
  const p = packs[3],
    chosen = p.questions.slice(0, 5).map((q) => q.id);
  expect(() => createRoom(p, chosen, Array(5).fill("yes"))).toThrow();
  pay(p);
  pay(p);
  expect(owned()).toEqual(["pack4"]);
  expect(viewRoom(createRoom(p, chosen, Array(5).fill("yes")), null).pack).toBe(
    p,
  );
});
