import { expect, it } from "vitest";
import { packs } from "../src/domain";
it("사용자에게 보이는 선택지·결과·대화 문장에 직접적인 거절이나 상대 해석을 쓰지 않는다", () => {
  for (const p of packs)
    for (const q of p.questions) {
      expect(
        [...q.options.map((o) => o.label), q.matchMessage, q.followUp].join(
          " ",
        ),
      ).not.toMatch(
        /거절|싫어|아니야|그 웃음이 사실 대답|눈이 마주치면 그게 답|아쉬워합니다/,
      );
    }
});
