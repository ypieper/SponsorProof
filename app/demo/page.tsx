import type { Metadata } from "next";
import { PublicPageFrame } from "@/components/public-page-frame";
import { ProductDemo } from "@/components/product-demo";

export const metadata: Metadata = {
  title: "pacct live erleben – Produktdemo",
  description: "Entdecke den Sponsoringablauf in pacct anhand eines interaktiven, schreibgeschützten Beispiel-Events.",
  alternates: { canonical: "/demo" },
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return <PublicPageFrame brandHref="/">
    <ProductDemo />
  </PublicPageFrame>;
}
