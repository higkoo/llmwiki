'use client'

import * as React from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Upload as UploadIcon, BookOpen, ArrowUpRight, Loader2, FileText } from 'lucide-react'
import * as tus from 'tus-js-client'
import { useUserStore } from '@/stores'
import { useKBDocuments } from '@/hooks/useKBDocuments'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
import dynamic from 'next/dynamic'
import { KBSidenav } from '@/components/kb/KBSidenav'
import { WikiContent } from '@/components/wiki/WikiContent'
import { NoteEditor } from '@/components/editor/NoteEditor'
import type { WikiNode } from '@/components/wiki/WikiSidenav'
import type { DocumentListItem } from '@/lib/types'

const PdfViewer = dynamic(() => import('@/components/viewer/PdfViewer'), { ssr: false })

const wikiPathCache = new Map<string, string>()

function isNoteFile(doc: DocumentListItem): boolean {
  const ft = doc.file_type
  return ft === 'md' || ft === 'txt' || ft === 'note'
}

function buildTreeFromDocs(docs: DocumentListItem[]): WikiNode[] {
  const groups = new Map<string, WikiNode[]>()
  const topLevel: WikiNode[] = []

  for (const doc of docs) {
    const relative = (doc.path + doc.filename).replace(/^\/wiki\/?/, '')
    const parts = relative.split('/')
    const title =
      doc.title ||
      parts[parts.length - 1].replace(/\.(md|txt|json)$/, '').replace(/[-_]/g, ' ')

    if (parts.length === 1) {
      topLevel.push({ title, path: relative })
    } else {
      const folder = parts.slice(0, -1).join('/')
      if (!groups.has(folder)) groups.set(folder, [])
      groups.get(folder)!.push({ title, path: relative })
    }
  }

  const tree: WikiNode[] = []
  const overviewIdx = topLevel.findIndex(
    (n) => n.path === 'index.md' || n.path === 'overview.md' || n.path === 'README.md',
  )
  if (overviewIdx >= 0) tree.push(topLevel.splice(overviewIdx, 1)[0])

  for (const [folder, children] of groups) {
    const folderTitle = folder.split('/').pop()!.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    tree.push({ title: folderTitle, children: children.sort((a, b) => a.title.localeCompare(b.title)) })
  }

  tree.push(...topLevel.sort((a, b) => a.title.localeCompare(b.title)))
  return tree
}

function findFirstPath(nodes: WikiNode[]): string | null {
  for (const node of nodes) {
    if (node.path) return node.path
    if (node.children) {
      const found = findFirstPath(node.children)
      if (found) return found
    }
  }
  return null
}

type Props = {
  kbId: string
  kbSlug: string
  kbName: string
}

