import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronRight, X } from "lucide-react";
import {
  Pack,
  isFree,
  roomPrice,
  selectFive,
  Product,
  passName,
  passPrice,
} from "./domain";
import { recent, hasPass } from "./store";
import { asset } from "./paths";
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
    <section className="flow setup">
      <h1 className="screen-title">
        <span className="title-rays">카드 고르기</span>
      </h1>
      {!manual ? (
        <>
          <img
            className="couple-setup"
            src={asset("sketch/couple-setup.png")}
            alt=""
          />
          <div className="paper-sheet setup-paper">
            <h2>
              <span className="highlighter">오늘의 다섯 장</span>
            </h2>
            <p>
              총 {pack.questions.length}장 중에서{" "}
              <span className="setup-lead-rest">
                오늘 묻고 싶은 다섯 장만 골라요!
              </span>
            </p>
            <div className="setup-choices">
              <button
                className="choice-row"
                onClick={() => start(selectFive(pack, recent(pack)))}
              >
                <img src={asset("sketch/dice.png")} alt="" />
                랜덤으로 5장 뽑기
                <ChevronRight className="row-chevron" />
              </button>
              <button className="choice-row" onClick={() => setManual(true)}>
                <img src={asset("sketch/cards.png")} alt="" />
                <span>
                  직접 고르기 <small>({pack.questions.length}장 보기)</small>
                </span>
                <ChevronRight className="row-chevron" />
              </button>
            </div>
          </div>
          <small className="setup-meta">
            {pack.title} ·{" "}
            {hasPass()
              ? "패스로 결과까지 열려요"
              : isFree(pack)
                ? "보내기 무료 · 둘 다 맞은 2장까지 무료"
                : "보내기 무료 · 결과 " + roomPrice(pack)}
          </small>
          {pack.id === "pack4" && (
            <p className="notice small">
              늦은 밤 단둘일 때 꺼내기 어려운 질문만 담았어요.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="manual-head">
            <h2>직접 다섯 장을 골라요</h2>
            <b>{ids.length} / 5</b>
          </div>
          <div className="manual">
            {pack.questions.map((q) => {
              const on = ids.includes(q.id);
              return (
                <label
                  key={q.id}
                  className={
                    "pick" +
                    (on ? " on" : "") +
                    (!on && ids.length === 5 ? " muted" : "")
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
                  <span className="pick-box">{on && <Check size={14} />}</span>
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
  remaining,
  initial = "room",
  cancel,
  confirm,
}: {
  pack: Pack;
  remaining: number;
  initial?: Product;
  cancel: () => void;
  confirm: (product: Product) => Promise<void>;
}) {
  const [selection, setProduct] = useState<Product>(initial);
  const eligible = !hasPass();
  const product = eligible ? selection : "room";
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
        await confirm(product);
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
        <span className="eyebrow">모의 결제</span>
        <button
          aria-label="닫기"
          className="icon-btn"
          onClick={dismiss}
          data-feedback="custom"
        >
          <X />
        </button>
      </div>
      <h1 id="purchase-title">통한 카드 {remaining}장 더 열기</h1>
      <p>둘 다 좋다고 한 카드와 이어질 한마디를 두 사람 모두 볼 수 있어요.</p>
      {eligible ? (
        <fieldset className="offers" disabled={state !== "ready"}>
          <legend>이용 범위 선택</legend>
          {(["room", "pack"] as const).map((value) => (
            <label
              key={value}
              className={product === value ? "offer active" : "offer"}
            >
              <input
                type="radio"
                name="product"
                value={value}
                checked={product === value}
                onChange={() => setProduct(value)}
              />
              <span>
                <b>{value === "room" ? "이번 방만 열기" : passName}</b>
                <small>
                  {value === "room"
                    ? "지금 함께 답한 방 하나 · 남은 " +
                      remaining +
                      "장"
                    : "이 기기에서 만드는 4개 팩 결과 전부"}
                </small>
              </span>
              <strong>{value === "room" ? roomPrice(pack) : passPrice}</strong>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="sheet-price">이번 방 · {roomPrice(pack)}</p>
      )}
      <p className="notice small">
        서로 다른 카드는 끝까지 비밀로 남아요. 상대의 답도 보이지 않아요.
      </p>
      <button className="cta" disabled={state !== "ready"} onClick={purchase}>
        {state === "paying"
          ? "여는 중…"
          : error
            ? "다시 시도"
            : (product === "room" ? roomPrice(pack) : passPrice) + "으로 열기"}
      </button>
      <small className="sheet-note">모의 결제 · 실제 청구 금액 0원</small>
      {error && <p role="alert">{error}</p>}
    </dialog>
  );
}
