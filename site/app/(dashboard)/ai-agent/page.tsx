"use client"
import { useState, useRef, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { AiChatMessage } from "@seo/shared"
import { Bot, Send } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { apiClient } from "@/lib/api-client"
import { useActiveProject } from "@/contexts/ProjectContext"
import { useProjects } from "@/hooks/useProjects"

function ProjectChat({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]), [input, setInput] = useState("")
  const bottom = useRef<HTMLDivElement>(null), cache = useQueryClient()
  const context = useQuery({ queryKey: ["ai-agent", projectId], queryFn: () => apiClient.getAiAgent(projectId), retry: false })
  const ask = useMutation({ mutationFn: (history: AiChatMessage[]) => apiClient.askAiAgent(projectId, history),
    onSuccess: result => { setMessages(previous => [...previous, { role: "assistant", content: result.content }]); setInput("") },
    onSettled: () => cache.invalidateQueries({ queryKey: ["ai-agent", projectId] }) })
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }) }, [messages, ask.isPending])
  const ready = !!context.data?.auditId && context.data.usage.configured && context.data.usage.allowed && context.data.usage.used < context.data.usage.quota && context.data.usage.nextRequestUsd !== null && context.data.usage.committedUsd + context.data.usage.nextRequestUsd <= context.data.usage.budgetUsd
  function send() {
    if (!ready || !input.trim() || ask.isPending) return
    const history: AiChatMessage[] = [...(ask.isError && messages.at(-1)?.role === "user" ? messages.slice(0, -1) : messages), { role: "user", content: input.trim() }]
    setMessages(history); ask.mutate(history.slice(-8))
  }
  if (context.isLoading) return <Skeleton className="h-64" />
  if (context.error) return <p role="alert" className="text-destructive">{context.error.message}</p>
  return <div className="space-y-4"><div className="rounded-lg border p-4 text-sm space-y-2">
    <p>{context.data?.auditedAt ? "Contexte : audit du " + new Date(context.data.auditedAt).toLocaleString("fr-FR") : "Terminez un audit sur ce projet pour interroger l’agent."}</p>
    {context.data && <p>Appels IA ce mois : {context.data.usage.used} / {context.data.usage.quota} · budget engagé : {context.data.usage.committedUsd.toFixed(4)} / {context.data.usage.budgetUsd.toFixed(2)} USD.</p>}
    {!context.data?.usage.configured && <p>Le fournisseur et ses tarifs doivent être configurés par l’administrateur.</p>}
    {!context.data?.usage.allowed && <p>L’IA n’est pas incluse dans votre abonnement.</p>}
    <p className="text-muted-foreground">L’agent explique les résultats de l’audit et propose des actions. Les publications se valident dans Connexions CMS.</p>
  </div><Card><CardContent className="p-4 space-y-4"><div className="max-h-[55vh] overflow-y-auto space-y-4" aria-live="polite">
    {!messages.length && <p className="text-sm text-muted-foreground">Exemple : « Quelles sont les trois corrections prioritaires sur ce projet ? »</p>}
    {messages.map((message, index) => <div key={index} className={message.role === "user" ? "ml-4 rounded-lg bg-primary p-3 text-primary-foreground" : "mr-4 rounded-lg bg-muted p-3"}><p className="mb-1 text-xs font-medium">{message.role === "user" ? "Vous" : "Agent IA"}</p><p className="whitespace-pre-wrap break-words text-sm">{message.content}</p></div>)}
    {ask.isPending && <p className="text-sm text-muted-foreground">Analyse de l’audit en cours…</p>}<div ref={bottom} />
  </div>{ask.error && <p role="alert" className="text-sm text-destructive">{ask.error.message}</p>}
  <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); send() }}><label htmlFor="seo-agent-question" className="sr-only">Votre question SEO</label><textarea id="seo-agent-question" maxLength={1500} rows={2} value={input} onChange={event => setInput(event.target.value)} disabled={ask.isPending} placeholder="Votre question sur l’audit…" className="min-w-0 flex-1 rounded-md border bg-background p-3 text-sm" /><Button type="submit" disabled={!ready || ask.isPending || !input.trim()}><Send className="mr-2 h-4 w-4" />Envoyer</Button></form>
  <Button variant="outline" disabled={ask.isPending || !messages.length} onClick={() => { setMessages([]); ask.reset() }}>Nouvelle conversation</Button>
  </CardContent></Card></div>
}
export default function AIAgentPage() {
  const { activeProjectId, setActiveProjectId } = useActiveProject(), projects = useProjects()
  return <div className="p-4 md:p-6 space-y-6"><div className="flex items-center gap-3"><Bot className="h-6 w-6 text-primary" /><div><h1 className="text-2xl font-semibold">Agent IA SEO</h1><p className="text-sm text-muted-foreground">Des réponses fondées sur l’audit de votre client.</p></div></div><label className="block text-sm space-y-2">Projet client<select className="block w-full max-w-md rounded-md border bg-background p-2" value={activeProjectId ?? ""} onChange={event => setActiveProjectId(event.target.value || null)}><option value="">Choisir un projet</option>{projects.data?.map(project => <option key={project.id} value={project.id}>{project.name} — {project.domain}</option>)}</select></label>{activeProjectId ? <ProjectChat key={activeProjectId} projectId={activeProjectId} /> : <p className="text-muted-foreground">Choisissez le projet à analyser.</p>}</div>
}
