import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/layout/Providers"
import { Toaster } from "@/components/ui/sonner"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const siteUrl = "https://seo.404notfood.fr"

export const metadata: Metadata = {
  title: {
    default: "404 SEO — Plateforme d'audit SEO technique avec IA",
    template: "%s — 404 SEO",
  },
  description:
    "Auditez, analysez et optimisez le SEO de vos sites web avec l'IA. Audit technique complet, suivi de positions, analyse de backlinks, rapports PDF marque blanche. Essai gratuit.",
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: siteUrl,
    siteName: "404 SEO",
    title: "404 SEO — Plateforme d'audit SEO technique avec IA",
    description:
      "Auditez, analysez et optimisez le SEO de vos sites web. Audit technique, suivi de positions, backlinks, rapports PDF. Essai gratuit.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "404 SEO — Plateforme d'audit SEO",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "404 SEO — Audit SEO technique avec IA",
    description:
      "Auditez et optimisez le SEO de vos sites web avec l'IA. Essai gratuit.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
