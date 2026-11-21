import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Hand, Shuffle, X } from "lucide-react";
import { Pack, price, selectFive } from "./domain";
import { recent } from "./store";
import { buzz, reduced } from "./bridge";
import { asset } from "./paths";

export function Setup({
  pack,
  start,
}: {
  pack: Pack;
  start: (ids: string[]) => void;
}) {
  const [manual, setManual] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  return (
    <section className="flow">
      <div className="flow-art">
        <img src={asset("art/" + pack.id + ".webp")} alt="" />
      </div>
      <span className="eyebrow">
        {pack.title} · {price(pack)}
      </span>
      <h1>{manual ? "직접 다섯 장을 골라요" : "어떤 카드로 시작할까요?"}</h1>
      <p>
        {manual
          ? ids.length + " / 5장 선택"
          : "15문항 중 오늘 묻고 싶은 5장을 골라요."}
      </p>
      {pack.id === "pack4" && (
        <small>19+ 성인 카드예요. 스킨십·외박처럼 말로 꺼내기 어려운 것만 담았어요.</small>
      )}
      {!manual ? (
        <div className="actions">
          <button
            className="primary"
            onClick={() => start(selectFive(pack, recent(pack)))}
          >
            <Shuffle size={19} />
            랜덤으로 5장 뽑기
          </button>
          <button className="secondary" onClick={() => setManual(true)}>
            <Hand size={18} />
            직접 고르기
          </button>
        </div>
      ) : (
        <>
          <div className="manual panel">
            {pack.questions.map((q) => (
              <label
                key={q.id}
                className={
                  !ids.includes(q.id) && ids.length === 5 ? "muted" : ""
                }
              >
                <input
                  type="checkbox"
                  checked={ids.includes(q.id)}
                  disabled={!ids.includes(q.id) && ids.length === 5}
                  onChange={(e) =>
                    setIds(
                      e.target.checked
                        ? [...ids, q.id]
                        : ids.filter((id) => id !== q.id),
                    )
                  }
                />
                {q.question}
              </label>
            ))}
          </div>
          <div className="dock">
            <button
              className="primary"
              disabled={ids.length !== 5}
              onClick={() => start(ids)}
            >
              {ids.length === 5
                ? "5장 골랐어요 · 시작하기"
                : 5 - ids.length + "장 더 고르면 시작할 수 있어요"}
              <ArrowRight size={18} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
export function Purchase({
  pack,
  cancel,
  confirm,
}: {
  pack: Pack;
  cancel: () => void;
  confirm: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    timer = useRef(0),
    closing = useRef(false),
    granting = useRef(false);
  const [state, setState] = useState<"ready" | "paying" | "closing">("ready");
  const [error, setError] = useState("");
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    buzz("tap");
    return () => {
      clearTimeout(timer.current);
      d.close();
    };
  }, []);
  function dismiss() {
    if (closing.current || granting.current) return;
    closing.current = true;
    clearTimeout(timer.current);
    setState("closing");
    buzz();
    timer.current = window.setTimeout(cancel, reduced() ? 0 : 320);
  }
  function purchase() {
    if (state !== "ready") return;
    setState("paying");
    setError("");
    timer.current = window.setTimeout(async () => {
      granting.current = true;
      try {
        await confirm();
        buzz("success");
      } catch (e) {
        granting.current = false;
        setError(
          (e as Error).message ||
            "이용권을 저장할 수 없어요. 다시 시도해주세요.",
        );
        setState("ready");
        buzz("error");
      }
    }, 2000);
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="purchase-title"
      className={state === "closing" ? "closing" : ""}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
    >
      <div className="handle" />
      <div className="section-title">
        <span className="eyebrow">모의 인앱결제</span>
        <button
          aria-label="닫기"
          className="icon-btn"
          onClick={dismiss}
          data-feedback="custom"
        >
          <X />
        </button>
      </div>
      <h1 id="purchase-title">{pack.title} 팩 이용권</h1>
      <h2>{price(pack)}</h2>
      <ul className="benefits">
        {[
          "이 팩 15문항 전체 이용",
          "같은 팩으로 몇 번이든 방 만들기",
          "함께 열린 카드의 심화 리포트와 다음 대화 문장",
        ].map((s) => (
          <li key={s}>
            <Check size={17} />
            {s}
          </li>
        ))}
      </ul>
      <p className="notice">잠긴 카드는 상대의 답을 보여주지 않아요.</p>
      <button
        className="primary"
        disabled={state !== "ready"}
        onClick={purchase}
      >
        {state === "paying"
          ? "모의 결제 중…"
          : error
            ? "다시 시도"
            : price(pack) + " 모의 결제하기"}
      </button>
      <small>실제 청구 없이 테스트 이용권을 저장해요.</small>
      {error && <p role="alert">{error}</p>}
    </dialog>
  );
}
