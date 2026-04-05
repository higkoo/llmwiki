"""Supavault MCP tools — guide, search, read, write."""

import json
import os
import re
import logging
from datetime import date
from fnmatch import fnmatch
from typing import Literal

import aioboto3
from mcp.server.fastmcp import FastMCP, Context
from fastmcp.utilities.types import Image

from config import settings
from db import scoped_query, scoped_queryrow, scoped_execute

logger = logging.getLogger(__name__)

CONTEXT_CHARS = 120
MAX_LIST = 50
MAX_SEARCH = 20

GUIDE_TEXT = """# LLM Wiki — How It Works

You are connected to an **LLM Wiki** — a personal knowledge workspace with three layers:

## Three Layers

1. **Raw Sources** (path: `/`)
   Uploaded documents — PDFs, articles, notes, images, spreadsheets.
   These are your source of truth. You read from them but don't modify them.

2. **Compiled Wiki** (path: `/wiki/`)
   Markdown pages that YOU create and maintain. Summaries, entity pages, concept articles,
   comparisons, an overview. You own this layer — create pages, update them when new
   sources arrive, maintain cross-references, keep everything consistent.

3. **These Tools**
   search, read, write — your interface to both layers.

## Workflow

1. **Explore sources**: `search(mode="list")` to see what's available, then
   `search(mode="search", query="...")` to find specific content across all sources.

2. **Read sources**: `read(path="paper.pdf", pages="1-5")` to read specific pages.
   For images, the image is returned directly. For spreadsheets, call `read` without
   pages first to see sheet names, then `read(pages="2")` for a specific sheet.

3. **Write wiki pages**: `write(command="create", path="/wiki/", title="Overview", ...)`
   to compile what you've learned into structured wiki pages.

4. **Cite your sources**: Use markdown footnotes to reference sources:
   ```
   Transformers use self-attention[^1] that scales quadratically[^2].

   [^1]: attention-paper.pdf, p.3
   [^2]: scaling-laws.pdf, p.12-14
   ```

5. **Maintain the wiki**: As new sources are added, update existing wiki pages,
   add new ones, fix contradictions, strengthen cross-references.

## Available Knowledge Bases

"""


_LOCAL_USER_ID = os.environ.get("SUPAVAULT_USER_ID", "")


def _user_id(ctx: Context) -> str:
    if _LOCAL_USER_ID:
        return _LOCAL_USER_ID
    return ctx.request_context.access_token.client_id


def _deep_link(kb_slug: str, path: str, filename: str) -> str:
    full = (path.rstrip("/") + "/" + filename).lstrip("/")
    return f"{settings.APP_URL}/wikis/{kb_slug}/{full}"


def _extract_snippet(content: str, query: str) -> str:
    if not content:
        return "(empty)"
    idx = content.lower().find(query.lower())
    if idx < 0:
        return content[:CONTEXT_CHARS * 2].strip()
    start = max(0, idx - CONTEXT_CHARS)
    end = min(len(content), idx + len(query) + CONTEXT_CHARS)
    snippet = content[start:end].strip()
    if start > 0:
        snippet = "..." + snippet
    if end < len(content):
        snippet = snippet + "..."
    return snippet


def _glob_match(filepath: str, pattern: str) -> bool:
    return fnmatch(filepath, pattern)


_s3_session = None


