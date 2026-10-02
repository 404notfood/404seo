"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useActiveProject } from "@/contexts/ProjectContext"
import { useProjects } from "@/hooks/useProjects"
import { apiClient } from "@/lib/api-client"
import type { CmsResource, CmsCorrectionSummary, ProjectCms } from "@seo/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

const STATUS: Record<CmsCorrectionSummary["status"], string> = { GENERATING: "Génération en cours", DRAFT: "À valider", APPLYING: "Publication en cours",
  APPLIED: "Appliqué dans le CMS", RESTORING: "Annulation en cours", RESTORED: "Annulé", CONFLICT: "Contenu modifié : nouvelle proposition nécessaire",
  FAILED: "Aucune publication", UNCERTAIN: "Confirmation nécessaire" }
const value = (text: string | null) => text === null ? "Configuration habituelle du CMS (aucune valeur imposée par le connecteur)" : text || "Vide"

function ConnectionForm({ projectId, data }: { projectId: string; data: ProjectCms }) {
  const cache = useQueryClient()
  const [siteUrl, setSiteUrl] = useState(data.connection?.siteUrl ?? ""), [username, setUsername] = useState(""), [password, setPassword] = useState("")
  const [provider, setProvider] = useState<"WORDPRESS" | "PRESTASHOP">(data.connection?.provider ?? "WORDPRESS")
  const presta = provider === "PRESTASHOP", name = presta ? "PrestaShop" : "WordPress"
  const [editing, setEditing] = useState(false)
  const [disconnectConfirm, setDisconnectConfirm] = useState(false)
  const connect = useMutation({ mutationFn: () => presta ? apiClient.connectPrestaShop(projectId, { provider: "PRESTASHOP", siteUrl, token: password }) : apiClient.connectWordPress(projectId, { siteUrl, username, applicationPassword: password }),
    onSuccess: async () => { setPassword(""); setEditing(false); await cache.invalidateQueries({ queryKey: ["cms", projectId] }); await cache.invalidateQueries({ queryKey: ["cms-resources", projectId] }); toast.success("Accès CMS vérifiés") },
    onError: (error: Error) => toast.error(error.message) })
  const disconnect = useMutation({ mutationFn: () => apiClient.disconnectCms(projectId), onSuccess: async () => {
    setDisconnectConfirm(false); await cache.invalidateQueries({ queryKey: ["cms", projectId] }); toast.success("Connexion retirée")
  }, onError: (error: Error) => toast.error(error.message) })
  return <Card><CardHeader><CardTitle className="text-lg">{presta ? "PrestaShop" : "WordPress & WooCommerce"}</CardTitle></CardHeader><CardContent className="space-y-4">
    {data.connection && !editing ? <div className="space-y-3">
      <p className="font-medium">{data.connection.label}</p><p className="text-sm break-all">{data.connection.siteUrl}</p>
      <Badge>Connexion vérifiée</Badge>
      {presta && <p className="text-sm">Périmètre vérifié : boutique et langue {data.connection.scope}. Une modification du périmètre crée une nouvelle connexion et conserve l’ancien historique.</p>}
      {data.access.connect && <div><Button variant="outline" onClick={() => setEditing(true)}>Actualiser les accès {name}</Button></div>}
      <p className="text-sm text-muted-foreground">{presta ? "Les titres SEO et méta-descriptions des produits de cette boutique et de cette langue sont modifiables. Les valeurs sont enregistrées dans les champs natifs PrestaShop." : "Les titres SEO et méta-descriptions des pages, articles et produits sont modifiables. Les corrections du connecteur restent actives tant que son extension est installée."}</p>
      {data.access.connect && (disconnectConfirm ? <div className="rounded-lg border p-3 space-y-3">
        <p className="text-sm">Déconnecter retire les identifiants enregistrés. Les textes déjà publiés restent dans le CMS. L’annulation des anciennes propositions ne sera plus disponible depuis cette connexion.</p>
        <Button variant="destructive" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>Confirmer la déconnexion</Button>{" "}
        <Button variant="outline" onClick={() => setDisconnectConfirm(false)}>Conserver la connexion</Button>
      </div> : <Button variant="outline" onClick={() => setDisconnectConfirm(true)}>Déconnecter</Button>)}
    </div> : <>
      {!data.connection && <div className="text-sm space-y-1"><label htmlFor="cms-provider">CMS</label><select id="cms-provider" className="block w-full rounded-md border bg-background px-3 py-2" value={provider} disabled={connect.isPending} onChange={event => { setProvider(event.target.value as "WORDPRESS" | "PRESTASHOP"); setPassword(""); setUsername(""); connect.reset() }}><option value="WORDPRESS">WordPress / WooCommerce</option><option value="PRESTASHOP">PrestaShop</option></select></div>}
      <ol className="list-decimal pl-5 text-sm space-y-2">
        <li>Installez et activez <a href={presta ? "/downloads/seo404-prestashop.zip" : "/downloads/seo404-connector.zip"} download className="underline text-primary">{presta ? "le module 404 SEO Connector" : "l’extension 404 SEO Connector"}</a> dans {name}.</li>
        <li>{presta ? "Dans la configuration du module, sélectionnez une boutique et sa langue, puis générez la clé dédiée. Copiez l’adresse HTTPS indiquée par le module." : "Dans Utilisateurs → Profil, créez un mot de passe d’application pour 404 SEO avec un compte autorisé à modifier ces contenus."}</li>
        <li>Renseignez les accès ci-dessous. Une vérification du site précède l’enregistrement.</li>
      </ol>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); connect.mutate() }}>
        <label className="block text-sm space-y-1">Adresse {name} HTTPS<Input required type="url" placeholder="https://boutique.fr/" value={siteUrl} onChange={event => setSiteUrl(event.target.value)} disabled={!data.access.connect || connect.isPending} /></label>
        {!presta && <label className="block text-sm space-y-1">Identifiant WordPress<Input required autoComplete="off" value={username} onChange={event => setUsername(event.target.value)} disabled={!data.access.connect || connect.isPending} /></label>}
        <label className="block text-sm space-y-1">{presta ? "Clé du module PrestaShop" : "Mot de passe d’application"}<Input required type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} disabled={!data.access.connect || connect.isPending} /></label>
        <div className="flex flex-wrap gap-2"><Button disabled={!data.access.connect || !data.access.configured || connect.isPending}>{connect.isPending ? "Vérification…" : data.connection ? "Enregistrer les accès" : "Connecter " + name}</Button>
          {editing && <Button type="button" variant="outline" disabled={connect.isPending} onClick={() => { setEditing(false); setPassword("") }}>Annuler</Button>}</div>
      </form>
      {!data.access.configured && <p className="text-sm text-muted-foreground">Les connexions CMS doivent être activées par l’administrateur de la plateforme.</p>}
    </>}
    {connect.error && <p role="alert" className="text-sm text-destructive">{connect.error.message}</p>}
  </CardContent></Card>
}

