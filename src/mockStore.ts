import {
  Answer,
  complete,
  grantPack,
  matchCards,
  ownsPack,
  Pack,
  packs,
  validateFive,
} from "./domain";

const prefix = "secret-five.v1.";
function read<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(prefix + key);
  return raw === null ? fallback : (JSON.parse(raw) as T);
}
function write(key: string, value: unknown) {
  localStorage.setItem(prefix + key, JSON.stringify(value));
}
export function owned() {
  return packs.filter((p) => read("pass." + p.id, false)).map((p) => p.id);
}
export function pay(pack: Pack) {
  if (grantPack(owned(), pack).includes(pack.id))
    write("pass." + pack.id, true);
}
export function recent(pack: Pack) {
  return read<string[][]>("recent." + pack.id, []);
}
type Room = {
  id: string;
  packId: string;
  ids: string[];
  host: string;
  guest: string;
  created: number;
  hostAnswers: Answer[];
  guestAnswers?: Answer[];
  nick: string;
};
export function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export function createRoom(pack: Pack, ids: string[], answers: Answer[]) {
  if (
    !validateFive(pack, ids) ||
    !complete(answers) ||
    !ownsPack(owned(), pack)
  )
    throw new Error("카드와 팩 이용권을 확인해주세요.");
  let id: string;
  do {
    id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) =>
      (n % 36).toString(36),
    ).join("");
  } while (read("room." + id, null));
  const room: Room = {
    id,
    packId: pack.id,
    ids,
    host: token(),
    guest: token(),
    created: Date.now(),
    hostAnswers: answers,
    nick: "",
  };
  write("room." + id, room);
  write("host." + id, room.host);
  write("recent." + pack.id, [...recent(pack).slice(-2), ids]);
  return id;
}
function access(id: string, guest: string | null) {
  const room = read<Room | null>("room." + id, null);
  if (!room)
    throw new Error(
      "이 기기에서 방을 찾을 수 없어요. 모의 링크는 같은 브라우저에서 열어주세요.",
    );
  if (
    guest !== null
      ? guest !== room.guest
      : read<string | null>("host." + id, null) !== room.host
  )
    throw new Error("링크를 확인해주세요. 보낸 사람에게 다시 받아볼래요?");
  if (Date.now() - room.created >= 7 * 86400000)
    throw new Error("이 카드는 만료됐어요. 새 카드를 만들까요?");
  return room;
}
export function viewRoom(id: string, guest: string | null) {
  const room = access(id, guest);
  const pack = packs.find((p) => p.id === room.packId)!;
  const qs = room.ids.map((id) => pack.questions.find((q) => q.id === id)!);
  const result = room.guestAnswers
    ? matchCards(qs, room.hostAnswers, room.guestAnswers, false)
    : null;
  return {
    pack,
    nick: room.nick,
    created: room.created,
    guestToken: room.guest,
    questions: result ? [] : qs,
    result,
    report: room.guestAnswers
      ? matchCards(qs, room.hostAnswers, room.guestAnswers, true)
      : null,
  };
}
async function editRoom(id: string, update: () => void) {
  if (navigator.locks) await navigator.locks.request(prefix + id, update);
  else update();
}
export async function submitGuest(
  id: string,
  guest: string,
  answers: Answer[],
) {
  await editRoom(id, () => {
    const room = access(id, guest);
    if (room.guestAnswers) return;
    if (!complete(answers)) throw new Error("카드 다섯 장에 모두 답해주세요.");
    write("room." + id, { ...room, guestAnswers: answers });
  });
}
export async function setNickname(id: string, text: string) {
  const nick = text.trim();
  if (
    nick &&
    (!/^[\p{L}\p{N}]{2,6}$/u.test(nick) ||
      /씨발|시발|병신|개새끼|fuck|shit/i.test(nick))
  )
    throw new Error("닉네임은 편안한 말로, 글자나 숫자 2~6자로 적어주세요.");
  await editRoom(id, () => {
    const room = access(id, null);
    write("room." + id, { ...room, nick });
  });
}
export function myRooms() {
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(prefix + "host."))
    .map((k) => k.slice(-8))
    .flatMap((id) => {
      try {
        const room = access(id, null);
        return [
          {
            id,
            pack: packs.find((p) => p.id === room.packId)!,
            done: !!room.guestAnswers,
            created: room.created,
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.created - a.created);
}
