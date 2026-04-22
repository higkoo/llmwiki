'use client'

import * as React from 'react'
import { Copy, Check, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import { buildOAuthMcpConfig, MCP_URL } from '@/lib/mcp'
import { useUserStore } from '@/stores'

interface Usage {
  total_pages: number
  total_storage_bytes: number
  document_count: number
  max_pages: number
  max_storage_bytes: number
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}

export default function SettingsPage() {
  const router = useRouter()
  const token = useUserStore((s) => s.accessToken)
  const [usage, setUsage] = React.useState<Usage | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [configCopied, setConfigCopied] = React.useState(false)

  const oauthConfigJson = buildOAuthMcpConfig()

  React.useEffect(() => {
    if (!token) return
    apiFetch<Usage>('/v1/usage', token)
      .then((u) => setUsage(u))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  const handleCopyConfig = async () => {
    try {
      await navigator.clipboard.writeText(oauthConfigJson)
      setConfigCopied(true)
      setTimeout(() => setConfigCopied(false), 2000)
    } catch {
      console.error('Failed to copy')
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.back()}
          className="p-1 rounded-md hover:bg-accent transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </button>
        <h1 className="text-xl font-semibold tracking-tight">设置</h1>
      </div>

      {/* 用量 */}
      {usage && (
        <section>
          <h2 className="text-base font-medium">使用情况</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            已上传 {usage.document_count} 个文档
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-muted-foreground">存储</span>
                <span className="font-mono text-xs">
                  {formatBytes(usage.total_storage_bytes)} / {formatBytes(usage.max_storage_bytes)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    usage.total_storage_bytes / usage.max_storage_bytes > 0.9
                      ? 'bg-destructive'
                      : usage.total_storage_bytes / usage.max_storage_bytes > 0.7
                        ? 'bg-yellow-500'
                        : 'bg-primary'
                  )}
                  style={{ width: `${Math.min(100, (usage.total_storage_bytes / usage.max_storage_bytes) * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-muted-foreground">OCR 页面</span>
                <span className="font-mono text-xs">
                  {usage.total_pages.toLocaleString()} / {usage.max_pages.toLocaleString()}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    usage.total_pages / usage.max_pages > 0.9
                      ? 'bg-destructive'
                      : usage.total_pages / usage.max_pages > 0.7
                        ? 'bg-yellow-500'
                        : 'bg-primary'
                  )}
                  style={{ width: `${Math.min(100, (usage.total_pages / usage.max_pages) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {usage && <div className="h-px bg-border my-8" />}

      {/* MCP 配置 */}
      <section>
        <h2 className="text-base font-medium">通过 OAuth 连接</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          将此配置添加到你的 MCP 客户端。首次连接时，它会提示你使用 Supabase 登录。
        </p>
        <div className="relative mt-4">
          <pre className="rounded-lg bg-muted border border-border p-4 text-sm font-mono overflow-x-auto text-foreground">
            {oauthConfigJson}
          </pre>
          <button
            onClick={handleCopyConfig}
            className={cn(
              'absolute top-3 right-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer',
              configCopied
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : 'bg-background border border-border text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            {configCopied ? <><Check size={12} />已复制</> : <><Copy size={12} />复制</>}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          MCP URL：
          {' '}
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{MCP_URL}</code>
        </p>
      </section>
    </div>
  )
}
