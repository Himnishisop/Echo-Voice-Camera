import { useEffect, useRef, useState } from "react";
import { LOGO_URL, C, silverGradient, greenGradient, glowColor } from "../lib/theme";
import { type UserProfile, parseJwt } from "../lib/auth";

export function Logo({ size = 96, glow = true }: { size?: number; glow?: boolean }) {
  return (
    <div
      className="relative grid place-items-center overflow-hidden rounded-[28%] border"
      style={{
        width: size,
        height: size,
        borderColor: C.line,
        background: silverGradient,
        boxShadow: glow
          ? `0 14px 48px -12px ${glowColor(C.greenDeep, 0.85)}, inset 0 1px 0 rgba(255,255,255,0.6)`
          : "inset 0 1px 0 rgba(255,255,255,0.5)",
      }}
    >
      <img
        src={LOGO_URL}
        alt="Echo Voice Camera"
        className="h-full w-full object-cover"
        draggable={false}
      />
      {/* brushed silver sheen */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg,rgba(255,255,255,0.45) 0%,rgba(255,255,255,0) 38%,rgba(255,255,255,0) 62%,rgba(255,255,255,0.18) 100%)",
        }}
      />
    </div>
  );
}

export function Splash({ onDone }: { onDone: () => void }) {
  return (
    <button
      onClick={onDone}
      className="relative flex h-full w-full flex-col items-center justify-center gap-7"
      style={{ background: C.bg }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 38%, ${glowColor(C.greenDeep, 0.35)} 0%, transparent 62%)`,
        }}
      />
      <div className="relative animate-[pop_700ms_cubic-bezier(0.22,1,0.36,1)]">
        <Logo size={120} />
      </div>
      <div className="relative animate-[fade_700ms_250ms_both] text-center">
        <h1
          className="text-[26px] font-bold leading-tight tracking-[0.06em]"
          style={{
            color: C.silver,
            textShadow: `0 0 26px ${glowColor(C.greenDeep, 0.85)}, 0 1px 0 rgba(255,255,255,0.35)`,
          }}
        >
          Echo Voice
        </h1>
        <p className="mt-1 text-[11px] uppercase" style={{ color: C.silverDim, letterSpacing: "0.4em" }}>
          Camera
        </p>
      </div>
      <style>{`
        @keyframes pop{0%{transform:scale(.5);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes fade{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:none}}
      `}</style>
    </button>
  );
}

export function Login({
  onLogin,
  onSkip,
}: {
  onLogin: (user: UserProfile) => void;
  onSkip: () => void;
}) {
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [accountEmail, setAccountEmail] = useState("musicallyhimnishverma@gmail.com");
  const [accountName, setAccountName] = useState("Himnish Verma");

  useEffect(() => {
    const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
    // @ts-expect-error Google Identity Services global
    if (window.google?.accounts?.id && clientId && googleBtnRef.current) {
      try {
        // @ts-expect-error Google Identity Services global
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: any) => {
            if (response?.credential) {
              const payload = parseJwt(response.credential);
              if (payload) {
                onLogin({
                  name: payload.name || "Google User",
                  email: payload.email || "",
                  picture: payload.picture,
                  sub: payload.sub || "google_" + Date.now(),
                });
                return;
              }
            }
          },
        });
        // @ts-expect-error Google Identity Services global
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "filled_blue",
          size: "large",
          shape: "pill",
          width: 320,
        });
      } catch (e) {
        console.warn("Google Identity Services button init error:", e);
      }
    }
  }, [onLogin]);

  const handleManualGoogleLogin = () => {
    onLogin({
      name: accountName.trim() || "Google User",
      email: accountEmail.trim() || "user@gmail.com",
      picture: "https://api.dicebear.com/7.x/bottts/svg?seed=" + encodeURIComponent(accountEmail),
      sub: "google_" + Date.now(),
    });
  };

  return (
    <div
      className="relative flex h-full flex-col items-center justify-between px-7 py-12"
      style={{ background: C.bg }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${glowColor(C.greenDeep, 0.4)} 0%, transparent 70%)`,
        }}
      />
      <div className="relative flex flex-col items-center gap-5 pt-8">
        <Logo size={84} />
        <div className="text-center">
          <h1 className="text-[22px] font-bold tracking-tight text-white">
            Welcome to Echo Voice Camera
          </h1>
          <p className="mx-auto mt-2 max-w-[17rem] text-xs leading-relaxed" style={{ color: C.silverDim }}>
            Sign in with your Google Account to save recordings, restore subscriptions, and access studio features.
          </p>
        </div>
      </div>

      <div className="relative w-full space-y-3">
        {/* Real GIS button container if configured */}
        <div ref={googleBtnRef} className="flex justify-center" />

        {/* Primary Google Login Button */}
        <button
          onClick={() => setShowPrompt(true)}
          className="flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-3.5 text-[15px] font-semibold transition active:scale-[0.98]"
          style={{
            background: silverGradient,
            color: "#0a1410",
            boxShadow: `0 10px 30px -12px ${glowColor(C.greenDeep, 0.9)}`,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-2.8-.4-4.1H24v8.4h12.5c-.3 2.1-1.6 5.2-4.7 7.3l7.6 5.9c4.5-4.2 6.7-10.3 6.7-17.5z" />
            <path fill="#FBBC05" d="M10.4 28.7A14.6 14.6 0 0 1 9.6 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2 1.4-4.8 2.4-8.3 2.4-6.4 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
          Sign in with Google
        </button>

        <button
          onClick={onSkip}
          className="w-full py-2.5 text-center text-[12px] font-medium transition hover:text-white"
          style={{ color: C.silverDim }}
        >
          Continue as Guest
        </button>

        <p className="text-center text-[10px] leading-relaxed" style={{ color: "#5c6b64" }}>
          By continuing you agree to the Terms of Service & Privacy Policy
        </p>
      </div>

      {/* Google Account Modal */}
      {showPrompt && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowPrompt(false)} />
          <div className="relative w-full max-w-sm rounded-3xl border border-white/20 bg-[#0d1c3a] p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <svg width="26" height="26" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-2.8-.4-4.1H24v8.4h12.5c-.3 2.1-1.6 5.2-4.7 7.3l7.6 5.9c4.5-4.2 6.7-10.3 6.7-17.5z" />
                <path fill="#FBBC05" d="M10.4 28.7A14.6 14.6 0 0 1 9.6 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z" />
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2 1.4-4.8 2.4-8.3 2.4-6.4 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
              </svg>
              <div>
                <h3 className="text-sm font-semibold text-white">Google Sign-In</h3>
                <p className="text-[11px] text-slate-400">Choose Google account to proceed</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] text-slate-300">Name</label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-300">Google Email</label>
                <input
                  type="email"
                  value={accountEmail}
                  onChange={(e) => setAccountEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white outline-none focus:border-emerald-400"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowPrompt(false)}
                className="flex-1 rounded-xl border border-white/15 py-2.5 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleManualGoogleLogin}
                className="flex-1 rounded-xl bg-[#39ff87] py-2.5 text-xs font-bold text-slate-950 transition active:scale-95"
              >
                Confirm Sign In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Paywall({
  onUnlock,
  onClose,
  busy = false,
}: {
  onUnlock: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div
        className="relative w-full rounded-t-[28px] border-t px-6 pb-9 pt-7"
        style={{ borderColor: C.line, background: "linear-gradient(180deg,#152447 0%,#0a1633 100%)" }}
      >
        <div className="mb-5 flex justify-center">
          <Logo size={64} />
        </div>
        <h2 className="text-center text-[22px] font-semibold leading-tight" style={{ color: C.silver }}>
          You've used your free export
        </h2>
        <p className="mx-auto mt-2 max-w-[18rem] text-center text-sm" style={{ color: C.silverDim }}>
          Go Premium for <span style={{ color: C.silver }}>unlimited exports</span> for the next 6 months.
        </p>

        <div
          className="mt-5 space-y-2 rounded-2xl border p-4"
          style={{ borderColor: C.line, background: "rgba(199,208,214,0.04)" }}
        >
          {[
            "Unlimited exports for 6 months",
            "Full MP4 / MP3 quality",
            "All delay & reverb presets",
            "Manual knob fine-tuning",
          ].map((f) => (
            <div key={f} className="flex items-center gap-3 text-[13px]" style={{ color: C.silver }}>
              <span
                className="grid h-4 w-4 place-items-center rounded-full text-[9px]"
                style={{ background: C.green, color: "#04120b" }}
              >
                ✓
              </span>
              {f}
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-end justify-center gap-1">
          <span className="mb-1 text-sm" style={{ color: C.silverDim }}>₹</span>
          <span className="text-[40px] font-bold leading-none tracking-tight" style={{ color: C.silver }}>
            199
          </span>
          <span className="mb-1 text-sm" style={{ color: C.silverDim }}>/ 6 months</span>
        </div>

        <button
          onClick={onUnlock}
          disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[15px] font-bold uppercase tracking-[0.08em] transition active:scale-[0.98] disabled:opacity-70"
          style={{ background: greenGradient, color: "#052012", boxShadow: `0 12px 34px -14px ${glowColor(C.green, 0.9)}` }}
        >
          {busy ? (
            <>
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black/80"
                aria-hidden
              />
              Processing…
            </>
          ) : (
            "Get Premium · ₹199"
          )}
        </button>
        <p className="mt-2.5 flex items-center justify-center gap-1 text-center text-[10px]" style={{ color: "#5c6b64" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          Secure payment via Google Play
        </p>
        <button onClick={onClose} className="mt-1 w-full py-2 text-center text-[13px]" style={{ color: C.silverDim }}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
