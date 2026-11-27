import { useState } from "react";
import { hasPass } from "./store";
import { ArrowRight, Check } from "lucide-react";
import { Pack, packs, price, isFree, Question } from "./domain";

export const available = packs.filter(
  (p) => p.id !== "pack4" || import.meta.env.VITE_AUDIENCE !== "teens",
);

/** AI 일러스트 대신 쓰는 타이포그래피 카드 더미. */
export function CardFan({
  questions,
  small,
}: {
  questions: Question[];
  small?: boolean;
}) {
  return (
    <div className={"fan" + (small ? " small" : "")} aria-hidden="true">
      {questions.slice(0, 3).map((q, i) => (
        <article className={"fan-card c" + (i + 1)} key={q.id}>
          <span className="fan-no">0{i + 1}</span>
          <p>{q.question}</p>
        </article>
      ))}
    </div>
  );
}

export function Home({
  selected,
  onSelect,
  start,
}: {
  selected: Pack;
  onSelect: (p: Pack) => void;
  start: () => void;
}) {
  const [coverReady, setCoverReady] = useState(false);
  return (
    <div className="home">
      {/* Original user-approved cover: no redraw, crop, filter or color changes. */}
      <div style={{ display: coverReady ? "block" : "none", position: "relative", margin: "0 auto", width: "100%", maxWidth: 480 }}>
        <img
          src={import.meta.env.BASE_URL + "secret-five-cover.jpg"}
          alt="우리 썸인가? 비밀 다섯 장. 우연히 눈이 마주친 두 사람."
          onLoad={() => setCoverReady(true)}
          onError={() => setCoverReady(false)}
          style={{ display: "block", width: "100%", height: "auto" }}
        />
        <button
          type="button"
          aria-label="시작하기 — 카드 테마 선택"
          onClick={() => document.getElementById("card-picker")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })}
          style={{ position: "absolute", left: "8.5%", right: "11%", top: "81.5%", height: "10%", borderRadius: 999, background: "transparent", color: "transparent" }}
        >
          시작하기
        </button>
      </div>
      {!coverReady && <section className="hero">
        <div className="hero-copy">
          <span className="kicker">못 물어본 말, 다섯 장</span>
          <h1>
            대놓고 못 물어본
            <br />
            설레는 5장
          </h1>
          <p className="lede">
            보내면 상대도 몰래 답해요.
            <br />둘 다 좋다고 한 카드만 열려요.
          </p>
        </div>
        <CardFan questions={selected.questions} />
      </section>}

      <section className="picker" id="card-picker">
        <div className="picker-head">
          <h2>오늘의 카드</h2>
          <small>보내기는 모두 무료</small>
        </div>
        <div className="pack-list" role="radiogroup" aria-label="카드 팩">
          {available.map((p, i) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={p === selected}
              className={"pack-row" + (p === selected ? " on" : "")}
              onClick={() => onSelect(p)}
            >
              <span className="pack-no">{String(i + 1).padStart(2, "0")}</span>
              <span className="pack-name">
                <b>{p.title}</b>
                <small>{p.subtitle}</small>
              </span>
              <span className="pack-cost">
                {isFree(p)
                  ? "전부 무료"
                  : hasPass(p)
                    ? "이용권 보유"
                    : "결과 " + price(p)}
                {p === selected && <Check size={15} />}
              </span>
            </button>
          ))}
        </div>
        <button className="cta" onClick={start}>
          5장 고르기 시작
          <ArrowRight size={18} />
        </button>
        <p className="foot">
          {selected.title} ·{" "}
          {isFree(selected)
            ? "30초 · 가입 없이 · 결과 전부 무료"
            : hasPass(selected)
              ? "이용권으로 겹친 카드 전부 열기"
              : "30초 · 가입 없이 · 결과는 첫 카드까지 무료"}
        </p>
      </section>

      <section className="quiet">
        <p>링크 하나 보내면 끝. 상대가 답하는 순간 결과가 떠요.</p>
        <p className="quiet-note">
          서로 다른 카드는 아무것도 알려주지 않아요. 선택도, 답도.
        </p>
      </section>
    </div>
  );
}
