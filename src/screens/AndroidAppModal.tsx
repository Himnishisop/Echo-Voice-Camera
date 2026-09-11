import { useState } from "react";
import { C, greenGradient } from "../lib/theme";

interface AndroidAppModalProps {
  onClose: () => void;
  canPromptInstall: boolean;
  onTriggerInstall: () => void;
}

export function AndroidAppModal({
  onClose,
  canPromptInstall,
  onTriggerInstall,
}: AndroidAppModalProps) {
  const [tab, setTab] = useState<"install" | "apk" | "billing">("install");
  const [copied, setCopied] = useState(false);

  const previewUrl =
    typeof window !== "undefined"
      ? window.location.href.split("?")[0]
      : "https://ais-pre-jv2juno7zi7wiyreg5done-350901756270.asia-southeast1.run.app";

  const pwaBuilderUrl = `https://www.pwabuilder.com/reportcard?site=${encodeURIComponent(previewUrl)}`;

  const copyUrl = () => {
    navigator.clipboard.writeText(previewUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-md">
      <div
        className="relative flex w-full max-w-[400px] flex-col overflow-hidden rounded-3xl border shadow-2xl"
        style={{ background: "#0b1528", borderColor: C.line }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: C.line }}>
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: "rgba(57,255,135,0.12)", color: C.green }}
            >
              {/* Android Robot Icon */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9992.4482.9992.9993 0 .5511-.4482.9997-.9992.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.996-3.4572a.416.416 0 00-.1523-.5676.416.416 0 00-.5676.1523l-2.0223 3.503C15.5842 8.4116 13.8504 8 12 8s-3.5842.4116-5.1353.9519L4.8424 5.4489a.4161.4161 0 00-.5677-.1523.4157.4157 0 00-.1522.5676l1.996 3.4572C2.6889 11.1867.3333 14.58.3333 18.5h23.3334c0-3.92-2.3556-7.3133-5.7867-9.1786" />
              </svg>
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-white">Android App</h3>
              <p className="text-[11px] text-gray-400">Run or export on Android</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b px-3 pt-2" style={{ borderColor: C.line }}>
          <button
            onClick={() => setTab("install")}
            className={`flex-1 pb-2.5 text-center text-[12px] font-semibold transition ${
              tab === "install"
                ? "border-b-2 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
            style={{ borderColor: tab === "install" ? C.green : "transparent" }}
          >
            Direct Install
          </button>
          <button
            onClick={() => setTab("apk")}
            className={`flex-1 pb-2.5 text-center text-[12px] font-semibold transition ${
              tab === "apk"
                ? "border-b-2 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
            style={{ borderColor: tab === "apk" ? C.green : "transparent" }}
          >
            APK / AAB
          </button>
          <button
            onClick={() => setTab("billing")}
            className={`flex-1 pb-2.5 text-center text-[12px] font-semibold transition ${
              tab === "billing"
                ? "border-b-2 text-emerald-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
            style={{ borderColor: tab === "billing" ? C.green : "transparent" }}
          >
            Google Billing
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-5 text-gray-300">
          {tab === "install" ? (
            <div className="space-y-4 text-[13px]">
              <div className="rounded-xl border p-3.5" style={{ borderColor: C.line, background: "rgba(255,255,255,0.03)" }}>
                <p className="text-white font-medium mb-1">Install to Android Home Screen</p>
                <p className="text-[12px] text-gray-400 leading-relaxed">
                  Echo Voice is fully configured as a Progressive Web App (PWA) with offline support, camera & audio hardware access, and standalone full-screen view.
                </p>
              </div>

              {canPromptInstall ? (
                <button
                  onClick={onTriggerInstall}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold text-[#0a1633] shadow-lg transition active:scale-[0.98]"
                  style={{ background: greenGradient }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Install App on Device Now
                </button>
              ) : (
                <div className="space-y-2 rounded-xl border p-3.5 text-[12px]" style={{ borderColor: C.line }}>
                  <p className="font-semibold text-white">How to install in Chrome on Android:</p>
                  <ol className="list-decimal pl-4 space-y-1.5 text-gray-300 leading-normal">
                    <li>Open this URL in Google Chrome on your Android phone.</li>
                    <li>Tap the Chrome menu button <strong className="text-white">(⋮)</strong> in the top-right corner.</li>
                    <li>Tap <strong className="text-white">"Install app"</strong> or <strong className="text-white">"Add to Home screen"</strong>.</li>
                    <li>The app will install directly into your Android app drawer with full hardware support!</li>
                  </ol>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  readOnly
                  value={previewUrl}
                  className="flex-1 rounded-xl border px-3 py-2 text-[11px] text-gray-300 truncate outline-none"
                  style={{ background: "rgba(0,0,0,0.3)", borderColor: C.line }}
                />
                <button
                  onClick={copyUrl}
                  className="rounded-xl border px-3 py-2 text-[11px] font-semibold text-white transition active:scale-95"
                  style={{ borderColor: C.line, background: "rgba(255,255,255,0.08)" }}
                >
                  {copied ? "Copied! ✓" : "Copy Link"}
                </button>
              </div>
            </div>
          ) : tab === "apk" ? (
            <div className="space-y-4 text-[13px]">
              <div className="rounded-xl border p-3.5" style={{ borderColor: C.line, background: "rgba(255,255,255,0.03)" }}>
                <p className="text-white font-medium mb-1">Generate Standalone APK / AAB</p>
                <p className="text-[12px] text-gray-400 leading-relaxed">
                  You can package this web app into an official Android APK or Google Play Store bundle (AAB) using Microsoft PWABuilder (free & instant).
                </p>
              </div>

              <a
                href={pwaBuilderUrl}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold text-[#0a1633] shadow-lg transition active:scale-[0.98]"
                style={{ background: greenGradient }}
              >
                Open in PWABuilder (1-Click APK)
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                </svg>
              </a>

              <div className="space-y-2 rounded-xl border p-3.5 text-[12px]" style={{ borderColor: C.line }}>
                <p className="font-semibold text-white">APK Build Steps:</p>
                <ol className="list-decimal pl-4 space-y-1 text-gray-300">
                  <li>Click the button above to test the manifest on PWABuilder.</li>
                  <li>Click <strong className="text-white">"Package for Android"</strong>.</li>
                  <li>Download the ready-to-install <strong className="text-white">.apk</strong> or Google Play ready <strong className="text-white">.aab</strong>!</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-[12px]">
              <div className="rounded-xl border p-3.5" style={{ borderColor: "rgba(57,255,135,0.3)", background: "rgba(57,255,135,0.06)" }}>
                <p className="text-emerald-300 font-semibold mb-1">Google Play Billing (Digital Goods API)</p>
                <p className="text-gray-300 leading-relaxed text-[11px]">
                  The app is fully integrated with Google Play’s official <strong>Digital Goods API & PaymentRequest API</strong> for Trusted Web Activities (TWA).
                </p>
              </div>

              <div className="space-y-2 rounded-xl border p-3.5" style={{ borderColor: C.line }}>
                <p className="font-semibold text-white">What you need from Google Play Console:</p>
                <div className="space-y-2 text-gray-300">
                  <div className="rounded-lg bg-black/40 p-2 border border-white/10">
                    <p className="text-emerald-400 font-medium">1. Product SKU</p>
                    <p className="text-[11px] text-gray-400">In Google Play Console &gt; Monetize &gt; In-app products &gt; Create product:</p>
                    <p className="font-mono text-[11px] text-white select-all">echovoice_pro_6m</p>
                    <p className="text-[10px] text-gray-400">Price: ₹199 (or your preferred local price)</p>
                  </div>

                  <div className="rounded-lg bg-black/40 p-2 border border-white/10">
                    <p className="text-emerald-400 font-medium">2. Package Name</p>
                    <p className="text-[11px] text-gray-400">Create your app on Play Console with an application ID like:</p>
                    <p className="font-mono text-[11px] text-white">com.echovoice.camera</p>
                  </div>

                  <div className="rounded-lg bg-black/40 p-2 border border-white/10">
                    <p className="text-emerald-400 font-medium">3. Digital Asset Links</p>
                    <p className="text-[11px] text-gray-400">
                      Copy your App signing key SHA-256 fingerprint from Google Play Console &gt; App Integrity into <code className="text-white">.well-known/assetlinks.json</code>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-3 text-center" style={{ borderColor: C.line, background: "rgba(0,0,0,0.2)" }}>
          <button
            onClick={onClose}
            className="w-full py-2 text-[13px] font-medium text-gray-400 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
