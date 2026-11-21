import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Heart,
  Layers2,
  LockKeyhole,
  Play,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Pack, packs, price, ownsPack } from "./domain";
import { owned } from "./store";
import { reduced } from "./bridge";
import { asset } from "./paths";

const situations = [
  ["썸 탈 때", 0, 0],
  ["고백 직전", 1, 12],
  ["손잡고 싶을 때", 1, 1],
  ["말 못 한 서운함", 2, 0],
  ["싸운 다음 날", 2, 6],
  ["둘만의 밤", 3, 0],
] as const;
export const available = packs.filter(
  (p) => p.id !== "pack4" || import.meta.env.VITE_AUDIENCE !== "teens",
);
export function Fan() {
  return (
    <div className="artwork" aria-hidden="true">
      <i className="orbit one" />
      <i className="orbit two" />
      <i className="glint g1">✦</i>
      <i className="glint g2">✦</i>
      <i className="glint g3">✧</i>
      <img src={asset("art/fan.webp")} alt="" />
    </div>
  );
}
const guide = [
  ["카드 5장 골라 링크 보내기", "지금 진짜 궁금한 것만 5장 골라요."],
  [
    "상대도 몰래 답하기",
    "30초, 로그인 없이. 서로 뭐라고 골랐는지는 안 보여요.",
  ],
  [
    "둘 다 좋아한 카드만 열려요",
    "겹친 카드만 펼쳐져요. 나머지는 비밀로 남아요.",
  ],
];
function Preview({ question, go }: { question: string; go: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    let visible = false,
      pausedUntil = 0,
      lastY = scrollY;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(ref.current!);
    const scroll = () => {
      if (Math.abs(scrollY - lastY) > 100) {
        pausedUntil = Date.now() + 12000;
        lastY = scrollY;
      }
    };
    const timer = setInterval(() => {
      if (
        visible &&
        !document.hidden &&
        !mq.matches &&
        Date.now() > pausedUntil
      )
        setFrame((f) => (f + 1) % 3);
    }, 2000);
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      observer.disconnect();
      clearInterval(timer);
      window.removeEventListener("scroll", scroll);
    };
  }, [question]);
  return (
    <button className="preview" onClick={go} ref={ref}>
      <div className="preview-top">
        <span className="live-dot" />
        예시 미리보기 <span className="example">예시</span>
      </div>
      <div className="preview-paper" key={frame}>
        <Heart size={18} />
        <strong>
          {[question, "나도 좋아 · 상대도 좋아", "이 카드가 열렸어요"][frame]}
        </strong>
        <span className="dots">
          {[0, 1, 2].map((i) => (
            <i key={i} className={i === frame ? "on" : ""} />
          ))}
        </span>
      </div>
      <span className="preview-link">
        <Play size={15} fill="currentColor" /> 3초 예시 보기{" "}
        <ArrowRight size={18} />
      </span>
    </button>
  );
}
export function Home({
  selected,
  onSelect,
  start,
  go,
}: {
  selected: Pack;
  onSelect: (p: Pack) => void;
  start: () => void;
  go: (url: string) => void;
}) {
  const [active, setActive] = useState<number | null>(
    selected.id === "pack1" ? 0 : null,
  );
  const [sticky, setSticky] = useState(window.scrollY > 240);
  const list = useRef<HTMLElement>(null);
  const paid = owned();
  useEffect(() => {
    const fn = () => setSticky(window.scrollY > 240);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  const example =
    active === null
      ? selected.questions[0]
      : packs[situations[active][1]].questions[situations[active][2]];
  function choose(i: number) {
    setActive(i);
    onSelect(packs[situations[i][1]]);
    list.current?.scrollIntoView({
      behavior: reduced() ? "instant" : "smooth",
      block: "start",
    });
  }
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width:640px)").matches,
  );
  useEffect(() => {
    const m = matchMedia("(max-width:640px)");
    const change = () => setMobile(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  const situationsRow = (
    <section className="situations">
      <h2>어떤 순간에 쓰고 싶나요?</h2>
      <div className="chips">
        {situations.map(
          ([name, p], i) =>
            available.includes(packs[p]) && (
              <button
                key={name}
                aria-pressed={i === active}
                onClick={() => choose(i)}
              >
                {i === active && <Check size={14} />}
                {name}
              </button>
            ),
        )}
      </div>
    </section>
  );
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <div className="badges">
            <span>
              <Clock3 />
              30초
            </span>
            <span>
              <UserRound />
              가입 없음
            </span>
            <span>
              <LockKeyhole />
              둘만 보기
            </span>
          </div>
          <h1>
            대놓고 묻기 쪽팔린 말,
            <br />둘 다 좋다고 할 때만 열려요.
          </h1>
          <p>카드 5장을 골라 보내면, 상대도 몰래 답해요.</p>
        </div>
        {mobile && situationsRow}
        <Fan />
        <div className="hero-action">
          <button className="primary" onClick={start}>
            {ownsPack(paid, selected)
              ? "카드 5장 만들기"
              : selected.title +
                " · " +
                (selected.price_krw ? price(selected) + "으로 시작" : "무료로 시작")}
            <ArrowRight size={19} />
          </button>
          <small>한 판 30초 · 무료 팩 1개부터</small>
        </div>
      </section>
      {!mobile && situationsRow}
      <div className="guide-preview">
        <section>
          <h2>
            <Layers2 />
            언제 쓰나요?
          </h2>
          <div className="guide panel">
            {guide.map(([title, desc], i) => (
              <div className="step" key={title}>
                <span>{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </div>
              </div>
            ))}
            <small>한 판 30초 · 가입 없음 · 개인정보 안 받아요</small>
          </div>
        </section>
        <section>
          <h2>
            <Sparkles />
            예시로 먼저 보기
          </h2>
          <Preview
            question={example.question}
            go={() => go("/demo?pack=" + selected.id)}
          />
        </section>
      </div>
      <section ref={list} className="catalog">
        <div className="section-title">
          <h2>오늘의 카드 5장</h2>
          <small>{available.length}개 팩 · 15문항 중 5장</small>
        </div>
        <div className="pack-grid">
          {available.map((p) => (
            <button
              key={p.id}
              className={"pack panel " + (p === selected ? "selected" : "")}
              aria-pressed={p === selected}
              onClick={() => {
                onSelect(p);
                setActive(null);
              }}
            >
              <span className={"thumb " + p.id}>
                <img src={asset("art/" + p.id + ".webp")} alt="" />
              </span>
              <span className="pack-info">
                <span className="pack-title">{p.title}</span>
                <span>{p.subtitle}</span>
                <small>15문항 중 5장 · 30초</small>
              </span>
              <span className="pack-end">
                <b>{p.price_krw && ownsPack(paid, p) ? "이용 중" : price(p)}</b>
                {p === selected ? (
                  <Check size={18} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </span>
            </button>
          ))}
        </div>
      </section>
      {sticky && (
        <div className="dock">
          <button className="primary" onClick={start}>
            {selected.title} ·{" "}
            {selected.price_krw && ownsPack(paid, selected)
              ? "보유 팩으로"
              : price(selected) + "로"}{" "}
            시작하기 <ArrowRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
