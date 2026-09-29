import { actorFrom, apiError, ApiError, db, dueAt, ensureSeed, validateText, type Priority, type Ticket } from "@/lib/atlas";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const actor = actorFrom(request);
    await ensureSeed();
    const result = await db().prepare(`SELECT id, code, organization_id, requester_id, subject, description,
      priority, status, assignee_id, created_at, updated_at, due_at, resolved_at, version
      FROM tickets WHERE organization_id = ? AND (? != 'customer' OR requester_id = ?)
      ORDER BY created_at DESC`).bind(actor.organizationId, actor.role, actor.id).all<Ticket>();
    return Response.json({ tickets: result.results });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const actor = actorFrom(request);
    if (actor.role !== "customer") throw new ApiError(403, "Apenas clientes podem abrir chamados.");
    await ensureSeed();
    const body = await request.json() as Record<string, unknown>;
    const subject = validateText(body.subject, "Assunto", 5, 120);
    const description = validateText(body.description, "Descrição", 10, 4000);
    if (!(["low", "normal", "high"] as unknown[]).includes(body.priority)) throw new ApiError(400, "Prioridade inválida.");
    const priority = body.priority as Priority;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const code = `AT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    await db().prepare(`INSERT INTO tickets
      (id, code, organization_id, requester_id, subject, description, priority, status,
       created_at, updated_at, due_at, version, last_actor_id, last_action)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, 0, ?, 'CREATED')`)
      .bind(id, code, actor.organizationId, actor.id, subject, description, priority, now, now, dueAt(priority), actor.id).run();
    return Response.json({ ticket: await db().prepare("SELECT * FROM tickets WHERE id = ?").bind(id).first<Ticket>() }, { status: 201 });
  } catch (error) { return apiError(error); }
}
