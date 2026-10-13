"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EmptyState, Icon } from "@/components/ui";
import { fetchStoredEventsFromDatabase, formatEventDate, readStoredEvents } from "@/lib/events-storage";
import { fetchSponsorRecords } from "@/lib/sponsors-storage";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchStoredBenefits, syncLegacyBenefitsToSupabase } from "@/lib/benefits-storage";

type Benefit = { id?: string; title: string; sponsorId?: string; eventId?: string; dueAt?: string; evidence?: string; status?: string };
type ManualTask = { id: string; title: string; sponsor?: string; sponsorId?: string; eventId?: string; eventTitle?: string; dueAt?: string; due?: string; status?: string };
type DashboardTask = { id: string; title: string; eventId: string; eventTitle: string; sponsor: string; dueAt: string };

const benefitsKey = "sponsorproof.additional-benefits.v1";
const manualTasksKey = "sponsorproof.manual-tasks.v1";
const statusOverridesKey = "sponsorproof.task-status-overrides.v1";
const evidenceDatabase = "sponsorproof-evidence";
const evidenceStore = "proofs";

function readStoredValue<T>(key: string, fallback: T): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return value == null ? fallback : value as T;
  } catch {
    return fallback;
  }
}

function readEvidenceIds(): Promise<Set<string>> {
  return new Promise((resolve) => {
    const request = indexedDB.open(evidenceDatabase, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(evidenceStore)) request.result.createObjectStore(evidenceStore, { keyPath: "taskId" });
    };
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(evidenceStore)) {
        database.close();
        resolve(new Set());
        return;
      }
      const read = database.transaction(evidenceStore, "readonly").objectStore(evidenceStore).getAllKeys();
      read.onsuccess = () => { resolve(new Set(read.result.map(String))); database.close(); };
      read.onerror = () => { resolve(new Set()); database.close(); };
    };
    request.onerror = () => resolve(new Set());
  });
}

