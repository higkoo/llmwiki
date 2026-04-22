'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useUserStore } from '@/stores'
import { ArrowRight, BookOpen, FileText, PenTool, Search, GitBranch } from 'lucide-react'

const ease: [number, number, number, number] = [0.16, 1, 0.3, 1]

const WIKI_TREE = [
  { label: '概览', active: true, depth: 0 },
  { label: '概念', depth: 0, folder: true },
  { label: '注意力机制', depth: 1 },
  { label: '缩放法则', depth: 1 },
  { label: '实体', depth: 0, folder: true },
  { label: 'Transformer 架构', depth: 1 },
  { label: '资料', depth: 0, folder: true },
  { label: '日志', depth: 0 },
]

export default function LandingPage() {
  const user = useUserStore((s) => s.user)
  const router = useRouter()

  React.useEffect(() => {
    if (user) router.replace('/wikis')
  }, [user, router])

  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 lg:px-10 h-14 bg-background/80 backdrop-blur-sm">
        <span className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill="currentColor" className="text-foreground" />
            <polyline points="11,8 21,16 11,24" fill="none" stroke="currentColor" className="text-background" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          LLM Wiki
        </span>
        <div className="flex items-center gap-5">
          <Link
            href="https://github.com/lucasastorian/llmwiki"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
          </Link>
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            登录
          </Link>
          <Link
            href="/signup"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            开始使用
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 lg:px-10">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease }}
          >
            <p className="text-sm text-muted-foreground mb-4">
              Karpathy's LLM Wiki 的开源实现
              <Link
                href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f"
                className="text-foreground underline underline-offset-2 decoration-foreground/30 hover:decoration-foreground transition-colors"
              >
                &nbsp;规范
              </Link>
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              LLM Wiki
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.12, ease }}
            className="mt-6 text-base sm:text-lg text-muted-foreground max-w-md mx-auto leading-relaxed"
          >
            你的 LLM 从原始资料中编译并维护一个结构化的维基。
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25, ease }}
            className="mt-9 flex items-center justify-center gap-3"
          >
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              开始使用
              <ArrowRight className="size-3.5 opacity-60" />
            </Link>
            <Link
              href="https://github.com/lucasastorian/llmwiki"
              className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
            >
              GitHub
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Product Preview */}
      <section className="px-6 lg:px-10 pb-28">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4, ease }}
          className="max-w-5xl mx-auto"
        >
          <div className="bg-card rounded-2xl border border-border shadow-lg overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex gap-1.5">
                <div className="size-2.5 rounded-full bg-border" />
                <div className="size-2.5 rounded-full bg-border" />
                <div className="size-2.5 rounded-full bg-border" />
              </div>
              <div className="flex-1 flex justify-center">
                <span className="text-xs text-muted-foreground/50 font-mono">
                  llmwiki.app
                </span>
              </div>
              <div className="w-14" />
            </div>

            <div className="flex min-h-[400px]">
              {/* Sidebar */}
              <div className="w-52 shrink-0 border-r border-border p-3 hidden sm:block">
                <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
                  <Search className="size-3 text-muted-foreground/30" />
                  <span className="text-xs text-muted-foreground/30">搜索维基...</span>
                </div>
                <div className="space-y-0.5">
                  {WIKI_TREE.map((item, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
                        item.active
                          ? 'bg-accent font-medium text-foreground'
                          : 'text-muted-foreground'
                      }`}
                      style={{ paddingLeft: `${item.depth * 14 + 8}px` }}
                    >
                      {item.folder ? (
                        <GitBranch className="size-3 opacity-40" />
                      ) : (
                        <FileText className="size-3 opacity-40" />
                      )}
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 p-8 sm:p-10">
                <div className="max-w-lg">
                  <h2 className="text-xl font-semibold tracking-tight mb-1">概览</h2>
                  <p className="text-xs text-muted-foreground mb-6">
                    12 个资料 · 最后更新于 2 小时前
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                    本维基追踪关于 transformer 架构及其缩放特性的研究。
                    它综合了来自 <span className="font-medium text-foreground">12 个资料</span> 的发现，跨越 47 个页面。
                  </p>
                  <h3 className="text-sm font-semibold mt-5 mb-2">关键发现</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                    模型大小与性能之间的关系遵循可预测的{' '}
                    <span className="font-medium text-foreground">缩放法则</span> —
                    损失随着计算、数据集大小和参数数量的幂律而减少。
                  </p>
                  <h3 className="text-sm font-semibold mt-5 mb-2">最近更新</h3>
                  <ul className="space-y-1 ml-4">
                    <li className="text-sm text-muted-foreground list-disc">添加了稀疏注意力变体的分析</li>
                    <li className="text-sm text-muted-foreground list-disc">使用新基准更新了缩放法则</li>
                    <li className="text-sm text-muted-foreground list-disc">标记了 Chen 等人与 Wei 等人之间的矛盾</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Divider */}
      <div className="max-w-5xl mx-auto border-t border-border" />

      {/* Three Layers */}
      <section className="px-6 lg:px-10 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="text-center mb-14"
          >
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">三层结构</h2>
            <p className="mt-3 text-muted-foreground max-w-md mx-auto">
              你很少需要自己编写维基 — 维基是 LLM 的领域。
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-6">
            {
              [
                {
                  icon: FileText,
                  title: '原始资料',
                  body: '文章、论文、笔记、transcripts。你的不可变事实来源。LLM 从中读取但从不修改它们。',
                },
                {
                  icon: BookOpen,
                  title: '维基',
                  body: 'LLM 生成的 Markdown 页面，包含摘要、实体页面和交叉引用。LLM 拥有这一层。你阅读它；LLM 编写它。',
                },
                {
                  icon: PenTool,
                  title: '架构',
                  body: '一个配置文件，告诉 LLM 维基的结构、要遵循的约定以及在摄取时要运行的工作流程。',
                },
              ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-card rounded-xl border border-border p-6"
              >
                <item.icon className="size-5 text-muted-foreground mb-4" strokeWidth={1.5} />
                <h3 className="font-semibold text-sm mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-5xl mx-auto border-t border-border" />

      {/* How It Works */}
      <section className="px-6 lg:px-10 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="text-center mb-14"
          >
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">工作原理</h2>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-10 sm:gap-8">
            {
              [
                {
                  step: '01',
                  title: '摄取',
                  body: '将资料放入 raw/ 目录。LLM 读取它，编写摘要，更新维基中的实体和概念页面，并标记任何与现有知识相矛盾的内容。一个资料可能会涉及 10-15 个维基页面。',
                },
                {
                  step: '02',
                  title: '查询',
                  body: '针对编译后的维基提出复杂问题。知识已经被合成 — 不是每次都从原始块重新推导。好的答案会作为新页面被归档，因此你的探索会不断累积。',
                },
                {
                  step: '03',
                  title: '检查',
                  body: '对维基运行健康检查。查找不一致的数据、过时的声明、孤立页面、缺失的交叉引用。LLM 会建议要问的新问题和要寻找的新资料。',
                },
              ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <span className="text-xs font-mono text-muted-foreground/40 mb-3 block">{item.step}</span>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-5xl mx-auto border-t border-border" />

      {/* Quote */}
      <section className="px-6 lg:px-10 py-24">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8 }}
          className="max-w-2xl mx-auto text-center"
        >
          <blockquote className="text-lg sm:text-xl leading-relaxed text-foreground/80 italic">
            &ldquo;维护知识库的繁琐部分不是阅读或思考 — 而是记录工作。LLM 不会感到无聊，不会忘记更新交叉引用，并且可以一次处理 15 个文件。&rdquo;
          </blockquote>
          <p className="mt-5 text-sm text-muted-foreground">
            Andrej Karpathy
          </p>
        </motion.div>
      </section>

      {/* Divider */}
      <div className="max-w-5xl mx-auto border-t border-border" />

      {/* CTA */}
      <section className="px-6 lg:px-10 py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6 }}
          className="max-w-md mx-auto text-center"
        >
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">开始构建你的维基</h2>
          <p className="text-muted-foreground mb-8">
            一个令人难以置信的产品，而不是一堆杂乱的脚本。
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-7 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            免费开始使用
            <ArrowRight className="size-3.5 opacity-60" />
          </Link>
        </motion.div>
      </section>

      {/* 页脚 */}
      <footer className="border-t border-border px-6 lg:px-10 py-6 flex items-center justify-between text-xs text-muted-foreground/50">
        <span>LLM Wiki</span>
        <span>免费 &amp; 开源 &middot; Apache 2.0</span>
      </footer>
    </div>
  )
}
