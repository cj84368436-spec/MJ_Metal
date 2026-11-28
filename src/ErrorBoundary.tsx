import { Component, type ErrorInfo, type ReactNode } from "react";
import { asset } from "./paths";

type Props = {
  children: ReactNode;
  /** 테스트·미리보기에서 이동을 가로챌 때 쓴다. 없으면 실제 페이지를 다시 연다. */
  onRetry?: () => void;
  onHome?: () => void;
};
type State = { failed: boolean };

/**
 * 화면을 그리다 예상 못 한 오류가 나면 하얀 화면 대신 안내를 보여준다.
 * 앱 전체를 감싸므로 App이 통째로 터져도 이 화면은 남는다.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("화면을 그리다 문제가 생겼어요", error, info.componentStack);
  }

  private retry = () => {
    if (this.props.onRetry) this.props.onRetry();
    else location.reload();
  };

  private home = () => {
    if (this.props.onHome) this.props.onHome();
    else location.assign(import.meta.env.BASE_URL || "/");
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="app-shell">
        <main className="app-main">
          <section className="flow center crash" role="alert">
            <img
              className="crash-heart"
              src={asset("sketch/heart.png")}
              alt=""
            />
            <h1>잠깐 문제가 생겼어요</h1>
            <p>다시 열거나 처음으로 돌아가면 이어서 할 수 있어요.</p>
            <div className="crash-actions">
              <button className="cta" onClick={this.retry}>
                다시 시도
              </button>
              <button className="ghost" onClick={this.home}>
                처음으로
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }
}
