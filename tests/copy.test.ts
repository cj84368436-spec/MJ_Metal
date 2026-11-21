import { describe, expect, it } from "vitest";
import { packs } from "../src/domain";

const all = packs.flatMap((p) => p.questions);
const shown = (q: (typeof all)[number]) =>
  [...q.options.map((o) => o.label), q.matchMessage, q.followUp].join(" ");
const coach =
  /말해보세요|해보세요|권해요|답이 두 배|오래 갑니다|어떻게|그 웃음이 사실 대답|눈이 마주치면 그게 답|아쉬워합니다|인정했어|설레는 순간/;
const crossExam =
  /이성적인 호감|고백하면|받아줄 생각|사귀는 상상|어장|말릴 거야|정색|한심|최악/;

describe("카드 문구 정책", () => {
  it("선택지는 예·고민·아니오 세 개이고 라벨은 짧고 바로 읽힌다", () => {
    for (const q of all) {
      expect(q.options.map((o) => o.value)).toEqual(["yes", "maybe", "no"]);
      for (const o of q.options) {
        expect(o.label).toBe(o.label.trim());
        expect(o.label.length).toBeGreaterThan(0);
        expect(o.label.length).toBeLessThanOrEqual(12);
        expect(o.label).not.toMatch(/[.?!]$/);
      }
    }
  });
  it("'아니오'는 거절이나 평가 없이 자기 뜻만 분명하게 말한다", () => {
    for (const q of all)
      expect(q.options[2].label).not.toMatch(/거절|싫|최악|별로|한심|실망/);
  });
  it("연애 코치 설교조와 상대 마음 해석 문구를 쓰지 않는다", () => {
    for (const q of all) expect(shown(q)).not.toMatch(coach);
  });
  it("취조하거나 고백을 재촉하는 직설 문구를 다시 넣지 않는다", () => {
    for (const q of all) expect(q.question + " " + shown(q)).not.toMatch(crossExam);
  });
  it("결과 문구는 한 줄로 끝나고 바로 이어질 수 있는 말을 한다", () => {
    for (const q of all) {
      expect(q.matchMessage.length).toBeLessThanOrEqual(30);
      expect(q.followUp.length).toBeLessThanOrEqual(40);
      expect(q.matchMessage.endsWith(".")).toBe(true);
      expect(q.followUp.endsWith(".")).toBe(true);
      expect(q.matchMessage).not.toMatch(/\n/);
      expect(q.followUp).not.toMatch(/\n/);
    }
  });
  it("질문은 두 사람 모두 자기 말로 읽을 수 있는 짧은 한 문장이다", () => {
    for (const q of all) {
      expect(q.question.endsWith("?")).toBe(true);
      expect(q.question.length).toBeLessThanOrEqual(36);
      expect(q.question).not.toMatch(/당신|너희/);
    }
  });
  it("60문항의 질문과 ID가 모두 다르다", () => {
    expect(new Set(all.map((q) => q.id)).size).toBe(60);
    expect(new Set(all.map((q) => q.question)).size).toBe(60);
  });
  it("팩 제목은 설렘의 온도차를 드러낸다", () => {
    expect(packs.map((p) => p.title)).toEqual([
      "설렘의 시작",
      "심장 간질간질",
      "우리 둘 이야기",
      "둘만의 밤 · 19+",
    ]);
  });
  it("성인 팩은 심의에서 문제 되는 노골적 표현 없이 수위와 허락만 묻는다", () => {
    const adult = packs.find((p) => p.id === "pack4")!;
    expect(adult.title).toContain("19+");
    for (const q of adult.questions)
      expect(q.question + " " + q.matchMessage + " " + q.followUp).not.toMatch(
        /섹스|성관계|정사|나체|알몸|벗겨|삽입|오르가즘|야한/,
      );
  });
});
