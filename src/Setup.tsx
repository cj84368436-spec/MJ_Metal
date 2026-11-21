import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Hand, Shuffle, X } from "lucide-react";
import { Pack, price, selectFive } from "./domain";
import { recent } from "./store";
import { buzz, reduced } from "./bridge";

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
      <span className="eyebrow">{pack.title}</span>
      <h1>{manual ? "직접 다섯 장을 골라요" : "오늘의 다섯 장"}</h1>
      <p>
        {manual
          ? ids.length + " / 5장 골랐어요"
          : "15장 중에서 오늘 묻고 싶은 다섯 장만 골라요."}
      </p>
      <small className="muted-note">
        {pack.price_krw
          ? "보내기는 무료예요. 결과는 첫 카드까지 무료로 보여드려요."
          : "보내기도 결과도 전부 무료예요."}
      </small>
      {pack.id === "pack4" && (
        <p className="notice small">
          늦은 밤, 단둘일 때 꺼내기 어려운 질문만 담았어요.
        </p>
      )}
      {!manual ? (
        <div className="actions">
          <button
            className="cta"
            onClick={() => start(selectFive(pack, recent(pack)))}
          >
            <Shuffle size={18} />
            랜덤으로 5장 뽑기
          </button>
          <button className="ghost" onClick={() => setManual(true)}>
            <Hand size={17} />
            직접 고르기
          </button>
        </div>
      ) : (
        <>
          <div className="manual">
            {pack.questions.map((q) => {
              const on = ids.includes(q.id);
              return (
                <label
                  key={q.id}
                  className={
                    "pick" + (on ? " on" : "") + (!on && ids.length === 5 ? " muted" : "")
                  }
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!on && ids.length === 5}
                    onChange={(e) =>
                      setIds(
                        e.target.checked
                          ? [...ids, q.id]
                          : ids.filter((id) => id !== q.id),
                      )
                    }
                  />
                  <span className="pick-box">
                    {on && <Check size={14} />}
                  </span>
                  <span>{q.question}</span>
                </label>
              );
            })}
          </div>
          <div className="dock">
            <button
              className="cta"
              disabled={ids.length !== 5}
              onClick={() => start(ids)}
            >
              {ids.length === 5
                ? "5장 골랐어요 · 답하러 가기"
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
          (e as Error).message || "결과를 열 수 없어요. 다시 시도해주세요.",
        );
        setState("ready");
        buzz("error");
      }
    }, 1800);
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
      <div className="sheet-head">
        <span className="eyebrow">결과 열기</span>
        <button
          aria-label="닫기"
          className="icon-btn"
          onClick={dismiss}
          data-feedback="custom"
        >
          <X />
        </button>
      </div>
      <h1 id="purchase-title">설레는 답 모두 열기</h1>
      <p className="sheet-price">{price(pack)}</p>
      <ul className="benefits">
        {[
          "둘 다 좋다고 한 카드 전부",
          "카드마다 이어질 한마디",
          "이 결과, 일주일 동안 다시 보기",
        ].map((s) => (
          <li key={s}>
            <Check size={16} />
            {s}
          </li>
        ))}
      </ul>
      <p className="notice small">
        서로 다른 카드는 끝까지 비밀로 남아요. 상대의 답도 보이지 않아요.
      </p>
      <button
        className="cta"
        disabled={state !== "ready"}
        onClick={purchase}
      >
        {state === "paying"
          ? "여는 중…"
          : error
            ? "다시 시도"
            : price(pack) + "으로 열기"}
      </button>
      <small className="sheet-note">실제 청구 없이 테스트로 열어요.</small>
      {error && <p role="alert">{error}</p>}
    </dialog>
  );
}
