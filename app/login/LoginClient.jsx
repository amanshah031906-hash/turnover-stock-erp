"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/app/actions";

export default function LoginClient() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await login({ username: username.trim(), password: password });
    setLoading(false);
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError(res.message || "Could not log in.");
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
      <form onSubmit={handleSubmit} style={{ width: 340, border: "1px solid var(--line)", padding: 32 }}>
        <div className="wordmark" style={{ marginBottom: 4 }}>
          TURN,OVER.
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 24 }}>
          Stock &amp; Design ERP — sign in
        </p>

        <div className="field">
          <label>Username</label>
          <input value={username} onChange={function (e) { setUsername(e.target.value); }} autoFocus />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={function (e) { setPassword(e.target.value); }} />
        </div>

        {error && (
          <p style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 14 }}>{error}</p>
        )}

        <button type="submit" className="btn" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}