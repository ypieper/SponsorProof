import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { EventEntitlementsProvider } from "@/components/event-entitlements";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sponsor-proof.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "pacct",
  title: { default: "pacct – Sponsoring einfach im Blick", template: "%s | pacct" },
  description: "Verwalte Sponsoren, Vereinbarungen, Leistungen, Aufgaben und Nachweise für deine Veranstaltungen an einem Ort.",
  keywords: ["Sponsoring verwalten", "Sponsorenmanagement", "Event-Sponsoring", "Sponsoring-Nachweise", "Festival organisieren"],
  icons: { icon: "/pacct-logo.svg" },
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "pacct",
    title: "pacct – Sponsoring einfach im Blick",
    description: "Sponsoren, Vereinbarungen, Leistungen und Nachweise für Veranstaltungen zentral verwalten.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "pacct – Sponsoring einfach im Blick",
    description: "Sponsoren, Vereinbarungen, Leistungen und Nachweise für Veranstaltungen zentral verwalten.",
  },
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body><EventEntitlementsProvider><AppShell>{children}</AppShell></EventEntitlementsProvider></body>
    </html>
  );
}
