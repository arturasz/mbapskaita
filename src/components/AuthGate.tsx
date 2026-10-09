import { useEffect, useRef, useState, type ReactNode } from "react";
import { migrateLocalToRemote } from "../storage";

const GOOGLE_CLIENT_ID =
  "24158284298-q4nhfmn1vf40c2bqt6q34ovsp7aejtpi.apps.googleusercontent.com";

interface GoogleId {
  initialize: (config: {
    client_id: string;
    callback: (r: { credential: string }) => void;
  }) => void;
  renderButton: (el: HTMLElement, options: Record<string, string>) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

type State = "checking" | "signed-out" | "signed-in" | "denied";

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google) return resolve();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google script failed"));
    document.head.appendChild(script);
  });
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth").then(async (res) => {
      if (res.ok) {
        await migrateLocalToRemote().catch(console.error);
        setState("signed-in");
      } else {
        setState("signed-out");
      }
    });
  }, []);

  useEffect(() => {
    if (state !== "signed-out" && state !== "denied") return;
    loadGoogleScript().then(() => {
      const google = window.google!.accounts.id;
      google.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          const res = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential }),
          });
          if (res.ok) {
            await migrateLocalToRemote().catch(console.error);
            setState("signed-in");
          } else {
            setState("denied");
          }
        },
      });
      if (buttonRef.current) {
        google.renderButton(buttonRef.current, { theme: "outline", size: "large" });
      }
    });
  }, [state]);

  if (state === "signed-in") return <>{children}</>;
  if (state === "checking") return null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">MB apskaita</h1>
      {state === "denied" && (
        <p className="text-red-600">Šis paskyra neturi prieigos.</p>
      )}
      <div ref={buttonRef} />
    </div>
  );
}
