import data from "./questions.json";

// 화면 문구의 유일한 출처는 questions.json이다. 예전에는 질문 ID별 덮어쓰기 표가
// copy.ts에 있어서 문항을 고쳐도 화면에는 옛 문장이 남았다. 그 표는 삭제했다.

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
export const lockedText = "아직 열리지 않은 카드예요.";
export const price = (p: Pack) =>
  p.price_krw ? p.price_krw.toLocaleString("ko-KR") + "원" : "무료";

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
export function matchCards(
  questions: Question[],
  host: Answer[],
  guest: Answer[],
  report: boolean,
) {
  if (questions.length !== 5 || !complete(host) || !complete(guest))
    throw new Error("카드 다섯 장에 모두 답해주세요.");
  const matched = questions.filter(
    (_, i) => host[i] === "yes" && guest[i] === "yes",
  );
  const opened = matched.slice(0, report ? 5 : 2);
  return {
    matched: matched.length,
    percent: matched.length * 20,
    opened,
    locked: 5 - opened.length,
  };
}
export type Result = ReturnType<typeof matchCards>;
export const ownsPack = (ids: string[], pack: Pack) =>
  pack.price_krw === 0 || ids.includes(pack.id);
export const grantPack = (ids: string[], pack: Pack) =>
  ownsPack(ids, pack) ? ids : [...ids, pack.id];
