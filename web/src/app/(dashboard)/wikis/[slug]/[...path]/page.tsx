'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useKBStore } from '@/stores'
import { useKBDocuments } from '@/hooks/useKBDocuments'
import { NoteEditor } from '@/components/editor/NoteEditor'
import { Loader2, FileText, ChevronLeft, ChevronRight } from 'lucide-react'

export default function FilePage() {
  const router = useRouter()
  const params = useParams<{ slug: string; path: string[] }>()
  const knowledgeBases = useKBStore((s) => s.knowledgeBases)
  const kbLoading = useKBStore((s) => s.loading)

  const kb = React.useMemo(
    () => knowledgeBases.find((k) => k.slug === params.slug),
    [knowledgeBases, params.slug]
  )

  const { documents, loading: docsLoading } = useKBDocuments(kb?.id ?? '')

  const docNumber = parseInt(params.path?.[0] ?? '', 10)

  const document = React.useMemo(() => {
    if (!documents.length || isNaN(docNumber)) return null
    return documents.find((d) => d.document_number === docNumber) ?? null
  }, [documents, docNumber])

  if (kbLoading || (kb && docsLoading)) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex items-center gap-1.5 px-5 py-4 shrink-0">
          <button
            onClick={() => router.push(`/wikis/${params.slug}`)}
            className="p-1 rounded transition-colors hover:bg-accent cursor-pointer text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button disabled className="p-1 rounded text-muted-foreground/30 cursor-default">
            <ChevronRight className="size-4" />
          </button>
          <nav className="flex items-center gap-1 text-sm">
            <button
              onClick={() => router.push('/wikis')}
              className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer truncate"
            >
              {kb?.name ?? params.slug}
            </button>
            <span className="text-muted-foreground/40">/</span>
            <div className="h-4 w-48 bg-muted rounded animate-pulse" />
          </nav>
        </div>
        <div className="flex-1 px-6">
          <div className="max-w-4xl mx-auto bg-card rounded-2xl border border-border/40 shadow-sm min-h-full px-20 py-12">
            <div className="h-8 w-80 bg-muted rounded animate-pulse mb-6" />
            <div className="h-4 w-48 bg-muted rounded animate-pulse mb-4" />
            <div className="h-4 w-64 bg-muted rounded animate-pulse mb-8" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-muted/60 rounded animate-pulse" />
              <div className="h-4 w-5/6 bg-muted/60 rounded animate-pulse" />
              <div className="h-4 w-4/6 bg-muted/60 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!kb) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 bg-background">
        <h1 className="text-lg font-medium">Wiki not found</h1>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 bg-background">
        <h1 className="text-lg font-medium">Document not found</h1>
        <p className="text-sm text-muted-foreground">
          Document #{docNumber} does not exist in this wiki.
        </p>
        <button
          onClick={() => router.push(`/wikis/${params.slug}`)}
          className="mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Back to {kb.name}
        </button>
      </div>
    )
  }

  const isNote = document.file_type === 'md' || document.file_type === 'txt' || document.file_type === 'note'

  if (isNote) {
    return (
      <NoteEditor
        documentId={document.id}
        initialTitle={document.title ?? document.filename}
        initialTags={document.tags}
        backLabel={kb.name}
        onBack={() => router.push(`/wikis/${params.slug}`)}
      />
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 bg-background">
      <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-muted">
        <FileText size={28} className="text-muted-foreground" />
      </div>
      <div className="text-center">
        <h1 className="text-lg font-medium">{document.title || document.filename}</h1>
        <p className="text-xs text-muted-foreground mt-2">File viewer coming soon</p>
      </div>
      <button
        onClick={() => router.push(`/wikis/${params.slug}`)}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        Back to {kb.name}
      </button>
    </div>
  )
}
