"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bot, Send, User } from "lucide-react"
import { ComingSoonBanner } from "@/components/layout/ComingSoonBanner"

interface Message {
  role: "user" | "assistant"
  content: string
}

const INITIAL_MESSAGES: Message[] = [
  {
    role: "assistant",
    content: "Bonjour ! Je suis votre agent IA SEO. Je peux analyser vos audits, identifier des opportunités d'optimisation et vous proposer des plans d'action. Que souhaitez-vous savoir ?",
  },
]

const MOCK_RESPONSES: Record<string, string> = {
  default: "Cette fonctionnalité sera bientôt disponible avec l'intégration de l'API Claude. En attendant, consultez la page Recommandations IA pour des insights basés sur vos audits.",
  score: "Votre score SEO global est calculé à partir de 4 axes : technique, on-page, performance et UX mobile. Pour l'améliorer, concentrez-vous d'abord sur les problèmes critiques identifiés dans la page Problèmes & Erreurs.",
  performance: "Pour améliorer les performances, commencez par optimiser les images (compression WebP), activez la mise en cache navigateur, et minimisez les fichiers CSS/JS. Consultez la page Vitesse & Performance pour les détails.",
  contenu: "Un bon contenu SEO doit contenir au minimum 300 mots, inclure vos mots-clés principaux dans le titre, la meta description et le H1. Vérifiez l'Audit de contenu pour identifier les pages à améliorer.",
}

function getMockResponse(input: string): string {
  const lower = input.toLowerCase()
  if (lower.includes("score")) return MOCK_RESPONSES.score
  if (lower.includes("performance") || lower.includes("vitesse") || lower.includes("lent")) return MOCK_RESPONSES.performance
  if (lower.includes("contenu") || lower.includes("texte") || lower.includes("mot")) return MOCK_RESPONSES.contenu
  return MOCK_RESPONSES.default
}

export default function AIAgentPage() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES)
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function handleSend() {
    if (!input.trim() || isTyping) return
    const userMsg: Message = { role: "user", content: input.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsTyping(true)

    setTimeout(() => {
      const response = getMockResponse(userMsg.content)
      setMessages((prev) => [...prev, { role: "assistant", content: response }])
      setIsTyping(false)
    }, 1200)
  }

  return (
    <div className="p-6 space-y-6 flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex items-center gap-3 shrink-0">
        <div className="p-2 rounded-xl" style={{ background: "rgba(6,182,212,0.1)" }}>
          <Bot className="h-6 w-6" style={{ color: "#06b6d4" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agent IA SEO</h1>
          <p className="text-sm text-slate-500">Posez vos questions SEO à l'IA</p>
        </div>
      </div>

      <ComingSoonBanner feature="L'agent IA avec Claude API" />

      {/* Chat area */}
      <Card className="border-slate-100 rounded-2xl shadow-sm flex-1 flex flex-col min-h-0">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
              {msg.role === "assistant" && (
                <div className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center" style={{ background: "rgba(6,182,212,0.1)" }}>
                  <Bot className="h-4 w-4" style={{ color: "#06b6d4" }} />
                </div>
              )}
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {msg.content}
              </div>
              {msg.role === "user" && (
                <div className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center bg-blue-600">
                  <User className="h-4 w-4 text-white" />
                </div>
              )}
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center" style={{ background: "rgba(6,182,212,0.1)" }}>
                <Bot className="h-4 w-4" style={{ color: "#06b6d4" }} />
              </div>
              <div className="bg-slate-100 rounded-2xl px-4 py-3 text-sm text-slate-400">
                <span className="animate-pulse">En train de réfléchir...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </CardContent>

        {/* Input */}
        <div className="p-4 border-t border-slate-100">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend() }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez votre question SEO..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
            <Button type="submit" size="sm" disabled={!input.trim() || isTyping} className="px-4">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  )
}
