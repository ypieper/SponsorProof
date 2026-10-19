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
import { createClient } from "@/lib/supabase/client";
import type { DashboardTaskSummary } from "@/components/dashboard-metrics";

type DashboardTask = { id: string; title: string; eventId: string; eventTitle: string; sponsor: string; dueAt: string; publishReady: boolean };

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DashboardTasks({ onSummaryChange }: { onSummaryChange: (summary: DashboardTaskSummary | null) => void }) {
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [visibleCount, setVisibleCount] = useState(5);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const taskListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTasks() {
      setReady(false);
      setLoadError("");
      setTasks([]);
      onSummaryChange(null);
      try {
        const [evidenceResult, eventResult, sponsorResult, benefitResult, taskResult, userResult] = await Promise.all([
          fetchStoredEvidence(),
          isSupabaseConfigured ? fetchStoredEventsFromDatabase() : Promise.resolve(null),
          isSupabaseConfigured ? fetchSponsorRecords() : Promise.resolve(null),
          isSupabaseConfigured ? fetchStoredBenefits() : Promise.resolve(null),
          isSupabaseConfigured ? fetchStoredTasks() : Promise.resolve(null),
          isSupabaseConfigured ? createClient().auth.getUser() : Promise.resolve({ data: { user: null }, error: null }),
        ]);
        if (evidenceResult.error || eventResult?.error || sponsorResult?.error || benefitResult?.error || taskResult?.error || userResult.error) throw new Error("Aufgabendaten konnten nicht geladen werden.");
        if (cancelled) return;

        const userId = userResult.data.user?.id;
        const events = eventResult?.data ?? [];
        const eventNames = Object.fromEntries(events.map((event) => [event.id, event.title]));
        const sponsorNames = Object.fromEntries((sponsorResult?.data ?? []).map(({ sponsor }) => [sponsor.id, sponsor.name]));
        const openTasks: DashboardTask[] = [];

        const evidenceIds = new Set((evidenceResult.data ?? []).map((item) => item.taskId));
        const storedTasks = taskResult?.data ?? [];
        const benefitsById = new Map((benefitResult?.data ?? []).map((benefit) => [benefit.id, benefit]));
        const quantityBoundTasks = storedTasks.filter((task) => {
          if (task.source !== "Leistung") return true;
          if (!task.benefit_id) return false;
          const benefit = benefitsById.get(task.benefit_id);
          return Boolean(benefit && benefit.completionRequired !== false && task.workflow_instance <= (benefit.tasksPerUnit ? benefit.quantity : 1));
        });
        quantityBoundTasks.filter((task) => task.source === "Leistung" || task.source === "Manuell").filter((task) => Boolean(userId && task.assigned_to === userId && !task.assigned_to_sponsor)).forEach((task) => {
          const completed = evidenceIds.has(task.id) || task.status === "Erledigt";
          const publishReady = task.publish_ready && task.assigned_to === userId;
          if (completed && !publishReady) return;
          openTasks.push({
            id: task.id,
            title: task.title,
            eventId: task.event_id ?? "",
            eventTitle: eventNames[task.event_id ?? ""] ?? "Event",
            sponsor: sponsorNames[task.sponsor_id ?? ""] ?? task.sponsor_name ?? "",
            dueAt: task.due_at ?? "",
            publishReady,
          });
        });

        const now = new Date();
        const today = localDateKey(now);
        const weekAhead = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
        const weekAheadKey = `${weekAhead.getFullYear()}-${String(weekAhead.getMonth() + 1).padStart(2, "0")}-${String(weekAhead.getDate()).padStart(2, "0")}`;
        const priority = (task: DashboardTask) => task.publishReady ? 2 : task.dueAt && task.dueAt < today ? 0 : task.dueAt && task.dueAt <= weekAheadKey ? 1 : 3;
        openTasks.sort((a, b) => {
          const priorityDifference = priority(a) - priority(b);
          if (priorityDifference) return priorityDifference;
          if (!a.dueAt) return b.dueAt ? 1 : a.title.localeCompare(b.title, "de");
          if (!b.dueAt) return -1;
          return a.dueAt.localeCompare(b.dueAt) || a.title.localeCompare(b.title, "de");
        });
        setTasks(openTasks);
        onSummaryChange({
          open: openTasks.filter((task) => !task.publishReady).length,
          overdue: openTasks.filter((task) => !task.publishReady && task.dueAt && task.dueAt < today).length,
        });
      } catch {
        if (!cancelled) {
          setLoadError("Die Aufgaben konnten nicht geladen werden. Bitte versuche es erneut.");
          onSummaryChange({ open: 0, overdue: 0, error: true });
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void loadTasks();
    const refreshOnFocus = () => { void loadTasks(); };
    window.addEventListener("focus", refreshOnFocus);
    return () => { cancelled = true; window.removeEventListener("focus", refreshOnFocus); };
  }, [retryKey, onSummaryChange]);

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
      setVisibleCount(Math.min(tasks.length, 5, Math.max(1, Math.ceil(eventListHeight / averageRowHeight))));
    };

    updateVisibleCount();
    const observer = new ResizeObserver(updateVisibleCount);
    observer.observe(eventList);
    observer.observe(list);
    return () => observer.disconnect();
  }, [tasks]);

  const today = localDateKey();
  return <div className="task-list dashboard-task-list" ref={taskListRef}>
    {!ready ? <p className="task-empty">Aufgaben werden geladen …</p> : loadError ? <EmptyState className="empty-state-compact" title="Aufgaben gerade nicht verfügbar" description={loadError} action={<button className="btn" type="button" onClick={() => setRetryKey((key) => key + 1)}>Erneut laden</button>} /> : tasks.length ? tasks.map((task) => <Link className="task-row dashboard-task-row" href={task.eventId ? `/events/${task.eventId}?tab=aufgaben-nachweise` : "/aufgaben"} key={task.id}>
      <span className="task-check"><Icon name={task.publishReady ? "check" : "clock"} size={14}/></span>
      <span className="dashboard-task-copy"><span className="task-title">{task.title}</span><span className="task-caption">{[task.sponsor, task.eventTitle, task.publishReady ? "Sponsorfreigabe liegt vor · Veröffentlichung möglich" : ""].filter(Boolean).join(" · ")}</span></span>
      <span className={`task-date ${!task.publishReady && task.dueAt && task.dueAt < today ? "overdue" : ""}`}>{task.publishReady ? "Zur Veröffentlichung" : task.dueAt ? `${task.dueAt < today ? "Überfällig · " : "Fällig "}${formatEventDate(task.dueAt, { day: "2-digit", month: "short" })}` : "Kein Fälligkeitstermin"}</span>
    </Link>).slice(0, visibleCount) : <EmptyState className="empty-state-compact" title="Keine offenen Aufgaben" description="Sobald offene Leistungen oder Aufgaben vorhanden sind, erscheinen hier die nächsten Fälligkeiten." action={<Link className="btn" href="/aufgaben">Zu den Aufgaben</Link>} />}
  </div>;
}
