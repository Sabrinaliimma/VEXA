import { env } from "cloudflare:workers";

export type Role = "customer" | "agent" | "manager";
export type Priority = "low" | "normal" | "high";
export type Status = "open" | "in_progress" | "resolved";
export type Actor = { id: string; name: string; role: Role; organizationId: string };
export type Ticket = {
  id: string; code: string; organization_id: string; requester_id: string;
  subject: string; description: string; priority: Priority; status: Status;
  assignee_id: string | null; created_at: string; updated_at: string;
  due_at: string; resolved_at: string | null; version: number;
};

const ORG = "north-digital-demo";
export const PEOPLE = {
  customer: { id: "marina", name: "Marina Lopes", role: "customer", organizationId: ORG },
  agent: { id: "rafael", name: "Rafael Costa", role: "agent", organizationId: ORG },
  manager: { id: "camila", name: "Camila Rocha", role: "manager", organizationId: ORG },
} as const satisfies Record<Role, Actor>;

export function actorFrom(request: Request): Actor {
  const role = request.headers.get("x-demo-role") ?? "manager";
  if (!(role in PEOPLE)) throw new ApiError(400, "Perfil de demonstração inválido.");
  return PEOPLE[role as Role];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function apiError(error: unknown): Response {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Atlas Desk request failed", error);
  return Response.json({ error: "Não foi possível concluir. Tente novamente." }, { status: 500 });
}

export function db(): D1Database {
  if (!env.DB) throw new Error("D1 DB binding is unavailable");
  return env.DB;
}

export function dueAt(priority: Priority, from: Date = new Date()): string {
  return new Date(from.getTime() + ({ low: 72, normal: 24, high: 4 }[priority] * 3600000)).toISOString();
}

export function validateText(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max)
    throw new ApiError(400, `${label}: use entre ${min} e ${max} caracteres.`);
  return value.trim();
}

export async function ensureSeed(): Promise<void> {
  const database = db();
  const current = await database.prepare("SELECT id FROM tickets LIMIT 1").first();
  if (current) return;
  const now = Date.now();
  const seed = [
    ["demo-2401", "AT-2401", "Não consigo acessar minha conta", "Depois de alterar a senha, a página retorna erro ao tentar entrar.", "high", "open", null, now - 42 * 60000, now + 3 * 3600000, null, "marina", "CREATED"],
    ["demo-2402", "AT-2402", "Permissão para o painel de relatórios", "Preciso consultar os indicadores do último trimestre no painel da equipe.", "normal", "in_progress", "rafael", now - 5 * 3600000, now + 19 * 3600000, null, "rafael", "CLAIMED"],
    ["demo-2403", "AT-2403", "Exportação do histórico de atendimentos", "Solicito uma cópia dos chamados encerrados no período anterior.", "low", "resolved", "rafael", now - 30 * 3600000, now + 42 * 3600000, now - 22 * 3600000, "rafael", "RESOLVED"],
    ["demo-2404", "AT-2404", "Erro na atualização do cadastro", "O formulário salva os dados mas a confirmação não aparece na tela.", "high", "open", null, now - 7 * 3600000, now - 3 * 3600000, null, "marina", "CREATED"],
  ] as const;
  await database.batch(seed.map(([id, code, subject, description, priority, status, assignee, created, due, resolved, actor, action]) =>
    database.prepare(`INSERT OR IGNORE INTO tickets
      (id, code, organization_id, requester_id, subject, description, priority, status, assignee_id,
       created_at, updated_at, due_at, resolved_at, version, last_actor_id, last_action)
      VALUES (?, ?, ?, 'marina', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`).bind(
      id, code, ORG, subject, description, priority, status, assignee,
      new Date(created).toISOString(), new Date(created).toISOString(), new Date(due).toISOString(),
      resolved ? new Date(resolved).toISOString() : null, actor, action
    )
  ));
  // A sample exchange helps the detail view communicate the workflow.
  await database.prepare(`INSERT INTO ticket_events (ticket_id, actor_id, action, from_status, to_status, note, created_at)
    SELECT 'demo-2402', 'rafael', 'COMMENT', NULL, NULL,
    'Estou verificando as permissões com a equipe.', ?
    WHERE NOT EXISTS (SELECT 1 FROM ticket_events WHERE ticket_id='demo-2402' AND action='COMMENT')`)
    .bind(new Date(now - 4 * 3600000).toISOString()).run();
}

export async function findTicket(actor: Actor, id: string): Promise<Ticket> {
  const ticket = await db().prepare(`SELECT id, code, organization_id, requester_id, subject, description, priority,
    status, assignee_id, created_at, updated_at, due_at, resolved_at, version FROM tickets
    WHERE id = ? AND organization_id = ? AND (? != 'customer' OR requester_id = ?)`)
    .bind(id, actor.organizationId, actor.role, actor.id).first<Ticket>();
  if (!ticket) throw new ApiError(404, "Chamado não encontrado.");
  return ticket;
}
