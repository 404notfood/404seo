import Image from "next/image"
import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-slate-200 py-10">
      <div className="max-w-6xl mx-auto px-6">
        {/* Ligne principale */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <Image src="/logo.png" alt="404 SEO" width={100} height={30} className="h-8 w-auto" />
          <p className="text-sm text-slate-400">
            © {new Date().getFullYear()} 404 SEO · Tous droits réservés ·{" "}
            <a href="mailto:laurentbwa@gmail.com" className="hover:text-slate-600 transition-colors">
              Contact
            </a>
          </p>
          <div className="flex items-center gap-5 text-sm text-slate-400">
            <Link href="/login" className="hover:text-slate-600 transition-colors">Connexion</Link>
            <Link href="/register" className="hover:text-slate-600 transition-colors">Inscription</Link>
          </div>
        </div>

        {/* Liens légaux */}
        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
          <Link href="/legal/mentions-legales" className="hover:text-slate-600 transition-colors">
            Mentions légales
          </Link>
          <Link href="/legal/privacy" className="hover:text-slate-600 transition-colors">
            Confidentialité
          </Link>
          <Link href="/legal/terms" className="hover:text-slate-600 transition-colors">
            CGU
          </Link>
          <Link href="/legal/cookies" className="hover:text-slate-600 transition-colors">
            Cookies
          </Link>
        </div>
      </div>
    </footer>
  )
}
