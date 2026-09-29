"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, ListTodo, Users } from "lucide-react";
import type { Ticket } from "@/lib/atlas";

type Summary = { total: number; active: number; overdue: number; resolved: number; on_time: number; avg_resolution_hours: number | null };
type Report = { summary: Summary; priorities: { priority: "high" | "normal" | "low"; count: number }[]; workload: { assignee_id: string | null; active: number; resolved: number }[]; queue: Ticket[] };
const labels = { high: "Alta", normal: "Normal", low: "Baixa" };
const names: Record<string, string> = { rafael: "Rafael Costa" };
const formatDate = (date: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(date));

export function Reports({ onOpen }: { onOpen: (id: string) => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/reports", { headers: { "x-demo-role": "manager" }, cache: "no-store" });
      const result = await response.json() as Report & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os indicadores.");
      setReport(result);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar os indicadores."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading && !report) return <section className="report-loading" aria-live="polite">Preparando indicadores...</section>;
  if (error) return <section className="report-loading" role="alert">{error} <button type="button" onClick={() => void load()}>Tentar novamente</button></section>;
  if (!report) return null;

  const { summary, priorities, workload, queue } = report;
  const sla = summary.resolved ? Math.round((summary.on_time / summary.resolved) * 100) : null;
  const priorityCounts = (['high', 'normal', 'low'] as const).map(priority => ({ priority, count: priorities.find(item => item.priority === priority)?.count ?? 0 }));
  const totalPriority = Math.max(summary.total, 1);
  return <div className="reports-view">
    <div className="report-intro"><div><p className="eyebrow">VISÃO DA GESTORA · INDICADORES</p><h1>Saúde da operação</h1><p className="intro">Dados dos chamados registrados nesta demonstração.</p></div><div className="report-live"><span/> Atualizado agora</div></div>
    <div className="report-metrics">
      <article className="report-metric"><span className="metric-glyph mint"><CheckCircle2 size={21}/></span><span>Resolvidos no prazo</span><strong>{sla === null ? "—" : `${sla}%`}</strong><small>{summary.on_time} de {summary.resolved} resolvidos</small></article>
      <article className="report-metric"><span className="metric-glyph coral"><AlertTriangle size={21}/></span><span>Prazo vencido</span><strong>{summary.overdue}</strong><small>Chamados ainda ativos</small></article>
      <article className="report-metric"><span className="metric-glyph blue"><Clock3 size={21}/></span><span>Tempo médio de resolução</span><strong>{summary.avg_resolution_hours === null ? "—" : `${Math.round(summary.avg_resolution_hours * 10) / 10}h`}</strong><small>Entre abertura e resolução</small></article>
      <article className="report-metric"><span className="metric-glyph violet"><ListTodo size={21}/></span><span>Fila ativa</span><strong>{summary.active}</strong><small>De {summary.total} chamados no total</small></article>
    </div>
    <div className="reports-grid">
      <section className="report-panel priority-panel"><div className="report-section-head"><div><h2>Prioridades</h2><p>Distribuição de todos os chamados</p></div><span className="section-symbol"><ArrowUpRight size={19}/></span></div><div className="priority-bars">{priorityCounts.map(item => <div className="priority-item" key={item.priority}><div className="bar-label"><span>{labels[item.priority]}</span><strong>{item.count}</strong></div><div className="bar-track"><div className={`bar-fill bar-${item.priority}`} style={{ width: `${(item.count / totalPriority) * 100}%` }}/></div></div>)}</div><p className="report-hint">Os indicadores usam os registros atuais; novas ações atualizam estes valores.</p></section>
      <section className="report-panel workload-panel"><div className="report-section-head"><div><h2>Carga de atendimento</h2><p>Distribuição por responsável</p></div><span className="section-symbol"><Users size={19}/></span></div><div className="workload-head"><span>RESPONSÁVEL</span><span>ATIVOS</span><span>RESOLVIDOS</span></div>{workload.map((item, index) => <div className="workload-row" key={item.assignee_id ?? `unassigned-${index}`}><div className="workload-name"><span className={`workload-avatar ${item.assignee_id ? "" : "vacant"}`}>{item.assignee_id ? "RC" : "—"}</span><strong>{item.assignee_id ? names[item.assignee_id] || item.assignee_id : "Sem responsável"}</strong></div><span>{item.active}</span><span>{item.resolved}</span></div>)}</section>
    </div>
    <section className="report-panel queue-panel"><div className="report-section-head"><div><h2>Fila que precisa de atenção</h2><p>Chamados ativos ordenados pelo prazo mais próximo</p></div><span className="queue-count">{queue.length} na fila</span></div><div className="queue-list">{queue.length ? queue.map(ticket => { const late = new Date(ticket.due_at).getTime() < Date.now(); return <button className="queue-row" type="button" onClick={() => onOpen(ticket.id)} key={ticket.id}><span className="queue-ticket"><small>{ticket.code}</small><strong>{ticket.subject}</strong></span><span className={`queue-priority qp-${ticket.priority}`}>{labels[ticket.priority]}</span><span className={late ? "queue-due late" : "queue-due"}>{late ? "Vencido · " : "Prazo · "}{formatDate(ticket.due_at)}</span><ArrowUpRight size={18}/></button>; }) : <p className="queue-empty">Nenhum chamado ativo no momento.</p>}</div></section>
    <p className="footer-note"><CheckCircle2 size={16}/> Indicadores da demonstração; perfis e dados são fictícios.</p>
  </div>;
}
