import { API_BASE } from "@/lib/apiConfig";

const LS_KEY        = "coincash-cc-id";
const LS_SYNC_CLAIM = "cc-sync-claim";

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function computeFingerprint(): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 220;
  canvas.height = 40;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.textBaseline = "top";
    ctx.font = "13px Arial,sans-serif";
    ctx.fillStyle = "#00ffc6";
    ctx.fillRect(10, 5, 80, 20);
    ctx.fillStyle = "#0b0f14";
    ctx.fillText("CoinCash-fp", 12, 8);
    ctx.fillStyle = "rgba(0,220,160,0.6)";
    ctx.fillText("CoinCash-fp", 14, 10);
  }
  const canvasData = canvas.toDataURL();

  const signals = [
    navigator.language ?? "",
    (navigator.languages ?? []).join(","),
    `${screen.width}x${screen.height}`,
    String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    String(navigator.hardwareConcurrency ?? 0),
    String(navigator.maxTouchPoints ?? 0),
    canvasData,
  ].join("|");

  return sha256hex(signals);
}

let _resolvePromise: Promise<string> | null = null;

export async function resolveIdentity(): Promise<string> {
  if (_resolvePromise) return _resolvePromise;

  _resolvePromise = (async () => {
    // ── Priority 0: pending sync claim (user entered a sync code on this device) ──
    const pendingCode = localStorage.getItem(LS_SYNC_CLAIM);
    if (pendingCode) {
      try {
        const res = await fetch(`${API_BASE}/freemium/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: pendingCode }),
        });
        if (res.ok) {
          const { ccId } = await res.json();
          if (ccId && typeof ccId === "string") {
            localStorage.setItem(LS_KEY, ccId);
            localStorage.removeItem(LS_SYNC_CLAIM);
            return ccId;
          }
        }
      } catch {}
      // If the claim failed (bad code, network error), just remove it and continue normally
      localStorage.removeItem(LS_SYNC_CLAIM);
    }

    const cached = localStorage.getItem(LS_KEY);
    const fp = await computeFingerprint().catch(() => "");
    const ua = navigator.userAgent ?? "";

    try {
      const res = await fetch(`${API_BASE}/freemium/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fp, ua, hint: cached }),
      });
      if (res.ok) {
        const { ccId } = await res.json();
        if (ccId && typeof ccId === "string") {
          localStorage.setItem(LS_KEY, ccId);
          return ccId;
        }
      }
    } catch {}

    if (cached) return cached;

    const digits = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
    const fallback = `CC-${digits}`;
    localStorage.setItem(LS_KEY, fallback);
    return fallback;
  })();

  return _resolvePromise;
}

/**
 * Store a sync code that will be claimed on the next page load.
 * After calling this, reload the page so resolveIdentity picks it up.
 */
export function claimSyncCode(code: string): void {
  localStorage.setItem(LS_SYNC_CLAIM, code.trim().toUpperCase());
}
