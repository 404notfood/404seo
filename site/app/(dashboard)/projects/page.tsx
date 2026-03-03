"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog"
import { FolderOpen, Plus, Search, Trash2, Globe, BarChart2 } from "lucide-react"
import { useProjects, useCreateProject, useDeleteProject } from "@/hooks/useProjects"
import { useRole } from "@/hooks/useMe"
import { formatDistanceToNow } from "@/lib/date"

export default function ProjectsPage() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [domain, setDomain] = useState("")
  const [description, setDescription] = useState("")

  const { data: projects, isLoading } = useProjects()
  const { mutate: createProject, isPending } = useCreateProject()
  const { mutate: deleteProject } = useDeleteProject()
  const { isMember, isAdmin } = useRole()

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    createProject({ name, domain, description: description || undefined }, {
      onSuccess: () => {
        setOpen(false)
        setName("")
        setDomain("")
        setDescription("")
      },
    })
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projets</h1>
          <p className="text-slate-500 mt-1">Organisez vos audits par client ou domaine</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          {isMember && (
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nouveau projet
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Créer un projet</DialogTitle>
              <DialogDescription>
                Un projet regroupe plusieurs audits pour un même site.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom du projet</Label>
                <Input
                  id="name"
                  placeholder="Mon site e-commerce"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">URL du site</Label>
                <Input
                  id="domain"
                  type="url"
                  placeholder="https://exemple.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description (optionnel)</Label>
                <Input
                  id="desc"
                  placeholder="Notes sur ce projet..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Création..." : "Créer"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}
        </div>
      )}

      {!isLoading && (!projects || projects.length === 0) && (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <FolderOpen className="h-6 w-6 text-slate-400" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">Aucun projet</h3>
            <p className="text-sm text-slate-500 mb-4">
              Créez un projet pour regrouper vos audits par client ou domaine
            </p>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Créer un projet
            </Button>
          </CardContent>
        </Card>
      )}

      {projects && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <FolderOpen className="h-5 w-5 text-blue-600" />
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => deleteProject(project.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all"
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <h3 className="font-semibold text-slate-900 mb-1">{project.name}</h3>

                {project.description && (
                  <p className="text-xs text-slate-400 mb-2 line-clamp-2">{project.description}</p>
                )}

                <div className="flex items-center gap-1 text-xs text-slate-400 mb-4">
                  <Globe className="h-3 w-3" />
                  <a
                    href={project.domain}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 truncate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {project.domain.replace(/^https?:\/\//, "")}
                  </a>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <BarChart2 className="h-3 w-3" />
                    {project._count.audits} audit{project._count.audits !== 1 ? "s" : ""}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/audits?project=${project.id}`}>
                      <Search className="h-3 w-3 mr-1.5" />
                      Auditer
                    </Link>
                  </Button>
                </div>

                <p className="text-xs text-slate-300 mt-2">
                  Créé {formatDistanceToNow(project.createdAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
