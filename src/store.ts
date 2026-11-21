import { Answer, Pack, packs, Result } from "./domain";
import * as mock from "./mockStore";

const endpoint = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const mode = import.meta.env.VITE_DATA_MODE ?? "auto";
export const shared =
  mode === "shared" ||
  (!!endpoint && !!apiKey && mode !== "mock" && "ReactNativeWebView" in window);
const prefix = "secret-five.shared." + endpoint + ".";
function get<T>(key: string, fallback: T): T {
  return JSON.parse(localStorage.getItem(prefix + key) ?? "null") ?? fallback;
}
function put(key: string, value: unknown) {
  localStorage.setItem(prefix + key, JSON.stringify(value));
}
const messages: Record<string, string> = {
  INVALID_LINK: "초대 링크를 확인해주세요. 보낸 사람에게 다시 받아볼래요?",
  EXPIRED: "이 카드는 만료됐어요. 새 카드를 만들까요?",
  INVALID_NICK: "닉네임은 편안한 말로, 글자나 숫자 2~6자로 적어주세요.",
  TEST_PURCHASE_DISABLED: "이 서버에서는 모의 결제가 꺼져 있어요.",
  TOO_MANY: "잠시 뒤 다시 시도해주세요.",
};
async function rpc<T>(op: string, args: object): Promise<T> {
  if (!endpoint || !apiKey)
    throw new Error("공유 방 서버 설정을 확인해주세요.");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: apiKey,
  };
  if (apiKey.startsWith("ey")) headers.Authorization = "Bearer " + apiKey;
  const response = await fetch(endpoint + "/rest/v1/rpc/secret_five", {
    method: "POST",
    headers,
    body: JSON.stringify({ op, args }),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(
        messages[data.message] ??
          "방 정보를 확인할 수 없어요. 잠시 뒤 다시 시도해주세요.",
      ),
      { code: data.message },
    );
  return data as T;
}
export const recent = (p: Pack) =>
  shared ? get<string[][]>("recent." + p.id, []) : mock.recent(p);
type Credentials = { id: string; host: string; guest: string };
type Entry = Credentials & { packId: string; done: boolean; created: number };
function credentials(): Credentials {
  return {
    id: Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) =>
      (n % 36).toString(36),
    ).join(""),
    host: mock.token(),
    guest: mock.token(),
  };
}
export async function createRoom(
  p: Pack,
  ids: string[],
  answers: Answer[],
  attempt: string,
) {
  if (!shared) return mock.createRoom(p, ids, answers);
  const key = prefix + "attempt." + attempt;
  let c: Credentials =
    JSON.parse(sessionStorage.getItem(key) ?? "null") ?? credentials();
  for (let attempt = 0; attempt < 3; attempt++) {
    sessionStorage.setItem(key, JSON.stringify(c));
    try {
      await rpc("create", { ...c, ids, answers, pack: p.id });
      break;
    } catch (e) {
      if ((e as { code?: string }).code !== "ID_COLLISION" || attempt === 2)
        throw e;
      c = credentials();
    }
  }
  if (!get("host." + c.id, null)) {
    put("host." + c.id, {
      ...c,
      packId: p.id,
      done: false,
      created: Date.now(),
    });
    put("recent." + p.id, [...recent(p).slice(-2), ids]);
  }
  return c.id;
}
export function myRooms() {
  if (!shared) return mock.myRooms();
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(prefix + "host."))
    .flatMap((k) => {
      const e = JSON.parse(localStorage.getItem(k)!) as Entry;
      return Date.now() - e.created < 7 * 86400000
        ? [
            {
              id: e.id,
              pack: packs.find((p) => p.id === e.packId)!,
              done: e.done,
              created: e.created,
            },
          ]
        : [];
    })
    .sort((a, b) => b.created - a.created);
}
export type RoomData = {
  pack: Pack;
  nick: string;
  created: number;
  guestToken: string;
  unlocked: boolean;
  questions: ReturnType<typeof mock.viewRoom>["questions"];
  result: Result | null;
};
type Snapshot = {
  pack: string;
  nick: string;
  created: number;
  matched: number | null;
  ids: string[] | null;
  opened: string[] | null;
  unlocked: boolean;
};
export async function viewRoom(
  id: string,
  guest: string | null,
): Promise<RoomData> {
  if (!shared) return mock.viewRoom(id, guest);
  const host = get<Entry | null>("host." + id, null);
  const token = guest ?? host?.host;
  if (!token) throw new Error(messages.INVALID_LINK);
  const s = await rpc<Snapshot>("state", { id, token });
  const pack = packs.find((p) => p.id === s.pack)!;
  const qs = (ids: string[] | null) =>
    (ids ?? []).map((qid) => pack.questions.find((q) => q.id === qid)!);
  const result: Result | null =
    s.matched === null
      ? null
      : {
          matched: s.matched,
          percent: s.matched * 20,
          opened: qs(s.opened),
          locked: s.matched - (s.opened?.length ?? 0),
          sealed: 5 - s.matched,
        };
  if (host && !host.done && result) put("host." + id, { ...host, done: true });
  return {
    pack,
    nick: s.nick,
    created: s.created,
    guestToken: guest ?? host!.guest,
    unlocked: s.unlocked || pack.price_krw === 0,
    questions: qs(s.ids),
    result,
  };
}
/**
 * 결과 잠금 해제. 화면의 모의 결제가 끝난 뒤에만 부른다.
 * 실제 출시에서는 영수증 검증으로 바꿔야 하는 지점이다.
 */
export async function unlockRoom(id: string, guest: string | null) {
  if (!shared) return mock.unlock(id, guest);
  const token = guest ?? get<Entry | null>("host." + id, null)?.host;
  await rpc("test_unlock", { id, token });
}
export async function setNickname(id: string, nick: string) {
  if (!shared) return mock.setNickname(id, nick);
  await rpc("nickname", {
    id,
    token: get<Entry | null>("host." + id, null)?.host,
    nick: nick.trim(),
  });
}
export async function submitGuest(
  id: string,
  guest: string,
  answers: Answer[],
) {
  if (!shared) return mock.submitGuest(id, guest, answers);
  await rpc("answer", { id, token: guest, answers });
}
