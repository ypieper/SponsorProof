import { PageHeading } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";

export default function SettingsPage() {
  return <main className="content">
    <PageHeading eyebrow="VERANSTALTERBEREICH" title="Einstellungen" subtitle="Verwalte die Angaben zu deinem Veranstalter und deiner Ansprechperson." />
    <SettingsForm />
  </main>;
}
