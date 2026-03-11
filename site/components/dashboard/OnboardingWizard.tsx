"use client"

import { useState, useEffect } from "react"
import { useProjects, useCreateProject } from "@/hooks/useProjects"
import { useLaunchAudit } from "@/hooks/useAudits"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  FolderPlus,
  Search,
  CheckCircle2,
  ArrowRight,
  Rocket,
  Globe,
  BarChart3,
} from "lucide-react"

const STEPS = [
  { id: 1, title: "Créez un projet", desc: "Ajoutez le site à auditer", icon: FolderPlus },
  { id: 2, title: "Lancez un audit", desc: "Analysez votre site", icon: Search },
  { id: 3, title: "Consultez les résultats", desc: "Suivez vos recommandations", icon: BarChart3 },
]

export default function OnboardingWizard() {
  const { data: projects } = useProjects()
  const createProject = useCreateProject()
  const launchAudit = useLaunchAudit()

  const [step, setStep] = useState(1)
  const [name, setName] = useState("")
  const [domain, setDomain] = useState("")
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  // Si l'utilisateur a déjà un projet, passer à l'étape 2
  useEffect(() => {
    if (projects && projects.length > 0 && step === 1) {
      setCreatedProjectId(projects[0].id)
      setStep(2)
    }
  }, [projects, step])

  // Si dismissé via localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("onboarding_dismissed") === "true") {
      setDismissed(true)
    }
  }, [])

  if (dismissed) return null

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault()
    let url = domain.trim()
    if (url && !url.startsWith("http")) url = `https://${url}`
    createProject.mutate(
      { name: name.trim(), domain: url },
      {
        onSuccess: (project) => {
          setCreatedProjectId(project.id)
          setStep(2)
        },
      }
    )
  }

  async function handleLaunchAudit() {
    if (!createdProjectId) return
    launchAudit.mutate(
      { projectId: createdProjectId },
      {
        onSuccess: () => {
          setStep(3)
          localStorage.setItem("onboarding_dismissed", "true")
        },
      }
    )
  }

  function handleDismiss() {
    localStorage.setItem("onboarding_dismissed", "true")
    setDismissed(true)
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="h-16 w-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)" }}>
          <Rocket className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#0f172a" }}>
          Bienvenue sur 404 SEO !
        </h2>
        <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
          Configurez votre premier audit en 3 étapes simples
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center gap-0 mb-10">
        {STEPS.map((s, i) => {
          const done = step > s.id
          const active = step === s.id
          return (
            <div key={s.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300"
                  style={{
                    background: done ? "#10b981" : active ? "#2563eb" : "#f1f5f9",
                    color: done || active ? "#fff" : "#94a3b8",
                    boxShadow: active ? "0 0 0 4px rgba(37,99,235,0.15)" : "none",
                  }}
                >
                  {done ? <CheckCircle2 className="h-5 w-5" /> : s.id}
                </div>
                <p className="text-xs mt-2 font-medium" style={{ color: active ? "#2563eb" : done ? "#10b981" : "#94a3b8" }}>
                  {s.title}
                </p>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className="w-16 h-0.5 mx-3 mt-[-16px] transition-all duration-300"
                  style={{ background: step > s.id + 1 ? "#10b981" : step > s.id ? "#2563eb" : "#e2e8f0" }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        {step === 1 && (
          <form onSubmit={handleCreateProject} className="space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(37,99,235,0.08)" }}>
                <Globe className="h-5 w-5" style={{ color: "#2563eb" }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold" style={{ color: "#0f172a" }}>Ajoutez votre site</h3>
                <p className="text-xs text-slate-400">Le nom et l&apos;URL de votre site web</p>
              </div>
            </div>

            <div>
              <Label htmlFor="name">Nom du projet</Label>
              <Input
                id="name"
                placeholder="Mon site web"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="domain">URL du site</Label>
              <Input
                id="domain"
                placeholder="https://monsite.fr"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full btn-glow"
              style={{ background: "#2563eb" }}
              disabled={createProject.isPending || !name.trim() || !domain.trim()}
            >
              {createProject.isPending ? "Création…" : "Créer le projet"}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </form>
        )}

        {step === 2 && (
          <div className="text-center space-y-6">
            <div className="flex items-center gap-3 justify-center mb-2">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(37,99,235,0.08)" }}>
                <Search className="h-5 w-5" style={{ color: "#2563eb" }} />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-semibold" style={{ color: "#0f172a" }}>Lancez votre premier audit</h3>
                <p className="text-xs text-slate-400">L&apos;analyse prend environ 1-2 minutes</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
              <p>Votre audit analysera :</p>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> SEO technique</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Contenu on-page</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Performance</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> UX mobile</span>
              </div>
            </div>

            <Button
              onClick={handleLaunchAudit}
              className="w-full btn-glow"
              style={{ background: "#2563eb" }}
              disabled={launchAudit.isPending}
            >
              {launchAudit.isPending ? "Lancement…" : "Lancer l'audit"}
              <Rocket className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="text-center space-y-4">
            <div className="h-16 w-16 rounded-full mx-auto flex items-center justify-center" style={{ background: "rgba(16,185,129,0.1)" }}>
              <CheckCircle2 className="h-8 w-8" style={{ color: "#10b981" }} />
            </div>
            <h3 className="text-lg font-semibold" style={{ color: "#0f172a" }}>Audit lancé !</h3>
            <p className="text-sm text-slate-400">
              Votre audit est en cours d&apos;exécution. Vous recevrez une notification quand il sera terminé.
            </p>
            <Button
              asChild
              className="w-full btn-glow"
              style={{ background: "#2563eb" }}
            >
              <a href="/audits">Voir mes audits <ArrowRight className="h-4 w-4 ml-2" /></a>
            </Button>
          </div>
        )}
      </div>

      {/* Dismiss link */}
      {step < 3 && (
        <p className="text-center mt-4">
          <button onClick={handleDismiss} className="text-xs text-slate-400 hover:text-slate-600 underline">
            Passer l&apos;introduction
          </button>
        </p>
      )}
    </div>
  )
}
