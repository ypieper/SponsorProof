import { createClient } from "@/lib/supabase/client";

export type EventReportMetric = {
  id: string;
  name: string;
  value: string;
};

type EventReportMetricRow = {
  id: string;
  metric_name: string;
  metric_value: string;
};

export async function fetchEventReportMetrics(eventId: string) {
  const { data, error } = await createClient()
    .from("event_report_metrics")
    .select("id, metric_name, metric_value")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  return {
    data: (data ?? []).map((row) => {
      const metric = row as EventReportMetricRow;
      return { id: metric.id, name: metric.metric_name, value: metric.metric_value };
    }),
    error,
  };
}

export async function saveEventReportMetric(eventId: string, metric: Omit<EventReportMetric, "id">, metricId?: string) {
  const supabase = createClient();
  if (metricId) {
    return supabase.from("event_report_metrics")
      .update({ metric_name: metric.name.trim(), metric_value: metric.value.trim(), updated_at: new Date().toISOString() })
      .eq("id", metricId)
      .eq("event_id", eventId)
      .select("id")
      .maybeSingle();
  }
  return supabase.from("event_report_metrics")
    .insert({ event_id: eventId, metric_name: metric.name.trim(), metric_value: metric.value.trim() })
    .select("id")
    .single();
}

export async function deleteEventReportMetric(eventId: string, metricId: string) {
  return createClient().from("event_report_metrics").delete().eq("id", metricId).eq("event_id", eventId);
}
