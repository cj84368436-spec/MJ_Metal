import {
  Answer,
  AdState,
  Pack,
  packs,
  Result,
  Product,
  Referral,
  validateFive,
} from "./domain";
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
function deviceKey(): string {
  let key = get<string | null>("pass-device", null);
  if (!key) {
    key = mock.token();
    put("pass-device", key);
  }
  return key;
}
export function hasPass() {
  return shared ? get("trial-pass.all", false) : mock.hasPass();
}
const messages: Record<string, string> = {
  PASS_ALREADY_OWNED: "이 기기에 이미 전 팩 패스가 있어요.",
  NO_LOCKED_MATCHES: "더 열 수 있는 카드가 없어요.",
  ALREADY_UNLOCKED: "이미 이 방의 결과가 열렸어요.",
  INVALID_ACTION: "공유 방 서버에 최신 마이그레이션을 적용해주세요.",
  INVALID_LINK: "초대 링크를 확인해주세요. 보낸 사람에게 다시 받아볼래요?",
  EXPIRED: "이 카드는 만료됐어요. 새 카드를 만들까요?",
  INVALID_NICK: "닉네임은 편안한 말로 글자나 숫자 2~6자로 적어주세요.",
  TEST_PURCHASE_DISABLED: "이 서버에서는 모의 결제가 꺼져 있어요.",
  TOO_MANY: "잠시 뒤 다시 시도해주세요.",
};
/**
 * 광고 보상(`ad_state`, `ad_reward`)은 004 마이그레이션이 따로 만든
 * `secret_five_ad`가 맡는다. 나머지는 기존 `secret_five`로 보낸다.
 * 한 함수로 몰아 보내면 광고 op가 `INVALID_ACTION`으로 떨어진다.
 */
const adFunction = (op: string) => op.startsWith("ad_");
async function rpc<T>(op: string, args: object): Promise<T> {
  if (!endpoint || !apiKey)
    throw new Error("공유 방 서버 설정을 확인해주세요.");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: apiKey,
  };
  if (apiKey.startsWith("ey")) headers.Authorization = "Bearer " + apiKey;
  const fn = adFunction(op) ? "secret_five_ad" : "secret_five";
  const response = await fetch(endpoint + "/rest/v1/rpc/" + fn, {
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
      { code: data.message, pgc: data.code, status: response.status },
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
  referral?: Referral,
) {
  if (!shared) return mock.createRoom(p, ids, answers);
  const key = prefix + "attempt." + attempt;
  let c: Credentials =
    JSON.parse(sessionStorage.getItem(key) ?? "null") ?? credentials();
  for (let attempt = 0; attempt < 3; attempt++) {
    sessionStorage.setItem(key, JSON.stringify(c));
    try {
      await rpc("create", {
        ...c,
        ids,
        answers,
        pack: p.id,
        device: deviceKey(),
        ...(referral && {
          parent_id: referral.room,
          parent_guest: referral.guest,
        }),
      });
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
  /** 결과 화면의 광고 보상 상태. */
  ad: AdState;
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
// 광고 보상 RPC가 없는 서버는 한 번만 확인하고 기억한다.
const noAdBonus = new Set<string>();
/**
 * 보상형 광고 보상 조회. 004 마이그레이션이 없는 서버에는 `secret_five_ad`가
 * 없어서 한 번만 확인하고 광고 버튼을 숨긴다.
 */
async function adBonusState(id: string, token: string) {
  if (noAdBonus.has(endpoint ?? "")) return null;
  try {
    return await rpc<{ bonus: boolean; card: string | null }>("ad_state", {
      id,
      token,
    });
  } catch (e) {
    const err = e as { code?: string; pgc?: string; status?: number };
    const code = err.code ?? "";
    // 004 미적용 서버는 함수가 없어 PostgREST 404(PGRST202)를 돌려준다.
    if (
      code === "INVALID_ACTION" ||
      code.startsWith("PGRST") ||
      (err.pgc ?? "").startsWith("PGRST") ||
      err.status === 404
    )
      noAdBonus.add(endpoint ?? "");
    return null;
  }
}
export async function viewRoom(
  id: string,
  guest: string | null,
): Promise<RoomData> {
  if (!shared) {
    const data = mock.viewRoom(id, guest);
    mock.activateSeat(id, guest);
    return data;
  }
  const host = get<Entry | null>("host." + id, null);
  const token = guest ?? host?.host;
  if (!token) throw new Error(messages.INVALID_LINK);
  const s = await rpc<Snapshot>("state", { id, token });
  const pack = packs.find((p) => p.id === s.pack)!;
  const qs = (ids: string[] | null) =>
    (ids ?? []).map((qid) => pack.questions.find((q) => q.id === qid)!);
  const unlocked = s.unlocked;
  let result: Result | null =
    s.matched === null
      ? null
      : {
          matched: s.matched,
          percent: s.matched * 20,
          opened: qs(s.opened),
          locked: s.matched - (s.opened?.length ?? 0),
          sealed: 5 - s.matched,
        };
  let ad: AdState = "none";
  if (result && !unlocked && result.locked > 0) {
    const info = await adBonusState(id, token);
    if (info?.bonus && info.card && !result.opened.some((q) => q.id === info.card)) {
      const bonus = qs([info.card])[0];
      if (bonus) {
        result = {
          ...result,
          opened: [...result.opened, bonus],
          locked: result.locked - 1,
          adBonusId: bonus.id,
        };
        mock.markAdBonusSeen(id);
      }
    }
    ad = info ? (info.bonus ? "used" : "available") : "none";
  }
  if (host && !host.done && result) put("host." + id, { ...host, done: true });
  return {
    pack,
    nick: s.nick,
    created: s.created,
    guestToken: guest ?? host!.guest,
    unlocked,
    ad,
    questions: qs(s.ids),
    result,
  };
}
export async function redeal(id: string, guest: string | null, pack: Pack) {
  if (!shared) return mock.redeal(id, guest);
  const token = guest ?? get<Entry | null>("host." + id, null)?.host;
  const ids = await rpc<string[]>("redeal", { id, token });
  if (!validateFive(pack, ids))
    throw new Error("새 카드를 준비하지 못했어요. 다시 시도해주세요.");
  return ids;
}
/**
 * 결과 잠금 해제. 화면의 모의 결제가 끝난 뒤에만 부른다.
 * 실제 출시에서는 영수증 검증으로 바꿔야 하는 지점이다.
 */
export async function unlockRoom(
  id: string,
  guest: string | null,
  product: Product = "room",
) {
  if (!shared) return mock.unlock(id, guest, product);
  const token = guest ?? get<Entry | null>("host." + id, null)?.host;
  if (product === "pack") {
    try {
      await rpc("test_pack_pass", { id, token, device: deviceKey() });
    } catch (e) {
      if ((e as { code?: string }).code !== "PASS_ALREADY_OWNED") throw e;
    }
    put("trial-pass.all", true);
  } else await rpc("test_unlock", { id, token });
}
/**
 * 보상형 광고 보상을 방에 기록한다. 한 방에 한 번만 열린다.
 * 광고를 끝까지 본 뒤에만 부른다.
 */
export async function claimAdBonus(id: string, guest: string | null) {
  if (!shared) await mock.claimAd(id, guest);
  else {
    const token = guest ?? get<Entry | null>("host." + id, null)?.host;
    if (!token) throw new Error(messages.INVALID_LINK);
    await rpc("ad_reward", { id, token });
  }
  mock.markAdBonusSeen(id);
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
