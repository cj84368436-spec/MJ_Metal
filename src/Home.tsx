import { ArrowRight, Check } from "lucide-react";
import { hasPass } from "./store";
import {
  Pack,
  packs,
  freeLead,
  freeTail,
  passPrice,
  roomPrice,
} from "./domain";
import { asset } from "./paths";

export const available = packs.filter(
  (p) => p.id !== "pack4" || import.meta.env.VITE_AUDIENCE !== "teens",
);

const themeArt = ["heart", "theme-chat", "theme-sparks", "theme-heart"];
const captions = [
  "지금 우리 썸일까?",
  "내 마음이 궁금해?",
  "혹시 나만 신경 쓰여?",
  "이 감정 들키고 싶어?",
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
  const pass = hasPass();
  return (
    <section className="theme-screen">
      <h1 className="screen-title">
        <span className="title-rays">카드 테마 선택</span>
      </h1>
      <div className="pack-list" role="radiogroup" aria-label="카드 테마">
        {available.map((p, i) => {
          const checked = p.id === selected.id;
          // 패스를 가진 기기는 네 팩 결과가 모두 열리고, 아니면 어느 팩이든 두 장까지 무료다.
          const tag = pass ? "패스 보유" : "2장 무료";
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
              {tag && <span className="pack-tag">{tag}</span>}
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
          {pass ? (
            <>
              패스로 <b>4개 팩 결과</b>를 다 열 수 있어요
            </>
          ) : (
            <>
              {freeLead} <b>{freeTail}</b>
            </>
          )}
        </p>
        {!pass && (
          <small className="theme-sub">
            나머지 {roomPrice(selected)} · 전 팩 패스 {passPrice}
          </small>
        )}
        <button className="cta" onClick={start}>
          이 테마로 시작하기 <ArrowRight size={21} />
        </button>
      </div>
    </section>
  );
}

export function Cover({ start }: { start: () => void }) {
  return (
    <section className="cover" aria-label="우리 썸인가">
      <img
        src={asset("secret-five-cover.jpg")}
        width={720}
        height={1280}
        alt="우리 썸인가? 속마음 5장. 두 사람이 마주 보고 있어요."
      />
      <button
        className="cover-start"
        aria-label="시작하기 — 카드 테마 선택"
        onClick={start}
      />
    </section>
  );
}