function Resources({ projectId, data }: { projectId: string; data: ProjectCms }) {
  const presta = data.connection?.provider === "PRESTASHOP"
  const [kind, setKind] = useState<CmsResource["kind"]>(presta ? "product" : "page"), [page, setPage] = useState(1)
  const cache = useQueryClient()
  const resources = useQuery({ queryKey: ["cms-resources", projectId, data.connection?.id, kind, page],
    queryFn: () => apiClient.getCmsResources(projectId, kind, page), enabled: !!data.connection && data.access.connect, retry: false, staleTime: 30_000 })
  const generate = useMutation({ mutationFn: ({ id, mode }: { id: number; mode: "SEO" | "SPELLING" }) => apiClient.generateCmsCorrection(projectId, id, mode),
    onSuccess: () => toast.success("Proposition préparée : vérifiez l’avant/après."),
    onSettled: async () => { await cache.invalidateQueries({ queryKey: ["cms", projectId] }) },
    onError: (error: Error) => toast.error(error.message) })
  const allowed = data.access.generate && data.access.aiConfigured && data.access.used < data.access.quota
  return <Card><CardHeader><CardTitle className="text-lg">Préparer les corrections</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">L’IA prépare une proposition par page. Vous validez sa publication après lecture. Ce premier périmètre concerne les champs SEO, y compris pour « Corriger les fautes ».</p>
    <p className="text-sm">Propositions ce mois : <strong>{data.access.used} / {data.access.quota}</strong>. Chaque génération lancée compte, même si elle échoue ; la publication et l’annulation ne consomment pas de proposition.</p>
    {!data.access.generate && <p className="text-sm text-muted-foreground">Votre rôle ou abonnement ne permet pas les propositions et corrections CMS.</p>}
    {!data.access.aiConfigured && <p className="text-sm text-muted-foreground">La génération IA doit être activée par l’administrateur.</p>}
    {data.access.connect ? <>
      <div className="flex flex-wrap items-center gap-3"><label className="text-sm">Contenu{" "}
        <select className="rounded-md border bg-background px-3 py-2" value={kind} onChange={event => { setKind(event.target.value as CmsResource["kind"]); setPage(1) }}>
          {!presta && <><option value="page">Pages</option><option value="post">Articles</option></>}<option value="product">{presta ? "Produits PrestaShop" : "Produits WooCommerce"}</option>
        </select></label><Button variant="outline" disabled={resources.isFetching} onClick={() => void resources.refetch()}>Actualiser les pages</Button></div>
      {resources.isLoading && <Skeleton className="h-24" />}
      {resources.error && <p role="alert" className="text-sm text-destructive">{resources.error.message}</p>}
      {resources.data?.resources.length === 0 && <p className="text-sm text-muted-foreground">Aucun contenu publié et modifiable sur cette page.</p>}
      {resources.data?.resources.map(resource => <div key={resource.id} className="rounded-lg border p-4 space-y-3">
        <p className="font-medium">{resource.title}</p><p className="text-xs break-all text-muted-foreground">{resource.url}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!allowed || generate.isPending} onClick={() => generate.mutate({ id: resource.id, mode: "SEO" })}>{generate.isPending && generate.variables?.id === resource.id ? "Préparation…" : "Améliorer mon SEO"}</Button>
          <Button size="sm" variant="outline" disabled={!allowed || generate.isPending || !resource.seoTitle && !resource.seoDescription} onClick={() => generate.mutate({ id: resource.id, mode: "SPELLING" })}>Corriger les fautes</Button>
        </div>
      </div>)}
      <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 1 || resources.isFetching} onClick={() => setPage(value => value - 1)}>Précédent</Button>
        <span className="text-sm">Page {page}</span><Button variant="outline" disabled={!resources.data?.hasMore || resources.isFetching} onClick={() => setPage(value => value + 1)}>Suivant</Button></div>
    </> : <p className="text-sm text-muted-foreground">Un compte membre est nécessaire pour lire le CMS.</p>}
  </CardContent></Card>
}

