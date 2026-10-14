import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Passwort zurücksetzen", "Vergib ein neues Passwort für dein sponso-Konto.");

export default function ResetPasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
