import { useEffect, useRef, useState } from "react";
import Camera from "./screens/Camera";
import Editor from "./screens/Editor";
import { Login, Paywall } from "./screens/Onboarding";
import { defaultFx, download, type FxState, type MediaKind } from "./lib/audio";
import { type Recording } from "./lib/recorder";
import { renderAudioBuffer, encodeMp3, renderVideoMp4, type Progress } from "./lib/encode";
import { ExportOverlay } from "./screens/ExportOverlay";
import { AndroidAppModal } from "./screens/AndroidAppModal";
import { C } from "./lib/theme";
import { purchasePremium, restorePremium, PLAN_MONTHS } from "./lib/payment";
import { getStoredUser, saveStoredUser, removeStoredUser, type UserProfile } from "./lib/auth";

type Stage = "login" | "camera" | "editor";

const K_EXPORTS = "va_exports";
const K_PRO = "va_pro";

const safeStorage = {
  getItem: (k: string): string | null => {
    try {
      return window.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string): void => {
    try {
      window.localStorage?.setItem(k, v);
    } catch {}
  },
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(() => getStoredUser());
  const [stage, setStage] = useState<Stage>(() => (getStoredUser() ? "camera" : "login"));
  const [take, setTake] = useState<Recording | null>(null);
  const [fx, setFx] = useState<FxState>(defaultFx);
  const [trim, setTrim] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const [exporting, setExporting] = useState(false);
  const [exProgress, setExProgress] = useState<Progress>({ stage: "prepare", ratio: 0 });
  const [exDone, setExDone] = useState(false);
  const [exError, setExError] = useState(false);
  const [exName, setExName] = useState("");
  const [paywall, setPaywall] = useState(false);
  const [buying, setBuying] = useState(false);
  const [toast, setToast] = useState("");
  // Android / PWA install state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [androidModal, setAndroidModal] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const triggerInstall = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice?.outcome === "accepted") {
        setInstallPrompt(null);
        setAndroidModal(false);
        flash("App installed successfully! 🎉");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const exportsUsed = useRef(Number(safeStorage.getItem(K_EXPORTS) ?? 0));
  // Premium = a 6-month pass. K_PRO stores the expiry timestamp (ms).
  const [pro, setPro] = useState(() => {
    const exp = Number(safeStorage.getItem(K_PRO) ?? 0);
    return exp > Date.now();
  });

  const fileInput = useRef<HTMLInputElement>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(""), 2600);
  };

  const loadTake = (r: Recording) => {
    setTake(r);
    setFx(defaultFx);
    setTrim({ start: 0, end: 0 });
    setStage("editor");
  };

  const importFile = (f: File) => {
    const isVideo = f.type.startsWith("video");
    loadTake({
      kind: isVideo ? "video" : "audio",
      file: f,
      url: URL.createObjectURL(f),
      duration: 0,
      lossless: false,
    });
  };

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  const doExport = async () => {
    if (!take) return;
    if (exportsUsed.current >= 1 && !pro) {
      setPaywall(true);
      return;
    }
    setExporting(true);
    setExDone(false);
    setExError(false);
    setExProgress({ stage: "prepare", ratio: 0 });
    const opts = { trimStart: trim.start, trimEnd: trim.end };

    try {
      let name = "";
      if (take.kind === "video") {
        const { blob, ext } = await renderVideoMp4(take.url, fx, setExProgress, opts);
        name = `echo-voice-${stamp()}.${ext}`;
        download(blob, name);
      } else {
        setExProgress({ stage: "audio", ratio: 0.1 });
        const buffer = await renderAudioBuffer(take.file, fx, opts);
        setExProgress({ stage: "audio", ratio: 0.4 });
        const blob = encodeMp3(buffer, (r) =>
          setExProgress({ stage: "audio", ratio: 0.4 + r * 0.5 })
        );
        setExProgress({ stage: "finalize", ratio: 1 });
        name = `echo-voice-${stamp()}.mp3`;
        download(blob, name);
      }
      setExName(name);
      setExProgress({ stage: "done", ratio: 1 });
      setExDone(true);
      exportsUsed.current += 1;
      safeStorage.setItem(K_EXPORTS, String(exportsUsed.current));
    } catch (e) {
      console.error(e);
      setExError(true);
    }
  };

  const closeExport = () => {
    setExporting(false);
    setExDone(false);
    setExError(false);
  };

  const grantPremium = () => {
    const expiry = Date.now() + PLAN_MONTHS * 30 * 24 * 60 * 60 * 1000;
    safeStorage.setItem(K_PRO, String(expiry));
    setPro(true);
    setPaywall(false);
  };

  // Restore an existing Play purchase on launch (survives reinstalls when tied
  // to the Google account). No-op in a normal browser.
  useEffect(() => {
    if (pro) return;
    try {
      restorePremium()
        .then((active) => {
          if (active) {
            safeStorage.setItem(
              K_PRO,
              String(Date.now() + PLAN_MONTHS * 30 * 24 * 60 * 60 * 1000)
            );
            setPro(true);
          }
        })
        .catch(() => {});
    } catch {}
  }, [pro]);

  const unlock = async () => {
    if (buying) return;
    setBuying(true);
    try {
      const res = await purchasePremium();
      if (res.ok) {
        grantPremium();
        flash(res.demo ? "Premium unlocked (demo) 🎉" : "Purchase successful — Premium unlocked 🎉");
      } else if (res.reason && res.reason !== "cancelled") {
        flash(res.reason);
      }
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060d20] p-0 sm:p-6">
      {/* ambient glow (desktop backdrop) */}
      <div className="pointer-events-none fixed inset-0 hidden sm:block">
        <div className="absolute left-1/2 top-1/4 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-blue-700/15 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-indigo-800/15 blur-[120px]" />
      </div>

      {/* phone frame */}
      <div
        className="relative h-[100dvh] w-full max-w-[460px] overflow-hidden sm:h-[880px] sm:max-h-[94vh] sm:rounded-[40px] sm:border sm:border-white/15 sm:shadow-[0_25px_80px_-15px_rgba(0,0,0,0.8),0_0_40px_rgba(57,255,135,0.15)]"
        style={{ background: C.bg }}
      >
        {/* notch */}
        <div className="pointer-events-none absolute left-1/2 top-0 z-30 hidden h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-black/80 backdrop-blur sm:block" />

        {stage === "login" && (
          <Login
            onLogin={(u) => {
              setUser(u);
              saveStoredUser(u);
              setStage("camera");
              flash("Signed in as " + u.name);
            }}
            onSkip={() => setStage("camera")}
          />
        )}

        {stage === "camera" && (
          <Camera
            onCapture={loadTake}
            onImport={() => fileInput.current?.click()}
            onOpenAndroid={() => setAndroidModal(true)}
            user={user}
            onSignOut={() => {
              removeStoredUser();
              setUser(null);
              setStage("login");
              flash("Signed out");
            }}
            pro={pro}
            onOpenPaywall={() => setPaywall(true)}
          />
        )}
        {stage === "editor" && take && (
          <Editor
            kind={take.kind as MediaKind}
            url={take.url}
            fx={fx}
            setFx={setFx}
            trim={trim}
            setTrim={setTrim}
            onBack={() => setStage("camera")}
            onExport={doExport}
            exporting={exporting}
          />
        )}

        {exporting && (
          <ExportOverlay
            kind={(take?.kind as MediaKind) ?? "audio"}
            progress={exProgress}
            done={exDone}
            error={exError}
            filename={exName}
            onClose={closeExport}
          />
        )}

        {androidModal && (
          <AndroidAppModal
            canPromptInstall={!!installPrompt}
            onTriggerInstall={triggerInstall}
            onClose={() => setAndroidModal(false)}
          />
        )}

        {paywall && <Paywall onUnlock={unlock} onClose={() => setPaywall(false)} busy={buying} />}

        {toast && (
          <div
            className="pointer-events-none absolute bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-[12px] font-semibold shadow-xl"
            style={{ background: "linear-gradient(180deg,#eef3f5,#c3ccd2)", color: "#0a1410" }}
          >
            {toast}
          </div>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="video/*,audio/*,.mp4,.mp3,.m4a,.wav,.webm,.mov"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