function Correction({ projectId, item, data }: { projectId: string; item: CmsCorrectionSummary; data: ProjectCms }) {
  const cache = useQueryClient(), [confirm, setConfirm] = useState<"apply" | "restore" | null>(null)
  const publish = useMutation({ mutationFn: (action: "apply" | "restore" | "reconcile") => apiClient.publishCmsCorrection(projectId, item.id, action),
    onSuccess: () => { setConfirm(null); toast.success("État confirmé par le CMS") },
    onSettled: async () => { await cache.invalidateQueries({ queryKey: ["cms", projectId] }); await cache.invalidateQueries({ queryKey: ["cms-resources", projectId] }) },
    onError: (error: Error) => toast.error(error.message) })
  const active = item.connectionId === data.connection?.id, available = active && data.access.publish && !publish.isPending
  return <div className="rounded-lg border p-4 space-y-3">
    <div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{item.title}</p><Badge className="whitespace-normal text-left" variant={item.status === "UNCERTAIN" ? "destructive" : "secondary"}>{STATUS[item.status]}</Badge></div>
    <p className="text-xs break-all text-muted-foreground">{item.resourceUrl} · {new Date(item.createdAt).toLocaleString("fr-FR")}</p>
    {["DRAFT", "APPLIED", "RESTORED", "CONFLICT", "APPLYING", "RESTORING", "UNCERTAIN"].includes(item.status) && <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg bg-muted p-3 text-sm space-y-2"><p className="font-medium">Avant</p><p>Titre SEO : {value(item.beforeTitle)}</p><p>Description : {value(item.beforeDescription)}</p></div>
      <div className="rounded-lg bg-muted p-3 text-sm space-y-2"><p className="font-medium">Proposition</p><p>Titre SEO : {value(item.afterTitle)}</p><p>Description : {value(item.afterDescription)}</p></div>
    </div>}
    {item.reason && <p className="text-sm text-muted-foreground">{item.reason}</p>}
    {item.status === "APPLIED" && <p className="text-sm text-muted-foreground">La publication est confirmée dans le CMS. Purgez le cache du site si nécessaire, puis <Link href="/optimization" className="underline">relancez un audit pour vérifier le rendu public</Link>.</p>}
    {confirm ? <div className="rounded-lg border p-3 space-y-3">
      <p className="text-sm">{confirm === "apply" ? "Publier exactement cette proposition dans le CMS ?" : "Restaurer les valeurs précédentes ? Un changement intervenu depuis la publication bloquera l’annulation."}</p>
      <div className="flex flex-wrap gap-2"><Button disabled={!available} onClick={() => publish.mutate(confirm)}>{confirm === "apply" ? "Confirmer la publication" : "Confirmer l’annulation"}</Button>
        <Button variant="outline" disabled={publish.isPending} onClick={() => setConfirm(null)}>Revenir à l’aperçu</Button></div>
    </div> : <div className="flex flex-wrap gap-2">
      {item.status === "DRAFT" && <Button disabled={!available} onClick={() => setConfirm("apply")}>Appliquer cette proposition</Button>}
      {item.status === "APPLIED" && <Button variant="outline" disabled={!available} onClick={() => setConfirm("restore")}>Annuler les changements</Button>}
      {["APPLYING", "RESTORING", "UNCERTAIN"].includes(item.status) && <Button variant="outline" disabled={!active || !data.access.connect || publish.isPending} onClick={() => publish.mutate("reconcile")}>Vérifier l’opération</Button>}
    </div>}
    {publish.error && <p role="alert" className="text-sm text-destructive">{publish.error.message}</p>}
  </div>
}

