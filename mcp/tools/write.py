import re
from datetime import date
from typing import Literal

from mcp.server.fastmcp import FastMCP, Context

from db import scoped_queryrow, service_queryrow, service_execute
from .helpers import get_user_id, resolve_kb, deep_link, resolve_path

_ASSET_EXTENSIONS = {".svg", ".csv", ".json", ".xml", ".html"}


async def _create_note(
    user_id: str, kb: dict, path: str, title: str, content: str,
    tags: list[str], date_str: str,
) -> str:
    if not title:
        return "错误：创建笔记时需要标题。"
    if not tags:
        return "错误：创建笔记时至少需要一个标签。"

    dir_path = path if path.endswith("/") else path + "/"
    if not dir_path.startswith("/"):
        dir_path = "/" + dir_path

    # 检测资产扩展名
    _title_lower = title.lower()
    asset_ext = None
    for ext in _ASSET_EXTENSIONS:
        if _title_lower.endswith(ext):
            asset_ext = ext
            break

    # 从标题派生文件名（slug）
    if asset_ext:
        filename = re.sub(r"[^\w\s\-.]", "", _title_lower.replace(" ", "-"))
        file_type = asset_ext.lstrip(".")
    else:
        slug = _title_lower
        # 如果 Claude 传递了文件名作为标题，去除 .md
        slug = re.sub(r"\.(md|txt)$", "", slug)
        filename = re.sub(r"[^\w\s\-.]", "", slug.replace(" ", "-"))
        if not filename.endswith(".md"):
            filename += ".md"
        file_type = "md"

    # 确保标题是人类可读的，而不是 slug
    # "operating-leverage.md" → "Operating Leverage"
    clean_title = re.sub(r"\.(md|txt|svg|csv|json|xml|html)$", "", title)
    if clean_title == clean_title.lower() and "-" in clean_title:
        clean_title = clean_title.replace("-", " ").replace("_", " ").strip().title()
    title = clean_title

    note_date = date_str or date.today().isoformat()

    doc = await service_queryrow(
        "INSERT INTO documents (knowledge_base_id, user_id, filename, title, path, "
        "file_type, status, content, tags, version) "
        "VALUES ($1, $2, $3, $4, $5, $6, 'ready', $7, $8, 0) "
        "RETURNING id, filename, path",
        kb["id"], user_id, filename, title, dir_path, file_type, content, tags,
    )

    link = deep_link(kb["slug"], doc["path"], doc["filename"])

    is_wiki = dir_path.startswith("/wiki/")
    suffix = ""
    if asset_ext:
        suffix = f"\n\n在维基页面中嵌入：`![{title}]({filename})`"
    elif is_wiki:
        suffix = "\n\n记得使用脚注引用来源：`[^1]: source-file.pdf, p.X`"

    return (
        f"已创建 **{title}** 在 `{dir_path}{filename}`\n"
        f"标签：{', '.join(tags)} | 日期：{note_date}\n"
        f"[在 LLM Wiki 中查看]({link}){suffix}"
    )


async def _edit_note(user_id: str, kb: dict, path: str, old_text: str, new_text: str) -> str:
    if not old_text:
        return "错误：str_replace 需要 old_text。"

    dir_path, filename = resolve_path(path)

    doc = await scoped_queryrow(
        user_id,
        "SELECT id, content FROM documents "
        "WHERE knowledge_base_id = $1 AND filename = $2 AND path = $3 AND NOT archived",
        kb["id"], filename, dir_path,
    )
    if not doc:
        return f"未找到文档 '{path}'。"

    content = doc["content"] or ""
    count = content.count(old_text)
    if count == 0:
        return "错误：未找到与 old_text 匹配的内容。"
    if count > 1:
        return f"错误：找到 {count} 个与 old_text 匹配的内容。请提供更多上下文以精确匹配一次。"

    new_content = content.replace(old_text, new_text, 1)
    await service_execute(
        "UPDATE documents SET content = $1, version = version + 1 "
        "WHERE id = $2 AND user_id = $3",
        new_content, doc["id"], user_id,
    )

    link = deep_link(kb["slug"], dir_path, filename)
    return f"已编辑 `{path}`。替换了 1 处。\n[在 LLM Wiki 中查看]({link})"


async def _append_note(user_id: str, kb: dict, path: str, content: str) -> str:
    dir_path, filename = resolve_path(path)

    doc = await scoped_queryrow(
        user_id,
        "SELECT id, content FROM documents "
        "WHERE knowledge_base_id = $1 AND filename = $2 AND path = $3 AND NOT archived",
        kb["id"], filename, dir_path,
    )
    if not doc:
        return f"未找到文档 '{path}'。"

    new_content = (doc["content"] or "") + "\n\n" + content
    await service_execute(
        "UPDATE documents SET content = $1, version = version + 1 "
        "WHERE id = $2 AND user_id = $3",
        new_content, doc["id"], user_id,
    )

    link = deep_link(kb["slug"], dir_path, filename)
    return f"已追加到 `{path}`。\n[在 LLM Wiki 中查看]({link})"


def register(mcp: FastMCP) -> None:

    @mcp.tool(
        name="write",
        description=(
            "在知识库中创建或编辑笔记和维基页面。\n\n"
            "维基页面应在 `/wiki/` 下创建，并应使用 Markdown 脚注引用其来源 "
            "（例如 `[^1]: paper.pdf, p.3`）。\n\n"
            "你还可以创建 SVG 图表和 CSV 数据文件作为维基资产：\n"
            "- `write(command=\"create\", path=\"/wiki/\", title=\"architecture-diagram.svg\", content=\"<svg>...</svg>\", tags=[\"diagram\"])`\n"
            "- `write(command=\"create\", path=\"/wiki/\", title=\"data-table.csv\", content=\"col1,col2\\nval1,val2\", tags=[\"data\"])`\n"
            "SVG 和其他资产可以通过 `![架构](architecture-diagram.svg)` 嵌入维基页面\n\n"
            "命令：\n"
            "- create: 创建新页面（标题和标签是必需的）\n"
            "- str_replace: 替换现有页面中的确切文本（先读取）\n"
            "- append: 向现有页面末尾添加内容"
        ),
    )
    async def write(
        ctx: Context,
        knowledge_base: str,
        command: Literal["create", "str_replace", "append"],
        path: str = "/",
        title: str = "",
        content: str = "",
        tags: list[str] | None = None,
        date_str: str = "",
        old_text: str = "",
        new_text: str = "",
    ) -> str:
        user_id = get_user_id(ctx)

        kb = await resolve_kb(user_id, knowledge_base)
        if not kb:
            return f"未找到知识库 '{knowledge_base}'。"

        if command == "create":
            return await _create_note(user_id, kb, path, title, content, tags or [], date_str)
        elif command == "str_replace":
            return await _edit_note(user_id, kb, path, old_text, new_text)
        elif command == "append":
            return await _append_note(user_id, kb, path, content)

        return f"未知命令：{command}"
