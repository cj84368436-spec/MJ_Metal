import { describe, expect, it } from "vitest";
import {
  packs,
  selectFive,
  validateFive,
  matchCards,
  unlockPrice,
  isFree,
  previewCards,
  Answer,
} from "../src/domain";

const pack = packs[0];
const five = pack.questions.slice(0, 5);
const yes: Answer[] = Array(5).fill("yes");
describe("질문 팩과 선택", () => {
  it("팩별로 15개의 고유 문항, 정확한 가격과 답 3개를 제공한다", () => {
    expect(packs.map((p) => p.price_krw)).toEqual([0, 1100, 1100, 1496]);
    expect(
      new Set(packs.flatMap((p) => p.questions.map((q) => q.id))).size,
    ).toBe(60);
    for (const p of packs) {
      expect(p.questions).toHaveLength(15);
      for (const q of p.questions)
        expect(q.options.map((o) => o.value)).toEqual(["yes", "maybe", "no"]);
    }
  });
  it("직접 선택은 같은 팩의 서로 다른 5장만 허용한다", () => {
    const ids = five.map((q) => q.id);
    expect(validateFive(pack, ids)).toBe(true);
    for (const invalid of [
      ids.slice(1),
      [...ids, ids[0]],
      [...ids.slice(1), ids[1]],
      [...ids.slice(1), "p2-01"],
    ]) {
      expect(validateFive(pack, invalid)).toBe(false);
    }
  });
  it("최근 세 판을 가능한 한 피하고 풀이 소진되면 오래된 판부터 다시 쓴다", () => {
    const rounds: string[][] = [];
    for (let i = 0; i < 3; i++) rounds.push(selectFive(pack, rounds));
    expect(new Set(rounds.flat()).size).toBe(15);
    expect(selectFive(pack, rounds).sort()).toEqual([...rounds[0]].sort());
  });
});
describe("결과 공개와 잠금 해제", () => {
  it("YES × YES 이외의 여덟 조합은 양방향 모두 아무 카드도 열지 않는다", () => {
    const values: Answer[] = ["yes", "maybe", "no"];
    for (const a of values)
      for (const b of values) {
        if (a === "yes" && b === "yes") continue;
        const result = matchCards(
          five,
          Array(5).fill(a),
          Array(5).fill(b),
          true,
        );
        expect(result).toEqual({
          matched: 0,
          percent: 0,
          opened: [],
          locked: 0,
          sealed: 5,
        });
      }
  });
  it("잠금 해제 전에는 겹친 첫 카드 한 장만, 해제 후에는 겹친 카드 전부를 연다", () => {
    const guest: Answer[] = ["yes", "maybe", "yes", "yes", "no"];
    const preview = matchCards(five, yes, guest, false);
    expect(previewCards).toBe(1);
    expect(preview.matched).toBe(3);
    expect(preview.percent).toBe(60);
    expect(preview.opened.map((q) => q.id)).toEqual([five[0].id]);
    expect(preview.locked).toBe(2);
    expect(preview.sealed).toBe(2);
    expect(JSON.stringify(preview)).not.toContain(five[1].question);
    expect(JSON.stringify(preview)).not.toContain(five[2].question);
    const full = matchCards(five, yes, guest, true);
    expect(full.opened.map((q) => q.id)).toEqual([
      five[0].id,
      five[2].id,
      five[3].id,
    ]);
    expect(full.locked).toBe(0);
    expect(full.sealed).toBe(2);
  });
  it("미완료 응답으로 결과를 만들지 않는다", () => {
    expect(() => matchCards(five, yes, [], false)).toThrow();
  });
  it("보상형 광고를 보면 겹친 카드 한 장이 더 열리고, 해제 뒤에는 영향이 없다", () => {
    const guest: Answer[] = ["yes", "maybe", "yes", "yes", "no"];
    const bonus = matchCards(five, yes, guest, false, true);
    expect(bonus.opened.map((q) => q.id)).toEqual([five[0].id, five[2].id]);
    expect(bonus.locked).toBe(1);
    expect(bonus.adBonusId).toBe(five[2].id);
    expect(JSON.stringify(bonus)).not.toContain(five[3].question);
    const full = matchCards(five, yes, guest, true, true);
    expect(full.opened).toHaveLength(3);
    expect(full.locked).toBe(0);
    expect(full.adBonusId).toBeUndefined();
  });
  it("겹친 카드가 한 장이면 광고로 더 열 카드가 없다", () => {
    const one = matchCards(five, yes, ["yes", "no", "no", "no", "no"], false, true);
    expect(one.opened).toHaveLength(1);
    expect(one.locked).toBe(0);
    expect(one.adBonusId).toBeUndefined();
  });
});
it("무료 팩은 결과가 0원이고 유료 팩만 잠금 해제 값을 가진다", () => {
  expect(packs.map(isFree)).toEqual([true, false, false, false]);
  expect(unlockPrice(packs[0])).toBe(0);
  expect(unlockPrice(packs[1])).toBe(1100);
  expect(unlockPrice(packs[3])).toBe(1496);
});
