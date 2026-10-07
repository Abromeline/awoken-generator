// Local stand-ins for the two `@hatch/space-sdk/client` helpers the UI uses.
// Behavior matches the SDK: fileToBase64 returns { dataBase64, mimeType };
// SafeAreaTopScrim renders the fixed top safe-area scrim (default gradient).

import { createElement, type CSSProperties } from "react";

export function bytesToBase64(bytes: Uint8Array): string {
  const native = bytes as Uint8Array & { toBase64?: () => string };
  if (typeof native.toBase64 === "function") return native.toBase64();
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as unknown as number[]);
  }
  return btoa(binary);
}

export async function fileToBase64(file: Blob): Promise<{ dataBase64: string; mimeType: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { dataBase64: bytesToBase64(bytes), mimeType: file.type || "application/octet-stream" };
}

const GRADIENT_MASK =
  "linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.99) 10%, rgba(0, 0, 0, 0.96) 20%, rgba(0, 0, 0, 0.90) 30%, rgba(0, 0, 0, 0.80) 40%, rgba(0, 0, 0, 0.67) 50%, rgba(0, 0, 0, 0.52) 60%, rgba(0, 0, 0, 0.36) 70%, rgba(0, 0, 0, 0.20) 80%, rgba(0, 0, 0, 0.08) 90%, rgba(0, 0, 0, 0) 100%)";

export function SafeAreaTopScrim({
  variant = "gradient",
  backgroundColor,
  zIndex = 40,
  className,
  style,
  ...props
}: {
  variant?: "gradient" | "blur" | "solid";
  backgroundColor?: CSSProperties["backgroundColor"];
  zIndex?: CSSProperties["zIndex"];
  className?: string;
  style?: CSSProperties;
  [key: string]: unknown;
}) {
  const managedStyle: CSSProperties = {
    ...style,
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex,
    pointerEvents: "none",
    height: "calc(env(safe-area-inset-top, 0px) + min(2rem, env(safe-area-inset-top, 0px)))",
    backgroundColor: backgroundColor ?? style?.backgroundColor ?? "var(--bg)",
  };
  if (variant === "gradient") {
    managedStyle.maskImage = GRADIENT_MASK;
    (managedStyle as Record<string, string>).WebkitMaskImage = GRADIENT_MASK;
  } else if (variant === "blur") {
    managedStyle.backdropFilter = style?.backdropFilter ?? "blur(12px)";
  }
  return createElement("div", { ...props, "aria-hidden": true, className, style: managedStyle });
}
