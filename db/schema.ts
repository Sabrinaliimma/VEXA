import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  organizationId: text("organization_id").notNull(),
  requesterId: text("requester_id").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  priority: text("priority").notNull(),
  status: text("status").notNull(),
  assigneeId: text("assignee_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  dueAt: text("due_at").notNull(),
  resolvedAt: text("resolved_at"),
  version: integer("version").notNull().default(0),
  lastActorId: text("last_actor_id").notNull(),
  lastAction: text("last_action").notNull(),
}, (table) => [
  index("idx_tickets_org_status").on(table.organizationId, table.status),
  index("idx_tickets_org_requester").on(table.organizationId, table.requesterId),
]);

export const events = sqliteTable("ticket_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: text("ticket_id").notNull().references(() => tickets.id),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  note: text("note"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_ticket_events_ticket_id").on(table.ticketId)]);
