"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { events } from "@/lib/demo-data";
import { formatEventDateRange, readStoredEvents, type StoredEvent } from "@/lib/events-storage";
import { Icon, Progress } from "@/components/ui";

const deletedEventsKey = "sponsorproof.deleted-events.v1";

export function DashboardEvents() {
  const [createdEvents, setCreatedEvents] = useState<StoredEvent[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  useEffect(() => {
    setCreatedEvents(readStoredEvents());
    try {
      const storedIds: unknown = JSON.parse(localStorage.getItem(deletedEventsKey) ?? "[]");
      if (Array.isArray(storedIds)) setDeletedIds(storedIds.filter((id): id is string => typeof id === "string"));
    } catch {
      setDeletedIds([]);
    }
  }, []);

  const featuredEvents = [
    ...events.map((event) => ({
      id: event.id,
      title: event.title,
      date: event.date,
      location: event.location,
      status: event.status,
      sponsorship: event.sponsorship,
      sponsors: event.sponsors,
      completed: event.completed,
      benefits: event.benefits,
    })),
    ...createdEvents.map((event) => ({
      id: event.id,
      title: event.title,
      date: formatEventDateRange(event.startDate, event.endDate),
      location: event.location,
      status: "In Vorbereitung",
      sponsorship: 0,
      sponsors: 0,
      completed: 0,
      benefits: 0,
    })),
  ].filter((event) => !deletedIds.includes(event.id)).slice(0, 3);

  return <>
    <div className="dashboard-event-list">
      {featuredEvents.map((event) => <Link href={`/events/${event.id}`} className="dashboard-event-row" key={event.id}>
        <div className="dashboard-event-primary"><span className="dashboard-event-date">{event.date}</span><h3>{event.title}</h3><span className="event-location"><Icon name="pin" size={13}/>{event.location}</span></div>
        <div className="dashboard-event-facts"><div className="dashboard-event-fact"><small>Sponsoringvolumen</small><b>{event.sponsorship.toLocaleString("de-DE")} €</b></div><div className="dashboard-event-fact"><small>Sponsoren</small><b>{event.sponsors}</b></div><div className="dashboard-event-fact"><small>Status</small><span className="status status-progress">{event.status}</span></div><div className="dashboard-event-progress"><span>{event.completed} von {event.benefits} Leistungen erledigt</span><Progress value={event.benefits ? Math.round(event.completed / event.benefits * 100) : 0}/></div></div>
      </Link>)}
      {featuredEvents.length === 0 && <div className="dashboard-event-empty">Noch keine Events angelegt.</div>}
    </div>
    <Link className="btn btn-primary dashboard-section-link" href="/events">Alle Events ansehen <Icon name="arrow" size={14}/></Link>
  </>;
}
