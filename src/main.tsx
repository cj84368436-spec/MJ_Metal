import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronLeft,
  ArrowRight,
  Check,
  Inbox,
  House,
  Layers2,
} from "lucide-react";
import {
  Answer,
  Referral,
  matchCards,
  Pack,
  selectFive,
  validateFive,
} from "./domain";
import { createRoom, myRooms } from "./store";
import { buzz, initialPath, installBridge, leave, native } from "./bridge";
import { asset, browserPath, currentRoute } from "./paths";
import { available, Home, Cover } from "./Home";
import { Setup } from "./Setup";
import { CardStack } from "./CardStack";
import { Room } from "./Room";
import { Results } from "./Results";
import "./style.css";

declare const __HAS_HOME_COVER__: boolean;

type Draft = {
  packId: string;
  ids: string[];
  answers: Answer[];
  room?: string;
  referral?: Referral;
};
const route = currentRoute;
const initial = initialPath();
if (initial) history.replaceState(null, "", browserPath(initial));

function Demo({ pack, start }: { pack: Pack; start: () => void }) {
  const [ids] = useState(() => selectFive(pack, []));
  const [show, setShow] = useState(false);
  const qs = ids.map((id) => pack.questions.find((q) => q.id === id)!);
  if (show)
    return (
      <Results
        pack={pack}
        result={matchCards(
          qs,
          ["yes", "maybe", "yes", "yes", "no"],
          ["yes", "yes", "yes", "yes", "maybe"],
          true,
        )}
        unlocked
        demo
        again={start}
        home={start}
      />
    );
  return (
    <section className="flow center">
      <span className="eyebrow">예시 · {pack.title}</span>
      <h1>둘 다 좋아하면 어떻게 열릴까요?</h1>
      <p>다섯 장 중 세 장을 함께 고른 예시예요.</p>
      <div className="demo-list">
        {qs.map((q) => (
          <p key={q.id}>{q.question}</p>
        ))}
      </div>
      <button className="cta" onClick={() => setShow(true)}>
        예시 결과 보기 <ArrowRight size={18} />
      </button>
    </section>
  );
}
function Library({ go }: { go: (u: string) => void }) {
  const rooms = myRooms();
  return (
    <section className="flow library">
      <h1 className="screen-title">내 카드함</h1>
      <h2 className="library-period">최근 7일 · 보낸 카드</h2>
      {rooms.length ? (
        rooms.map((r) => (
          <button
            className="library-row"
            key={r.id}
            onClick={() => go("/r/" + r.id)}
          >
            <img className="lib-heart" src={asset("sketch/heart.png")} alt="" />
            <span className="lib-copy">
              <b>{r.pack.title}</b>
              <small>
                {new Date(r.created).toLocaleString("ko-KR", {
                  month: "numeric",
                  day: "numeric",
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </small>
            </span>
            <em className={r.done ? "ready" : ""}>
              {r.done ? "결과 보기 ›" : "기다리는 중"}
            </em>
          </button>
        ))
      ) : (
        <div className="empty">
          <Inbox size={22} />
          <h2>아직 보낸 카드가 없어요</h2>
          <button className="cta" onClick={() => go("/")}>
            카드 5장 만들기
          </button>
        </div>
      )}
    </section>
  );
}
function App() {
  const [path, setPath] = useState(route);
  const [selected, setSelected] = useState(available[0]);
  const [, setRev] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const url = new URL(path, location.origin);
  const go = useCallback((destination: string, replace = false) => {
    history[replace ? "replaceState" : "pushState"](
      { inside: true },
      "",
      browserPath(destination),
    );
    setPath(route());
    setError("");
    window.scrollTo(0, 0);
  }, []);
  const back = useCallback(() => {
    if (document.querySelector("dialog[open]")) {
      document
        .querySelector("dialog")
        ?.dispatchEvent(new Event("cancel", { cancelable: true }));
      return;
    }
    if (route() === "/") {
      leave();
      return;
    }
    if (history.state?.inside) history.back();
    else go("/", true);
  }, [go]);
  useEffect(() => {
    const pop = () => {
      setPath(route());
      setError("");
    };
    addEventListener("popstate", pop);
    const release = installBridge(back);
    return () => {
      removeEventListener("popstate", pop);
      release();
    };
  }, [back]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(timer);
  }, [toast]);
  const pack =
    available.find((p) => p.id === url.searchParams.get("pack")) ??
    available[0];
  const step = url.searchParams.get("step");
  const draftKey = "draft." + url.searchParams.get("d");
  const draft: Draft | null = JSON.parse(
    sessionStorage.getItem(draftKey) ?? "null",
  );
  const start = (p: Pack) => {
    setSelected(p);
    go("/?step=setup&pack=" + p.id);
  };
  function begin(ids: string[], roundPack: Pack = pack, referral?: Referral) {
    const key = crypto.getRandomValues(new Uint32Array(2)).join("-");
    sessionStorage.setItem(
      "draft." + key,
      JSON.stringify({ packId: roundPack.id, ids, answers: [], referral }),
    );
    go("/?step=answer&pack=" + roundPack.id + "&d=" + key);
  }
  function update(d: Draft) {
    sessionStorage.setItem(draftKey, JSON.stringify(d));
    setRev((v) => v + 1);
  }
  async function seal() {
    if (!draft) return;
    if (draft.room) {
      go("/r/" + draft.room, true);
      return;
    }
    // 보내기는 무료다. 결제는 결과 화면에서 잠금을 열 때만 일어난다.
    const id = await createRoom(
      pack,
      draft.ids,
      draft.answers,
      draftKey,
      draft.referral,
    );
    update({ ...draft, room: id });
    go("/r/" + id, true);
  }
  const home = url.pathname === "/" && !step && !url.searchParams.has("room");
  const isLibrary = url.pathname === "/library";
  const roomId =
    /^\/r\/([a-z0-9]{8})$/.exec(url.pathname)?.[1] ??
    (url.pathname === "/" ? url.searchParams.get("room") : null);
  const cover = home && __HAS_HOME_COVER__;
  const theme = (home && !cover) || (step === "theme" && url.pathname === "/");
  let page;
  if (roomId)
    page = (
      <Room
        key={roomId + (url.searchParams.get("j") ?? "host")}
        id={roomId}
        guest={url.searchParams.get("j")}
        step={step}
        go={go}
        replay={(p, ids, referral) => {
          setSelected(p);
          begin(ids, p, referral);
        }}
        toast={setToast}
      />
    );
  else if (isLibrary) page = <Library go={go} />;
  else if (url.pathname === "/demo")
    page = <Demo pack={pack} start={() => start(pack)} />;
  else if (cover) page = <Cover start={() => go("/?step=theme")} />;
  else if (theme)
    page = (
      <Home
        selected={selected}
        onSelect={setSelected}
        start={() => start(selected)}
      />
    );
  else if (url.pathname === "/" && step === "setup")
    page = <Setup key={pack.id} pack={pack} start={begin} />;
  else if (
    url.pathname === "/" &&
    step === "answer" &&
    draft?.packId === pack.id &&
    validateFive(pack, draft.ids)
  ) {
    if (draft.room)
      page = (
        <section className="flow panel">
          <h1>이미 봉인한 카드예요</h1>
          <button className="cta" onClick={() => go("/r/" + draft.room, true)}>
            내 방으로
          </button>
        </section>
      );
    else
      page = (
        <CardStack
          pack={pack}
          questions={draft.ids.map(
            (id) => pack.questions.find((q) => q.id === id)!,
          )}
          answers={draft.answers}
          change={(a) => update({ ...draft, answers: a })}
          busy={busy}
          finish={async () => {
            if (busy) return;
            setBusy(true);
            try {
              await seal();
            } catch (e) {
              setError((e as Error).message);
              buzz("error");
            } finally {
              setBusy(false);
            }
          }}
        />
      );
  } else
    page = (
      <section className="flow panel">
        <h1>링크를 확인해주세요</h1>
        <button className="cta" onClick={() => go("/")}>
          홈으로
        </button>
      </section>
    );
  return (
    <div
      className="app-shell"
      onClickCapture={(e) => {
        const button = (e.target as HTMLElement).closest("button");
        if (button && !button.disabled && !button.dataset.feedback) buzz();
      }}
    >
      <main className={cover ? "app-main cover-main" : "app-main"}>
        {!home && !native && (
          <button className="back" aria-label="뒤로" onClick={back}>
            <ChevronLeft size={25} strokeWidth={2.7} />
          </button>
        )}
        {page}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </main>
      {(home || theme || isLibrary) && (
        <nav className="tabbar" aria-label="주 메뉴">
          <button
            aria-current={home || theme ? "page" : undefined}
            onClick={() => go("/")}
          >
            <House size={24} />홈
          </button>
          <button
            aria-current={isLibrary ? "page" : undefined}
            onClick={() => go("/library")}
          >
            <Layers2 size={24} />내 카드함
          </button>
        </nav>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
