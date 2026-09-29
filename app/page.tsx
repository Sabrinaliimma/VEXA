"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle2, ChevronRight, Clock3, LayoutDashboard, ListTodo, MessageCircle, Plus, Search, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Reports } from "@/app/components/reports";

type Role = "customer" | "agent" | "manager";
type Status = "open" | "in_progress" | "resolved";
type Priority = "low" | "normal" | "high";
type Ticket = { id: string; code: string; subject: string; description: string; priority: Priority; status: Status; requester_id: string; assignee_id: string | null; created_at: string; updated_at: string; due_at: string; resolved_at: string | null; version: number };
type Event = { id: number; action: string; actor_id: string; note: string | null; created_at: string };
type Detail = { ticket: Ticket; events: Event[] };

const profiles: Record<Role, { name: string; title: string; initial: string }> = {
  customer: { name: "Marina Lopes", title: "Cliente", initial: "ML" },
  agent: { name: "Rafael Costa", title: "Agente", initial: "RC" },
  manager: { name: "Camila Rocha", title: "Gestora", initial: "CR" },
};
const statusLabels: Record<Status, string> = { open: "Aberto", in_progress: "Em atendimento", resolved: "Resolvido" };
const priorityLabels: Record<Priority, string> = { low: "Baixa", normal: "Normal", high: "Alta" };
const actionLabels: Record<string, string> = { CREATED: "abriu o chamado", CLAIMED: "assumiu o atendimento", RESOLVED: "resolveu o chamado", REOPENED: "reabriu o chamado", COMMENT: "comentou" };
const names: Record<string, string> = { marina: "Marina Lopes", rafael: "Rafael Costa", camila: "Camila Rocha" };
const fmtDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const overdue = (ticket: Ticket) => ticket.status !== "resolved" && new Date(ticket.due_at).getTime() < Date.now();

async function api<T>(path: string, role: Role, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", "x-demo-role": role, ...init?.headers }, cache: "no-store" });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data as T;
}

