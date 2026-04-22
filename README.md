# LLM Wiki

[![在线演示](https://img.shields.io/badge/demo-llmwiki.app-blue)](https://llmwiki.app)
[![许可证](https://img.shields.io/badge/license-Apache%202.0-green)](https://opensource.org/licenses/Apache-2.0)

[Karpathy's LLM Wiki](https://x.com/karpathy/status/2039805659525644595) ([规范](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f))的免费开源实现。可在 [llmwiki.app](https://llmwiki.app) 使用。

1. **上传资料** — PDF、文章、笔记、办公文档。在完整的文档查看器中查看它们。
2. **连接 Claude** — 通过 MCP。它读取你的资料，编写维基页面，维护交叉引用和引用。
3. **维基不断丰富** — 你添加的每一个资料和提出的每一个问题都让它变得更加丰富。知识是累积的，而不是重新推导的。

![LLM Wiki — 带有引用和目录的编译维基页面](wiki-page.png)

### 三层结构

| 层级 | 描述 |
|-------|-------------|
| **原始资料** | PDF、文章、笔记、 transcripts。你的不可变事实来源。LLM 读取它们但从不修改它们。 |
| **维基** | LLM 生成的 Markdown 页面 — 摘要、实体页面、交叉引用、Mermaid 图表、表格。LLM 拥有这一层。你阅读它；LLM 编写它。 |
| **工具** | 搜索、读取和写入。Claude 通过 MCP 连接并协调其他操作。 |

### 核心操作

LLM Wiki 内置了一个 **MCP 服务器**，Claude.ai 可以直接连接到它。连接后，Claude 拥有在你的整个知识库中搜索、读取、写入和删除的工具。以下所有操作都通过 Claude 进行 — 你与它交谈，它维护维基。

**摄取** — 放入一个资料。Claude 读取它，编写摘要，更新维基中的实体和概念页面，并标记任何与现有知识相矛盾的内容。一个资料可能会涉及 10-15 个维基页面。

**查询** — 针对编译后的维基提出复杂问题。知识已经被合成 — 不是每次都从原始块重新推导。好的答案会作为新页面被归档，因此你的探索会不断累积。

**检查** — 运行健康检查。查找不一致的数据、过时的声明、孤立页面、缺失的交叉引用。Claude 会建议要研究的新问题和要寻找的新资料。

---

## 架构

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Next.js   │────▶│   FastAPI   │────▶│  Supabase   │
│   前端      │     │   后端      │     │  (Postgres) │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │  MCP 服务器 │◀──── Claude
                    └─────────────┘
```

| 组件 | 技术栈 | 职责 |
|-----------|-------|------------------|
| **Web** (`web/`) | Next.js 16, React 19, Tailwind, Radix UI | 仪表板、PDF/HTML 查看器、维基渲染器、引导流程 |
| **API** (`api/`) | FastAPI, asyncpg, aioboto3 | 认证、上传 (TUS)、文档处理、OCR (Mistral) |
| **Converter** (`converter/`) | FastAPI, LibreOffice | 隔离的办公文档到 PDF 转换（非 root，零 AWS 凭证） |
| **MCP** (`mcp/`) | MCP SDK, Supabase OAuth | Claude 的工具：`guide`、`search`、`read`、`write`、`delete` |
| **数据库** | Supabase (Postgres + RLS + PGroonga) | 文档、块、知识库、用户 |
| **存储** | 兼容 S3 的存储 | 原始上传、标记的 HTML、提取的图像 |

---

## MCP 工具

连接后，Claude 可以完全访问你的知识库：

| 工具 | 描述 |
|------|-------------|
| `guide` | 解释维基的工作原理并列出可用的知识库 |
| `search` | 浏览文件 (`list`) 或使用 PGroonga 排名进行关键字搜索 (`search`) |
| `read` | 读取文档 — 带有页面范围的 PDF、内联图像、全局批量读取 |
| `write` | 创建维基页面，使用 `str_replace` 编辑，追加。支持 SVG 和 CSV 资产 |
| `delete` | 按路径或全局模式归档文档 |

---

## 开始使用

尝试 LLM Wiki 的最快方法：

1. 在 [llmwiki.app](https://llmwiki.app) **注册**并创建知识库
2. **上传资料** — 放入 PDF、笔记、文章
3. **连接 Claude** — 进入设置，复制 MCP 配置，在 Claude.ai 中添加为连接器
4. **开始构建** — 告诉 Claude 读取你的资料并编译维基

就是这样。无需本地设置。

### 自托管

#### 先决条件

- Python 3.11+
- Node.js 20+
- 一个 [Supabase](https://supabase.com) 项目（或本地 Docker 设置）
- 一个兼容 S3 的存储桶（需要用于文件上传）

#### 1. 数据库

```bash
psql $DATABASE_URL -f supabase/migrations/001_initial.sql
```

或使用本地 Docker：`docker compose up -d`

#### 2. API

```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env  # 编辑你的凭证
uvicorn main:app --reload --port 8000
```

#### 3. MCP 服务器

```bash
cd mcp
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --port 8080
```

#### 4. Web

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

#### 5. 连接 Claude

1. 在 Claude 中打开 **设置** > **连接器**
2. 添加指向 `http://localhost:8080/mcp` 的自定义连接器
3. 出现提示时使用你的 Supabase 账户登录

#### 环境变量

**API** (`api/.env`)

```
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-ref.supabase.co
SUPABASE_JWT_SECRET=          # 可选，用于旧版 HS256 项目
MISTRAL_API_KEY=              # 用于 PDF OCR
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
S3_BUCKET=your-bucket
APP_URL=http://localhost:3000
CONVERTER_URL=               # 可选，隔离的转换器服务 URL
```

**Web** (`web/.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://your-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MCP_URL=http://localhost:8080/mcp
```

---

## 为什么这有效

维护知识库的繁琐部分不是阅读或思考 — 而是记录工作。更新交叉引用、保持摘要最新、注意新数据何时与旧声明相矛盾、在数十页中保持一致性。

人类放弃个人维基是因为维护负担增长快于价值。LLM 不会感到无聊，不会忘记更新交叉引用，并且可以一次处理 15 个文件。维基保持维护是因为维护成本几乎降至零。

人类的工作是策展资料、指导分析、提出好问题并思考这一切意味着什么。LLM 的工作是其他所有事情。

## 许可证

Apache 2.0
