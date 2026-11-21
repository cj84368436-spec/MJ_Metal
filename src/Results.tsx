import { useEffect, useState } from "react";
import { ArrowRight, Download, LockKeyhole } from "lucide-react";
import { Pack, price, Result } from "./domain";
import { buzz, reduced } from "./bridge";

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
  c.fillText("비밀 다섯 장", 100, 150);
  c.fillStyle = "#B4493A";
  c.font = "600 108px sans-serif";
  c.fillText(result.matched + " / 5", 96, 320);
  c.fillStyle = "#1B1917";
  c.font = "500 42px sans-serif";
  c.fillText("5장 중 " + result.matched + "장이 통했어요", 98, 404);
  c.fillStyle = "#7A7268";
  c.font = "400 30px sans-serif";
  let y = 530;
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
  const file = new File([blob], "비밀-다섯-장.png", { type: "image/png" });
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
  onUnlock?: () => void;
  again: () => void;
  home: () => void;
};
export function Results({
  pack,
  result,
  unlocked,
  demo,
  guest,
  onUnlock,
  again,
  home,
}: Props) {
  const n = usePercent(result.percent);
  const [error, setError] = useState("");
  useEffect(() => {
    buzz("success");
  }, []);
  const spend = price(pack);
  return (
    <section className="flow result">
      <header className="result-head">
        <span className="eyebrow">
          {pack.title}
          {demo && " · 예시"}
        </span>
        {result.matched ? (
          <>
            <h1>
              5장 중 <em>{result.matched}장</em>이 통했어요
            </h1>
            <p className="result-sub">
              겹친 비율 {n === null ? "…" : n + "%"}
              {unlocked ? " · 카드마다 한마디까지 열렸어요" : ""}
            </p>
          </>
        ) : (
          <>
            <h1>이번엔 겹친 카드가 없어요</h1>
            <p className="result-sub">
              서로 뭘 골랐는지는 알 수 없어요. 그것도 비밀이에요.
            </p>
          </>
        )}
      </header>

      {result.opened.map((q, i) => (
        <article
          className="open-card"
          key={q.id}
          style={{ animationDelay: 140 + i * 90 + "ms" }}
        >
          <span className="tag">함께 열린 카드</span>
          <h2>{q.question}</h2>
          <p className="match">{q.matchMessage}</p>
          {unlocked && (
            <div className="follow">
              <span>이어질 한마디</span>
              <p>{q.followUp}</p>
            </div>
          )}
        </article>
      ))}

      {result.locked > 0 && (
        <section className="paywall">
          <div className="backs" aria-hidden="true">
            {Array.from({ length: Math.min(result.locked, 3) }, (_, i) => (
              <i key={i}>
                <LockKeyhole size={17} />
              </i>
            ))}
          </div>
          <h3>나머지 {result.locked}장도 통했어요</h3>
          <p>
            둘 다 좋다고 한 카드예요. 카드마다 이어질 한마디까지 한 번에
            열려요.
          </p>
          {demo ? (
            <small>예시라서 결제 없이 보여드려요.</small>
          ) : (
            <button className="cta" onClick={onUnlock}>
              나머지 설레는 답 모두 열기 · {spend}
            </button>
          )}
        </section>
      )}

      {result.sealed > 0 && (
        <p className="sealed">
          나머지 {result.sealed}장은 서로 답이 달라서, 끝까지 비밀이에요.
        </p>
      )}

      <div className="actions">
        {demo ? (
          <button className="cta" onClick={again}>
            이제 진짜로 보내기
            <ArrowRight size={18} />
          </button>
        ) : (
          <>
            <button className="ghost" onClick={again}>
              {guest ? "나도 카드 만들기" : "같은 팩으로 새 5장"}
            </button>
            {pack.id !== "pack4" && (
              <button
                className="text-btn"
                onClick={async () => {
                  try {
                    await exportImage(result);
                  } catch (e) {
                    if ((e as Error).name !== "AbortError")
                      setError("이미지를 저장할 수 없어요. 다시 시도해주세요.");
                  }
                }}
              >
                <Download size={16} />
                결과 이미지 저장
              </button>
            )}
            <button className="text-btn" onClick={home}>
              다른 팩 보기
            </button>
          </>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