export default function Home() {
  const [role, setRole] = useState<Role>("manager");
  const [view, setView] = useState<"tickets" | "reports">("tickets");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (profile: Role) => {
    setLoading(true); setError("");
    try { const result = await api<{ tickets: Ticket[] }>("/api/tickets", profile); setTickets(result.tickets); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar chamados."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(role); setSelectedId(null); setDetail(null); }, [role, load]);
  useEffect(() => {
    if (!selectedId) return;
    setDetail(null);
    void api<Detail>(`/api/tickets/${encodeURIComponent(selectedId)}`, role)
      .then(setDetail).catch(e => setError(e instanceof Error ? e.message : "Falha ao abrir chamado."));
  }, [selectedId, role]);

  useEffect(() => {
    type Tool = { name: string; title: string; description: string; inputSchema: object;
      annotations: { readOnlyHint: boolean }; execute: (input: unknown) => Promise<unknown> };
    const context = (document as Document & { modelContext?: { registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Tool) => { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(console.error); };
    register({ name: "list_vexa_tickets", title: "Listar chamados", description: "Ler os chamados visíveis no perfil atual da demonstração.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true },
      execute: async () => { const result = await api<{ tickets: Ticket[] }>("/api/tickets", role); return result.tickets.map(t => ({ id: t.id, code: t.code, subject: t.subject, status: t.status, priority: t.priority })); } });
    register({ name: "create_vexa_ticket", title: "Criar chamado", description: "Criar um chamado como cliente no ambiente de demonstração.",
      inputSchema: { type: "object", properties: { subject: { type: "string", minLength: 5, maxLength: 120 }, description: { type: "string", minLength: 10, maxLength: 4000 }, priority: { type: "string", enum: ["low", "normal", "high"] } }, required: ["subject", "description", "priority"], additionalProperties: false }, annotations: { readOnlyHint: false },
      execute: async (input) => {
        if (role !== "customer") throw new Error("Selecione o perfil Cliente para abrir um chamado.");
        if (!input || typeof input !== "object") throw new Error("Dados inválidos.");
        const fields = input as Record<string, unknown>;
        if (typeof fields.subject !== "string" || fields.subject.trim().length < 5 || typeof fields.description !== "string" || fields.description.trim().length < 10 || !["low", "normal", "high"].includes(String(fields.priority))) throw new Error("Assunto, descrição ou prioridade inválidos.");
        const result = await api<{ ticket: Ticket }>("/api/tickets", role, { method: "POST", body: JSON.stringify(fields) });
        await load(role); setSelectedId(result.ticket.id); setNotice("Chamado criado com sucesso.");
        return { id: result.ticket.id, code: result.ticket.code, status: result.ticket.status };
      } });
    return () => lifecycle.abort();
  }, [role, load]);

  const filtered = useMemo(() => tickets.filter(t =>
    (filter === "all" || t.status === filter) &&
    `${t.code} ${t.subject} ${t.description}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))
  ), [tickets, filter, search]);
  const stats = {
    total: tickets.length,
    open: tickets.filter(t => t.status === "open").length,
    progress: tickets.filter(t => t.status === "in_progress").length,
    overdue: tickets.filter(overdue).length,
    resolved: tickets.filter(t => t.status === "resolved").length,
  };

  async function refreshDetail(id: string) {
    const [list, item] = await Promise.all([
      api<{ tickets: Ticket[] }>("/api/tickets", role),
      api<Detail>(`/api/tickets/${encodeURIComponent(id)}`, role),
    ]);
    setTickets(list.tickets); setDetail(item);
  }

  async function transition(action: "claim" | "resolve" | "reopen") {
    if (!detail) return;
    setBusy(true); setError("");
    try {
      await api(`/api/tickets/${encodeURIComponent(detail.ticket.id)}`, role, { method: "POST", body: JSON.stringify({ action, expectedVersion: detail.ticket.version }) });
      await refreshDetail(detail.ticket.id);
      setNotice(action === "claim" ? "Chamado assumido." : action === "resolve" ? "Chamado resolvido." : "Chamado reaberto.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao atualizar."); }
    finally { setBusy(false); }
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    setBusy(true); setError("");
    try {
      await api(`/api/tickets/${encodeURIComponent(detail.ticket.id)}`, role, { method: "POST", body: JSON.stringify({ action: "comment", note: comment }) });
      setComment(""); await refreshDetail(detail.ticket.id); setNotice("Comentário adicionado.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao comentar."); }
    finally { setBusy(false); }
  }

  async function createTicket(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api<{ ticket: Ticket }>("/api/tickets", role, { method: "POST", body: JSON.stringify({ subject, description, priority }) });
      setCreateOpen(false); setSubject(""); setDescription(""); setPriority("normal");
      await load(role); setSelectedId(result.ticket.id); setNotice("Chamado criado com sucesso.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao criar chamado."); }
    finally { setBusy(false); }
  }

  return (
    <div className="workspace">
      <aside className="rail">
        <div className="brand"><div className="brand-type"><strong>vexa</strong><small>ATENDIMENTO INTELIGENTE</small></div></div>
        <div className="rail-group-label">VISÃO GERAL</div>
        <button type="button" className={`rail-link ${view === "tickets" ? "active" : ""}`} onClick={() => setView("tickets")}><LayoutDashboard size={19} /><span>Chamados</span><span className="rail-count">{tickets.length}</span></button>
        {role === "manager" && <button type="button" className={`rail-link ${view === "reports" ? "active" : ""}`} onClick={() => setView("reports")}><BarChart3 size={19} /><span>Indicadores</span></button>}
        <div className="rail-bottom"><div className="rail-divider"/><div className="demo-tag"><ShieldCheck size={17}/><div><strong>Ambiente de demonstração</strong><span>Perfis e dados fictícios</span></div></div></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={15}/> <strong>Central de atendimento</strong></div><div className="top-actions"><span className="environment-pill"><span/> Demo</span><div className="avatar" title={profiles[role].name}>{role === "agent" ? <img src="/rafael-agent.webp" alt="Rafael Costa" width="40" height="40" /> : role === "manager" ? <img src="/camila-manager.png" alt="Camila, gestora fictícia" width="40" height="40" /> : profiles[role].initial}</div></div></header>
        <div className="content">
          {view === "tickets" ? <>
          <div className="page-heading"><div><p className="eyebrow">OPERAÇÃO · ATENDIMENTO</p><h1>Central de atendimento</h1><p className="intro">Acompanhe solicitações, responsáveis e prazos em um só lugar.</p></div><div className="heading-actions"><div className="profile-picker"><span>Visualizar como</span><Select value={role} onValueChange={value => { setRole(value as Role); setView("tickets"); }}><SelectTrigger aria-label="Perfil de demonstração" className="profile-trigger"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="manager">Camila · Gestora</SelectItem><SelectItem value="agent">Rafael · Agente</SelectItem><SelectItem value="customer">Marina · Cliente</SelectItem></SelectContent></Select></div>{role === "customer" && <Button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={17}/> Novo chamado</Button>}</div></div>
          {notice && <div className="notice" role="status"><CheckCircle2 size={17}/>{notice}<button type="button" aria-label="Fechar aviso" onClick={() => setNotice("")}><X size={15}/></button></div>}
          {error && <div className="error" role="alert">{error}<button type="button" onClick={() => { setError(""); void load(role); }}>Tentar novamente</button></div>}
          <div className="stats-grid">
            <article className="stat-card"><div className="stat-head">Todos os chamados <span className="stat-icon blue"><ListTodo size={18}/></span></div><strong>{stats.total}</strong><div className="stat-foot">Solicitações registradas</div></article>
            <article className="stat-card"><div className="stat-head">Abertos <span className="stat-icon amber"><ArrowUpRight size={18}/></span></div><strong>{stats.open}</strong><div className="stat-foot">Aguardando atendimento</div></article>
            <article className="stat-card"><div className="stat-head">Em atendimento <span className="stat-icon violet"><Activity size={18}/></span></div><strong>{stats.progress}</strong><div className="stat-foot">Com agente responsável</div></article>
            <article className="stat-card"><div className="stat-head">Prazo vencido <span className="stat-icon rose"><Clock3 size={18}/></span></div><strong>{stats.overdue}</strong><div className="stat-foot">Precisam de atenção</div></article>
          </div>
          <section className="tickets-panel" id="ticket-list"><div className="panel-top"><div><h2>Chamados</h2><p>Gerencie as solicitações da equipe</p></div><span className="count-badge">{filtered.length} registros</span></div><div className="toolbar"><div className="filter-tabs" role="group" aria-label="Filtrar por status">{(["all", "open", "in_progress", "resolved"] as const).map(value => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? "current" : ""} onClick={() => setFilter(value)}>{value === "all" ? "Todos" : statusLabels[value]}</button>)}</div><div className="search-wrap"><Search size={18}/><Input aria-label="Buscar chamados" placeholder="Buscar chamado..." value={search} onChange={event => setSearch(event.target.value)}/></div></div>
            <div className="table-scroll"><Table><TableHeader><TableRow><TableHead>CHAMADO</TableHead><TableHead>STATUS</TableHead><TableHead>PRIORIDADE</TableHead><TableHead>RESPONSÁVEL</TableHead><TableHead>PRAZO</TableHead><TableHead><span className="sr-only">Abrir</span></TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={6} className="table-state">Carregando chamados...</TableCell></TableRow> : filtered.length ? filtered.map(ticket => <TableRow key={ticket.id} className="ticket-row" onClick={() => setSelectedId(ticket.id)}><TableCell><button type="button" className="ticket-main" onClick={event => { event.stopPropagation(); setSelectedId(ticket.id); }}><span className="ticket-code">{ticket.code}</span><strong>{ticket.subject}</strong></button></TableCell><TableCell><span className={`status status-${ticket.status}`}><i/>{statusLabels[ticket.status]}</span></TableCell><TableCell><span className={`priority priority-${ticket.priority}`}>{priorityLabels[ticket.priority]}</span></TableCell><TableCell>{ticket.assignee_id ? names[ticket.assignee_id] || ticket.assignee_id : <span className="muted">Não atribuído</span>}</TableCell><TableCell><span className={overdue(ticket) ? "due-over" : ""}>{ticket.status === "resolved" ? "—" : fmtDate(ticket.due_at)}</span></TableCell><TableCell><ChevronRight size={17} className="row-chevron"/></TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="table-state">Nenhum chamado corresponde à busca.</TableCell></TableRow>}</TableBody></Table></div>
          </section>
          <p className="footer-note"><ShieldCheck size={16}/> Esta é uma demonstração com pessoas e informações fictícias. A troca de perfil simula os papéis do sistema.</p>
          </> : <Reports onOpen={setSelectedId} />}
        </div>
      </main>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="dialog-surface"><DialogHeader><DialogTitle>Abrir novo chamado</DialogTitle><DialogDescription>Descreva a solicitação para a equipe de atendimento.</DialogDescription></DialogHeader><form onSubmit={createTicket} className="form-stack"><label>Assunto<Input required minLength={5} maxLength={120} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex.: Não consigo acessar minha conta"/></label><label>Descrição<textarea required minLength={10} maxLength={4000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Conte o que aconteceu e o que você esperava ver" rows={5}/></label><label>Prioridade<Select value={priority} onValueChange={v => setPriority(v as Priority)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="low">Baixa · 72 horas</SelectItem><SelectItem value="normal">Normal · 24 horas</SelectItem><SelectItem value="high">Alta · 4 horas</SelectItem></SelectContent></Select></label><div className="form-actions"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy} className="primary-button">{busy ? "Salvando..." : "Criar chamado"}</Button></div></form></DialogContent></Dialog>
      <Sheet open={!!selectedId} onOpenChange={open => { if (!open) { setSelectedId(null); setDetail(null); setComment(""); } }}><SheetContent className="detail-sheet sm:!max-w-[620px]"><SheetHeader><div className="sheet-overline">{detail?.ticket.code || "CHAMADO"}</div><SheetTitle>{detail?.ticket.subject || "Carregando..."}</SheetTitle><SheetDescription>Histórico e acompanhamento da solicitação</SheetDescription></SheetHeader>{detail ? <div className="detail-scroll"><div className="detail-meta"><div><span>Status</span><strong className={`status status-${detail.ticket.status}`}><i/>{statusLabels[detail.ticket.status]}</strong></div><div><span>Prioridade</span><strong>{priorityLabels[detail.ticket.priority]}</strong></div><div><span>Aberto em</span><strong>{fmtDate(detail.ticket.created_at)}</strong></div><div><span>Prazo</span><strong className={overdue(detail.ticket) ? "due-over" : ""}>{fmtDate(detail.ticket.due_at)}</strong></div></div><div className="detail-section"><h3>Descrição</h3><p>{detail.ticket.description}</p></div><div className="detail-section"><h3>Atividade <span>{detail.events.length}</span></h3><div className="timeline">{detail.events.map(event => <div className="timeline-item" key={event.id}><div className="timeline-dot"><MessageCircle size={14}/></div><div><p><strong>{names[event.actor_id] || event.actor_id}</strong> {actionLabels[event.action] || event.action}</p>{event.note && <div className="timeline-note">{event.note}</div>}<time>{fmtDate(event.created_at)}</time></div></div>)}</div></div><form className="comment-form" onSubmit={addComment}><label htmlFor="comment">Adicionar comentário</label><textarea id="comment" minLength={2} maxLength={1000} required rows={3} placeholder="Escreva uma atualização para o chamado" value={comment} onChange={e => setComment(e.target.value)}/><Button type="submit" variant="outline" disabled={busy}>Enviar comentário</Button></form></div> : <p className="detail-loading">Carregando detalhes...</p>}{detail && <div className="detail-actions">{role === "agent" && detail.ticket.status === "open" && <Button className="primary-button" disabled={busy} onClick={() => void transition("claim")}>Assumir chamado <ArrowDownRight size={17}/></Button>}{role === "agent" && detail.ticket.status === "in_progress" && detail.ticket.assignee_id === "rafael" && <Button className="primary-button" disabled={busy} onClick={() => void transition("resolve")}>Marcar como resolvido <CheckCircle2 size={17}/></Button>}{role === "customer" && detail.ticket.status === "resolved" && <Button className="primary-button" disabled={busy} onClick={() => void transition("reopen")}>Reabrir chamado</Button>}</div>}</SheetContent></Sheet>
    </div>
  );
}
