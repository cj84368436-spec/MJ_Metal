// Preserve the supplied JSON and apply the app's display-copy policy at import.
const labels: Record<string, string> = {
  "아직 듣기 싫어": "조금 더 있다가",
  아니야: "나는 다르게 느껴",
  "더울 땐 아니야": "더울 땐 따로",
};
export const optionLabel = (s: string) => labels[s] ?? s;
export const messages: Record<string, string> = {
  "p2-06": "둘 다 웃어넘길 수 있다고 했어요.",
  "p2-13": "둘 다 올려도 좋다고 했어요. 함께 올릴 사진을 골라볼까요?",
  "p3-12": "둘 다 자주 말한다고 했어요. 오늘 고마웠던 일을 하나씩 꺼내봐요.",
};
export const prompts: Record<string, string> = {
  "p2-01": "손을 잡기 전에 “지금 잡아도 돼?” 하고 한 번 더 물어봐요.",
  "p2-06": "“다음에 같은 질문을 받으면 뭐라고 할까?” 하고 이야기해봐요.",
  "p2-08": "“오늘은 어떻게 인사할까?” 하고 먼저 물어봐요.",
  "p2-13": "같이 올리고 싶은 사진과 공개 범위를 이야기해봐요.",
  "p2-15": "한 달 뒤에 다시 꺼내고 싶은 질문을 하나 골라봐요.",
  "p3-10": "“오늘은 조용히 쉬고 싶어. 내일 볼래?”라고 말해봐요.",
  "p4-11": "“오늘은 어떻게 누우면 편할까?” 하고 물어봐요.",
  "p4-15": "“오늘 나눈 이야기 중 둘만 간직하고 싶은 게 있어?” 하고 물어봐요.",
};
