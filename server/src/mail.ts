/**
 * THE POST (email reset links, Nigel 2026-10-19): the game's one
 * outbound letter — a password-reset link, sent only when a Tender
 * asks for one. Delivery runs through Resend when RESEND_API_KEY is
 * in the environment (and awokin.gg is verified there); until then
 * the mailer is DORMANT: it keeps the letter in hand (logged, and
 * held for the scratch proofs) and reports not-live, so the game can
 * honestly tell a locked-out Tender that the Keeper's hand is still
 * the road. Keys live in the host's env, never in the repo.
 */
export function mailLive(): boolean {
  return typeof process.env.RESEND_API_KEY === "string" && process.env.RESEND_API_KEY.length > 0;
}

let lastMail: { to: string; subject: string; link: string } | null = null;
/** Scratch-proof hook: the last letter the dormant mailer held. */
export function __lastMailForTest(): { to: string; subject: string; link: string } | null {
  return lastMail;
}

export async function sendPasswordResetMail(to: string, link: string): Promise<boolean> {
  const subject = "Reset your Awokin password";
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    lastMail = { to, subject, link };
    console.log(`[mail:dormant] password reset letter for ${to} held (no RESEND_API_KEY): ${link}`);
    return false;
  }
  const from = process.env.MAIL_FROM ?? "The Awokin <no-reply@awokin.gg>";
  const text = [
    "A password reset was asked for your Tender account in the Awokin.",
    "",
    "Set a new password here (the link lives for one hour, and once only):",
    link,
    "",
    "If you did not ask for this, do nothing — your password stands as it was.",
  ].join("\n");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!res.ok) console.error(`[mail] Resend refused a reset letter (${res.status}).`);
    return res.ok;
  } catch (e) {
    console.error("[mail] Resend unreachable:", e instanceof Error ? e.message : e);
    return false;
  }
}
