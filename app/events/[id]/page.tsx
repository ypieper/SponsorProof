import Link from "next/link";
import { benefits, blocks, events, sponsors, sponsorContracts } from "@/lib/demo-data";
import { CustomEventPage } from "@/components/custom-event-page";
import { EventOverviewDetails } from "@/components/event-overview-details";
import { EventReports } from "@/components/event-reports";
import { EventSponsorsOverview } from "@/components/event-sponsors-overview";
import { EventSponsorDetail } from "@/components/event-sponsor-detail";
import { TasksOverview } from "@/components/tasks-overview";
import { Icon, Metric, PageHeading, Tabs } from "@/components/ui";

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; sponsor?: string }> }) {
  const { id } = await params;
  const event = events.find((item) => item.id === id);
  if (!event) return <CustomEventPage eventId={id} />;
  const { tab, sponsor: sponsorId } = await searchParams;
  const active = tab === "sponsoren" ? "Sponsoren" : tab === "aufgaben-nachweise" ? "Aufgaben & Nachweise" : tab === "reports" ? "Reports" : "Übersicht";
  const selectedSponsor = sponsors.find((item) => item.id === sponsorId);
  const selectedContract = sponsorContracts.find((contract) => contract.eventId === id && contract.sponsorId === selectedSponsor?.id);
  const selectedBenefits = benefits.filter((benefit) => benefit.eventId === id && benefit.sponsorId === selectedSponsor?.id);
  const eventSponsors = sponsorContracts.filter((contract) => contract.eventId === id).map((contract) => sponsors.find((sponsor) => sponsor.id === contract.sponsorId)).filter((sponsor): sponsor is (typeof sponsors)[number] => sponsor !== undefined);
  const tabItems = [
    { label: "Übersicht", href: `/events/${id}` },
    { label: "Sponsoren", href: `/events/${id}?tab=sponsoren` },
    { label: "Aufgaben & Nachweise", href: `/events/${id}?tab=aufgaben-nachweise` },
    { label: "Reports", href: `/events/${id}?tab=reports` },
  ];

  return <main className="content">
    <PageHeading eyebrow="EVENT · IN VORBEREITUNG" title={event.title} subtitle="Kennzahlen, Vereinbarungen und Aufgaben an einem Ort." action={<Link className="btn btn-primary" href="/event-modus"><Icon name="camera" size={16} /> Event-Modus</Link>} />
    <Tabs items={tabItems} active={active} />

    {active === "Übersicht" && <>
      <section className="metric-grid"><Metric label="Sponsoringvolumen" value={`${event.sponsorship.toLocaleString("de-DE")} €`} icon="spark" /><Metric label="Sponsoren" value={`${event.sponsors}`} icon="users" /><Metric label="Leistungen" value={`${event.benefits}`} icon="check" /><Metric label="Erledigt" value={`${Math.round(event.completed / event.benefits * 100)} %`} note={`${event.completed} von ${event.benefits}`} icon="layers" /></section>
      <EventOverviewDetails eventId={event.id} initialDetails={{ startDate: "2027-05-31", endDate: "2027-06-05", location: event.location, responsible: "Maria Krüger" }} />
    </>}

    {active === "Sponsoren" && selectedSponsor && selectedContract ? <EventSponsorDetail eventId={id} eventTitle={event.title} sponsor={selectedSponsor} contract={selectedContract} baseBenefits={selectedBenefits} blocks={blocks} /> : active === "Sponsoren" ? <EventSponsorsOverview eventId={id} sponsors={eventSponsors} contracts={sponsorContracts.filter((contract) => contract.eventId === id)} benefits={benefits.filter((benefit) => benefit.eventId === id)} /> : null}

    {active === "Aufgaben & Nachweise" && <TasksOverview eventFilter={id} embedded />}

    {active === "Reports" && <EventReports eventId={id} eventTitle={event.title} sponsors={eventSponsors} contracts={sponsorContracts.filter((contract) => contract.eventId === id)} benefits={benefits.filter((benefit) => benefit.eventId === id)} />}
  </main>;
}
