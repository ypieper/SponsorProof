import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Bausteine", "Verwalte wiederverwendbare Sponsoring-Leistungen für deine Verträge.");

export default function BenefitsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
