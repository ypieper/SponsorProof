import { OrganizerOnboarding } from "@/components/organizer-onboarding";
import { privatePageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Zugang einrichten", "Ergänze deine Unternehmens- und Profildaten.");

export default function OnboardingPage() {
  return <OrganizerOnboarding/>;
}
