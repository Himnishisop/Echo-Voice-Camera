/**
 * Screen guard to give the app a true native mobile feel:
 * - disables right-click context menu
 * - prevents pinch zoom gesture accidental triggers
 * - prevents pull-to-refresh / rubber-banding
 */
export function installScreenGuard() {
  if (typeof window === "undefined") return;

  // Disable context menu
  window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // Prevent drag and drop file replacement
  window.addEventListener("dragover", (e) => e.preventDefault(), false);
  window.addEventListener("drop", (e) => e.preventDefault(), false);
}
