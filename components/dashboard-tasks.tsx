"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EmptyState, Icon } from "@/components/ui";
import { fetchStoredEventsFromDatabase, formatEventDate } from "@/lib/events-storage";
import { fetchSponsorRecords } from "@/lib/sponsors-storage";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchStoredBenefits } from "@/lib/benefits-storage";
import { fetchStoredTasks } from "@/lib/tasks-storage";
import { fetchStoredEvidence } from "@/lib/evidence-storage";

type DashboardTask = { id: string; title: string; eventId: string; eventTitle: string; sponsor: string; dueAt: string };

export function DashboardTasks() {
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [visibleCount, setVisibleCount] = useState(5);
  const [ready, setReady] = useState(false);
  const taskListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTasks() {
      try {
        const [evidenceResult, eventResult, sponsorResult, benefitResult, taskResult] = await Promise.all([
          fetchStoredEvidence(),
          isSupabaseConfigured ? fetchStoredEventsFromDatabase().catch(() => null) : Promise.resolve(null),
          isSupabaseConfigured ? fetchSponsorRecords().catch(() => null) : Promise.resolve(null),
          isSupabaseConfigured ? fetchStoredBenefits().catch(() => null) : Promise.resolve(null),
          isSupabaseConfigured ? fetchStoredTasks().catch(() => null) : Promise.resolve(null),
        ]);
        if (evidenceResult.error || benefitResult?.error || taskResult?.error) throw new Error("Aufgabendaten konnten nicht geladen werden.");
        if (cancelled) return;

        const events = eventResult?.data ?? [];
        const eventNames = Object.fromEntries(events.map((event) => [event.id, event.title]));
        const sponsorNames = Object.fromEntries((sponsorResult?.data ?? []).map(({ sponsor }) => [sponsor.id, sponsor.name]));
        const openTasks: DashboardTask[] = [];

        const evidenceIds = new Set((evidenceResult.data ?? []).map((item) => item.taskId));
        (benefitResult?.data ?? []).forEach((benefit) => {
          const taskId = `benefit-${benefit.id}`;
          const completed = evidenceIds.has(taskId) || Boolean(benefit.evidence && benefit.evidence !== "Noch kein Nachweis") || benefit.status === "Erledigt" || benefit.status === "Erfüllt";
          if (completed) return;
          openTasks.push({
            id: taskId,
            title: benefit.title,
            eventId: benefit.eventId,
            eventTitle: eventNames[benefit.eventId] ?? "Event",
            sponsor: sponsorNames[benefit.sponsorId ?? ""] ?? "",
            dueAt: benefit.dueAt ?? "",
          });
        });

        (taskResult?.data ?? []).filter((task) => task.source === "Manuell").forEach((task) => {
          const completed = evidenceIds.has(task.id) || task.status === "Erledigt";
          if (completed) return;
          openTasks.push({
            id: task.id,
            title: task.title,
            eventId: task.event_id ?? "",
            eventTitle: eventNames[task.event_id ?? ""] ?? "Event",
            sponsor: sponsorNames[task.sponsor_id ?? ""] ?? task.sponsor_name ?? "",
            dueAt: task.due_at ?? "",
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
