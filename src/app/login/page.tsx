"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import PasswordInput from "@/components/PasswordInput";

function friendlyError(err) {
  if (err?.code === "custom/name-required") return "Tell us what to call you.";

  const message = (err?.message || "").toLowerCase();
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "An account already exists for that email.";
  }
  if (message.includes("invalid login credentials") || message.includes("invalid credentials")) {
    return "Email or password is incorrect.";
  }
  if (message.includes("password should be") || message.includes("weak password")) {
    return "Password should be at least 6 characters.";
  }
  if (message.includes("email not confirmed")) {
    return "Please confirm your email, then sign in.";
  }
  if (message.includes("unable to validate email") || message.includes("invalid email")) {
    return "That email doesn't look right.";
  }
  return err?.message || "Something went wrong. Try again.";
}

export default function LoginPage() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, signup, loginWithGoogle } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signin") {
        await login(email, password);
      } else {
        if (!name.trim()) throw { code: "custom/name-required" };
        await signup(email, password, name.trim());
      }
      router.replace("/chat");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      // Redirects to Google; the /chat redirect happens after the callback.
      await loginWithGoogle();
    } catch (err) {
      setError(friendlyError(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <PriChatMark />
          <span className="font-display text-2xl font-semibold tracking-tight">PriChat</span>
        </div>
        <h1 className="sr-only">
          PriChat — Free realtime private chat rooms with voice messages and video calls
        </h1>
        <p className="mb-8 text-center text-sm text-textSecondary">
          Realtime private chat rooms · voice messages · audio &amp; video calls
        </p>

        <div className="bg-surface border border-border rounded-2xl p-6">
          <div className="flex mb-6 rounded-lg bg-bg border border-border p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                mode === "signin" ? "bg-accent text-bg font-medium" : "text-textSecondary"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                mode === "signup" ? "bg-accent text-bg font-medium" : "text-textSecondary"
              }`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Display name"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-bg font-medium text-sm rounded-lg py-2.5 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="flex items-center gap-2 my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-textSecondary">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 border border-border rounded-lg py-2.5 text-sm hover:bg-surfaceHover transition-colors disabled:opacity-50"
          >
            <GoogleIcon />
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}

function PriChatMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
      <path
        d="M4 14L11 7M11 7L8 7M11 7L11 10"
        stroke="#4FD1C5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 14L17 21M17 21L20 21M17 21L17 18"
        stroke="#ECEDEE"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92a8.78 8.78 0 0 0 2.68-6.6z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.81.55-1.85.87-3.04.87a5.41 5.41 0 0 1-5.1-3.73H.86v2.34A9 9 0 0 0 9 18z"
      />
      <path fill="#FBBC05" d="M3.9 10.69a5.41 5.41 0 0 1 0-3.38V5H.86v8z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.59 8.59 0 0 0 9 0 9 9 0 0 0 .86 5l3.04 2.31A5.4 5.4 0 0 1 9 3.58z"
      />
    </svg>
  );
}
