"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { Spinner } from "@/components/Spinner";

export default function AuthPage() {
  const { create, login, loading, error, account, storedAccounts } = useWallet();
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<"welcome" | "create" | "accounts">("welcome");
  const router = useRouter();

  useEffect(() => {
    if (account) {
      router.replace("/dashboard");
    }
  }, [account, router]);

  if (account) {
    return null;
  }

  async function handleCreate() {
    if (!username.trim()) return;
    await create(username.trim());
    router.replace("/dashboard");
  }

  async function handleLogin(credentialId?: string) {
    await login(credentialId);
    router.replace("/dashboard");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-10">
        {/* Brand */}
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">Cannes</h1>
          <p className="text-secondary text-sm">Private payments, simplified</p>
        </div>

        {error && (
          <div className="rounded-2xl bg-red/10 px-4 py-3 text-sm text-red text-center">
            {error}
          </div>
        )}

        {mode === "welcome" && (
          <div className="space-y-3">
            <button
              onClick={() => setMode("create")}
              className="w-full h-14 rounded-2xl bg-accent text-white text-base font-semibold hover:bg-accent-hover transition-colors"
            >
              Create Wallet
            </button>
            <button
              onClick={() =>
                storedAccounts.length > 0
                  ? setMode("accounts")
                  : handleLogin()
              }
              className="w-full h-14 rounded-2xl bg-elevated text-primary text-base font-medium hover:bg-line transition-colors"
            >
              Sign In
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="space-y-5">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Choose a username"
              className="w-full h-14 rounded-2xl bg-elevated border border-line px-5 text-primary text-base placeholder:text-tertiary focus:outline-none focus:border-accent"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={loading || !username.trim()}
              className="w-full h-14 rounded-2xl bg-accent text-white text-base font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40"
            >
              {loading ? <Spinner /> : "Create Wallet"}
            </button>
            <button
              onClick={() => setMode("welcome")}
              className="w-full text-sm text-secondary hover:text-primary transition-colors"
            >
              Back
            </button>
          </div>
        )}

        {mode === "accounts" && (
          <div className="space-y-3">
            {storedAccounts.map((acc) => (
              <button
                key={acc.credentialId}
                onClick={() => handleLogin(acc.credentialId)}
                disabled={loading}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-elevated hover:bg-line transition-colors text-left disabled:opacity-40"
              >
                <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center text-lg font-bold">
                  {acc.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-primary">{acc.username}</p>
                  <p className="text-xs text-tertiary">{acc.credentialId.slice(0, 16)}...</p>
                </div>
              </button>
            ))}
            <button
              onClick={() => handleLogin()}
              disabled={loading}
              className="w-full h-14 rounded-2xl bg-elevated text-primary text-base font-medium hover:bg-line transition-colors disabled:opacity-40"
            >
              {loading ? <Spinner /> : "Use Another Passkey"}
            </button>
            <button
              onClick={() => setMode("welcome")}
              className="w-full text-sm text-secondary hover:text-primary transition-colors"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
