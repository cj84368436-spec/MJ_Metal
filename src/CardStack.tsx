import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { Answer, Pack, Question } from "./domain";
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
  return (
    <section className="flow stack-flow">
      <div className="section-title">
        <span className="eyebrow">
          {guest ? "받은 카드" : "내 답 5장"} · {pack.title}
        </span>
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
      <div className="progress">
        <strong>{Math.min(5, answers.length + 1)} / 5</strong>
        <span>
          <i
            style={{
              transform:
                "scaleX(" + Math.min(1, (answers.length + 1) / 5) + ")",
            }}
          />
        </span>
      </div>
      {q ? (
        <>
          <div className="stack">
            <article
              key={q.id}
              className={"question panel " + (chosen ? "leaving" : "")}
              style={
                drag.x || drag.y
                  ? {
                      transform:
                        "translate(" +
                        drag.x +
                        "px," +
                        drag.y +
                        "px) rotate(" +
                        Math.max(-12, Math.min(12, drag.x / 24)) +
                        "deg)",
                      transition: "none",
                    }
                  : undefined
              }
              onPointerDown={(e) => {
                if (locked.current) return;
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
                if (!o) return;
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
              onPointerCancel={() => {
                origin.current = null;
                setDrag({ x: 0, y: 0 });
              }}
              onPointerUp={(e) => {
                const o = origin.current;
                if (!o) return;
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
              <img draggable={false} src={"/art/" + pack.id + ".webp"} alt="" />
              <h1>{q.question}</h1>
              {Math.max(Math.abs(drag.x), Math.abs(drag.y)) > 57 && (
                <b className="drag-label">
                  {
                    q.options.find((o) => o.value === direction(drag.x, drag.y))
                      ?.label
                  }
                </b>
              )}
            </article>
          </div>
          <div className="actions">
            {q.options.map((o) => (
              <button
                key={o.value}
                disabled={!!chosen}
                data-feedback="custom"
                className={
                  "answer " + o.value + (chosen === o.value ? " picked" : "")
                }
                onClick={() => pick(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <small className="center">
            오른쪽 · {q.options[0].label}　↑ {q.options[1].label}　왼쪽 ·{" "}
            {q.options[2].label}
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
    </section>
  );
}
