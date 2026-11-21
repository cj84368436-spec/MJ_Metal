import { useCallback, useEffect, useState } from "react";
import { RoomData, viewRoom } from "./store";

export function useRoom(id: string, guest: string | null, report: boolean) {
  const key = id + ":" + guest + ":" + report;
  const [state, setState] = useState<{
    key: string;
    data?: RoomData;
    problem?: string;
  }>({ key: "" });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let alive = true,
      timer = 0,
      sequence = 0;
    async function read() {
      clearTimeout(timer);
      if (document.hidden) return;
      const current = ++sequence;
      try {
        const data = await viewRoom(id, guest, report);
        if (!alive || current !== sequence) return;
        setState({ key, data });
        if (!guest && !data.result && !document.hidden)
          timer = window.setTimeout(read, 3000);
      } catch (e) {
        if (alive && current === sequence)
          setState({ key, problem: (e as Error).message });
      }
    }
    const storage = (e: StorageEvent) => {
      if (e.key?.endsWith("room." + id)) void read();
    };
    void read();
    addEventListener("storage", storage);
    addEventListener("online", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      alive = false;
      clearTimeout(timer);
      removeEventListener("storage", storage);
      removeEventListener("online", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, [id, guest, report, version, key]);
  return { ...(state.key === key ? state : { key }), refresh };
}