function ProjectCmsPanel({ projectId }: { projectId: string }) {
  const data = useQuery({ queryKey: ["cms", projectId], queryFn: () => apiClient.getProjectCms(projectId), retry: false,
    refetchInterval: query => query.state.data?.corrections.some(item => ["GENERATING", "APPLYING", "RESTORING"].includes(item.status)) ? 5000 : false })
  if (data.isLoading) return <Skeleton className="h-64" />
  if (data.error) return <Card><CardContent className="pt-6 space-y-3"><p role="alert">{data.error.message}</p><Button onClick={() => void data.refetch()}>Réessayer</Button></CardContent></Card>
  if (!data.data) return null
  return <div className="space-y-6"><ConnectionForm key={data.data.connection?.id ?? "new"} projectId={projectId} data={data.data} />
    {data.data.connection && <Resources key={data.data.connection.id} projectId={projectId} data={data.data} />}
    <Card><CardHeader><CardTitle className="text-lg">Propositions & historique</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Les 50 dernières propositions de ce projet. Aucune publication n’est déclenchée par la génération.</p>
      {data.data.corrections.length ? data.data.corrections.map(item => <Correction key={item.id} projectId={projectId} item={item} data={data.data!} />) : <p className="text-sm text-muted-foreground">Préparez une première proposition depuis une page du CMS.</p>}
    </CardContent></Card></div>
}
export function CmsConnectionsPanel() {
  const { activeProjectId, setActiveProjectId } = useActiveProject(), projects = useProjects()
  return <div className="p-4 md:p-6 space-y-6">
    <div><h1 className="text-2xl font-semibold">Connexions CMS</h1><p className="mt-2 text-muted-foreground">Connectez le site de votre client, préparez ses corrections SEO et validez leur publication depuis un seul espace.</p></div>
    <label className="block text-sm space-y-2">Projet client<select className="block w-full max-w-md rounded-md border bg-background px-3 py-2" value={activeProjectId ?? ""} onChange={event => setActiveProjectId(event.target.value || null)}>
      <option value="">Choisir un projet</option>{projects.data?.map(project => <option key={project.id} value={project.id}>{project.name} — {project.domain}</option>)}</select></label>
    {projects.error && <p role="alert" className="text-destructive">{projects.error.message}</p>}
    <div className="grid gap-4 md:grid-cols-3">
      {[["WordPress / WooCommerce", "Connecteur disponible", "Pages, articles et produits : titres SEO et méta-descriptions."],
        ["Shopify", "À venir", "Le connecteur Shopify n’est pas encore livré."], ["PrestaShop", "Pilote disponible", "Produits : titres SEO et méta-descriptions, boutique et langue explicites."]].map(([name, status, description]) =>
        <Card key={name}><CardContent className="pt-5 space-y-2"><p className="font-medium">{name}</p><Badge variant="outline">{status}</Badge><p className="text-sm text-muted-foreground">{description}</p></CardContent></Card>)}
    </div>
    {activeProjectId ? <ProjectCmsPanel key={activeProjectId} projectId={activeProjectId} /> : <p className="text-muted-foreground">Choisissez un projet pour connecter son CMS. <Link href="/projects" className="underline">Gérer les projets</Link></p>}
  </div>
}
