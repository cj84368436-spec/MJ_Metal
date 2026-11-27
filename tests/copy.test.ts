import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { freePreviewText, packs } from "../src/domain";

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
  it("팩 제목은 썸의 온도차를 드러낸다", () => {
    expect(packs.map((p) => p.title)).toEqual([
      "우리 썸인가",
      "내가 그렇게 좋아?",
      "질투 나는데",
      "썸 끝내기",
    ]);
  });
  it("노골적 표현과 잠자리 유도 문구를 60문항 어디에도 쓰지 않는다", () => {
    for (const q of all)
      expect(q.question + " " + shown(q)).not.toMatch(
        /섹스|성관계|정사|나체|알몸|벗겨|삽입|오르가즘|야한|자고 갈래|자고 갈까|자고 가|집에 안 가|집에 안 들|외박|원나잇|모텔|호텔|잠자리|스킨십|하룻밤|19\+|19금/,
      );
    const last = packs.find((p) => p.id === "pack4")!;
    expect(last.title + " " + last.subtitle).not.toMatch(/19|성인|야한/);
  });
});
describe("화면 가격 안내와 팩 소개", () => {
  it("팩 부제와 앱 설명에도 쉼표를 쓰지 않는다", () => {
    for (const p of packs) expect(p.subtitle).not.toContain(",");
    const meta = JSON.parse(readFileSync("src/questions.json", "utf8")) as {
      description: string;
    };
    expect(meta.description).not.toContain(",");
  });
  it("팩4 가격을 바꿀 때 옛 금액이 코드와 서버 규칙에 남지 않는다", () => {
    const files = [
      "src/questions.json",
      "src/domain.ts",
      "src/Home.tsx",
      "src/Setup.tsx",
      "src/Results.tsx",
      "supabase/migrations/005_preview_two_and_pass.sql",
    ];
    for (const file of files)
      expect(readFileSync(file, "utf8"), file).not.toMatch(/1,496|1496/);
  });
  it("팩2~4도 두 장까지 무료라는 사실을 홈에서 숨기지 않는다", () => {
    // 모든 팩이 2장 무료이므로 "결과는 결제"처럼 다른 규칙을 알리는 문구를 쓰지 않는다.
    for (const file of ["src/Home.tsx", "src/Setup.tsx"])
      expect(readFileSync(file, "utf8"), file).not.toContain("결과는 결제");
    // 홈·카드 고르기 화면 모두 같은 무료 공개 문구를 쓴다.
    expect(freePreviewText).toBe("보내기 무료 · 둘 다 맞은 2장까지 무료");
    expect(readFileSync("src/Home.tsx", "utf8")).toContain("freeTail");
  });
});
