import { appRoute, browserPath } from "./paths";
import {
  closeView,
  generateHapticFeedback,
  getSafeAreaInsets,
  getSchemeUri,
  getTossShareLink,
  graniteEvent,
  loadFullScreenAd,
  SafeArea,
  share,
  showFullScreenAd,
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

// 보상형 광고. 앱인토스 콘솔에서 발급한 광고 그룹 ID를 환경변수로 넣는다.
// 없으면 SDK가 문서에 적어 둔 테스트 ID로 동작한다(광고는 나오지만 수익은 없다).
export const adGroupId =
  import.meta.env.VITE_TOSS_REWARDED_AD_GROUP_ID || "ait-ad-test-rewarded-id";
export const testAd = adGroupId === "ait-ad-test-rewarded-id";
export type AdOutcome = "reward" | "closed" | "failed";
export type AdPhase = "loading" | "watching";
/** 토스 앱에서 실제 광고를 띄울 수 있는지. 브라우저 미리보기는 모의 광고로 체험한다. */
export function adsAvailable() {
  if (!native) return true;
  try {
    return (
      !!adGroupId &&
      loadFullScreenAd.isSupported() &&
      showFullScreenAd.isSupported()
    );
  } catch {
    return false;
  }
}
/** 브라우저 미리보기용 모의 광고. ?ad=skip 이면 끝까지 보지 않은 경우를 흉내 낸다. */
function mockAd(phase?: (p: AdPhase) => void) {
  const mode = new URLSearchParams(location.search).get("ad");
  return new Promise<AdOutcome>((resolve) =>
    setTimeout(() => {
      phase?.("watching");
      setTimeout(
        () =>
          resolve(
            mode === "fail" ? "failed" : mode === "skip" ? "closed" : "reward",
          ),
        1200,
      );
    }, 400),
  );
}
/**
 * 보상형 광고를 미리 불러와 노출하고, 끝까지 본 경우에만 보상을 준다.
 * 중간에 닫으면 closed, 불러오지 못하면 failed.
 */
export function showRewardedAd(phase?: (p: AdPhase) => void): Promise<AdOutcome> {
  if (!native) return mockAd(phase);
  if (!adsAvailable()) return Promise.resolve("failed");
  return new Promise<AdOutcome>((resolve) => {
    let done = false;
    let earned = false;
    let timer = 0;
    let stopLoad: (() => void) | undefined;
    let stopShow: (() => void) | undefined;
    const finish = (outcome: AdOutcome) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        stopShow?.();
        stopLoad?.();
      } catch {
        /* Already released. */
      }
      resolve(outcome);
    };
    // 광고를 불러오지 못하면 15초 뒤 정리하고, 노출 뒤에는 넉넉하게 기다린다.
    const arm = (ms: number) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => finish("failed"), ms);
    };
    arm(15000);
    const show = () => {
      phase?.("watching");
      arm(120000);
      try {
        stopShow = showFullScreenAd({
          options: { adGroupId },
          onEvent: (event) => {
            if (event.type === "userEarnedReward") {
              earned = true;
              finish("reward");
            } else if (event.type === "dismissed")
              // 닫힘 직후에 도착하는 보상 이벤트까지 받아 본다.
              window.setTimeout(() => finish(earned ? "reward" : "closed"), 250);
            else if (event.type === "failedToShow") finish("failed");
          },
          onError: () => finish("failed"),
        });
      } catch {
        finish("failed");
      }
    };
    try {
      stopLoad = loadFullScreenAd({
        options: { adGroupId },
        onEvent: (event) => {
          if (event.type === "loaded") show();
        },
        onError: () => finish("failed"),
      });
    } catch {
      finish("failed");
    }
  });
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
