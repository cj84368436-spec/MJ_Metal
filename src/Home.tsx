import { ArrowRight, Check } from "lucide-react";
import { hasPass } from "./store";
import { Pack, packs, price, isFree } from "./domain";
import { asset } from "./paths";

export const available = packs.filter(
  (p) => p.id !== "pack4" || import.meta.env.VITE_AUDIENCE !== "teens",
);

const themeArt = ["heart", "theme-chat", "theme-sparks", "theme-heart"];
const captions = [
  "지금 우리, 썸일까?",
  "내 마음이 궁금해?",
  "혹시 나만 신경 쓰여?",
  "이 감정, 들키고 싶어?",
];

export function Home({
  selected,
  onSelect,
  start,
}: {
  selected: Pack;
  onSelect: (pack: Pack) => void;
  start: () => void;
}) {
  return (
    <section className="theme-screen">
      <h1 className="screen-title">
        <span className="title-rays">카드 테마 선택</span>
      </h1>
      <div className="pack-list" role="radiogroup" aria-label="카드 테마">
        {available.map((p, i) => {
          const checked = p.id === selected.id;
          return (
            <button
              key={p.id}
              className={"pack-row" + (checked ? " on" : "")}
              role="radio"
              aria-checked={checked}
              onClick={() => onSelect(p)}
            >
              <img
                className="theme-art"
                src={asset("sketch/" + themeArt[i] + ".png")}
                alt=""
              />
              <span className="pack-name">
                <b>
                  {p.title}
                  {i === 0 ? "?" : i >= 2 ? "…" : ""}
                </b>
                <small>{captions[i]}</small>
              </span>
              {checked && (
                <span className="pack-tag">
                  {isFree(p)
                    ? "전부 무료"
                    : hasPass(p)
                      ? "이용권 보유"
                      : "결과 " + price(p)}
                </span>
              )}
              <span className="radio-dot" aria-hidden="true">
                {checked && <Check size={15} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="theme-bottom">
        <p className="theme-note">
          <img src={asset("sketch/crown.png")} alt="" />
          {isFree(selected) ? (
            <>
              결과 확인 · 보내기 모두 <b>무료!</b>
            </>
          ) : hasPass(selected) ? (
            "이용권으로 결과까지 열려요"
          ) : (
            <>보내기는 무료 · 추가 결과 {price(selected)}</>
          )}
        </p>
        <button className="cta" onClick={start}>
          이 테마로 시작하기 <ArrowRight size={21} />
        </button>
      </div>
    </section>
  );
}

export function Cover({ start }: { start: () => void }) {
  return (
    <section className="cover" aria-label="썸 속마음 질문">
      <img
        src={asset("secret-five-cover.jpg")}
        alt="썸 속마음 질문 확정 홈 표지"
      />
      <button
        className="cover-start"
        aria-label="시작하기 — 카드 테마 선택"
        onClick={start}
      />
    </section>
  );
}
