import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Sponsoren", "Verwalte Sponsorstammdaten und Eventvereinbarungen zentral.");

export default function SponsorsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