export function DashboardTasks() {
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [visibleCount, setVisibleCount] = useState(5);
  const [ready, setReady] = useState(false);
  const taskListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTasks() {
      try {
        const benefits = readStoredValue<Benefit[]>(benefitsKey, []);
        if (isSupabaseConfigured) {
          const legacyBenefits = benefits.filter((benefit): benefit is Benefit & { eventId: string; sponsorId: string } => Boolean(benefit.eventId && benefit.sponsorId));
          const syncResult = await syncLegacyBenefitsToSupabase(legacyBenefits);
          if (syncResult.error) throw syncResult.error;
        }
        const manualTasks = readStoredValue<ManualTask[]>(manualTasksKey, []);
        const statusOverrides = readStoredValue<Record<string, string>>(statusOverridesKey, {});
        const [evidenceIds, eventResult, sponsorResult, benefitResult] = await Promise.all([
          readEvidenceIds(),
          isSupabaseConfigured ? fetchStoredEventsFromDatabase().catch(() => null) : Promise.resolve(null),
          isSupabaseConfigured ? fetchSponsorRecords().catch(() => null) : Promise.resolve(null),
          isSupabaseConfigured ? fetchStoredBenefits().catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        const events = eventResult?.data ?? readStoredEvents();
        const eventNames = Object.fromEntries(events.map((event) => [event.id, event.title]));
        const sponsorNames = Object.fromEntries((sponsorResult?.data ?? []).map(({ sponsor }) => [sponsor.id, sponsor.name]));
        const openTasks: DashboardTask[] = [];

        const databaseBenefits: Benefit[] = (benefitResult?.data ?? []).flatMap((benefit) => benefit.sponsorId ? [{
          id: benefit.id,
          title: benefit.title,
          sponsorId: benefit.sponsorId,
          eventId: benefit.eventId,
          dueAt: benefit.dueAt,
          evidence: benefit.evidence,
          status: benefit.status,
        }] : []);
        const databaseBenefitKeys = new Set(databaseBenefits.map((benefit) => `${benefit.eventId}:${benefit.sponsorId}:${benefit.title.trim().toLocaleLowerCase("de-DE")}`));
        const allBenefits = [...databaseBenefits, ...benefits.filter((benefit) => !databaseBenefitKeys.has(`${benefit.eventId}:${benefit.sponsorId}:${benefit.title.trim().toLocaleLowerCase("de-DE")}`))];
        allBenefits.forEach((benefit, index) => {
          const taskId = benefit.id
            ? `benefit-${benefit.id}`
            : `benefit-${benefit.eventId}-${benefit.title.toLocaleLowerCase("de-DE").replace(/[^a-z0-9]+/g, "-")}`;
          const completed = evidenceIds.has(taskId)
            || statusOverrides[taskId] === "Erledigt"
            || Boolean(benefit.evidence && benefit.evidence !== "Noch kein Nachweis")
            || benefit.status === "Erledigt"
            || benefit.status === "Erfüllt";
          if (completed) return;
          openTasks.push({
            id: taskId || `benefit-${index}`,
            title: benefit.title,
            eventId: benefit.eventId ?? "",
            eventTitle: eventNames[benefit.eventId ?? ""] ?? "Event",
            sponsor: sponsorNames[benefit.sponsorId ?? ""] ?? "",
            dueAt: benefit.dueAt ?? "",
          });
        });

        manualTasks.forEach((task) => {
          const completed = evidenceIds.has(task.id) || task.status === "Erledigt";
          if (completed) return;
          openTasks.push({
            id: task.id,
            title: task.title,
            eventId: task.eventId ?? "",
            eventTitle: eventNames[task.eventId ?? ""] ?? task.eventTitle ?? "Event",
            sponsor: sponsorNames[task.sponsorId ?? ""] ?? task.sponsor ?? "",
            dueAt: task.dueAt ?? (/^\d{4}-\d{2}-\d{2}$/.test(task.due ?? "") ? task.due! : ""),
          });
        });

        openTasks.sort((a, b) => {
          if (!a.dueAt) return b.dueAt ? 1 : a.title.localeCompare(b.title, "de");
          if (!b.dueAt) return -1;
          return a.dueAt.localeCompare(b.dueAt);
        });
        setTasks(openTasks);
      } catch {
        if (!cancelled) setTasks([]);
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void loadTasks();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const list = taskListRef.current;
    const eventList = document.querySelector<HTMLElement>(".dashboard-event-list");
    if (!list || !eventList) return;

    const updateVisibleCount = () => {
      if (window.matchMedia("(max-width: 1050px)").matches) {
        setVisibleCount(Math.min(tasks.length, 5));
        return;
      }
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".dashboard-task-row"));
      if (!rows.length) return;
      const averageRowHeight = rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0) / rows.length;
      const eventListHeight = eventList.getBoundingClientRect().height;
      if (!averageRowHeight || !eventListHeight) return;
      setVisibleCount(Math.min(tasks.length, Math.max(1, Math.ceil(eventListHeight / averageRowHeight))));
    };

    updateVisibleCount();
    const observer = new ResizeObserver(updateVisibleCount);
    observer.observe(eventList);
    observer.observe(list);
    return () => observer.disconnect();
  }, [tasks]);

  return <div className="task-list" ref={taskListRef}>
    {!ready ? <p className="task-empty">Aufgaben werden geladen …</p> : tasks.length ? tasks.map((task) => <Link className="task-row dashboard-task-row" href={task.eventId ? `/events/${task.eventId}?tab=aufgaben-nachweise` : "/aufgaben"} key={task.id}>
      <span className="task-check"><Icon name="clock" size={14}/></span>
      <span className="dashboard-task-copy"><span className="task-title">{task.title}</span><span className="task-caption">{[task.sponsor, task.eventTitle].filter(Boolean).join(" · ")}</span></span>
      <span className={`task-date ${task.dueAt && task.dueAt < new Date().toISOString().slice(0, 10) ? "overdue" : ""}`}>{task.dueAt ? formatEventDate(task.dueAt, { day: "2-digit", month: "short" }) : "Ohne Termin"}</span>
    </Link>).slice(0, visibleCount) : <EmptyState className="empty-state-compact" title="Keine offenen Aufgaben" description="Sobald offene Leistungen oder Aufgaben vorhanden sind, erscheinen hier die nächsten Fälligkeiten." action={<Link className="btn" href="/aufgaben">Zu den Aufgaben</Link>} />}
  </div>;
}
