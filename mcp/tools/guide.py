from mcp.server.fastmcp import FastMCP, Context

from config import settings
from db import scoped_query
from .helpers import get_user_id

GUIDE_TEXT = """# LLM Wiki — 工作原理

你已连接到 **LLM Wiki** — 一个个人知识工作空间，你可以在这里从原始源文档编译并维护一个结构化的维基。

## 架构

1. **原始资料** (路径: `/`) — 上传的文档（PDF、笔记、图像、电子表格）。事实来源。只读。
2. **编译维基** (路径: `/wiki/`) — 由你创建和维护的 Markdown 页面。你拥有这一层。
3. **工具** — `search`、`read`、`write`、`delete` — 你与两层的接口。

## 维基结构

每个维基都遵循此结构。这些类别不是建议 — 它们是维基的 backbone。

### 概览 (`/wiki/overview.md`) — 中心页面
始终存在。这是维基的首页。它必须包含：
- 此维基涵盖的内容及其范围的摘要
- **资料数量**和页面数量（每次摄取时更新）
- **关键发现** — 所有资料中最重要的见解
- **最近更新** — 最近 5-10 个操作（摄取、新页面、修订）

每次摄取或重大编辑后更新概览。如果你只更新一个页面，应该是这个。

### 概念 (`/wiki/concepts/`) — 抽象思想
用于理论框架、方法论、原则、主题 — 任何概念性的内容。
- `/wiki/concepts/scaling-laws.md`
- `/wiki/concepts/attention-mechanisms.md`
- `/wiki/concepts/self-supervised-learning.md`

每个概念页面应：定义概念，解释它在上下文中的重要性，引用资料，并交叉引用相关概念和实体。

### 实体 (`/wiki/entities/`) — 具体事物
用于人物、组织、产品、技术、论文、数据集 — 任何你可以指向的东西。
- `/wiki/entities/transformer.md`
- `/wiki/entities/openai.md`
- `/wiki/entities/attention-is-all-you-need.md`

每个实体页面应：描述它是什么，记录关键事实，引用资料，并交叉引用相关概念和实体。

### 日志 (`/wiki/log.md`) — 时间记录
始终存在。仅追加。记录每次摄取、重大编辑和检查。永远不要删除条目。

格式 — 每个条目以可解析的标题开始：
```
## [YYYY-MM-DD] ingest | 资料标题
- 创建概念页面：[页面标题](concepts/page.md)
- 更新实体页面：[页面标题](entities/page.md)
- 更新概览，添加新发现
- 关键要点：一句话总结

## [YYYY-MM-DD] query | 所提问题
- 创建新页面：[页面标题](concepts/page.md)
- 发现：一句话答案

## [YYYY-MM-DD] lint | 健康检查
- 修复 X 和 Y 之间的矛盾
- 在 Z 中添加缺失的交叉引用
```

### 其他页面
你可以在需要时在 concepts/ 和 entities/ 之外创建页面：
- `/wiki/comparisons/x-vs-y.md` — 用于深度比较
- `/wiki/timeline.md` — 用于时间叙述

但 concepts/ 和 entities/ 是主要类别。如有疑问，请放在那里。

## 页面层次结构

维基页面通过路径使用父/子层次结构：
- `/wiki/concepts.md` — 父页面（可选；总结所有概念）
- `/wiki/concepts/attention.md` — 子页面

父页面总结；子页面深入。UI 将其渲染为可展开的树。

## 写作标准

**维基页面必须比聊天回复丰富得多。**它们是持久的、精心策划的成果。

### 结构
- 以摘要段落开始（无 H1 — 标题由 UI 渲染）
- 使用 `##` 表示主要部分，`###` 表示子部分
- 每个部分一个想法。事实使用项目符号，综合使用散文。

### 视觉元素 — 必须

**每个维基页面必须包含至少一个视觉元素。**只有散文的页面是不完整的。

**Mermaid 图表** — 用于任何结构化关系：
- 流程图用于流程、管道、决策树
- 序列图用于交互、时间线
- 象限图用于比较、权衡分析
- 实体关系图用于人物、公司、概念

````
```mermaid
graph LR
    A[输入] --> B[处理] --> C[输出]
```
````

**表格** — 用于任何结构化比较：
- 功能矩阵、优缺点、时间线、指标
- 如果你列出 3+ 个带有属性的项目，应该使用表格

**SVG 资产** — 用于 Mermaid 无法表达的自定义视觉效果：
- 创建：`write(command="create", path="/wiki/", title="diagram.svg", content="<svg>...</svg>", tags=["diagram"])`
- 嵌入维基页面：`![描述](diagram.svg)`

### 引用 — 必需

每个事实性声明必须通过 Markdown 脚注引用其来源：
```
Transformer 使用自注意力[^1]，其扩展性呈二次方[^2]。

[^1]: attention-paper.pdf, p.3
[^2]: scaling-laws.pdf, p.12-14
```

规则：
- 使用完整的源文件名 — 永远不要截断
- 为 PDF 添加页码：`paper.pdf, p.3`
- 每个声明一个引用 — 不要批量处理不相关的声明
- 引用在 UI 中渲染为可悬停的弹出式徽章

### 交叉引用
使用指向其他维基路径的标准 Markdown 链接在维基页面之间建立链接。

## 核心工作流程

### 摄取新资料
1. 阅读它：`read(path="source.pdf", pages="1-10")`
2. 与用户讨论关键要点
3. 在 `/wiki/concepts/` 下创建或更新 **概念**页面
4. 在 `/wiki/entities/` 下创建或更新 **实体**页面
5. 更新 `/wiki/overview.md` — 资料数量、关键发现、最近更新
6. 向 `/wiki/log.md` 添加条目
7. 一个资料通常会涉及 5-15 个维基页面 — 这是预期的

### 回答问题
1. `search(mode="search", query="术语")` 查找相关内容
2. 阅读相关维基页面和资料
3. 综合并引用
4. 如果答案有价值，将其归档为新的维基页面 — 探索应该累积
5. 向 `/wiki/log.md` 添加查询条目

### 维护维基（检查）
检查：矛盾、孤立页面、缺失的交叉引用、过时的声明、提及但缺乏自己页面的概念。向 `/wiki/log.md` 添加检查条目。

## 可用的知识库

"""


def register(mcp: FastMCP) -> None:

    @mcp.tool(
        name="guide",
        description="开始使用 LLM Wiki。调用此工具了解知识库的工作原理并查看你可用的知识库。",
    )
    async def guide(ctx: Context) -> str:
        user_id = get_user_id(ctx)
        kbs = await scoped_query(
            user_id,
            "SELECT name, slug, "
            "  (SELECT count(*) FROM documents d WHERE d.knowledge_base_id = kb.id AND d.path NOT LIKE '/wiki/%%' AND NOT d.archived) as source_count, "
            "  (SELECT count(*) FROM documents d WHERE d.knowledge_base_id = kb.id AND d.path LIKE '/wiki/%%' AND NOT d.archived) as wiki_count "
            "FROM knowledge_bases kb ORDER BY created_at DESC",
        )
        if not kbs:
            return GUIDE_TEXT + "还没有知识库。在 " + settings.APP_URL + "/wikis 创建一个"

        lines = []
        for kb in kbs:
            lines.append(f"- **{kb['name']}** (`{kb['slug']}`) — {kb['source_count']} 个资料，{kb['wiki_count']} 个维基页面")
        return GUIDE_TEXT + "\n".join(lines)
