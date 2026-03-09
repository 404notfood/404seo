"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Loader2, Palette, Image, Building2, Link2, Link2Off, CheckCircle2 } from "lucide-react"
import { useSession } from "@/lib/auth-client"
import { useTenant, useUpdateBranding } from "@/hooks/useTenant"
import { useRole } from "@/hooks/useMe"
import { useGoogleStatus, useDisconnectGoogle } from "@/hooks/useGoogle"
import { apiClient } from "@/lib/api-client"

export default function SettingsPage() {
  const { data: session } = useSession()
  const { isAdmin } = useRole()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
        <p className="text-slate-500 mt-1">Gérez votre profil et vos préférences</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profil</CardTitle>
            <CardDescription>Vos informations personnelles</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom complet</Label>
              <Input
                id="name"
                defaultValue={session?.user?.name ?? ""}
                placeholder="Votre nom"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                defaultValue={session?.user?.email ?? ""}
                disabled
              />
              <p className="text-xs text-slate-500">L&apos;email ne peut pas être modifié</p>
            </div>
            <Button>Sauvegarder</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mot de passe</CardTitle>
            <CardDescription>Modifiez votre mot de passe</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Mot de passe actuel</Label>
              <Input id="current-password" type="password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nouveau mot de passe</Label>
              <Input id="new-password" type="password" />
            </div>
            <Button variant="outline">Changer le mot de passe</Button>
          </CardContent>
        </Card>

        <GoogleConnectionCard />
        {isAdmin && <BrandingCard />}
      </div>
    </div>
  )
}

function GoogleConnectionCard() {
  const { data: status, isLoading } = useGoogleStatus()
  const { mutate: disconnect, isPending: isDisconnecting } = useDisconnectGoogle()

  const services = [
    { label: "Google Business Profile", color: "#4285F4" },
    { label: "Analytics 4", color: "#0F9D58" },
    { label: "Search Console", color: "#F4B400" },
  ]

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-1" />
        </CardHeader>
        <CardContent><Skeleton className="h-20 w-full" /></CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(66,133,244,0.1)" }}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <div>
            <CardTitle>Connexions Google</CardTitle>
            <CardDescription>Connectez vos services Google en une seule autorisation</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Services disponibles */}
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <Badge
              key={s.label}
              className="flex items-center gap-1.5 text-xs px-2 py-1"
              style={{ background: `${s.color}15`, color: s.color, border: `1px solid ${s.color}30` }}
            >
              <CheckCircle2 className="h-3 w-3" />
              {s.label}
            </Badge>
          ))}
        </div>

        <Separator />

        {status?.connected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: "rgba(16,185,129,0.1)" }}>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">Compte connecté</p>
                <p className="text-xs text-slate-500">{status.email}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnect()}
              disabled={isDisconnecting}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              {isDisconnecting ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Déconnexion…</>
              ) : (
                <><Link2Off className="h-3.5 w-3.5 mr-1.5" />Déconnecter</>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Aucun compte Google connecté</p>
              <p className="text-xs text-slate-400 mt-0.5">Importez automatiquement vos fiches GBP, Analytics et Search Console</p>
            </div>
            <Button
              onClick={() => apiClient.connectGoogle()}
              className="btn-glow gap-1.5"
              style={{ background: "#4285F4" }}
            >
              <Link2 className="h-3.5 w-3.5" />
              Connecter avec Google
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BrandingCard() {
  const { data: tenant, isLoading } = useTenant()
  const { mutate: updateBranding, isPending } = useUpdateBranding()

  const [name, setName] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  const [brandColor, setBrandColor] = useState("#2563eb")

  useEffect(() => {
    if (tenant) {
      setName(tenant.name)
      setLogoUrl(tenant.logoUrl || "")
      setBrandColor(tenant.brandColor || "#2563eb")
    }
  }, [tenant])

  function handleSave() {
    updateBranding({ name, logoUrl: logoUrl || null, brandColor })
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: `${brandColor}18` }}>
            <Palette className="h-3.5 w-3.5" style={{ color: brandColor }} />
          </div>
          <div>
            <CardTitle>Marque blanche</CardTitle>
            <CardDescription>Personnalisez vos rapports PDF</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Nom entreprise */}
        <div className="space-y-2">
          <Label htmlFor="brand-name" className="flex items-center gap-1.5 text-sm">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            Nom de l&apos;entreprise
          </Label>
          <Input
            id="brand-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mon Agence SEO"
          />
        </div>

        {/* Couleur de marque */}
        <div className="space-y-2">
          <Label htmlFor="brand-color" className="flex items-center gap-1.5 text-sm">
            <Palette className="h-3.5 w-3.5 text-slate-400" />
            Couleur de marque
          </Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              id="brand-color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-9 w-14 rounded-md border border-slate-200 cursor-pointer"
            />
            <Input
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              placeholder="#2563eb"
              className="flex-1 font-mono text-sm"
              maxLength={7}
            />
          </div>
        </div>

        {/* URL logo */}
        <div className="space-y-2">
          <Label htmlFor="brand-logo" className="flex items-center gap-1.5 text-sm">
            <Image className="h-3.5 w-3.5 text-slate-400" />
            URL du logo
          </Label>
          <Input
            id="brand-logo"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://exemple.com/logo.png"
          />
          <p className="text-[10px] text-slate-400">Image PNG ou SVG, idéalement 200×60px</p>
        </div>

        <Separator />

        {/* Preview */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Aperçu du rapport</p>
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
            <div className="flex items-center gap-3 mb-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-8 max-w-[120px] object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                />
              ) : (
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: brandColor }}
                >
                  {name.charAt(0).toUpperCase() || "S"}
                </div>
              )}
              <span className="font-semibold text-sm" style={{ color: "#0f172a" }}>{name || "Mon Entreprise"}</span>
            </div>
            <div className="h-2 rounded-full" style={{ background: brandColor, opacity: 0.7, width: "60%" }} />
            <div className="h-2 rounded-full mt-1.5 bg-slate-200" style={{ width: "80%" }} />
            <div className="h-2 rounded-full mt-1.5 bg-slate-200" style={{ width: "45%" }} />
          </div>
        </div>

        <Button onClick={handleSave} disabled={isPending} className="btn-glow" style={{ background: "#2563eb" }}>
          {isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enregistrement…</>
          ) : (
            "Sauvegarder le branding"
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
