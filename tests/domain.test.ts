import { describe, expect, it } from "vitest";
import {
  packs,
  selectFive,
  validateFive,
  matchCards,
  roomPriceKrw,
  roomPrice,
  price,
  passPrice,
  isFree,
  previewCards,
  reading,
  packAfter,
  packNote,
  checkoutProduct,
  Answer,
} from "../src/domain";

const pack = packs[0];
const five = pack.questions.slice(0, 5);
const yes: Answer[] = Array(5).fill("yes");
describe("질문 팩과 선택", () => {
  it("팩별로 15개의 고유 문항, 정확한 가격과 답 3개를 제공한다", () => {
    expect(packs.map((p) => p.price_krw)).toEqual([0, 1100, 1100, 1500]);
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
  it("다음 단계 팩은 4단계로 이어지고 마지막 팩 뒤에는 없다", () => {
    expect(packs.map(packAfter).map((p) => p?.id)).toEqual([
      "pack2",
      "pack3",
      "pack4",
      undefined,
    ]);
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
  it("잠금 해제 전에는 통한 카드 두 장까지, 해제 후에는 통한 카드 전부를 연다", () => {
    const guest: Answer[] = ["yes", "maybe", "yes", "yes", "no"];
    const preview = matchCards(five, yes, guest, false);
    expect(previewCards).toBe(2);
    expect(preview.matched).toBe(3);
    expect(preview.percent).toBe(60);
    expect(preview.opened.map((q) => q.id)).toEqual([five[0].id, five[2].id]);
    expect(preview.locked).toBe(1);
    expect(preview.sealed).toBe(2);
    expect(JSON.stringify(preview)).not.toContain(five[1].question);
    expect(JSON.stringify(preview)).not.toContain(five[3].question);
    const full = matchCards(five, yes, guest, true);
    expect(full.opened.map((q) => q.id)).toEqual([
      five[0].id,
      five[2].id,
      five[3].id,
    ]);
    expect(full.locked).toBe(0);
    expect(full.sealed).toBe(2);
  });
  it("두 장만 통하면 잠글 카드가 없고, 세 장부터 한 장이 잠긴다", () => {
    const two = matchCards(five, yes, ["yes", "no", "yes", "no", "no"], false);
    expect(two.opened).toHaveLength(2);
    expect(two.locked).toBe(0);
    const four = matchCards(
      five,
      yes,
      ["yes", "yes", "yes", "yes", "no"],
      false,
    );
    expect(four.opened).toHaveLength(2);
    expect(four.locked).toBe(2);
  });
  it("미완료 응답으로 결과를 만들지 않는다", () => {
    expect(() => matchCards(five, yes, [], false)).toThrow();
  });
  it("보상형 광고로 통한 카드 한 장을 더 열고, 해제 뒤에는 영향이 없다", () => {
    const guest: Answer[] = ["yes", "maybe", "yes", "yes", "yes"];
    const bonus = matchCards(five, yes, guest, false, true);
    expect(bonus.opened.map((q) => q.id)).toEqual([
      five[0].id,
      five[2].id,
      five[3].id,
    ]);
    expect(bonus.locked).toBe(1);
    expect(bonus.adBonusId).toBe(five[3].id);
    expect(JSON.stringify(bonus)).not.toContain(five[4].question);
    const full = matchCards(five, yes, guest, true, true);
    expect(full.opened).toHaveLength(4);
    expect(full.locked).toBe(0);
    expect(full.adBonusId).toBeUndefined();
  });
  it("통한 카드가 두 장 이하면 광고로 더 열 카드가 없다", () => {
    const two = matchCards(
      five,
      yes,
      ["yes", "no", "yes", "no", "no"],
      false,
      true,
    );
    expect(two.opened).toHaveLength(2);
    expect(two.locked).toBe(0);
    expect(two.adBonusId).toBeUndefined();
  });
});
describe("가격 구조", () => {
  it("무료 팩은 표시 가격이 0원이고, 남은 카드는 1,100원에 연다", () => {
    expect(packs.map(isFree)).toEqual([true, false, false, false]);
    expect(price(packs[0])).toBe("무료");
    expect(roomPriceKrw(packs[0])).toBe(1100);
    expect(roomPrice(packs[0])).toBe("1,100원");
    expect(roomPrice(packs[3])).toBe("1,500원");
  });
  it("팩4 단건 가격은 1,500원으로 서버와 같은 숫자를 쓴다", () => {
    expect(roomPriceKrw(packs[3])).toBe(1500);
    // 화면에는 세 자리 구분자가 붙여진다.
    expect(roomPrice(packs[3])).toBe("1,500원");
  });
  it("전 팩 패스는 1,900원이다", () => {
    expect(passPrice).toBe("1,900원");
  });
});
describe("결제창 상품 선택", () => {
  it("버튼에서 고른 상품을 그대로 결제 상품으로 쓴다", () => {
    expect(checkoutProduct("room", false)).toBe("room");
    expect(checkoutProduct("pack", false)).toBe("pack");
  });
  it("패스 보유자는 단건 결제로 내려가지 않고 패스 적용으로 고정한다", () => {
    expect(checkoutProduct("room", true)).toBe("pack");
    expect(checkoutProduct("pack", true)).toBe("pack");
  });
  it("팩 가격 안내가 무료 공개와 남은 금액을 함께 알린다", () => {
    expect(packNote(packs[3])).toBe(
      "보내기 무료 · 둘 다 맞은 2장까지 무료 · 나머지 1,500원",
    );
    expect(packNote(packs[0])).toContain("나머지 1,100원");
    expect(packNote(packs[1], true)).toBe(
      "보내기 무료 · 패스로 4개 팩 결과까지 열려요",
    );
    // 어느 팩 안내든 문장에 쉼표를 쓰지 않는다(금액의 자리 구분은 제외).
    for (const p of packs) expect(packNote(p)).not.toMatch(/[가-힣],/);
  });
});
describe("결과 심리 분석", () => {
  it("통한 카드 수에 따라 호감 확률과 다음 행동이 정해진다", () => {
    const table = [
      [5, 94, "confess"],
      [4, 86, "next-pack"],
      [3, 74, "next-pack"],
      [2, 48, "other-pack"],
      [1, 40, "other-pack"],
      [0, 32, "other-pack"],
    ] as const;
    for (const [matched, chance, next] of table) {
      const r = reading(matched);
      expect(r.chance).toBe(chance);
      expect(r.next).toBe(next);
      expect(r.headline.length).toBeGreaterThan(4);
      expect(r.body.length).toBeGreaterThan(10);
    }
  });
  it("통한 카드가 많을수록 호감 확률이 높고, 교과서 문구를 쓰지 않는다", () => {
    let previous = 0;
    for (let matched = 0; matched <= 5; matched++) {
      const r = reading(matched);
      expect(r.chance).toBeGreaterThan(previous);
      previous = r.chance;
      expect(r.headline + " " + r.body).not.toMatch(
        /말해보세요|해보세요|권해요|중요해요|필요가 있습니다/,
      );
    }
  });
  it("범위를 벗어난 값은 양 끝으로 맞춘다", () => {
    expect(reading(-1).chance).toBe(32);
    expect(reading(9).chance).toBe(94);
  });
});
