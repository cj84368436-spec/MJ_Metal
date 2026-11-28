// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../src/ErrorBoundary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function Boom(): JSX.Element {
  throw new Error("그리다 터진 화면");
}

let host: HTMLDivElement;
let root: Root;
const onRetry = vi.fn();
const onHome = vi.fn();
const buttons = () => [...host.querySelectorAll("button")];

beforeEach(() => {
  // React가 오류를 잡아도 콘솔에 스택을 찍으므로 테스트 출력만 조용히 한다.
  vi.spyOn(console, "error").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  onRetry.mockClear();
  onHome.mockClear();
});

describe("ErrorBoundary", () => {
  it("자식이 그리다 터지면 하얀 화면 대신 안내 문구와 두 버튼을 보여준다", () => {
    act(() => {
      root.render(
        <ErrorBoundary onRetry={onRetry} onHome={onHome}>
          <Boom />
        </ErrorBoundary>,
      );
    });
    expect(host.textContent).toContain("잠깐 문제가 생겼어요");
    expect(host.textContent).toContain(
      "다시 열거나 처음으로 돌아가면 이어서 할 수 있어요.",
    );
    expect(buttons().map((b) => b.textContent?.trim())).toEqual([
      "다시 시도",
      "처음으로",
    ]);
    const [retry, home] = buttons();
    act(() => home.click());
    expect(onHome).toHaveBeenCalledTimes(1);
    act(() => retry.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("문제가 없으면 자식 화면을 그대로 그린다", () => {
    act(() => {
      root.render(
        <ErrorBoundary onRetry={onRetry} onHome={onHome}>
          <p>정상 화면</p>
        </ErrorBoundary>,
      );
    });
    expect(host.textContent).toBe("정상 화면");
    expect(buttons()).toHaveLength(0);
  });
});
