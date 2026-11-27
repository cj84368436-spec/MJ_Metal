import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { Answer, Pack, Question } from "./domain";
import { asset } from "./paths";
import { buzz, reduced } from "./bridge";

const feedback = {
  yes: "tickMedium",
  maybe: "tickWeak",
  no: "softMedium",
} as const;
type Props = {
  pack: Pack;
  questions: Question[];
  answers: Answer[];
  change: (a: Answer[]) => void;
  finish: () => void;
  guest?: boolean;
  busy?: boolean;
};
export function CardStack({
  pack,
  questions,
  answers,
  change,
  finish,
  guest,
  busy,
}: Props) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 300);
    return () => clearTimeout(timer);
  }, [busy]);
  const [chosen, setChosen] = useState<Answer | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const origin = useRef<{
    x: number;
    y: number;
    time: number;
    ticked: boolean;
  } | null>(null);
  const timer = useRef(0);
  const locked = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  function pick(value: Answer) {
    if (locked.current || answers.length === 5) return;
    locked.current = true;
    buzz(feedback[value]);
    setChosen(value);
    setDrag({ x: 0, y: 0 });
    timer.current = window.setTimeout(
      () => {
        change([...answers, value]);
        setChosen(null);
        locked.current = false;
        if (answers.length === 4) buzz("success");
      },
      reduced() ? 0 : 180,
    );
  }
  const q = questions[answers.length];
  const direction = (x: number, y: number): Answer | null =>
    Math.abs(x) >= Math.abs(y)
      ? x > 0
        ? "yes"
        : "no"
      : y < 0
        ? "maybe"
        : null;
  const distance = Math.max(Math.abs(drag.x), Math.abs(drag.y));
  const preview = distance > 57 ? direction(drag.x, drag.y) : null;
  // Limit the visual travel while keeping the original swipe distance for selection.
  const lean = Math.tanh(drag.x / 110);
  return (
    <section className="flow stack-flow">
      <div
        className="progress"
        aria-label={Math.min(5, answers.length + 1) + "번째 카드"}
      >
        <strong>{Math.min(5, answers.length + 1)} / 5</strong>
        <div className="progress-pips" aria-hidden="true">
          {questions.map((item, i) => (
            <i key={item.id} className={i <= answers.length ? "filled" : ""} />
          ))}
        </div>
      </div>
      {q ? (
        <>
          <div
            key={q.id}
            className="paper-sheet answer-sheet"
            data-choice={chosen ?? undefined}
            data-dragging={distance > 0 || undefined}
            style={
              distance
                ? {
                    transform: `translate(${lean * 6}px, ${Math.tanh(drag.y / 110) * 9}px) rotate(${lean * 2.4}deg)`,
                  }
                : undefined
            }
          >
            <img
              className="sheet-heart"
              src={asset("sketch/question-heart.png")}
              alt=""
            />
            <article
              className="question"
              onPointerDown={(e) => {
                if (locked.current || !e.isPrimary || e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                origin.current = {
                  x: e.clientX,
                  y: e.clientY,
                  time: performance.now(),
                  ticked: false,
                };
              }}
              onPointerMove={(e) => {
                const o = origin.current;
                if (!o || !e.isPrimary) return;
                const x = e.clientX - o.x,
                  y = e.clientY - o.y;
                setDrag({ x, y });
                if (
                  !o.ticked &&
                  direction(x, y) &&
                  Math.max(Math.abs(x), Math.abs(y)) >= 96
                ) {
                  buzz();
                  o.ticked = true;
                }
              }}
              onLostPointerCapture={(e) => {
                if (!e.isPrimary) return;
                origin.current = null;
                setDrag({ x: 0, y: 0 });
              }}
              onPointerUp={(e) => {
                const o = origin.current;
                if (!o || !e.isPrimary) return;
                origin.current = null;
                const x = e.clientX - o.x,
                  y = e.clientY - o.y;
                const value = direction(x, y);
                const dist = Math.max(Math.abs(x), Math.abs(y));
                if (
                  value &&
                  (dist >= 96 ||
                    (dist > 12 &&
                      dist / Math.max(1, performance.now() - o.time) >= 0.6))
                )
                  pick(value);
                setDrag({ x: 0, y: 0 });
              }}
            >
              <h1>{q.question}</h1>
            </article>
            <div className="actions">
              {q.options.map((o) => (
                <button
                  key={o.value}
                  disabled={!!chosen}
                  data-feedback="custom"
                  data-preview={preview === o.value || undefined}
                  className={
                    "answer " + o.value + (chosen === o.value ? " picked" : "")
                  }
                  onClick={() => pick(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <small className="center hint">
            끌어서 답해도 돼요 · 오른쪽 {q.options[0].label} / 위{" "}
            {q.options[1].label} / 왼쪽 {q.options[2].label}
          </small>
        </>
      ) : (
        <div className="panel done center">
          <span className="complete">
            <Check />
          </span>
          <h1>다섯 장에 모두 답했어요</h1>
          <p>보내기 전까지 내 답을 바꿀 수 있어요.</p>
          <button className="primary" disabled={busy} onClick={finish}>
            {slow
              ? guest
                ? "답 보내는 중…"
                : "링크 만드는 중…"
              : guest
                ? "답 보내기"
                : "카드 봉인하고 보내기"}
            <ArrowRight size={18} />
          </button>
        </div>
      )}
      <div className="answer-meta">
        <small>
          {guest ? "받은 카드 · 속마음 5장" : "내 답 · " + pack.title}
        </small>
        {!!answers.length && (
          <button
            className="text-btn"
            disabled={!!chosen || busy}
            data-feedback="custom"
            onClick={() => {
              buzz("tap");
              change(answers.slice(0, -1));
            }}
          >
            <RotateCcw size={16} />
            되돌리기
          </button>
        )}
      </div>
    </section>
  );
}