def _get_s3_session():
    global _s3_session
    if _s3_session is None and settings.AWS_ACCESS_KEY_ID:
        _s3_session = aioboto3.Session(
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
    return _s3_session


async def _load_s3_bytes(key: str) -> bytes | None:
    session = _get_s3_session()
    if not session:
        return None
    try:
        async with session.client("s3") as s3:
            resp = await s3.get_object(Bucket=settings.S3_BUCKET, Key=key)
            return await resp["Body"].read()
    except Exception as e:
        logger.warning("Failed to load S3 key %s: %s", key, e)
        return None


def _parse_page_range(pages_str: str, max_page: int) -> list[int]:
    result = set()
    for part in pages_str.split(","):
        part = part.strip()
        if "-" in part:
            start, end = part.split("-", 1)
            s, e = int(start.strip()), int(end.strip())
            for p in range(max(1, s), min(max_page, e) + 1):
                result.add(p)
        elif part.isdigit():
            p = int(part)
            if 1 <= p <= max_page:
                result.add(p)
    return sorted(result)


def register(mcp: FastMCP) -> None:

    @mcp.tool(
        name="guide",
        description="Get started with LLM Wiki. Call this to understand how the knowledge vault works and see your available knowledge bases.",
    )
    async def guide(ctx: Context) -> str:
        user_id = _user_id(ctx)
        kbs = await scoped_query(
            user_id,
            "SELECT name, slug, "
            "  (SELECT count(*) FROM documents d WHERE d.knowledge_base_id = kb.id AND d.path NOT LIKE '/wiki/%%' AND NOT d.archived) as source_count, "
            "  (SELECT count(*) FROM documents d WHERE d.knowledge_base_id = kb.id AND d.path LIKE '/wiki/%%' AND NOT d.archived) as wiki_count "
            "FROM knowledge_bases kb ORDER BY created_at DESC",
        )
        if not kbs:
            return GUIDE_TEXT + "No knowledge bases yet. Create one at " + settings.APP_URL + "/wikis"

        lines = []
        for kb in kbs:
            lines.append(f"- **{kb['name']}** (`{kb['slug']}`) — {kb['source_count']} sources, {kb['wiki_count']} wiki pages")
        return GUIDE_TEXT + "\n".join(lines)

    @mcp.tool(
        name="search",
        description=(
            "Browse or search the knowledge vault.\n\n"
            "Sources (raw documents) live at `/`. Wiki pages (LLM-compiled) live at `/wiki/`.\n\n"
            "Modes:\n"
            "- list: browse files and folders\n"
            "- search: keyword search across document content (searches chunks for precise results with page numbers)\n\n"
            "Use `path` to scope: `*` for root, `/wiki/**` for wiki only, `*.pdf` for PDFs, etc.\n"
            "Use `tags` to filter by document tags."
        ),
    )
    async def search(
        ctx: Context,
        knowledge_base: str,
        mode: Literal["list", "search"] = "list",
        query: str = "",
        path: str = "*",
        tags: list[str] | None = None,
        limit: int = 10,
    ) -> str:
        user_id = _user_id(ctx)

        if not knowledge_base:
            return await _list_all_kbs(user_id)

        kb = await _resolve_kb(user_id, knowledge_base)
        if not kb:
            return f"Knowledge base '{knowledge_base}' not found."

        if mode == "list":
            return await _list_documents(user_id, kb, path, tags)
        elif mode == "search":
            if not query:
                return "search mode requires a query."
            return await _search_chunks(user_id, kb, query, path, tags, min(limit, MAX_SEARCH))

        return f"Unknown mode: {mode}"

    @mcp.tool(
        name="read",
        description=(
            "Read document content from the knowledge vault.\n\n"
            "For PDFs and office docs, use `pages` to read specific page ranges (e.g. '1-5', '3').\n"
            "For spreadsheets, each sheet is a page (call without pages first to see sheet names).\n"
            "Images on requested pages are automatically included in the response.\n"
            "For image files (png, jpg, etc.), the image is returned directly.\n"
            "For markdown notes, optionally extract specific sections by heading.\n\n"
            "When reading sources to compile wiki pages, note the filename and page ranges for citation."
        ),
    )
    async def read(
        ctx: Context,
        knowledge_base: str,
        path: str,
        pages: str = "",
        sections: list[str] | None = None,
    ) -> str | list:
        user_id = _user_id(ctx)

        kb = await _resolve_kb(user_id, knowledge_base)
        if not kb:
            return f"Knowledge base '{knowledge_base}' not found."

        path_clean = path.lstrip("/")
        if "/" in path_clean:
            dir_path = "/" + path_clean.rsplit("/", 1)[0] + "/"
            filename = path_clean.rsplit("/", 1)[1]
        else:
            dir_path = "/"
            filename = path_clean

        doc = await scoped_queryrow(
            user_id,
            "SELECT id, user_id, filename, title, path, content, tags, version, file_type, "
            "page_count, created_at, updated_at "
            "FROM documents WHERE knowledge_base_id = $1 AND filename = $2 AND path = $3 AND NOT archived",
            kb["id"], filename, dir_path,
        )
        if not doc:
            doc = await scoped_queryrow(
                user_id,
                "SELECT id, user_id, filename, title, path, content, tags, version, file_type, "
                "page_count, created_at, updated_at "
                "FROM documents WHERE knowledge_base_id = $1 AND (filename = $2 OR title = $2) AND NOT archived",
                kb["id"], path_clean.split("/")[-1] if "/" in path_clean else path_clean,
            )

        if not doc:
            return f"Document '{path}' not found in {knowledge_base}."

        tags_str = ", ".join(doc["tags"]) if doc["tags"] else "none"
        link = _deep_link(kb["slug"], doc["path"], doc["filename"])
        file_type = doc["file_type"] or ""

        header = (
            f"**{doc['title'] or doc['filename']}**\n"
            f"Type: {file_type} | Tags: {tags_str} | Version: {doc['version']} | "
            f"Updated: {doc['updated_at'].strftime('%Y-%m-%d') if doc['updated_at'] else 'unknown'}"
        )
        if doc["page_count"]:
            header += f" | Pages: {doc['page_count']}"
        header += f"\n[View in Supavault]({link})\n\n---\n\n"

        image_types = {"png", "jpg", "jpeg", "webp", "gif"}
        if file_type in image_types:
            s3_key = f"{doc['user_id']}/{doc['id']}/source.{file_type}"
            img_bytes = await _load_s3_bytes(s3_key)
            if img_bytes:
                fmt = "jpeg" if file_type in ("jpg", "jpeg") else file_type
                return [header, Image(data=img_bytes, format=fmt)]
            return header + "(Image could not be loaded from storage)"

        has_pages = file_type in ("pdf", "pptx", "ppt", "docx", "doc", "xlsx", "xls", "csv")
        spreadsheet_types = {"xlsx", "xls", "csv"}

        if has_pages and pages:
            return await _read_pages(doc, kb, header, pages)

        if file_type in spreadsheet_types and not pages:
            return await _read_spreadsheet_index(doc, header)

        content = doc["content"] or ""
        if sections:
            content = _extract_sections(content, sections)

        return header + content

    async def _read_pages(doc: dict, kb: dict, header: str, pages_str: str) -> str | list:
        max_page = doc["page_count"] or 1
        page_nums = _parse_page_range(pages_str, max_page)
        if not page_nums:
            return header + f"Invalid page range: {pages_str} (document has {max_page} pages)"

        user_id = str(doc["user_id"])
        doc_id = str(doc["id"])

        page_rows = await scoped_query(
            user_id,
            "SELECT page, content, elements FROM document_pages "
            "WHERE document_id = $1 AND page = ANY($2) ORDER BY page",
            doc["id"], page_nums,
        )

        if not page_rows:
            return header + f"No page data found for pages {pages_str}."

        result_parts: list[str | Image] = [header]
        for row in page_rows:
            result_parts.append(f"**— Page {row['page']} —**\n\n{row['content']}")

            elements = row["elements"]
            if not elements:
                continue
            if isinstance(elements, str):
                elements = json.loads(elements)

            images = elements.get("images", [])
            if not images:
                continue

            for img_meta in images:
                img_id = img_meta.get("id")
                if not img_id:
                    continue
                s3_key = f"{user_id}/{doc_id}/images/{img_id}"
                img_bytes = await _load_s3_bytes(s3_key)
                if img_bytes:
                    fmt = "jpeg" if img_id.endswith((".jpg", ".jpeg")) else "png"
                    result_parts.append(Image(data=img_bytes, format=fmt))

        if any(isinstance(p, Image) for p in result_parts):
            return result_parts
        return "\n\n".join(p for p in result_parts if isinstance(p, str))

    async def _read_spreadsheet_index(doc: dict, header: str) -> str:
        user_id = str(doc["user_id"])
        page_rows = await scoped_query(
            user_id,
            "SELECT page, content, elements FROM document_pages "
            "WHERE document_id = $1 ORDER BY page",
            doc["id"],
        )
        if not page_rows:
            return header + (doc["content"] or "(no data)")

        lines = [header, "**Sheets:**\n"]
        for row in page_rows:
            elements = row["elements"]
            if isinstance(elements, str):
                elements = json.loads(elements)
            sheet_name = (elements or {}).get("sheet_name", f"Sheet {row['page']}")
            row_count = row["content"].count("\n") if row["content"] else 0
            lines.append(f"  Page {row['page']}: **{sheet_name}** (~{row_count} rows)")
        lines.append(f"\nUse `pages=\"1\"` to read a specific sheet.")
        return "\n".join(lines)

    @mcp.tool(
        name="write",
        description=(
            "Create or edit notes and wiki pages in the knowledge vault.\n\n"
            "Wiki pages should be created under `/wiki/` and should cite their sources using "
            "markdown footnotes (e.g. `[^1]: paper.pdf, p.3`).\n\n"
            "Commands:\n"
            "- create: create a new page (title and tags are REQUIRED)\n"
            "- str_replace: replace exact text in an existing page (read first)\n"
            "- append: add content to the end of an existing page"
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
        user_id = _user_id(ctx)

        kb = await _resolve_kb(user_id, knowledge_base)
        if not kb:
            return f"Knowledge base '{knowledge_base}' not found."

        if command == "create":
            return await _create_note(user_id, kb, path, title, content, tags or [], date_str)
        elif command == "str_replace":
            return await _edit_note(user_id, kb, path, old_text, new_text)
        elif command == "append":
            return await _append_note(user_id, kb, path, content)

        return f"Unknown command: {command}"

    @mcp.tool(
        name="delete",
        description=(
            "Delete documents or wiki pages from the knowledge vault.\n\n"
            "Provide a path to delete a single file, or a glob pattern to delete multiple.\n"
            "Examples:\n"
            "- `path=\"old-notes.md\"` — delete a single file\n"
            "- `path=\"/wiki/drafts/*\"` — delete all files in a folder\n"
            "- `path=\"/wiki/**\"` — delete the entire wiki\n\n"
            "Returns a list of deleted files. This action cannot be undone."
        ),
    )
    async def delete(
        ctx: Context,
        knowledge_base: str,
        path: str,
    ) -> str:
        user_id = _user_id(ctx)

        kb = await _resolve_kb(user_id, knowledge_base)
        if not kb:
            return f"Knowledge base '{knowledge_base}' not found."

        if not path or path in ("*", "**", "**/*"):
            return "Error: refusing to delete everything. Use a more specific path."

        is_glob = "*" in path or "?" in path

        if is_glob:
            docs = await scoped_query(
                user_id,
                "SELECT id, filename, title, path FROM documents "
                "WHERE knowledge_base_id = $1 AND NOT archived ORDER BY path, filename",
                kb["id"],
            )
            glob_pat = "/" + path.lstrip("/") if not path.startswith("/") else path
            matched = [d for d in docs if _glob_match(d["path"] + d["filename"], glob_pat)]
        else:
            path_clean = path.lstrip("/")
            if "/" in path_clean:
                dir_path = "/" + path_clean.rsplit("/", 1)[0] + "/"
                filename = path_clean.rsplit("/", 1)[1]
            else:
                dir_path = "/"
                filename = path_clean

            doc = await scoped_queryrow(
                user_id,
                "SELECT id, filename, title, path FROM documents "
                "WHERE knowledge_base_id = $1 AND filename = $2 AND path = $3 AND NOT archived",
                kb["id"], filename, dir_path,
            )
            matched = [doc] if doc else []

        if not matched:
            return f"No documents matching `{path}` found in {knowledge_base}."

        doc_ids = [str(d["id"]) for d in matched]
        await scoped_execute(
            user_id,
            "UPDATE documents SET archived = true, updated_at = now() "
            "WHERE id = ANY($1::uuid[])",
            doc_ids,
        )

        lines = [f"Deleted {len(matched)} document(s):\n"]
        for d in matched:
            lines.append(f"  {d['path']}{d['filename']}")
        return "\n".join(lines)

    async def _list_all_kbs(user_id: str) -> str:
        kbs = await scoped_query(
            user_id,
            "SELECT name, slug, created_at FROM knowledge_bases ORDER BY created_at DESC",
        )
        if not kbs:
            return "No knowledge bases found. Create one first."

        lines = ["**Knowledge Bases:**\n"]
        for kb in kbs:
            doc_count = await scoped_queryrow(
                user_id,
                "SELECT count(*) as cnt FROM documents WHERE knowledge_base_id = ("
                "SELECT id FROM knowledge_bases WHERE slug = $1) AND NOT archived",
                kb["slug"],
            )
            cnt = doc_count["cnt"] if doc_count else 0
            lines.append(f"  {kb['slug']}/ — {kb['name']} ({cnt} documents)")
        return "\n".join(lines)

    async def _resolve_kb(user_id: str, slug: str) -> dict | None:
        return await scoped_queryrow(
            user_id,
            "SELECT id, name, slug FROM knowledge_bases WHERE slug = $1",
            slug,
        )

    async def _list_documents(user_id: str, kb: dict, target: str, tags: list[str] | None) -> str:
        docs = await scoped_query(
            user_id,
            "SELECT id, filename, title, path, file_type, tags, page_count, updated_at "
            "FROM documents WHERE knowledge_base_id = $1 AND NOT archived "
            "ORDER BY path, filename",
            kb["id"],
        )

        if target not in ("*", "**", "**/*"):
            glob_pat = "/" + target.lstrip("/") if not target.startswith("/") else target
            docs = [d for d in docs if _glob_match(d["path"] + d["filename"], glob_pat)]

        if tags:
            tag_set = {t.lower() for t in tags}
            docs = [d for d in docs if tag_set.issubset({t.lower() for t in (d["tags"] or [])})]

        if not docs:
            return f"No matches for `{target}` in {kb['slug']}."

        sources = [d for d in docs if not d["path"].startswith("/wiki/")]
        wiki_pages = [d for d in docs if d["path"].startswith("/wiki/")]

        lines = [f"**{kb['name']}** (`{target}`):\n"]

        if sources:
            lines.append(f"**Sources ({len(sources)}):**")
            for doc in sources[:MAX_LIST]:
                title = doc["title"] or doc["filename"]
                tag_str = f" [{', '.join(doc['tags'])}]" if doc["tags"] else ""
                date_part = f", {doc['updated_at'].strftime('%Y-%m-%d')}" if doc["updated_at"] else ""
                pages_part = f", {doc['page_count']}p" if doc["page_count"] else ""
                lines.append(f"  {doc['path']}{doc['filename']} ({doc['file_type']}{pages_part}{date_part}){tag_str}")
            if len(sources) > MAX_LIST:
                lines.append(f"  ... {len(sources) - MAX_LIST} more")

        if wiki_pages:
            if sources:
                lines.append("")
            lines.append(f"**Wiki ({len(wiki_pages)} pages):**")
            for doc in wiki_pages[:MAX_LIST]:
                title = doc["title"] or doc["filename"]
                date_part = f", {doc['updated_at'].strftime('%Y-%m-%d')}" if doc["updated_at"] else ""
                lines.append(f"  {doc['path']}{doc['filename']}{date_part}")

        return "\n".join(lines)

    async def _search_chunks(
        user_id: str, kb: dict, query: str, path: str,
        tags: list[str] | None, limit: int,
    ) -> str:
        path_filter = ""
        path_args = []
        arg_idx = 3

        if path not in ("*", "**", "**/*"):
            if path.startswith("/wiki"):
                path_filter = f" AND d.path LIKE '/wiki/%%'"
            elif path == "/" or path == "/*":
                path_filter = f" AND d.path NOT LIKE '/wiki/%%'"

        matches = await scoped_query(
            user_id,
            f"SELECT dc.content, dc.page, dc.header_breadcrumb, dc.chunk_index, "
            f"  d.filename, d.title, d.path, d.file_type "
            f"FROM document_chunks dc "
            f"JOIN documents d ON dc.document_id = d.id "
            f"WHERE dc.knowledge_base_id = $1 "
            f"  AND dc.content &@~ $2 "
            f"  AND NOT d.archived"
            f"{path_filter} "
            f"ORDER BY d.path, d.filename, dc.chunk_index "
            f"LIMIT {limit}",
            kb["id"], query,
        )

        if tags:
            tag_set = {t.lower() for t in tags}
            matches = [m for m in matches if tag_set.issubset({t.lower() for t in (m.get("tags") or [])})]

        if not matches:
            return f"No matches for `{query}` in {kb['slug']}."

        lines = [f"**{len(matches)} result(s)** for `{query}`:\n"]
        for m in matches:
            filepath = f"{m['path']}{m['filename']}"
            page_str = f" (p.{m['page']})" if m['page'] else ""
            breadcrumb = f"\n  {m['header_breadcrumb']}" if m["header_breadcrumb"] else ""
            snippet = _extract_snippet(m["content"], query)
            link = _deep_link(kb["slug"], m["path"], m["filename"])
            lines.append(f"**{filepath}**{page_str} — [view]({link}){breadcrumb}")
            lines.append(f"```\n{snippet}\n```\n")

        return "\n".join(lines)

    async def _create_note(
        user_id: str, kb: dict, path: str, title: str, content: str,
        tags: list[str], date_str: str,
    ) -> str:
        if not title:
            return "Error: title is required when creating a note."
        if not tags:
            return "Error: at least one tag is required when creating a note."

        dir_path = path if path.endswith("/") else path + "/"
        if not dir_path.startswith("/"):
            dir_path = "/" + dir_path

        filename = re.sub(r"[^\w\s\-.]", "", title.lower().replace(" ", "-"))
        if not filename.endswith(".md"):
            filename += ".md"

        note_date = date_str or date.today().isoformat()

        doc = await scoped_queryrow(
            user_id,
            "INSERT INTO documents (knowledge_base_id, user_id, filename, title, path, "
            "file_type, status, content, tags, version) "
            "VALUES ($1, auth.uid(), $2, $3, $4, 'md', 'ready', $5, $6, 0) "
            "RETURNING id, filename, path",
            kb["id"], filename, title, dir_path, content, tags,
        )

        link = _deep_link(kb["slug"], doc["path"], doc["filename"])

        is_wiki = dir_path.startswith("/wiki/")
        suffix = ""
        if is_wiki:
            suffix = "\n\nRemember to cite sources using footnotes: `[^1]: source-file.pdf, p.X`"

        return (
            f"Created **{title}** at `{dir_path}{filename}`\n"
            f"Tags: {', '.join(tags)} | Date: {note_date}\n"
            f"[View in Supavault]({link}){suffix}"
        )

    async def _edit_note(user_id: str, kb: dict, path: str, old_text: str, new_text: str) -> str:
        if not old_text:
            return "Error: old_text is required for str_replace."

        path_clean = path.lstrip("/")
        if "/" in path_clean:
            dir_path = "/" + path_clean.rsplit("/", 1)[0] + "/"
            filename = path_clean.rsplit("/", 1)[1]
        else:
            dir_path = "/"
            filename = path_clean

        doc = await scoped_queryrow(
            user_id,
            "SELECT id, content FROM documents "
            "WHERE knowledge_base_id = $1 AND filename = $2 AND path = $3 AND NOT archived",
            kb["id"], filename, dir_path,
        )
        if not doc:
            return f"Document '{path}' not found."

        content = doc["content"] or ""
        count = content.count(old_text)
        if count == 0:
            return "Error: no match found for old_text."
        if count > 1:
            return f"Error: found {count} matches for old_text. Provide more context to match exactly once."

        new_content = content.replace(old_text, new_text, 1)
        await scoped_execute(
            user_id,
            "UPDATE documents SET content = $1, version = version + 1 WHERE id = $2",
            new_content, doc["id"],
        )

        link = _deep_link(kb["slug"], dir_path, filename)
        return f"Edited `{path}`. Replaced 1 occurrence.\n[View in Supavault]({link})"

    async def _append_note(user_id: str, kb: dict, path: str, content: str) -> str:
        path_clean = path.lstrip("/")
        if "/" in path_clean:
            dir_path = "/" + path_clean.rsplit("/", 1)[0] + "/"
            filename = path_clean.rsplit("/", 1)[1]
        else:
            dir_path = "/"
            filename = path_clean

        doc = await scoped_queryrow(
            user_id,
            "SELECT id, content FROM documents "
            "WHERE knowledge_base_id = $1 AND filename = $2 AND path = $3 AND NOT archived",
            kb["id"], filename, dir_path,
        )
        if not doc:
            return f"Document '{path}' not found."

        new_content = (doc["content"] or "") + "\n\n" + content
        await scoped_execute(
            user_id,
            "UPDATE documents SET content = $1, version = version + 1 WHERE id = $2",
            new_content, doc["id"],
        )

        link = _deep_link(kb["slug"], dir_path, filename)
        return f"Appended to `{path}`.\n[View in Supavault]({link})"


def _extract_sections(content: str, section_names: list[str]) -> str:
    lines = content.split("\n")
    sections = []
    current_section = None
    current_lines = []

    for line in lines:
        if line.startswith("#"):
            if current_section and current_lines:
                sections.append((current_section, "\n".join(current_lines)))
            heading = line.lstrip("#").strip()
            current_section = heading
            current_lines = [line]
        elif current_section:
            current_lines.append(line)

    if current_section and current_lines:
        sections.append((current_section, "\n".join(current_lines)))

    wanted = {s.lower() for s in section_names}
    matched = [text for name, text in sections if name.lower() in wanted]

    if not matched:
        return f"No sections matching {section_names} found."
    return "\n\n".join(matched)
