import { beforeEach, expect, it, vi } from "vitest";
import { packs } from "../src/domain";
import {
  createRoom,
  activateSeat,
  submitGuest,
  unlock,
  redeal,
  viewRoom,
  claimAd,
} from "../src/mockStore";

const ids = packs[0].questions.slice(0, 5).map((q) => q.id);
const paidIds = packs[3].questions.slice(0, 5).map((q) => q.id);
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  });
  const tab = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => tab.get(k) ?? null,
    setItem: (k: string, v: string) => tab.set(k, v),
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
  const id = createRoom(
    packs[1],
    paidIds.map((q) => q.replace("p4", "p2")),
    Array(5).fill("yes"),
  );
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

it("보상형 광고는 방마다 한 번, 겹친 카드 한 장을 더 열고 결제로 남은 카드를 연다", async () => {
  const pack = packs[1],
    ids = pack.questions.slice(0, 5).map((q) => q.id);
  const id = createRoom(pack, ids, Array(5).fill("yes")),
    guest = viewRoom(id, null).guestToken;
  await submitGuest(id, guest, ["yes", "maybe", "yes", "yes", "no"]);
  expect(viewRoom(id, null).ad).toBe("available");
  // 광고를 보기 전에는 한 장만 열려 있다.
  expect(viewRoom(id, null).result?.locked).toBe(2);
  await claimAd(id, guest);
  const after = viewRoom(id, null);
  expect(after.ad).toBe("used");
  expect(after.result?.opened).toHaveLength(2);
  expect(after.result?.locked).toBe(1);
  expect(after.result?.adBonusId).toBe(after.result?.opened[1].id);
  // 두 번째 광고는 없다. 두 좌석이 같은 결과를 본다.
  await claimAd(id, null);
  expect(viewRoom(id, null).result?.opened).toHaveLength(2);
  expect(viewRoom(id, guest).result?.opened).toHaveLength(2);
  // 남은 카드는 결제로 연다.
  await unlock(id, guest);
  expect(viewRoom(id, guest).result?.opened).toHaveLength(3);
  expect(viewRoom(id, null).ad).toBe("none");
});
it("겹친 카드가 한 장이거나 무료 팩이면 광고 버튼을 보여주지 않는다", async () => {
  const pack = packs[1],
    ids = pack.questions.slice(0, 5).map((q) => q.id);
  const one = createRoom(pack, ids, Array(5).fill("yes")),
    guest = viewRoom(one, null).guestToken;
  await submitGuest(one, guest, ["yes", "no", "no", "maybe", "maybe"]);
  expect(viewRoom(one, null).ad).toBe("none");
  await expect(claimAd(one, guest)).rejects.toThrow(/더 열 수 있는 카드/);
  const free = createRoom(packs[0], ids.map((q) => q.replace("p2", "p1")), Array(5).fill("yes")),
    freeGuest = viewRoom(free, null).guestToken;
  await submitGuest(free, freeGuest, ["yes", "yes", "yes", "no", "no"]);
  expect(viewRoom(free, null).ad).toBe("none");
});

it("팩 이용권은 심장 간질간질의 이번 결과와 이후 만든 방에 적용한다", async () => {
  const pack = packs[1],
    ids = pack.questions.slice(0, 5).map((q) => q.id);
  const create = () => createRoom(pack, ids, Array(5).fill("yes"));
  const previous = create(),
    id = create(),
    guest = viewRoom(id, null).guestToken;
  await expect(unlock(id, guest, "pack")).rejects.toThrow();
  await submitGuest(id, guest, ["yes", "maybe", "yes", "no", "yes"]);
  await unlock(id, guest, "pack");
  await unlock(id, guest, "pack");
  expect(viewRoom(id, null).result?.opened).toHaveLength(3);
  expect(viewRoom(previous, null).unlocked).toBe(false);
  activateSeat(id, null);
  expect(viewRoom(create(), null).unlocked).toBe(false);
  activateSeat(id, guest);
  expect(viewRoom(create(), null).unlocked).toBe(true);
  expect(
    viewRoom(createRoom(packs[3], paidIds, Array(5).fill("yes")), null)
      .unlocked,
  ).toBe(false);
});

it("겹친 카드 한 장이면 구매할 추가 카드가 없으며 답장 다섯 장은 앞 판과 겹치지 않는다", async () => {
  const pack = packs[1],
    ids = pack.questions.slice(0, 5).map((q) => q.id);
  const id = createRoom(pack, ids, Array(5).fill("yes")),
    guest = viewRoom(id, null).guestToken;
  await submitGuest(id, guest, ["yes", "no", "no", "maybe", "maybe"]);
  await expect(unlock(id, guest, "room")).rejects.toThrow();
  const next = redeal(id, guest);
  expect(new Set(next).size).toBe(5);
  expect(
    next.every(
      (q) => !ids.includes(q) && pack.questions.some((p) => p.id === q),
    ),
  ).toBe(true);
});
