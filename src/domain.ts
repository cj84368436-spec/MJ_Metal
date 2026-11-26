import data from "./questions.json";

// 화면 문구의 유일한 출처는 questions.json이다.
//
// 결제 모델(3.0): 방을 만들고 보내는 것은 모든 팩에서 무료다. 두 사람이 답을
// 마치면 결과 화면에서 겹친 카드 한 장을 무료로 열어 주고, 나머지 겹친 카드와
// 카드별 한마디는 그 방에서 한 번 결제해 잠금 해제한다. 무료 팩은 처음부터 전부
// 열린다. 상대의 답이나 서로 다른 카드는 어떤 경우에도 공개하지 않는다.

export type Answer = "yes" | "maybe" | "no";
export type Question = {
  id: string;
  question: string;
  options: { value: Answer; label: string }[];
  matchMessage: string;
  followUp: string;
};
export type Pack = {
  id: string;
  title: string;
  subtitle: string;
  sku: string | null;
  price_krw: number;
  questions: Question[];
};
export const packs: Pack[] = (data.packs as Pack[]).map((pack) => ({
  ...pack,
  questions: pack.questions.map((q) => ({
    ...q,
    options: q.options.map((o) => ({ ...o, label: o.label.trim() })),
  })),
}));
/** 잠금 해제 전에 무료로 열리는 겹친 카드 수. */
export const previewCards = 1;
/** 방마다 한 번, 보상형 광고로 더 여는 카드 수. */
export const adBonusCards = 1;
/** 결과 화면의 광고 보상 상태. none이면 광고 버튼을 숨긴다. */
export type AdState = "none" | "available" | "used";
export type Product = "room" | "pack";
export const passPackId = "pack2";
export const passPrice = "3,300원";
export type Referral = { room: string; guest: string };
export const lockedText = "둘 다 좋다고 한 카드예요.";
export const price = (p: Pack) =>
  p.price_krw ? p.price_krw.toLocaleString("ko-KR") + "원" : "무료";
/** 이 팩의 결과를 여는 값. 무료 팩은 0원. */
export const unlockPrice = (p: Pack) => p.price_krw;
export const isFree = (p: Pack) => p.price_krw === 0;

export function validateFive(pack: Pack, ids: string[]) {
  return (
    ids.length === 5 &&
    new Set(ids).size === 5 &&
    ids.every((id) => pack.questions.some((q) => q.id === id))
  );
}

export function selectFive(pack: Pack, history: string[][]): string[] {
  // Shuffle first so equally recent questions have a uniform random order.
  const ids = pack.questions.map((q) => q.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const recent = new Map<string, number>();
  history
    .slice(-3)
    .forEach((round, age) => round.forEach((id) => recent.set(id, age + 1)));
  return ids
    .sort((a, b) => (recent.get(a) ?? 0) - (recent.get(b) ?? 0))
    .slice(0, 5);
}
export function complete(answers: Answer[]) {
  return (
    answers.length === 5 &&
    Array.from(answers).every((a) => ["yes", "maybe", "no"].includes(a))
  );
}
export type Result = {
  /** 둘 다 yes인 카드 수. */
  matched: number;
  /** 겹친 비율(%). */
  percent: number;
  /** 지금 열려 있는(질문·결과 문장을 볼 수 있는) 카드. */
  opened: Question[];
  /** 겹쳤지만 아직 잠긴 카드 수. 결제로 열린다. */
  locked: number;
  /** 서로 답이 달라 끝까지 비밀로 남는 카드 수. */
  sealed: number;
  /** 보상형 광고로 열린 카드. 광고를 보지 않았으면 없다. */
  adBonusId?: string;
};
export function matchCards(
  questions: Question[],
  host: Answer[],
  guest: Answer[],
  unlocked: boolean,
  adBonus = false,
): Result {
  if (questions.length !== 5 || !complete(host) || !complete(guest))
    throw new Error("카드 다섯 장에 모두 답해주세요.");
  const matched = questions.filter(
    (_, i) => host[i] === "yes" && guest[i] === "yes",
  );
  const free = previewCards + (adBonus ? adBonusCards : 0);
  const opened = matched.slice(0, unlocked ? matched.length : free);
  const bonus = unlocked || !adBonus ? undefined : opened[previewCards];
  return {
    matched: matched.length,
    percent: matched.length * 20,
    opened,
    locked: matched.length - opened.length,
    sealed: 5 - matched.length,
    ...(bonus && { adBonusId: bonus.id }),
  };
}
