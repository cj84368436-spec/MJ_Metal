import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  ChevronRight,
  Clock3,
  Link as LinkIcon,
} from "lucide-react";
import { Answer, Pack, Referral } from "./domain";
import {
  setNickname,
  submitGuest,
  unlockRoom,
  shared,
  redeal,
  claimAdBonus,
} from "./store";
import { buzz, shareText, inviteURL } from "./bridge";
import { CardStack } from "./CardStack";
import { useRoom } from "./useRoom";
import { asset } from "./paths";
import { Results } from "./Results";
import { Purchase } from "./Setup";

type Props = {
  id: string;
  guest: string | null;
  step: string | null;
  go: (url: string, replace?: boolean) => void;
  replay: (p: Pack, ids: string[], referral?: Referral) => void;
  toast: (msg: string) => void;
};
export function Room({ id, guest, step, go, replay, toast }: Props) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [fallback, setFallback] = useState(false);
  const shareDetails = useRef<HTMLDetailsElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  function revealLink() {
    setFallback(true);
    if (shareDetails.current) shareDetails.current.open = true;
    linkInput.current?.focus();
  }
  const [nick, setNick] = useState("");
  const [replayBusy, setReplayBusy] = useState(false);
  const [purchase, setPurchase] = useState(false);
  const key = "guest-draft." + id + "." + guest;
  const [answers, setAnswers] = useState<Answer[]>(() =>
    JSON.parse(sessionStorage.getItem(key) ?? "[]"),
  );
  const [switchOpen, setSwitchOpen] = useState(false);
  const { data, problem, refresh } = useRoom(id, guest);
  const [queued, setQueued] = useState(
    () => sessionStorage.getItem(key + ".send") === "1",
  );
  useEffect(() => {
    if (!queued || !guest) return;
    let alive = true,
      timer = 0,
      running = false;
    let attempts = 0;
    async function send() {
      if (!alive || running) return;
      running = true;
      setBusy(true);
      try {
        const saved = JSON.parse(
          sessionStorage.getItem(key) ?? "[]",
        ) as Answer[];
        await submitGuest(id, guest!, saved);
        sessionStorage.removeItem(key + ".send");
        sessionStorage.removeItem(key);
        if (alive) {
          setQueued(false);
          go("/r/" + id + "?j=" + guest, true);
          refresh();
        }
      } catch (e) {
        if (!alive) return;
        if (e instanceof TypeError && ++attempts < 3)
          timer = window.setTimeout(send, 2000);
        else {
          setBusy(false);
          buzz("error");
          setError(
            e instanceof TypeError
              ? "답은 저장됐어요. 연결되면 다시 보내요."
              : (e as Error).message,
          );
        }
      } finally {
        running = false;
      }
    }
    const online = () => {
      clearTimeout(timer);
      attempts = 0;
      void send();
    };
    void send();
    addEventListener("online", online);
    return () => {
      alive = false;
      clearTimeout(timer);
      removeEventListener("online", online);
    };
  }, [queued, key, guest, id, go, refresh]);
  const base = "/r/" + id;
  const invite = base + "?j=" + encodeURIComponent(data?.guestToken ?? "");
  const [link, setLink] = useState("");
  useEffect(() => {
    if (!data || guest) return;
    let alive = true;
    void inviteURL(invite, shared)
      .then((url) => {
        if (alive) setLink(url);
      })
      .catch(() => {
        if (alive) setError("초대 링크를 만들지 못했어요. 다시 열어주세요.");
      });
    return () => {
      alive = false;
    };
  }, [invite, guest, !!data]);
  if (problem)
    return (
      <section className="flow panel">
        <h1>카드를 열 수 없어요</h1>
        <p>{problem}</p>
        <button className="ghost" onClick={refresh}>
          다시 확인하기
        </button>
        <button className="cta" onClick={() => go("/")}>
          새 카드 만들기
        </button>
      </section>
    );
  if (!data)
    return (
      <section className="flow" aria-label="카드 확인 중" aria-busy="true">
        {[1, 2, 3].map((n) => (
          <div className="skeleton" key={n} />
        ))}
      </section>
    );
  if (data.pack.id === "pack4" && import.meta.env.VITE_AUDIENCE === "teens")
    return (
      <section className="flow panel">
        <h1>이 팩을 이용할 수 없어요</h1>
        <button onClick={() => go("/")}>홈으로</button>
      </section>
    );
  const { pack } = data;
  const href = link;
  const here = guest ? invite : base;
  const next = (s: string) => here + (guest ? "&" : "?") + "step=" + s;
  const change = (values: Answer[]) => {
    sessionStorage.setItem(key, JSON.stringify(values));
    setAnswers(values);
  };
  const switcher = !shared && (
    <aside className="mock-panel">
      <button
        className="text-btn"
        aria-expanded={switchOpen}
        onClick={() => setSwitchOpen(!switchOpen)}
      >
        <ArrowLeftRight size={16} />
        모의 테스트 · {guest ? "받는 사람" : "보낸 사람"}
      </button>
      {switchOpen && (
        <>
          <small>같은 브라우저에서 두 역할을 번갈아 체험해요.</small>
          <button className="ghost" onClick={() => go(guest ? base : invite)}>
            {guest ? "보낸 사람으로 보기" : "받는 사람으로 보기"}{" "}
            <ArrowRight size={16} />
          </button>
        </>
      )}
    </aside>
  );
  if (data.result) {
    return (
      <>
        <Results
          pack={pack}
          result={data.result}
          unlocked={data.unlocked}
          guest={!!guest}
          ad={data.ad}
          onUnlock={() => setPurchase(true)}
          onAdReward={async () => {
            try {
              await claimAdBonus(id, guest);
            } catch {
              toast("광고 보상을 열지 못했어요. 잠시 뒤 다시 시도해주세요.");
            }
            refresh();
          }}
          replayBusy={replayBusy}
          again={async () => {
            if (replayBusy) return;
            setReplayBusy(true);
            setError("");
            try {
              const ids = await redeal(id, guest, pack);
              replay(pack, ids, guest ? { room: id, guest } : undefined);
            } catch (e) {
              setError((e as Error).message);
              setReplayBusy(false);
            }
          }}
          home={() => go("/")}
        />
        {purchase && data.result.locked > 0 && (
          <Purchase
            pack={pack}
            cancel={() => setPurchase(false)}
            remaining={data.result.locked}
            confirm={async (product) => {
              try {
                await unlockRoom(id, guest, product);
              } catch (e) {
                if ((e as { code?: string }).code === "ALREADY_UNLOCKED") {
                  setPurchase(false);
                  refresh();
                  toast("이미 이 방의 결과가 열렸어요");
                  return;
                }
                throw e;
              }

              refresh();
              setPurchase(false);
              toast(
                product === "pack"
                  ? `${pack.title} 팩을 열었어요`
                  : "이번 방의 결과를 열었어요",
              );
            }}
          />
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {switcher}
      </>
    );
  }
  return (
    <>
      {guest ? (
        step === "answer" ? (
          <CardStack
            pack={pack}
            guest
            questions={data.questions}
            answers={answers}
            change={change}
            busy={busy}
            finish={() => {
              if (busy) return;
              setError("");
              setBusy(true);
              sessionStorage.setItem(key + ".send", "1");
              if (queued) {
                window.dispatchEvent(new Event("online"));
              } else setQueued(true);
            }}
          />
        ) : (
          <section className="room-sketch room-received">
            <h1 className="screen-title">받은 카드</h1>
            <img
              className="room-envelope"
              src={asset("sketch/envelope.png")}
              alt=""
            />
            <div className="paper-sheet room-letter">
              <span>{pack.title}</span>
              <h2>
                {data.nick ? data.nick + "님이" : "누군가"} 카드 5장을 보냈어요
              </h2>
              <p>다섯 장에 답하면, 둘 다 좋다고 한 카드만 열려요.</p>
              <blockquote>{data.questions[2]?.question}</blockquote>
              <small>
                네가 뭘 골랐는지, 상대는 알 수 없어요. 서로 다른 카드는 아무것도
                알려주지 않아요.
              </small>
            </div>
            <button className="cta" onClick={() => go(next("answer"))}>
              나도 답할래
              <ArrowRight size={18} />
            </button>
            <small className="center-note">
              이 링크를 가진 사람만 참여할 수 있어요.
            </small>
          </section>
        )
      ) : (
        <section className="room-sketch room-share">
          <h1 className="screen-title">공유하기</h1>
          <img
            className="room-envelope"
            src={asset("sketch/envelope.png")}
            alt=""
          />
          <h2 className="room-ready">
            <span className="highlighter">카드 5장이 준비됐어요!</span>
          </h2>
          <div className="room-share-actions">
            <button
              className="choice-row room-share-action"
              disabled={!href}
              onClick={async () => {
                try {
                  if (
                    await shareText(
                      "대놓고 못 물어본 것 5개. 둘 다 좋으면 열려.\n" + href,
                    )
                  )
                    toast("공유 시트를 열었어요");
                  else revealLink();
                } catch (e) {
                  if ((e as Error).name !== "AbortError") revealLink();
                }
              }}
            >
              <img src={asset("sketch/talk.png")} alt="" />
              카톡으로 보내기
              <ChevronRight className="row-chevron" aria-hidden="true" />
            </button>
            <button
              className="choice-row room-share-action"
              disabled={!href}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(href);
                  toast("링크를 복사했어요");
                } catch {
                  revealLink();
                }
              }}
            >
              <LinkIcon className="room-link-icon" aria-hidden="true" />
              링크 복사
              <ChevronRight className="row-chevron" aria-hidden="true" />
            </button>
          </div>
          <div className="room-wait">
            <h3>
              <Clock3 aria-hidden="true" />
              상대 답변을 기다리는 중이에요
            </h3>
            <p>상대가 답변하면 결과를 바로 확인할 수 있어요.</p>
          </div>
          <details className="room-share-details" ref={shareDetails}>
            <summary>초대 링크 및 설정</summary>
            <p>
              {pack.title} · 5장 · {id}
            </p>
            <p>링크를 보내면 시작돼요. 보내기 전까지는 아무도 못 봐요.</p>
            <label className="link-input">
              {shared ? "초대 링크" : "모의 초대 링크"}
              <input
                ref={linkInput}
                value={href}
                readOnly
                onFocus={(e) => e.target.select()}
              />
            </label>
            {fallback && (
              <small role="status">위 링크를 선택해 직접 복사해주세요.</small>
            )}
            <button
              className="text-btn"
              onClick={() => {
                setNick(data.nick);
                setEdit(!edit);
              }}
            >
              {data.nick ? "닉네임 · " + data.nick : "닉네임 추가 (선택)"}
            </button>
            {edit && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await setNickname(id, nick);
                    setEdit(false);
                    setError("");
                    refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <input
                  aria-label="닉네임"
                  maxLength={6}
                  value={nick}
                  onChange={(e) => setNick(e.target.value)}
                  placeholder="닉네임 2~6자"
                />
                <button className="text-btn">저장</button>
              </form>
            )}
            <button className="text-btn" onClick={() => go("/library")}>
              나중에 보내기
            </button>
            <small>
              {data.unlocked
                ? "이 방은 둘 다 좋다고 한 카드가 전부 열려요."
                : "보내기는 무료예요. 결과는 첫 카드까지 무료로 열려요."}
            </small>
            {switcher}
          </details>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {guest && switcher}
    </>
  );
}
