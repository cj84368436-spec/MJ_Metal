import data from "./questions.json";

// 화면 문구의 유일한 출처는 questions.json이다.
//
// 결제 모델(5.0): 방을 만들고 보내는 것은 모든 팩에서 무료다. 두 사람이 답을
// 마치면 결과 화면에서 둘 다 yes인 카드를 두 장까지 무료로 열어 주고, 나머지
// '통한 카드'와 카드별 한마디는 그 방에서 한 번 결제(단건)하거나 전 팩 자유이용
// 패스로 잠금 해제한다. 무료 팩도 예외가 아니다. 상대의 답이나 서로 다른 카드는
// 어떤 경우에도 공개하지 않는다.

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
export const previewCards = 2;
/** 방마다 한 번, 보상형 광고로 더 여는 카드 수. */
export const adBonusCards = 1;
/** 결과 화면의 광고 보상 상태. none이면 광고 버튼을 숨긴다. */
export type AdState = "none" | "available" | "used";
export type Product = "room" | "pack";
/** 전 팩 자유이용 패스: 이 기기에서 만드는 모든 팩의 결과를 연다. */
export const passName = "전 팩 자유이용 패스";
export const passPriceKrw = 1900;
export const passPrice = passPriceKrw.toLocaleString("ko-KR") + "원";
/** 무료 팩에서 남은 '통한 카드'를 열 때의 값. */
export const extraCardKrw = 1100;
/** 모든 팩이 함께 쓰는 무료 공개 안내. 두 조각을 나눠 화면에서 굵게 표시한다. */
export const freeLead = "보내기 무료 · 둘 다 맞은";
export const freeTail = "2장까지 무료";
export const freePreviewText = freeLead + " " + freeTail;
export type Referral = { room: string; guest: string };
export const lockedText = "둘 다 좋다고 한 카드예요.";
export const krw = (n: number) => n.toLocaleString("ko-KR") + "원";
export const price = (p: Pack) => (p.price_krw ? krw(p.price_krw) : "무료");
/** 이 방의 남은 '통한 카드'를 여는 값. 무료 팩도 1,100원이다. */
export const roomPriceKrw = (p: Pack) => p.price_krw || extraCardKrw;
export const roomPrice = (p: Pack) => krw(roomPriceKrw(p));
export const isFree = (p: Pack) => p.price_krw === 0;
/**
 * 팩 선택·카드 고르기 화면의 가격 안내. 어떤 팩이든 둘 다 맞은 두 장은 무료이고
 * 남은 '통한 카드'만 그 방에서 한 번 결제하거나 전 팩 패스로 연다.
 */
export const packNote = (p: Pack, ownsPass = false) =>
  ownsPass
    ? "보내기 무료 · 패스로 4개 팩 결과까지 열려요"
    : freePreviewText + " · 나머지 " + roomPrice(p);
/**
 * 결제창이 실제로 부를 상품. 버튼에서 고른 상품을 그대로 따르되, 패스를 가진
 * 기기는 단건 과금 대상이 아니라서 패스 적용으로 고정한다(금액을 다시 받지 않는다).
 */
export const checkoutProduct = (
  selected: Product,
  ownsPass: boolean,
): Product => (ownsPass ? "pack" : selected);
/** 다음 단계 팩. 마지막 팩 뒤에는 없다. */
export const packAfter = (p: Pack) => packs[packs.indexOf(p) + 1];

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

// 결과 화면의 심리 분석. 문항마다 '둘 다 yes'가 얼마나 쌓였는지로 호감 확률을
// 매기고, 그 상태에서 바로 할 수 있는 다음 행동을 함께 고른다. 실제 상대의
// 답이나 감정을 맞히는 값이 아니라 참고용 추정치다.
export type Reading = {
  /** 호감 확률(%). */
  chance: number;
  /** 한 줄 결론. */
  headline: string;
  /** 두 문장 이내의 설명. */
  body: string;
  /** 이 단계에서 권하는 다음 행동. */
  next: "confess" | "next-pack" | "other-pack";
};
const readings: Reading[] = [
  {
    chance: 32,
    headline: "이번엔 하나도 안 겹쳤어요.",
    body: "서로 답이 달랐다는 것뿐이에요. 누가 뭘 골랐는지는 알 수 없어요.",
    next: "other-pack",
  },
  {
    chance: 40,
    headline: "아직은 서로 조심스러운 단계예요.",
    body: "한 장은 통했어요. 타이밍이 조금 엇갈렸을 뿐이니 속마음을 더 알아볼 필요가 있어요.",
    next: "other-pack",
  },
  {
    chance: 48,
    headline: "아직은 서로 조심스러운 단계예요.",
    body: "두 장이 통했어요. 마음이 없는 건 아니고 아직 말을 아끼는 중이에요.",
    next: "other-pack",
  },
  {
    chance: 74,
    headline: "분위기는 확실히 좋아요.",
    body: "세 장이 통했으면 마음은 이미 기운 쪽이에요. 안 꺼낸 속마음이 한두 장 남았을 뿐이에요.",
    next: "next-pack",
  },
  {
    chance: 86,
    headline: "거의 다 통했어요.",
    body: "네 장이 통했어요. 남은 한 장이 아직 안 꺼낸 속마음이에요.",
    next: "next-pack",
  },
  {
    chance: 94,
    headline: "이 정도면 그냥 고백해도 되겠는데요?",
    body: "다섯 장 다 통한 건 사실상 서로 눈치만 보고 있는 단계예요.",
    next: "confess",
  },
];
export const reading = (matched: number): Reading =>
  readings[Math.max(0, Math.min(5, matched))];
