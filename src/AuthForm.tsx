import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { errorText } from "./errors";

type Flow =
  "signIn" | "signUp" | "reset" | "email-verification" | "reset-verification";
export function AuthForm() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<Flow>("signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const verification = flow.endsWith("verification");
  const label =
    flow === "signUp"
      ? "Create my account"
      : flow === "signIn"
        ? "Sign in"
        : flow === "reset"
          ? "Send reset code"
          : flow === "reset-verification"
            ? "Reset password"
            : "Verify email";
  function change(next: Flow) {
    setFlow(next);
    setError("");
    setCode("");
    setPassword("");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await signIn("password", {
        flow,
        email: email.trim().toLowerCase(),
        ...(flow === "reset-verification"
          ? { newPassword: password }
          : { password }),
        ...(verification ? { code: code.trim().toUpperCase() } : {}),
      });
      if (!result.signingIn) {
        if (flow === "reset") change("reset-verification");
        else if (flow === "signUp" || flow === "signIn")
          change("email-verification");
      }
    } catch (e) {
      if (flow === "reset") {
        // Same visible response whether or not the account exists.
        change("reset-verification");
      } else
        setError(
          errorText(
            e,
            verification
              ? "That code is invalid or expired. Request a new one and try again."
              : "Unable to sign in. Check your details, or sign in if you already have an account.",
          ),
        );
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      {verification ? (
        <>
          <h2>
            {flow === "reset-verification"
              ? "Check your email"
              : "One last step"}
          </h2>
          <p className="muted">
            If your request was accepted, a 10-character code was sent to{" "}
            {email}. Check your spam folder too. It expires in 10 minutes.
          </p>
          <label>
            Email code
            <input
              aria-label="Email code"
              autoComplete="one-time-code"
              autoFocus
              required
              minLength={10}
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
        </>
      ) : (
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      )}
      {(flow === "signUp" ||
        flow === "signIn" ||
        flow === "reset-verification") && (
        <label>
          {flow === "reset-verification" ? "New password" : "Password"}
          <input
            type="password"
            autoComplete={
              flow === "signIn" ? "current-password" : "new-password"
            }
            required
            minLength={flow === "signIn" ? 1 : 10}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      {flow === "signUp" && (
        <small>
          Use at least 10 characters. We'll email a verification code.
        </small>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" disabled={pending} type="submit">
        {pending ? "Please wait…" : label}
      </button>
      <div className="auth-links">
        <button
          className="text-btn"
          type="button"
          disabled={pending}
          onClick={() => change(flow === "signIn" ? "signUp" : "signIn")}
        >
          {flow === "signIn" ? "Create an account" : "Back to sign in"}
        </button>
        {flow === "signIn" && (
          <button
            className="text-btn"
            type="button"
            onClick={() => change("reset")}
          >
            Forgot password?
          </button>
        )}
        {verification && (
          <button
            className="text-btn"
            type="button"
            disabled={pending}
            onClick={() =>
              change(flow === "reset-verification" ? "reset" : "signIn")
            }
          >
            Request a new code
          </button>
        )}
      </div>
    </form>
  );
}
