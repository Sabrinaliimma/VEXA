import { actorFrom, apiError, ApiError, db, dueAt, ensureSeed, findTicket, validateText, type Ticket } from "@/lib/atlas";

export const runtime = "edge";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const actor = actorFrom(request);
    await ensureSeed();
    const { id } = await context.params;
    const ticket = await findTicket(actor, id);
    const events = await db().prepare(`SELECT id, ticket_id, actor_id, action, from_status, to_status, note, created_at
      FROM ticket_events WHERE ticket_id = ? ORDER BY id ASC`).bind(id).all();
    return Response.json({ ticket, events: events.results });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = actorFrom(request);
    await ensureSeed();
    const { id } = await context.params;
    const ticket = await findTicket(actor, id);
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "comment") {
      const note = validateText(body.note, "Comentário", 2, 1000);
      await db().prepare(`INSERT INTO ticket_events (ticket_id, actor_id, action, note, created_at)
        VALUES (?, ?, 'COMMENT', ?, ?)`).bind(id, actor.id, note, new Date().toISOString()).run();
      return Response.json({ ticket });
    }
    if (!Number.isInteger(body.expectedVersion) || body.expectedVersion !== ticket.version)
      throw new ApiError(409, "O chamado foi atualizado. Recarregue para continuar.");
    let status: string;
    let assignee = ticket.assignee_id;
    let resolved = ticket.resolved_at;
    let due = ticket.due_at;
    let action: string;
    if (body.action === "claim" && actor.role === "agent" && ticket.status === "open") {
      status = "in_progress"; assignee = actor.id; action = "CLAIMED";
    } else if (body.action === "resolve" && actor.role === "agent" && ticket.status === "in_progress" && ticket.assignee_id === actor.id) {
      status = "resolved"; resolved = new Date().toISOString(); action = "RESOLVED";
    } else if (body.action === "reopen" && actor.role === "customer" && ticket.status === "resolved" && ticket.requester_id === actor.id) {
      status = "open"; assignee = null; resolved = null; due = dueAt(ticket.priority); action = "REOPENED";
    } else {
      throw new ApiError(403, "Esta ação não está disponível para este perfil ou estado.");
    }
    const update = await db().prepare(`UPDATE tickets SET status=?, assignee_id=?, resolved_at=?, due_at=?,
      updated_at=?, version=version+1, last_actor_id=?, last_action=?
      WHERE id=? AND organization_id=? AND version=? AND status=?`)
      .bind(status, assignee, resolved, due, new Date().toISOString(), actor.id, action,
        id, actor.organizationId, ticket.version, ticket.status).run();
    if (!update.meta.changes) throw new ApiError(409, "O chamado foi atualizado. Recarregue para continuar.");
    return Response.json({ ticket: await findTicket(actor, id) });
  } catch (error) { return apiError(error); }
}
