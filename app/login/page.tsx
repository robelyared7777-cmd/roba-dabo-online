"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    setBusy(true);
    setErr("");

    try {
      const sb = supabaseBrowser();

      /*
       * Sign in only on THIS browser/device.
       */
      const { data, error } =
        await sb.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

      if (error) {
        setErr(error.message);
        return;
      }

      if (!data.user) {
        setErr("Login failed. Please try again.");
        return;
      }

      /*
       * Check whether this account is active.
       */
      const {
        data: profile,
        error: profileError,
      } = await sb
        .from("profiles")
        .select("active")
        .eq("id", data.user.id)
        .single();

      if (profileError) {
        await sb.auth.signOut();

        setErr(
          "Could not load your account profile. Please try again."
        );

        return;
      }

      if (!profile?.active) {
        await sb.auth.signOut();

        setErr(
          "This Roba Dabo account is disabled. Contact the CEO or administrator."
        );

        return;
      }

      /*
       * Login successful.
       */
      router.replace("/dashboard");
    } catch (error) {
      console.error("Login error:", error);

      setErr(
        error instanceof Error
          ? error.message
          : "Something went wrong during login."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form
        className="loginbox"
        onSubmit={submit}
      >
        <h1>ROBA DABO</h1>

        <p>
          Online Bread Shop Management
        </p>

        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
          required
          disabled={busy}
        />

        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          required
          disabled={busy}
        />

        <button
          className="btn primary"
          style={{ width: "100%" }}
          disabled={busy}
          type="submit"
        >
          {busy
            ? "Signing in..."
            : "Sign in"}
        </button>

        {err && (
          <p className="notice">
            {err}
          </p>
        )}
      </form>
    </main>
  );
}