export function KBDetail({ kbId, kbSlug, kbName }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = useUserStore((s) => s.accessToken)
  const userId = useUserStore((s) => s.user?.id)
  const { documents, setDocuments, loading } = useKBDocuments(kbId)

  // Split documents into wiki and sources
  const wikiDocs = React.useMemo(
    () => documents.filter((d) => d.path === '/wiki/' || d.path.startsWith('/wiki/')),
    [documents],
  )
  const sourceDocs = React.useMemo(
    () => documents.filter((d) => !d.path.startsWith('/wiki/') && !d.archived),
    [documents],
  )
  const hasWiki = wikiDocs.length > 0

  // Wiki state
  const indexDoc = wikiDocs.find((d) => d.filename === 'index.json' && d.path === '/wiki/')
  const [wikiTree, setWikiTree] = React.useState<WikiNode[]>([])
  const [wikiActivePath, setWikiActivePath] = React.useState<string | null>(
    () => wikiPathCache.get(kbId) ?? null,
  )
  const [pageContent, setPageContent] = React.useState('')
  const [pageTitle, setPageTitle] = React.useState('')
  const [pageLoading, setPageLoading] = React.useState(false)
  const [indexLoaded, setIndexLoaded] = React.useState(false)

  // Source doc selection state — synced with ?doc= query param
  const [activeSourceDocId, setActiveSourceDocId] = React.useState<string | null>(null)
  const activeSourceDoc = React.useMemo(
    () => activeSourceDocId ? sourceDocs.find((d) => d.id === activeSourceDocId) ?? null : null,
    [activeSourceDocId, sourceDocs],
  )

  // Restore from URL on initial load
  const hasDocParam = !!searchParams.get('doc')
  const [urlRestored, setUrlRestored] = React.useState(!hasDocParam)
  React.useEffect(() => {
    if (urlRestored || loading || !documents.length) return
    const docNum = searchParams.get('doc')
    if (docNum) {
      const num = parseInt(docNum, 10)
      const doc = documents.find((d) => d.document_number === num)
      if (doc) {
        setActiveSourceDocId(doc.id)
        setWikiActivePath(null)
      }
    }
    setUrlRestored(true)
  }, [loading, documents, searchParams, urlRestored])

  // Sync selection to URL
  const updateUrl = React.useCallback((docNumber: number | null) => {
    const url = new URL(window.location.href)
    if (docNumber) {
      url.searchParams.set('doc', String(docNumber))
    } else {
      url.searchParams.delete('doc')
    }
    router.replace(url.pathname + url.search, { scroll: false })
  }, [router])

  const handleWikiSelect = React.useCallback((path: string) => {
    setWikiActivePath(path)
    setActiveSourceDocId(null)
    updateUrl(null)
  }, [updateUrl])

  const handleSourceSelect = React.useCallback((doc: DocumentListItem) => {
    setActiveSourceDocId(doc.id)
    setWikiActivePath(null)
    updateUrl(doc.document_number)
  }, [updateUrl])

  // Cache active path
  React.useEffect(() => {
    if (wikiActivePath) wikiPathCache.set(kbId, wikiActivePath)
  }, [kbId, wikiActivePath])

  // Build wiki tree
  React.useEffect(() => {
    if (indexDoc && token) {
      apiFetch<{ content: string }>(`/v1/documents/${indexDoc.id}/content`, token)
        .then((res) => {
          try {
            const parsed = JSON.parse(res.content)
            setWikiTree(parsed.tree || [])
          } catch {
            setWikiTree(buildTreeFromDocs(wikiDocs.filter((d) => d.id !== indexDoc.id)))
          }
          setIndexLoaded(true)
        })
        .catch(() => {
          setWikiTree(buildTreeFromDocs(wikiDocs.filter((d) => d.id !== indexDoc.id)))
          setIndexLoaded(true)
        })
    } else {
      setWikiTree(buildTreeFromDocs(wikiDocs))
      setIndexLoaded(true)
    }
  }, [indexDoc?.id, token, wikiDocs.length])

  // Auto-select first wiki page
  React.useEffect(() => {
    if (indexLoaded && !wikiActivePath && wikiTree.length) {
      const first = findFirstPath(wikiTree)
      if (first) setWikiActivePath(first)
    }
  }, [indexLoaded, wikiTree, wikiActivePath])

  // Fetch wiki page content
  React.useEffect(() => {
    if (!wikiActivePath || !token) return

    const doc = wikiDocs.find((d) => {
      const relative = (d.path + d.filename).replace(/^\/wiki\/?/, '')
      return relative === wikiActivePath
    })

    if (!doc) {
      setPageContent(`Page not found: ${wikiActivePath}`)
      setPageTitle('')
      return
    }

    setPageLoading(true)
    setPageTitle(doc.title || doc.filename.replace(/\.(md|txt)$/, ''))
    apiFetch<{ content: string }>(`/v1/documents/${doc.id}/content`, token)
      .then((res) => setPageContent(res.content || ''))
      .catch(() => setPageContent('Failed to load page content.'))
      .finally(() => setPageLoading(false))
  }, [wikiActivePath, token, wikiDocs])

  const handleWikiNavigate = React.useCallback(
    (path: string) => {
      setActiveSourceDocId(null)
      if (path.startsWith('/wiki/')) {
        setWikiActivePath(path.replace(/^\/wiki\/?/, ''))
      } else if (path.startsWith('/')) {
        setWikiActivePath(path.slice(1))
      } else if (wikiActivePath) {
        const dir = wikiActivePath.includes('/')
          ? wikiActivePath.substring(0, wikiActivePath.lastIndexOf('/'))
          : ''
        let resolved = path.startsWith('./')
          ? (dir ? dir + '/' : '') + path.slice(2)
          : (dir ? dir + '/' : '') + path

        // Resolve ../
        while (resolved.includes('../')) {
          resolved = resolved.replace(/[^/]*\/\.\.\//, '')
        }
        setWikiActivePath(resolved)
      } else {
        setWikiActivePath(path)
      }
    },
    [wikiActivePath],
  )

  // Document actions
  const getToken = () => {
    const t = useUserStore.getState().accessToken
    if (!t) { toast.error('Not authenticated'); return null }
    return t
  }

  const handleCreateNote = async () => {
    const t = getToken()
    if (!t || !userId) return
    try {
      const data = await apiFetch<DocumentListItem>(`/v1/knowledge-bases/${kbId}/documents/note`, t, {
        method: 'POST',
        body: JSON.stringify({ filename: 'Untitled.md', path: '/' }),
      })
      setDocuments((prev) => [data, ...prev])
      setActiveSourceDocId(data.id)
      setWikiActivePath(null)
      updateUrl(data.document_number)
    } catch {
      toast.error('Failed to create note')
    }
  }

  const handleCreateFolder = (folderName: string) => {
    const t = getToken()
    if (!t || !userId) return
    const path = '/' + folderName + '/'
    apiFetch<DocumentListItem>(`/v1/knowledge-bases/${kbId}/documents/note`, t, {
      method: 'POST',
      body: JSON.stringify({ filename: 'Untitled.md', path }),
    })
      .then((data) => {
        setDocuments((prev) => [data, ...prev])
        setActiveSourceDocId(data.id)
        setWikiActivePath(null)
        updateUrl(data.document_number)
      })
      .catch(() => toast.error('Failed to create folder'))
  }

  const handleMoveDocument = async (docId: string, targetPath: string) => {
    const t = getToken()
    if (!t) return
    try {
      await apiFetch(`/v1/documents/${docId}`, t, {
        method: 'PATCH',
        body: JSON.stringify({ path: targetPath }),
      })
      setDocuments((prev) => prev.map((d) => d.id === docId ? { ...d, path: targetPath } : d))
    } catch {
      toast.error('Failed to move document')
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    const t = getToken()
    if (!t) return
    try {
      await apiFetch(`/v1/documents/${docId}`, t, { method: 'DELETE' })
      setDocuments((prev) => prev.filter((d) => d.id !== docId))
      if (activeSourceDocId === docId) setActiveSourceDocId(null)
    } catch {
      toast.error('Failed to delete document')
    }
  }

  const handleRenameDocument = async (docId: string, newTitle: string) => {
    const t = getToken()
    if (!t) return
    try {
      await apiFetch(`/v1/documents/${docId}`, t, {
        method: 'PATCH',
        body: JSON.stringify({ title: newTitle }),
      })
      setDocuments((prev) => prev.map((d) => d.id === docId ? { ...d, title: newTitle } : d))
    } catch {
      toast.error('Failed to rename document')
    }
  }

  const handleUploadClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.txt,.pdf,.pptx,.ppt,.docx,.doc,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.csv,.html,.htm'
    input.multiple = true
    input.onchange = () => {
      if (input.files) uploadFiles(Array.from(input.files))
    }
    input.click()
  }

  const tusUploadFile = React.useCallback((file: File): Promise<void> => {
    const t = getToken()
    if (!t) return Promise.reject(new Error('Not authenticated'))

    return new Promise((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: `${API_URL}/v1/uploads`,
        retryDelays: [0, 1000, 3000, 5000],
        metadata: {
          filename: file.name,
          knowledge_base_id: kbId,
        },
        headers: { Authorization: `Bearer ${t}` },
        onError: (error) => {
          toast.error(`Upload failed: ${file.name}`)
          reject(error)
        },
        onSuccess: () => {
          toast.success(`${file.name} uploaded, processing...`)
          resolve()
        },
      })
      upload.start()
    })
  }, [kbId])

  const uploadFiles = React.useCallback((files: File[]) => {
    const t = getToken()
    if (!t || !userId) return

    const uploads = files.map(async (file) => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext === 'md' || ext === 'txt') {
        const content = await file.text()
        const title = file.name.replace(/\.(md|txt)$/i, '')
        try {
          const data = await apiFetch<DocumentListItem>(`/v1/knowledge-bases/${kbId}/documents/note`, t, {
            method: 'POST',
            body: JSON.stringify({ filename: file.name, title, content, path: '/' }),
          })
          setDocuments((prev) => [data, ...prev])
        } catch {
          toast.error(`Failed to import ${file.name}`)
        }
      } else {
        const tusTypes = new Set(['pdf', 'pptx', 'ppt', 'docx', 'doc', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'xlsx', 'xls', 'csv', 'html', 'htm'])
        if (ext && tusTypes.has(ext)) {
          await tusUploadFile(file)
        } else {
          toast.info(`${ext} files not yet supported`)
        }
      }
    })

    Promise.all(uploads).then(() => {
      const textFiles = files.filter((f) => /\.(md|txt)$/i.test(f.name))
      if (textFiles.length > 0) toast.success(`Imported ${textFiles.length} file${textFiles.length > 1 ? 's' : ''}`)
    })
  }, [kbId, userId, tusUploadFile])

  // File drag-and-drop
  const [fileDragOver, setFileDragOver] = React.useState(false)
  const dragCounterRef = React.useRef(0)

  const handleFileDragEnter = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-llmwiki-item')) return
    e.preventDefault()
    dragCounterRef.current++
    if (dragCounterRef.current === 1) setFileDragOver(true)
  }
  const handleFileDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setFileDragOver(false)
  }
  const handleFileDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-llmwiki-item')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const handleFileDrop = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-llmwiki-item')) return
    e.preventDefault()
    dragCounterRef.current = 0
    setFileDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) uploadFiles(files)
  }

  return (
    <div
      className="flex flex-col h-full relative"
      onDragEnter={handleFileDragEnter}
      onDragLeave={handleFileDragLeave}
      onDragOver={handleFileDragOver}
      onDrop={handleFileDrop}
    >
      {fileDragOver && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 border-2 border-dashed border-primary rounded-xl px-12 py-10">
            <UploadIcon className="size-8 text-primary" />
            <p className="text-sm font-medium text-primary">Drop files to upload</p>
            <p className="text-xs text-muted-foreground">PDF, Word, PowerPoint, images, and more</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex">
        <div className="w-56 shrink-0">
          <KBSidenav
            kbName={kbName}
            wikiTree={wikiTree}
            wikiActivePath={wikiActivePath}
            onWikiNavigate={handleWikiSelect}
            sourceDocs={sourceDocs}
            activeSourceDocId={activeSourceDocId}
            onSourceSelect={handleSourceSelect}
            hasWiki={hasWiki}
            loading={loading}
            onCreateNote={handleCreateNote}
            onCreateFolder={handleCreateFolder}
            onUpload={handleUploadClick}
            onDeleteDocument={handleDeleteDocument}
            onRenameDocument={handleRenameDocument}
            onMoveDocument={handleMoveDocument}
          />
        </div>
        <div className="flex-1 min-w-0">
          {!urlRestored ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeSourceDocId && activeSourceDoc ? (
            isNoteFile(activeSourceDoc) ? (
              <NoteEditor
                key={activeSourceDocId}
                documentId={activeSourceDocId}
                initialTitle={activeSourceDoc.title ?? activeSourceDoc.filename}
                initialTags={activeSourceDoc.tags}
                initialDate={activeSourceDoc.date}
                initialProperties={activeSourceDoc.metadata?.properties as Record<string, unknown> | undefined}
                embedded
              />
            ) : activeSourceDoc.status === 'pending' || activeSourceDoc.status === 'processing' ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
                <div className="text-center">
                  <h1 className="text-lg font-medium">{activeSourceDoc.title || activeSourceDoc.filename}</h1>
                  <p className="text-xs text-muted-foreground mt-2">Processing document...</p>
                </div>
              </div>
            ) : activeSourceDoc.status === 'failed' ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
                <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-destructive/10">
                  <FileText size={28} className="text-destructive" />
                </div>
                <div className="text-center">
                  <h1 className="text-lg font-medium">{activeSourceDoc.title || activeSourceDoc.filename}</h1>
                  <p className="text-xs text-destructive mt-2">Processing failed</p>
                  {activeSourceDoc.error_message && (
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">{activeSourceDoc.error_message}</p>
                  )}
                </div>
              </div>
            ) : ['pdf', 'pptx', 'ppt', 'docx', 'doc'].includes(activeSourceDoc.file_type) ? (
              <PdfDocViewer
                documentId={activeSourceDocId}
                title={activeSourceDoc.title || activeSourceDoc.filename}
              />
            ) : ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(activeSourceDoc.file_type) ? (
              <ImageViewer
                documentId={activeSourceDocId}
                title={activeSourceDoc.title || activeSourceDoc.filename}
              />
            ) : ['html', 'htm'].includes(activeSourceDoc.file_type) ? (
              <HtmlDocViewer
                documentId={activeSourceDocId}
                title={activeSourceDoc.title || activeSourceDoc.filename}
              />
            ) : ['xlsx', 'xls', 'csv'].includes(activeSourceDoc.file_type) ? (
              <ContentViewer
                documentId={activeSourceDocId}
                title={activeSourceDoc.title || activeSourceDoc.filename}
                fileType={activeSourceDoc.file_type}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
                <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-muted">
                  <FileText size={28} className="text-muted-foreground" />
                </div>
                <div className="text-center">
                  <h1 className="text-lg font-medium">{activeSourceDoc.title || activeSourceDoc.filename}</h1>
                  <p className="text-xs text-muted-foreground mt-2">File viewer coming soon</p>
                </div>
              </div>
            )
          ) : pageLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : hasWiki && wikiActivePath ? (
            <WikiContent
              content={pageContent}
              title={pageTitle}
              onNavigate={handleWikiNavigate}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
              <BookOpen className="size-10 text-muted-foreground/20" />
              <div className="text-center max-w-sm">
                <h3 className="text-base font-medium mb-1.5">No wiki yet</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Add some sources, then ask Claude to compile a wiki from them.
                </p>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={handleUploadClick}
                  className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <UploadIcon className="size-3.5 opacity-60" />
                  Upload Sources
                </button>
                <a
                  href="https://claude.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2 text-sm font-medium hover:bg-accent transition-colors"
                >
                  Open Claude
                  <ArrowUpRight className="size-3.5 opacity-60" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PdfDocViewer({ documentId, title }: { documentId: string; title: string }) {
  const token = useUserStore((s) => s.accessToken)
  const [fileUrl, setFileUrl] = React.useState<string | null>(null)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    if (!token) return
    let cancelled = false
    apiFetch<{ url: string }>(`/v1/documents/${documentId}/url`, token)
      .then((res) => { if (!cancelled) setFileUrl(res.url) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [documentId, token])

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-destructive">Failed to load PDF</p>
      </div>
    )
  }

  if (!fileUrl) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <PdfViewer fileUrl={fileUrl} title={title} />
}

function ImageViewer({ documentId, title }: { documentId: string; title: string }) {
  const token = useUserStore((s) => s.accessToken)
  const [imageUrl, setImageUrl] = React.useState<string | null>(null)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    if (!token) return
    let cancelled = false
    apiFetch<{ url: string }>(`/v1/documents/${documentId}/url`, token)
      .then((res) => { if (!cancelled) setImageUrl(res.url) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [documentId, token])

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-destructive">Failed to load image</p>
      </div>
    )
  }

  if (!imageUrl) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center px-4 py-1.5 border-b border-border text-xs text-muted-foreground shrink-0">
        <span className="truncate text-foreground">{title}</span>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={title} className="max-w-full max-h-full object-contain rounded-md" />
      </div>
    </div>
  )
}

