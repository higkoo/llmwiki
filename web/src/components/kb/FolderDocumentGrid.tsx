'use client'

import * as React from 'react'
import {
  Folder, FileText, NotepadText, Trash2, MoreHorizontal, Upload,
} from 'lucide-react'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { joinPath } from '@/lib/utils/folders'
import { DRAG_MIME, type DragItem } from '@/components/kb/FolderDocumentList'
import type { DocumentListItem } from '@/lib/types'

type GridSize = 'sm' | 'md' | 'lg'

const gridClasses: Record<GridSize, string> = {
  sm: 'grid-cols-5 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10',
  md: 'grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8',
  lg: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
}

type Props = {
  folders: string[]
  documents: DocumentListItem[]
  currentPath: string
  gridSize?: GridSize
  onNavigateFolder: (name: string) => void
  onOpenDocument: (doc: DocumentListItem) => void
  onDeleteDocument: (docId: string) => void
  onDeleteFolder: (folderName: string) => void
  onMoveDocument: (docId: string, targetPath: string) => void
  selectedIds?: Set<string>
  onSelect?: (itemId: string, e: React.MouseEvent) => void
  onCreateNote?: () => void
  onCreateFolder?: () => void
  onUpload?: () => void
}

export function FolderDocumentGrid({
  folders,
  documents,
  currentPath,
  gridSize = 'md',
  onNavigateFolder,
  onOpenDocument,
  onDeleteDocument,
  onDeleteFolder,
  onMoveDocument,
  selectedIds = new Set(),
  onSelect,
  onCreateNote,
  onCreateFolder,
  onUpload,
}: Props) {
  const [dragOverFolder, setDragOverFolder] = React.useState<string | null>(null)
  const isRoot = currentPath === '/'

  if (folders.length === 0 && documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            {isRoot ? 'This wiki is empty' : 'This folder is empty'}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add documents or notes to get started</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onUpload}
            className="flex flex-col items-center gap-2 px-6 py-4 rounded-lg border border-dashed border-border hover:border-foreground/20 hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <Upload className="size-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Upload files</span>
          </button>
          <button
            onClick={onCreateNote}
            className="flex flex-col items-center gap-2 px-6 py-4 rounded-lg border border-dashed border-border hover:border-foreground/20 hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <NotepadText className="size-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">New note</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn('grid gap-3', gridClasses[gridSize])}>
          {folders.map((name) => (
            <FolderCard
              key={`folder-${name}`}
              name={name}
              currentPath={currentPath}
              isDragOver={dragOverFolder === name}
              isSelected={selectedIds.has(`folder:${name}`)}
              onSelect={(e) => onSelect?.(`folder:${name}`, e)}
              onNavigate={() => onNavigateFolder(name)}
              onDelete={() => onDeleteFolder(name)}
              onMoveDocument={onMoveDocument}
              onDragOverFolder={setDragOverFolder}
            />
          ))}
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              currentPath={currentPath}
              isSelected={selectedIds.has(`doc:${doc.id}`)}
              onSelect={(e) => onSelect?.(`doc:${doc.id}`, e)}
              onOpen={() => onOpenDocument(doc)}
              onDelete={() => onDeleteDocument(doc.id)}
            />
          ))}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onCreateNote}>
          <NotepadText className="size-3.5 mr-2" />
          New Note
        </ContextMenuItem>
        <ContextMenuItem onClick={onCreateFolder}>
          <Folder className="size-3.5 mr-2" />
          New Folder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onUpload}>
          <Upload className="size-3.5 mr-2" />
          Upload Files
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function FolderCard({
  name,
  currentPath,
  isDragOver,
  isSelected,
  onSelect,
  onNavigate,
  onDelete,
  onMoveDocument,
  onDragOverFolder,
}: {
  name: string
  currentPath: string
  isDragOver: boolean
  isSelected?: boolean
  onSelect?: (e: React.MouseEvent) => void
  onNavigate: () => void
  onDelete: () => void
  onMoveDocument: (docId: string, targetPath: string) => void
  onDragOverFolder: (name: string | null) => void
}) {
  const folderPath = joinPath(currentPath, name)

  const handleDragStart = (e: React.DragEvent) => {
    const item: DragItem = { type: 'folder', folderName: name, folderPath }
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    onDragOverFolder(name)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    onDragOverFolder(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDragOverFolder(null)
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    const dragItem: DragItem = JSON.parse(raw)
    if (dragItem.type === 'document') {
      onMoveDocument(dragItem.documentId, folderPath)
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      onSelect?.(e)
      return
    }
    onNavigate()
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          draggable
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
          className={cn(
            'group relative rounded-lg border cursor-pointer transition-colors flex flex-col overflow-hidden h-full',
            isDragOver
              ? 'bg-muted border-primary/40'
              : isSelected
                ? 'ring-2 ring-primary bg-primary/5 border-border'
                : 'border-border hover:bg-muted/50',
          )}
        >
          <div className="flex items-center justify-center aspect-square">
            <Folder className="size-12 text-muted-foreground/70" />
          </div>
          <div className="px-2 py-1.5">
            <span className="text-xs font-medium text-foreground truncate block">{name}</span>
          </div>
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <CardMenu onDelete={onDelete} />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onNavigate}>Open</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onDelete} className="text-destructive">Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

const kindLabels: Record<string, string> = {
  pdf: 'PDF',
  docx: 'Word',
  pptx: 'PowerPoint',
  html: 'HTML',
  md: 'Note',
  txt: 'Text',
  csv: 'CSV',
  xlsx: 'Excel',
}

function getDocIcon(fileType: string) {
  if (fileType === 'md') return <NotepadText className="size-10 text-amber-500/70" />
  return <FileText className="size-10 text-muted-foreground/70" />
}

function DocumentCard({
  doc,
  currentPath,
  isSelected,
  onSelect,
  onOpen,
  onDelete,
}: {
  doc: DocumentListItem
  currentPath: string
  isSelected?: boolean
  onSelect?: (e: React.MouseEvent) => void
  onOpen: () => void
  onDelete: () => void
}) {
  const isNote = doc.file_type === 'md'
  const label = doc.title || doc.filename
  const date = doc.updated_at || doc.created_at

  const handleDragStart = (e: React.DragEvent) => {
    const item: DragItem = { type: 'document', documentId: doc.id, currentPath }
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      onSelect?.(e)
      return
    }
    onOpen()
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          draggable
          onDragStart={handleDragStart}
          onClick={handleClick}
          className={cn(
            'group relative rounded-lg border cursor-pointer transition-colors flex flex-col overflow-hidden h-full',
            isSelected
              ? 'ring-2 ring-primary bg-primary/5 border-border'
              : isNote
                ? 'border-border hover:bg-amber-500/5'
                : 'border-border hover:bg-muted/50',
          )}
        >
          <div className="flex items-center justify-center aspect-square bg-muted/30">
            {getDocIcon(doc.file_type)}
          </div>
          <div className="px-2 py-1.5 border-t border-border/50">
            <span className="text-xs font-medium text-foreground truncate block">{label}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-muted-foreground">
                {kindLabels[doc.file_type] ?? doc.file_type.toUpperCase()}
              </span>
              {date && (
                <>
                  <span className="text-[10px] text-muted-foreground/40">·</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {formatDate(date)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <CardMenu onDelete={onDelete} />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onOpen}>Open</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onDelete} className="text-destructive">Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function CardMenu({ onDelete }: { onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded-md bg-card/80 backdrop-blur-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
          <Trash2 className="size-3.5 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}
