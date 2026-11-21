import { appRoute, browserPath } from "./paths";
import {
  closeView,
  generateHapticFeedback,
  getSafeAreaInsets,
  getSchemeUri,
  getTossShareLink,
  graniteEvent,
  SafeArea,
  share,
} from "@apps-in-toss/web-framework";
export const native = "ReactNativeWebView" in window;
export const reduced = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
export function buzz(
  type: Parameters<typeof generateHapticFeedback>[0]["type"] = "tickWeak",
) {
  if (!native) return;
  try {
    void generateHapticFeedback({ type }).catch(() => {});
  } catch {
    /* Optional device feedback. */
  }
}
export function installBridge(back: () => void) {
  if (!native) return () => {};
  const releases: (() => void)[] = [];
  const apply = (insets: ReturnType<typeof getSafeAreaInsets>) => {
    for (const [edge, value] of Object.entries(insets ?? {})) {
      if (Number.isFinite(value))
        document.documentElement.style.setProperty(
          "--safe-" + edge,
          value + "px",
        );
    }
  };
  try {
    apply(getSafeAreaInsets());
    releases.push(SafeArea.subscribe({ onEvent: apply }));
  } catch {
    /* CSS env fallback. */
  }
  try {
    releases.push(
      graniteEvent.addEventListener("backEvent", { onEvent: back }),
    );
  } catch {
    /* Browser history remains available. */
  }
  return () => releases.forEach((fn) => fn());
}
export function initialPath() {
  if (native && appRoute(location.pathname, location.search) === "/") {
    try {
      const url = new URL(getSchemeUri());
      if (/^\/r\/[a-z0-9]{8}$/.test(url.pathname))
        return url.pathname + url.search;
    } catch {
      /* Direct home launch. */
    }
  }
}
export function leave() {
  if (native) void closeView().catch(() => {});
}
export async function shareText(message: string) {
  if (native) await share({ message });
  else if (navigator.share) await navigator.share({ text: message });
  else return false;
  return true;
}

export async function inviteURL(route: string, shared: boolean) {
  if (native && shared) {
    const scheme = "intoss://secret-five" + route;
    try {
      return await getTossShareLink(scheme);
    } catch {
      return scheme;
    }
  }
  return location.origin + browserPath(route);
}
