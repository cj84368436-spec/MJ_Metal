import { useEffect, useState } from "react";
import { ArrowRight, Download, LockKeyhole, Play } from "lucide-react";
import {
  AdState,
  Pack,
  passPrice,
  reading,
  Result,
  roomPrice,
} from "./domain";
import { buzz, reduced, showRewardedAd, adsAvailable, AdPhase } from "./bridge";
import { asset } from "./paths";
import "./room-sketch.css";

function usePercent(target: number) {
  const [n, setN] = useState<number | null>(() => (reduced() ? target : null));
  useEffect(() => {
    if (reduced()) {
      setN(target);
      return;
    }
    const start = performance.now() + 300;
    let id = 0;
    const frame = (time: number) => {
      if (time >= start) {
        const t = Math.min((time - start) / 900, 1);
        setN(Math.round(target * (1 - (1 - t) ** 3)));
        if (t === 1) return;
      }
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [target]);
  return n;
}
async function exportImage(result: Result) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const c = canvas.getContext("2d");
  if (!c) throw new Error();
  c.fillStyle = "#F7F3EC";
  c.fillRect(0, 0, 1080, 1350);
  c.fillStyle = "#FFFCF6";
  c.beginPath();
  c.roundRect(44, 44, 992, 1262, 36);
  c.fill();
  c.strokeStyle = "#E6DED2";
  c.lineWidth = 2;
  c.stroke();
  c.fillStyle = "#1B1917";
  c.font = "600 40px sans-serif";
  c.fillText("우리 썸인가", 100, 150);
  c.fillStyle = "#B4493A";
  c.font = "600 108px sans-serif";
  c.fillText(result.matched + " / 5", 96, 320);
  c.fillStyle = "#1B1917";
  c.font = "500 42px sans-serif";
  c.fillText("5장 중 " + result.matched + "장이 통했어요", 98, 404);
  c.fillStyle = "#B4493A";
  c.font = "500 34px sans-serif";
  c.fillText("호감 확률 " + reading(result.matched).chance + "%", 98, 462);
  c.fillStyle = "#7A7268";
  c.font = "400 30px sans-serif";
  let y = 560;
  for (const q of result.opened) {
    let row = "";
    for (const char of q.question) {
      if (c.measureText(row + char).width > 860) {
        c.fillText(row, 100, y);
        row = "";
        y += 46;
      }
      row += char;
    }
    c.fillText(row, 100, y);
    y += 84;
  }
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/png"),
  );
  if (!blob) throw new Error();
  const file = new File([blob], "우리-썸인가.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] }))
    await navigator.share({ files: [file] });
  else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
type Props = {
  pack: Pack;
  result: Result;
  unlocked: boolean;
  demo?: boolean;
  guest?: boolean;
  ad?: AdState;
  onUnlock?: () => void;
  onPass?: () => void;
  onAdReward?: () => void | Promise<void>;
  /** 다음 단계 팩을 바로 보낼 때. 마지막 팩이면 없다. */
  onNext?: () => void;
  /** 다음 단계 팩 이름. 받는 사람에게는 숨긴다. */
  nextTitle?: string;
  again: () => void;
  replayBusy?: boolean;
  home: () => void;
};
export function Results({
  pack,
  result,
  unlocked,
  demo,
  guest,
  ad = "none",
  onUnlock,
  onPass,
  onAdReward,
  onNext,
  nextTitle,
  again,
  replayBusy = false,
  home,
}: Props) {
  const n = usePercent(result.percent);
  const analysis = reading(result.matched);
  const chance = usePercent(analysis.chance);
  const [error, setError] = useState("");
  const [adError, setAdError] = useState("");
  const [phase, setPhase] = useState<AdPhase | "">("");
  useEffect(() => {
    buzz("success");
  }, []);
  const spend = roomPrice(pack);
  const full = unlocked || result.locked === 0;
  const canAd = ad === "available" && adsAvailable();
  const watching = phase !== "";
  async function watchAd() {
    if (watching) return;
    setAdError("");
    setPhase("loading");
    try {
      const outcome = await showRewardedAd((next) => setPhase(next));
      if (outcome === "reward") {
        buzz("success");
        await onAdReward?.();
      } else
        setAdError(
          outcome === "closed"
            ? "광고를 끝까지 봐야 카드가 열려요. 다시 볼 수 있어요."
            : "광고를 불러오지 못했어요. 잠시 뒤 다시 시도해주세요.",
        );
    } catch (e) {
      setAdError((e as Error).message);
    } finally {
      setPhase("");
    }
  }
  return (
    <section className="room-sketch room-result">
      <h1 className="screen-title">{demo ? "예시 결과 보기" : "결과 보기"}</h1>
      <img
        className="room-result-pair"
        src={asset("sketch/couple-result.png")}
        alt=""
      />
      <div className="paper-sheet room-result-summary">
        <h2>
          {result.matched ? (
            <>
              5장 중 <em>{result.matched}장</em>이 통했어요!
            </>
          ) : (
            "이번엔 겹친 카드가 없어요"
          )}
        </h2>
        <p>겹친 비율</p>
        <div className="room-ratio">
          <i className="room-rays" aria-hidden="true" />
          <strong className="room-percent" aria-label={result.percent + "%"}>
            {n === null ? "…" : n + "%"}
          </strong>
          <i className="room-rays" aria-hidden="true" />
        </div>
        <div
          className="room-result-count"
          role="img"
          aria-label={`전체 5장 중 겹친 카드 ${result.matched}장, 겹치지 않은 카드 ${result.sealed}장`}
        >
          {Array.from({ length: 5 }, (_, i) => (
            <img
              key={i}
              src={
                i < result.matched
                  ? asset("sketch/card-hit.png")
                  : asset("sketch/card-miss.png")
              }
              alt=""
            />
          ))}
        </div>
      </div>

      <section
        className={"paper-sheet room-reading " + analysis.next}
        aria-label="속마음 분석"
      >
        <span className="room-reading-label">
          <img src={asset("sketch/heart.png")} alt="" />
          속마음 분석
        </span>
        <h2>{analysis.headline}</h2>
        <div className="room-chance">
          <span>호감 확률</span>
          <strong aria-label={`호감 확률 ${analysis.chance}퍼센트`}>
            {chance === null ? "…" : chance + "%"}
          </strong>
          <div className="room-chance-track" aria-hidden="true">
            <i style={{ width: (chance ?? analysis.chance) + "%" }} />
          </div>
        </div>
        <p>{analysis.body}</p>
        <small>
          둘 다 맞은 카드 수로 매긴 참고 수치예요 · 재미로 봐주세요.
        </small>
      </section>

      {!demo && pack.id !== "pack4" && (
        <button
          className="cta room-save"
          onClick={async () => {
            try {
              await exportImage(result);
            } catch (e) {
              if ((e as Error).name !== "AbortError")
                setError("이미지를 저장할 수 없어요. 다시 시도해주세요.");
            }
          }}
        >
          <Download size={21} />
          결과 이미지 저장
        </button>
      )}
      {error && <p role="alert">{error}</p>}

      <div className="room-result-context">
        <strong>{guest ? "받은 카드 · 속마음 5장" : pack.title}</strong>
        {!result.matched ? (
          <p>서로 뭘 골랐는지는 알 수 없어요. 그것도 비밀이에요.</p>
        ) : (
          full && <p>카드마다 한마디까지 열렸어요.</p>
        )}
      </div>
      {result.opened.map((q) => (
        <article className="paper-sheet room-open-card" key={q.id}>
          <span className="room-card-label">
            <img src={asset("sketch/heart.png")} alt="" />
            {q.id === result.adBonusId ? "광고로 연 카드" : "함께 열린 카드"}
          </span>
          <h2>{q.question}</h2>
          <p className="match">{q.matchMessage}</p>
          {full && (
            <div className="follow">
              <span>이어질 한마디</span>
              <p>{q.followUp}</p>
            </div>
          )}
        </article>
      ))}

      {result.locked > 0 && (
        <section className="paper-sheet room-paywall">
          <LockKeyhole className="room-lock" aria-hidden="true" />
          <h2>나머지 {result.locked}장도 통했어요</h2>
          <p>
            둘 다 좋다고 한 카드예요. 카드마다 이어질 한마디까지 한 번에 열려요.
          </p>
          {demo ? (
            <small>예시라서 결제 없이 보여드려요.</small>
          ) : (
            <>
              <button className="cta" onClick={onUnlock}>
                나머지 {result.locked}장 열기 · {spend}
              </button>
              {onPass && (
                <button className="text-btn room-pass" onClick={onPass}>
                  {passPrice} 전 팩 패스로 4개 팩 다 열기
                </button>
              )}
              {canAd && (
                <>
                  <button
                    className="choice-row room-reward"
                    disabled={watching}
                    onClick={watchAd}
                  >
                    {!watching && <Play size={15} />}
                    {phase === "loading"
                      ? "광고 준비 중…"
                      : phase === "watching"
                        ? "광고 보는 중…"
                        : "광고 보고 1장 무료로 더 열기"}
                  </button>
                  <small className="ad-note">
                    광고 한 편을 끝까지 보면 이 방에서 한 번, 통한 카드 1장이
                    바로 열려요.
                  </small>
                  {adError && (
                    <small className="ad-note ad-error" role="alert">
                      {adError}
                    </small>
                  )}
                </>
              )}
              {ad === "used" && (
                <small className="ad-note">
                  광고로 이 방의 카드 1장을 열었어요.
                </small>
              )}
            </>
          )}
        </section>
      )}

      {result.sealed > 0 && (
        <p className="sealed">
          아쉽게 엇갈린 질문 {result.sealed}장 · 누가 뭘 골랐는지는 알 수 없어요.
        </p>
      )}

      {!demo && onNext && (
        <section className="room-next">
          <h2>
            {nextTitle ? "다음 단계 · " + nextTitle : "다음 단계 팩"}
          </h2>
          <p>
            {analysis.next === "confess"
              ? "이 분위기 그대로 한 판 더 하면 서로 말할 게 더 줄어들어요."
              : analysis.next === "next-pack"
                ? "안 꺼낸 속마음은 다음 팩에서 이어서 물어봐요."
                : "다른 팩으로 한 번 더 물어보면 서로 더 정확해져요."}
          </p>
          <button className="cta" disabled={replayBusy} onClick={onNext}>
            {replayBusy
              ? "새 카드 고르는 중…"
              : analysis.next === "other-pack"
                ? "다른 팩 보내기"
                : "다음 단계 팩 보내기"}
            <ArrowRight size={18} />
          </button>
        </section>
      )}

      <div className="actions">
        {demo ? (
          <button className="cta" onClick={again}>
            이제 진짜로 보내기
            <ArrowRight size={18} />
          </button>
        ) : (
          <>
            <button className="ghost" disabled={replayBusy} onClick={again}>
              {replayBusy
                ? "새 카드 고르는 중…"
                : guest
                  ? "이번엔 내가 새 5장 보내기"
                  : "같은 팩으로 새 5장"}
            </button>
            <small className="center-note">
              방금 답한 다섯 장은 빼고 골라요.
            </small>
            <button className="text-btn" onClick={home}>
              다른 팩 보기
            </button>
          </>
        )}
      </div>
    </section>
  );
}
