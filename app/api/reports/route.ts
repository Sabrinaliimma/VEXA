import { actorFrom, apiError, ApiError, db, ensureSeed, type Ticket } from "@/lib/atlas";

export const runtime = "edge";

type Summary = { total: number; active: number; overdue: number; resolved: number; on_time: number; avg_resolution_hours: number | null };
type PriorityCount = { priority: "low" | "normal" | "high"; count: number };
type Workload = { assignee_id: string | null; active: number; resolved: number };

export async function GET(request: Request) {
  try {
    const actor = actorFrom(request);
    if (actor.role !== "manager") throw new ApiError(403, "Indicadores disponíveis apenas para a gestora.");
    await ensureSeed();
    const now = new Date().toISOString();
    const database = db();
    const [summary, priorities, workload, queue] = await Promise.all([
      database.prepare(`SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status != 'resolved' THEN 1 ELSE 0 END),0) AS active,
        COALESCE(SUM(CASE WHEN status != 'resolved' AND due_at < ? THEN 1 ELSE 0 END),0) AS overdue,
        COALESCE(SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END),0) AS resolved,
        COALESCE(SUM(CASE WHEN status = 'resolved' AND resolved_at <= due_at THEN 1 ELSE 0 END),0) AS on_time,
        AVG(CASE WHEN status = 'resolved' AND resolved_at IS NOT NULL
          THEN (julianday(resolved_at) - julianday(created_at)) * 24 ELSE NULL END) AS avg_resolution_hours
        FROM tickets WHERE organization_id = ?`).bind(now, actor.organizationId).first<Summary>(),
      database.prepare(`SELECT priority, COUNT(*) AS count FROM tickets WHERE organization_id = ?
        GROUP BY priority`).bind(actor.organizationId).all<PriorityCount>(),
      database.prepare(`SELECT assignee_id,
        COALESCE(SUM(CASE WHEN status != 'resolved' THEN 1 ELSE 0 END),0) AS active,
        COALESCE(SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END),0) AS resolved
        FROM tickets WHERE organization_id = ? GROUP BY assignee_id`).bind(actor.organizationId).all<Workload>(),
      database.prepare(`SELECT id, code, organization_id, requester_id, subject, description,
        priority, status, assignee_id, created_at, updated_at, due_at, resolved_at, version
        FROM tickets WHERE organization_id = ? AND status != 'resolved'
        ORDER BY CASE WHEN due_at < ? THEN 0 ELSE 1 END, due_at ASC LIMIT 8`)
        .bind(actor.organizationId, now).all<Ticket>(),
    ]);
    return Response.json({ summary: summary ?? { total: 0, active: 0, overdue: 0, resolved: 0, on_time: 0, avg_resolution_hours: null },
      priorities: priorities.results, workload: workload.results, queue: queue.results });
  } catch (error) { return apiError(error); }
}
