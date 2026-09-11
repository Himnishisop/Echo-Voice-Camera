import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMsg: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    errorMsg: "",
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMsg: error?.message || "An unexpected error occurred." };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#060d20] p-6 text-center text-white">
          <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-[#0e1a38] p-6 shadow-2xl">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#39ff87]/20 text-[#39ff87]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Echo Voice Camera</h2>
            <p className="mt-2 text-sm text-slate-400">
              {this.state.errorMsg || "Ready to restart"}
            </p>
            <button
              onClick={() => {
                try {
                  localStorage.clear();
                  sessionStorage.clear();
                } catch {}
                window.location.reload();
              }}
              className="mt-6 w-full rounded-2xl bg-[#39ff87] py-3.5 text-sm font-bold text-[#052012] shadow-lg transition active:scale-98"
            >
              Restart Camera
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
