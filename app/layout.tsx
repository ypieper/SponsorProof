import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { EventEntitlementsProvider } from "@/components/event-entitlements";

export const metadata: Metadata = {
  title: "sponso – Sponsoring einfach im Blick",
  description: "Sponsoren, Leistungen und Nachweise für deine Veranstaltung an einem Ort.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body><EventEntitlementsProvider><AppShell>{children}</AppShell></EventEntitlementsProvider></body>
    </html>
  );
}
