import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import { Navbar } from "./Navbar";
import { usePrivacyStore } from "../stores/privacy-store";
import { setPrivacy } from "../lib/privacy";

export function Layout() {
  const on = usePrivacyStore((s) => s.on);
  // Apply the saved choice once the page content exists.
  useEffect(() => {
    setPrivacy(on);
  }, [on]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
