import { PageHeading } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Einstellungen", "Verwalte deine Veranstalterdaten, Teammitglieder, Vertragsvorlagen und Tarife.");

export default function SettingsPage() {
  return <main className="content">
    <PageHeading eyebrow="VERANSTALTERBEREICH" title="Einstellungen" subtitle="Stammdaten, Vertragsvorlagen, Tarife und Team an einem Ort." />
    <SettingsForm />
  </main>;
}