function HtmlDocViewer({ documentId, title }: { documentId: string; title: string }) {
  const token = useUserStore((s) => s.accessToken)
  const [htmlUrl, setHtmlUrl] = React.useState<string | null>(null)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    if (!token) return
    let cancelled = false
    apiFetch<{ url: string }>(`/v1/documents/${documentId}/url`, token)
      .then((res) => { if (!cancelled) setHtmlUrl(res.url) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [documentId, token])

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-destructive">Failed to load HTML</p>
      </div>
    )
  }

  if (!htmlUrl) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center px-4 py-1.5 border-b border-border text-xs text-muted-foreground shrink-0">
        <span className="truncate text-foreground">{title}</span>
      </div>
      <iframe
        src={htmlUrl}
        sandbox="allow-same-origin"
        className="flex-1 w-full bg-white"
        title={title}
      />
    </div>
  )
}

function ContentViewer({ documentId, title, fileType }: { documentId: string; title: string; fileType: string }) {
  const token = useUserStore((s) => s.accessToken)
  const [content, setContent] = React.useState<string | null>(null)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    if (!token) return
    let cancelled = false
    apiFetch<{ content: string }>(`/v1/documents/${documentId}/content`, token)
      .then((res) => { if (!cancelled) setContent(res.content ?? '') })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [documentId, token])

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-destructive">Failed to load content</p>
      </div>
    )
  }

  if (content === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isHtml = fileType === 'html' || fileType === 'htm'

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center px-4 py-1.5 border-b border-border text-xs text-muted-foreground shrink-0">
        <span className="truncate text-foreground">{title}</span>
      </div>
      {isHtml ? (
        <iframe
          srcDoc={content}
          sandbox="allow-same-origin"
          className="flex-1 w-full bg-white"
          title={title}
        />
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-8 py-6 prose prose-sm dark:prose-invert">
            <pre className="whitespace-pre-wrap text-sm font-mono">{content}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
