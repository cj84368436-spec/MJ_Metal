import { describe, expect, it } from "vitest";
import {
  packs,
  selectFive,
  validateFive,
  matchCards,
  ownsPack,
  grantPack,
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
describe("공개 결과", () => {
  it("YES × YES 이외의 여덟 조합은 양방향 모두 완전히 같은 결과를 만든다", () => {
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
          locked: 5,
        });
      }
  });
  it("무료 2장과 리포트의 공개 범위를 구분하고 잠긴 질문 식별자를 내보내지 않는다", () => {
    const guest: Answer[] = ["yes", "maybe", "yes", "yes", "no"];
    const result = matchCards(five, yes, guest, false);
    expect(result.matched).toBe(3);
    expect(result.percent).toBe(60);
    expect(result.opened.map((q) => q.id)).toEqual([five[0].id, five[2].id]);
    expect(result.locked).toBe(3);
    expect(JSON.stringify(result)).not.toContain(five[1].id);
    expect(matchCards(five, yes, guest, true).locked).toBe(2);
  });
  it("미완료 응답으로 결과를 만들지 않는다", () => {
    expect(() => matchCards(five, yes, [], false)).toThrow();
  });
});
it("무료 팩은 기본 제공, 결제는 해당 팩만 한 번 지급한다", () => {
  expect(ownsPack([], packs[0])).toBe(true);
  expect(ownsPack([], packs[1])).toBe(false);
  const paid = grantPack(grantPack([], packs[1]), packs[1]);
  expect(paid).toEqual(["pack2"]);
  expect(ownsPack(paid, packs[1])).toBe(true);
  expect(ownsPack(paid, packs[2])).toBe(false);
});
