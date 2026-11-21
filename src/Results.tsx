import { CSSProperties, useEffect, useState } from "react";
import { ArrowRight, Download, Heart, LockKeyhole } from "lucide-react";
import { lockedText, Pack, Result } from "./domain";
import { buzz, reduced } from "./bridge";

function usePercent(target: number) {
  const [n, setN] = useState<number | null>(() => (reduced() ? target : null));
  useEffect(() => {
    if (reduced()) {
      setN(target);
      return;
    }
    const start = performance.now() + 400;
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
  c.fillStyle = "#F2F4F6";
  c.fillRect(0, 0, 1080, 1350);
  c.fillStyle = "#FFFFFF";
  c.beginPath();
  c.roundRect(40, 40, 1000, 1270, 40);
  c.fill();
  c.fillStyle = "#191F28";
  c.font = "600 42px sans-serif";
  c.fillText("비밀 다섯 장", 90, 145);
  c.fillStyle = "#3182F6";
  c.font = "bold 114px sans-serif";
  c.fillText(result.percent + "%", 85, 308);
  c.fillStyle = "#191F28";
  c.font = "500 38px sans-serif";
  c.fillText("5장 중 " + result.matched + "장이 함께 열렸어요", 90, 398);
  c.font = "500 34px sans-serif";
  let y = 520;
  for (const q of result.opened) {
    let row = "";
    for (const char of q.question) {
      if (c.measureText(row + char).width > 895) {
        c.fillText(row, 90, y);
        row = "";
        y += 52;
      }
      row += char;
    }
    c.fillText(row, 90, y);
    y += 94;
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
  report: boolean;
  recommend?: { pack: Pack; start: () => void };
  demo?: boolean;
  goReport?: () => void;
  again: () => void;
  home: () => void;
  guest?: boolean;
};
export function Results({
  pack,
  result,
  report,
  demo,
  goReport,
  again,
  home,
  guest,
  recommend,
}: Props) {
  const n = usePercent(result.percent);
  const [error, setError] = useState("");
  const [mini, setMini] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => buzz("success"), reduced() ? 0 : 2160);
    const scroll = () => setMini(scrollY > 200);
    addEventListener("scroll", scroll);
    return () => {
      clearTimeout(timer);
      removeEventListener("scroll", scroll);
    };
  }, []);
  return (
    <section className="flow result">
      <span className="eyebrow">
        {demo ? "예시 결과" : report ? "심화 리포트" : "카드 개봉"} ·{" "}
        {pack.title}
      </span>
      {mini && (
        <div className="mini">
          {result.percent}%　·　{result.matched}/5장
        </div>
      )}
      <div className="result-summary">
        <small>겹친 비율</small>
        <strong>
          {n === null ? (
            <i>계산 중…</i>
          ) : (
            <>
              {n}
              <em>%</em>
            </>
          )}
        </strong>
        <h1>5장 중 {result.matched}장이 함께 열렸어요</h1>
        <p>
          {result.matched === 0
            ? "겹친 카드가 없어요. 열리지 않은 카드는 아무것도 알려주지 않아요."
            : result.matched === 1
              ? "한 장이 열렸어요. 나머지는 아직 비밀예요."
              : report
                ? "함께 고른 카드로 얘기를 이어가 보세요."
                : "둘 다 좋다고 한 카드를 펼쳐봐요."}
        </p>
      </div>
      {result.opened.map((q, i) => (
        <div className="flip-frame" key={q.id}>
          <article
            className="flip"
            style={{ "--delay": 1000 + i * 140 + "ms" } as CSSProperties}
          >
            <div className="flip-front panel" aria-hidden="true">
              <Heart size={26} />
              {q.question}
            </div>
            <div className="open-card panel">
              <span className="open-label">
                <Heart size={16} fill="currentColor" /> 함께 열린 카드
              </span>
              <h2>{q.question}</h2>
              <p>{q.matchMessage}</p>
              {report && (
                <div className="follow">
                  <strong>다음 대화 문장</strong>
                  <p>{q.followUp}</p>
                </div>
              )}
            </div>
          </article>
        </div>
      ))}
      {(report
        ? result.locked > 0
          ? [0]
          : []
        : Array.from({ length: result.locked }, (_, i) => i)
      ).map((i) => (
        <div
          className="locked"
          style={{ "--delay": 1500 + i * 80 + "ms" } as CSSProperties}
          key={i}
        >
          <LockKeyhole size={19} />
          {lockedText}
          {report && <small>{result.locked}장</small>}
        </div>
      ))}
      <div className="actions reveal-actions">
        {demo ? (
          <button className="primary" onClick={again}>
            이제 진짜로 보내기
            <ArrowRight size={18} />
          </button>
        ) : (
          <>
            {!report && result.matched > 0 && (
              <button className="primary" onClick={goReport}>
                심화 리포트 열기 <ArrowRight size={18} />
              </button>
            )}
            <button className="secondary" onClick={again}>
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
                <Download size={17} />
                결과 이미지 저장·공유
              </button>
            )}
            {report && (
              <>
                <small>이 리포트에는 두 사람이 함께 고른 카드만 담겨요.</small>
                {recommend && (
                  <button className="secondary" onClick={recommend.start}>
                    다음 팩 · {recommend.pack.title}
                    <ArrowRight size={16} />
                  </button>
                )}
              </>
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
