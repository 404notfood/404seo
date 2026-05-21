import Image from "next/image"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Footer } from "@/components/layout/Footer"
import { BrandConfig } from "@/lib/config"

export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  const brand = BrandConfig.getInstance()
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-slate-100 bg-white">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src={brand.logoPath}
              alt={brand.productName}
              width={100}
              height={30}
              className="h-8 w-auto"
            />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-6 py-12 w-full">{children}</main>

      <Footer />
    </div>
  )
}
