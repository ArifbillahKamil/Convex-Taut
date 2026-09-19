import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { Email } from "@convex-dev/auth/providers/Email";
import type { ConvexCredentialsUserConfig } from "@convex-dev/auth/providers/ConvexCredentials";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

function emailCode(id: string, purpose: string) {
  return Email({
    id,
    maxAge: 10 * 60,
    generateVerificationToken: async () =>
      crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    async sendVerificationRequest({ identifier, token }, ctx?: ActionCtx) {
      if (!ctx) throw new Error("Email action context unavailable");
      const key = process.env.AGENTMAIL_API_KEY;
      const inbox = process.env.AGENTMAIL_AUTH_INBOX_ID;
      if (!key || !inbox)
        throw new ConvexError(
          "Account email is temporarily unavailable. Please try again later.",
        );
      await ctx.runMutation(internal.accounts.reserveEmail, {
        email: identifier,
      });
      const base =
        process.env.AGENTMAIL_BASE_URL || "https://api.agentmail.to/v0";
      if (
        ![
          "https://api.agentmail.to/v0",
          "https://api.agentmail.eu/v0",
        ].includes(base)
      )
        throw new Error("Unsupported email API host");
      const response = await fetch(
        `${base}/inboxes/${encodeURIComponent(inbox)}/messages/send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: [identifier],
            subject: `${token} — ${purpose} for Taut`,
            text: `Your Taut ${purpose.toLowerCase()} code is: ${token}\n\nEnter it in the Taut window where you requested it. This code expires in 10 minutes and can only be used once. Never share it.\n\nIf you did not request this, you can ignore this email.`,
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok) {
        console.error("Auth email delivery failed", {
          status: response.status,
        });
        throw new ConvexError(
          "We could not send the email. Please try again later.",
        );
      }
    },
  });
}
const password = Password<DataModel>({
  validatePasswordRequirements(password) {
    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 128
    )
      throw new ConvexError("Use a password between 10 and 128 characters.");
  },
  profile(params) {
    return { email: params.email as string };
  },
  verify: emailCode("taut-verify", "Email verification"),
  reset: emailCode("taut-reset", "Password reset"),
});
// Retain the library's hashing, verification, and session lifecycle.
const options = (
  password as typeof password & {
    options: ConvexCredentialsUserConfig<DataModel>;
  }
).options;
const authorize = options.authorize;
options.authorize = async (params, ctx) => {
  const email =
    typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ConvexError("Enter a valid email address.");
  for (const field of ["password", "newPassword"])
    if (
      params[field] !== undefined &&
      (typeof params[field] !== "string" || params[field].length > 128)
    )
      throw new ConvexError("Invalid password length.");
  await ctx.runMutation(internal.accounts.reserveAuth, { email });
  return authorize({ ...params, email }, ctx);
};
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [password],
  signIn: { maxFailedAttempsPerHour: 8 },
});
