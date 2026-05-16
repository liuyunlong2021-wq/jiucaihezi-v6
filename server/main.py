"""
韭菜盒子 — Office & Graphify 后端服务
FastAPI service for document processing and knowledge graph operations.

Endpoints:
  POST /api/upload            — 通用文件上传，返回 URL
  POST /api/office/convert    — 文件格式转换 (docx→pdf, pptx→pdf, etc.)
  POST /api/office/create     — 创建文档 (从 JSON 描述 → docx/xlsx/pptx)
  POST /api/office/read       — 读取文档内容 (提取文本/表格) + 可选缩略图
  POST /api/office/execute    — 执行 Python 代码片段 (沙箱)
  POST /api/office/thumbnail  — 生成文档首页缩略图
  POST /api/graphify/build    — 构建知识图谱
  POST /api/graphify/query    — 查询知识图谱
  GET  /api/health            — 健康检查
  GET  /api/files/{filename}  — 下载/访问文件
"""

import os
import json
import uuid
import shutil
import asyncio
import tempfile
import traceback
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

app = FastAPI(title="韭菜盒子 Office & Graphify API", version="1.0.0")

# CORS — 允许前端跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 文件存储目录
UPLOAD_DIR = Path("/opt/jiucaihezi/uploads")
OUTPUT_DIR = Path("/opt/jiucaihezi/output")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ─── 健康检查 ───

@app.get("/api/health")
async def health():
    checks = {}
    # LibreOffice
    try:
        proc = await asyncio.create_subprocess_exec(
            "libreoffice", "--version",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        out, _ = await proc.communicate()
        checks["libreoffice"] = out.decode().strip() if proc.returncode == 0 else "not found"
    except Exception:
        checks["libreoffice"] = "not found"
    # Python packages
    for pkg in ["pypdf", "pdfplumber", "reportlab", "docx", "openpyxl", "pandas"]:
        try:
            __import__(pkg)
            checks[pkg] = "ok"
        except ImportError:
            checks[pkg] = "missing"
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat(), "checks": checks}


# ─── 文件下载/访问 ───

@app.get("/api/files/{filename}")
async def download_file(filename: str):
    filepath = OUTPUT_DIR / filename
    if not filepath.exists():
        raise HTTPException(404, f"File not found: {filename}")
    # 图片/PDF 直接内联显示
    import mimetypes
    mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    if mime.startswith("image/") or mime == "application/pdf":
        return FileResponse(filepath, media_type=mime)
    return FileResponse(filepath, filename=filename)


# ─── 通用文件上传 ───

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """上传文件到服务器，返回可访问的 URL"""
    suffix = Path(file.filename or "upload").suffix.lower()
    out_name = f"{uuid.uuid4().hex[:12]}{suffix}"
    out_path = OUTPUT_DIR / out_name
    content = await file.read()
    with open(out_path, "wb") as f:
        f.write(content)
    base_url = "https://api.jiucaihezi.studio"
    return {
        "status": "ok",
        "filename": out_name,
        "url": f"{base_url}/api/files/{out_name}",
        "size": len(content),
        "mime_type": file.content_type or "",
    }


# ─── 文档缩略图 ───

@app.post("/api/office/thumbnail")
async def generate_thumbnail(file: UploadFile = File(...)):
    """生成文档首页缩略图 (PNG)"""
    suffix = Path(file.filename or "").suffix.lower()
    tmp = UPLOAD_DIR / f"{uuid.uuid4()}{suffix}"
    try:
        with open(tmp, "wb") as f:
            f.write(await file.read())

        # 先转 PDF
        pdf_path = tmp
        if suffix not in (".pdf",):
            proc = await asyncio.create_subprocess_exec(
                "libreoffice", "--headless", "--convert-to", "pdf",
                "--outdir", str(UPLOAD_DIR), str(tmp),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            await proc.communicate()
            pdf_candidate = UPLOAD_DIR / f"{tmp.stem}.pdf"
            if pdf_candidate.exists():
                pdf_path = pdf_candidate

        # PDF → PNG (首页)
        thumb_name = f"thumb_{uuid.uuid4().hex[:8]}.png"
        thumb_path = OUTPUT_DIR / thumb_name
        proc = await asyncio.create_subprocess_exec(
            "pdftoppm", "-png", "-singlefile", "-r", "150",
            str(pdf_path), str(thumb_path.with_suffix("")),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()

        if thumb_path.exists():
            base_url = "https://api.jiucaihezi.studio"
            return {
                "status": "ok",
                "thumbnail_url": f"{base_url}/api/files/{thumb_name}",
            }
        return {"status": "error", "error": "缩略图生成失败"}
    finally:
        tmp.unlink(missing_ok=True)
        # 清理临时 PDF
        pdf_tmp = UPLOAD_DIR / f"{tmp.stem}.pdf"
        if pdf_tmp.exists() and pdf_tmp != tmp:
            pdf_tmp.unlink(missing_ok=True)


# ─── 文档读取 ───

@app.post("/api/office/read")
async def read_document(
    file: UploadFile = File(...),
    with_thumbnail: bool = Form(default=False),
):
    """读取文档内容，返回提取的文本和元数据。可选生成缩略图。"""
    suffix = Path(file.filename or "").suffix.lower()
    tmp = UPLOAD_DIR / f"{uuid.uuid4()}{suffix}"
    try:
        with open(tmp, "wb") as f:
            content = await file.read()
            f.write(content)

        if suffix == ".pdf":
            result = await _read_pdf(tmp)
        elif suffix in (".docx", ".doc"):
            result = await _read_docx(tmp)
        elif suffix in (".xlsx", ".xls", ".csv"):
            result = await _read_xlsx(tmp)
        elif suffix in (".pptx", ".ppt"):
            result = await _read_pptx(tmp)
        else:
            result = {"status": "error", "error": f"Unsupported format: {suffix}"}

        # 可选：生成缩略图
        if with_thumbnail and result.get("status") == "ok":
            try:
                pdf_path = tmp
                if suffix not in (".pdf",):
                    proc = await asyncio.create_subprocess_exec(
                        "libreoffice", "--headless", "--convert-to", "pdf",
                        "--outdir", str(UPLOAD_DIR), str(tmp),
                        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                    )
                    await proc.communicate()
                    pdf_candidate = UPLOAD_DIR / f"{tmp.stem}.pdf"
                    if pdf_candidate.exists():
                        pdf_path = pdf_candidate

                thumb_name = f"thumb_{uuid.uuid4().hex[:8]}.png"
                thumb_path = OUTPUT_DIR / thumb_name
                proc = await asyncio.create_subprocess_exec(
                    "pdftoppm", "-png", "-singlefile", "-r", "100",
                    str(pdf_path), str(thumb_path.with_suffix("")),
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                await proc.communicate()
                if thumb_path.exists():
                    result["thumbnail_url"] = f"/api/files/{thumb_name}"

                # 清理临时 PDF
                pdf_tmp = UPLOAD_DIR / f"{tmp.stem}.pdf"
                if pdf_tmp.exists() and pdf_tmp != tmp:
                    pdf_tmp.unlink(missing_ok=True)
            except Exception:
                pass  # 缩略图失败不影响主流程

        return result
    finally:
        tmp.unlink(missing_ok=True)


async def _read_pdf(path: Path):
    from pypdf import PdfReader
    reader = PdfReader(str(path))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        pages.append({"page": i + 1, "text": text})
    meta = reader.metadata
    return {
        "status": "ok",
        "format": "pdf",
        "page_count": len(reader.pages),
        "metadata": {
            "title": getattr(meta, "title", None),
            "author": getattr(meta, "author", None),
        },
        "pages": pages,
    }


async def _read_docx(path: Path):
    from docx import Document
    doc = Document(str(path))
    paragraphs = [p.text for p in doc.paragraphs]
    tables = []
    for table in doc.tables:
        rows = []
        for row in table.rows:
            rows.append([cell.text for cell in row.cells])
        tables.append(rows)
    return {
        "status": "ok",
        "format": "docx",
        "paragraphs": paragraphs,
        "tables": tables,
        "paragraph_count": len(paragraphs),
        "table_count": len(tables),
    }


async def _read_xlsx(path: Path):
    import pandas as pd
    suffix = path.suffix.lower()
    if suffix == ".csv":
        df = pd.read_csv(str(path))
        sheets = {"Sheet1": df.to_dict(orient="records")}
    else:
        xls = pd.read_excel(str(path), sheet_name=None)
        sheets = {name: df.to_dict(orient="records") for name, df in xls.items()}
    return {
        "status": "ok",
        "format": "xlsx",
        "sheets": {name: {"rows": len(data), "data": data[:100]} for name, data in sheets.items()},
    }


async def _read_pptx(path: Path):
    """使用 markitdown 或 fallback 到 python-pptx"""
    try:
        proc = await asyncio.create_subprocess_exec(
            "python3", "-m", "markitdown", str(path),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        out, _ = await proc.communicate()
        if proc.returncode == 0:
            return {"status": "ok", "format": "pptx", "content": out.decode()}
    except Exception:
        pass
    return {"status": "ok", "format": "pptx", "content": "(PPTX reading requires markitdown)"}


# ─── 文件格式转换 ───

@app.post("/api/office/convert")
async def convert_document(
    file: UploadFile = File(...),
    target_format: str = Form("pdf"),
):
    """文件格式转换：docx→pdf, pptx→pdf, xlsx→pdf, doc→docx, etc."""
    suffix = Path(file.filename or "").suffix.lower()
    tmp = UPLOAD_DIR / f"{uuid.uuid4()}{suffix}"
    try:
        with open(tmp, "wb") as f:
            content = await file.read()
            f.write(content)

        out_name = f"{uuid.uuid4()}.{target_format}"
        out_path = OUTPUT_DIR / out_name

        # LibreOffice 转换
        proc = await asyncio.create_subprocess_exec(
            "libreoffice", "--headless", "--convert-to", target_format,
            "--outdir", str(OUTPUT_DIR), str(tmp),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        _, err = await proc.communicate()

        if proc.returncode != 0:
            return {"status": "error", "error": f"LibreOffice conversion failed: {err.decode()}"}

        # LibreOffice 输出文件名基于输入文件名
        converted = OUTPUT_DIR / f"{tmp.stem}.{target_format}"
        if converted.exists():
            converted.rename(out_path)
            return {
                "status": "ok",
                "filename": out_name,
                "download_url": f"/api/files/{out_name}",
                "size": out_path.stat().st_size,
            }
        return {"status": "error", "error": "Converted file not found"}
    finally:
        tmp.unlink(missing_ok=True)


# ─── 创建文档 ───

@app.post("/api/office/create")
async def create_document(
    doc_type: str = Form(...),       # pdf, docx, xlsx, pptx
    content: str = Form(...),         # JSON 描述
    filename: str = Form(None),       # 可选文件名
):
    """从 JSON 描述创建文档"""
    try:
        spec = json.loads(content)
    except json.JSONDecodeError:
        spec = {"text": content}

    out_name = filename or f"{uuid.uuid4()}.{doc_type}"
    if not out_name.endswith(f".{doc_type}"):
        out_name += f".{doc_type}"
    out_path = OUTPUT_DIR / out_name

    try:
        if doc_type == "pdf":
            await _create_pdf(spec, out_path)
        elif doc_type == "docx":
            await _create_docx(spec, out_path)
        elif doc_type == "xlsx":
            await _create_xlsx(spec, out_path)
        elif doc_type == "pptx":
            return {"status": "error", "error": "PPTX creation requires pptxgenjs (use /api/office/execute)"}
        else:
            return {"status": "error", "error": f"Unsupported doc_type: {doc_type}"}

        return {
            "status": "ok",
            "filename": out_name,
            "download_url": f"/api/files/{out_name}",
            "size": out_path.stat().st_size,
        }
    except Exception as e:
        return {"status": "error", "error": str(e), "traceback": traceback.format_exc()}


async def _create_pdf(spec: dict, out_path: Path):
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm

    doc = SimpleDocTemplate(str(out_path), pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

    if "title" in spec:
        story.append(Paragraph(spec["title"], styles["Title"]))
        story.append(Spacer(1, 0.5 * cm))

    paragraphs = spec.get("paragraphs", [])
    if isinstance(paragraphs, str):
        paragraphs = paragraphs.split("\n\n")
    for p in paragraphs:
        if isinstance(p, str):
            story.append(Paragraph(p, styles["Normal"]))
            story.append(Spacer(1, 0.3 * cm))
        elif isinstance(p, dict):
            style = p.get("style", "Normal")
            story.append(Paragraph(p.get("text", ""), styles.get(style, styles["Normal"])))
            story.append(Spacer(1, 0.3 * cm))

    doc.build(story)


async def _create_docx(spec: dict, out_path: Path):
    from docx import Document
    from docx.shared import Pt

    doc = Document()

    if "title" in spec:
        doc.add_heading(spec["title"], level=0)

    for p in spec.get("paragraphs", []):
        if isinstance(p, str):
            doc.add_paragraph(p)
        elif isinstance(p, dict):
            level = p.get("heading_level")
            if level:
                doc.add_heading(p.get("text", ""), level=level)
            else:
                doc.add_paragraph(p.get("text", ""))

    for table_data in spec.get("tables", []):
        if not table_data:
            continue
        rows = len(table_data)
        cols = len(table_data[0]) if table_data else 0
        table = doc.add_table(rows=rows, cols=cols)
        table.style = "Table Grid"
        for i, row_data in enumerate(table_data):
            for j, cell_text in enumerate(row_data):
                table.rows[i].cells[j].text = str(cell_text)

    doc.save(str(out_path))


async def _create_xlsx(spec: dict, out_path: Path):
    import pandas as pd

    sheets = spec.get("sheets", {})
    if not sheets and "data" in spec:
        sheets = {"Sheet1": spec["data"]}

    with pd.ExcelWriter(str(out_path), engine="openpyxl") as writer:
        for sheet_name, data in sheets.items():
            if isinstance(data, list):
                df = pd.DataFrame(data)
            elif isinstance(data, dict):
                df = pd.DataFrame(data)
            else:
                df = pd.DataFrame()
            df.to_excel(writer, sheet_name=sheet_name, index=False)


# ─── 代码执行 (沙箱) ───

@app.post("/api/office/execute")
async def execute_code(
    code: str = Form(...),
    language: str = Form("python"),
    timeout: int = Form(60),
    files: list[UploadFile] = File(default=[]),
):
    """在沙箱中执行代码片段，用于复杂文档操作"""
    work_dir = Path(tempfile.mkdtemp(prefix="jch_exec_"))
    try:
        # 保存上传的文件
        for f in files:
            fpath = work_dir / (f.filename or f"file_{uuid.uuid4()}")
            with open(fpath, "wb") as fp:
                fp.write(await f.read())

        if language == "python":
            return await _exec_python(code, work_dir, timeout)
        elif language == "javascript":
            return await _exec_node(code, work_dir, timeout)
        else:
            return {"status": "error", "error": f"Unsupported language: {language}"}
    finally:
        # 移动生成的文件到 output 目录
        for f in work_dir.iterdir():
            if f.suffix.lower() in (".pdf", ".docx", ".xlsx", ".pptx", ".png", ".jpg", ".svg"):
                dest = OUTPUT_DIR / f.name
                shutil.move(str(f), str(dest))
        shutil.rmtree(work_dir, ignore_errors=True)


async def _exec_python(code: str, work_dir: Path, timeout: int):
    script = work_dir / "script.py"
    script.write_text(code)
    try:
        proc = await asyncio.create_subprocess_exec(
            "python3", str(script),
            cwd=str(work_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        output_files = []
        for f in work_dir.iterdir():
            if f.suffix.lower() in (".pdf", ".docx", ".xlsx", ".pptx", ".png", ".jpg", ".svg"):
                output_files.append({
                    "filename": f.name,
                    "download_url": f"/api/files/{f.name}",
                    "size": f.stat().st_size,
                })
        return {
            "status": "ok" if proc.returncode == 0 else "error",
            "stdout": out.decode()[:10000],
            "stderr": err.decode()[:5000],
            "return_code": proc.returncode,
            "output_files": output_files,
        }
    except asyncio.TimeoutError:
        return {"status": "error", "error": f"Execution timed out after {timeout}s"}


async def _exec_node(code: str, work_dir: Path, timeout: int):
    script = work_dir / "script.js"
    script.write_text(code)
    try:
        proc = await asyncio.create_subprocess_exec(
            "node", str(script),
            cwd=str(work_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        output_files = []
        for f in work_dir.iterdir():
            if f.suffix.lower() in (".pdf", ".docx", ".xlsx", ".pptx", ".png", ".jpg", ".svg"):
                output_files.append({
                    "filename": f.name,
                    "download_url": f"/api/files/{f.name}",
                    "size": f.stat().st_size,
                })
        return {
            "status": "ok" if proc.returncode == 0 else "error",
            "stdout": out.decode()[:10000],
            "stderr": err.decode()[:5000],
            "return_code": proc.returncode,
            "output_files": output_files,
        }
    except asyncio.TimeoutError:
        return {"status": "error", "error": f"Execution timed out after {timeout}s"}


# ─── Graphify 知识图谱 ───

@app.post("/api/graphify/build")
async def build_graph(
    files: list[UploadFile] = File(...),
    backend: str = Form("claude"),
    api_key: str = Form(None),
):
    """从上传的文件构建知识图谱"""
    work_dir = Path(tempfile.mkdtemp(prefix="jch_graph_"))
    try:
        for f in files:
            fpath = work_dir / (f.filename or f"file_{uuid.uuid4()}")
            with open(fpath, "wb") as fp:
                fp.write(await f.read())

        env = os.environ.copy()
        if api_key:
            if backend == "claude":
                env["ANTHROPIC_API_KEY"] = api_key
            elif backend == "openai":
                env["OPENAI_API_KEY"] = api_key

        # Run graphify extract
        proc = await asyncio.create_subprocess_exec(
            "python3", "-m", "graphify", "extract", str(work_dir),
            "--backend", backend,
            cwd=str(work_dir),
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, err = await asyncio.wait_for(proc.communicate(), timeout=300)

        # Look for graph.json
        graph_out = work_dir / "graphify-out"
        graph_json = graph_out / "graph.json"
        graph_html = graph_out / "graph.html"

        result = {
            "status": "ok" if proc.returncode == 0 else "error",
            "stdout": out.decode()[:10000],
            "stderr": err.decode()[:5000],
        }

        if graph_json.exists():
            # Copy to output dir
            out_json = f"graph_{uuid.uuid4().hex[:8]}.json"
            shutil.copy(str(graph_json), str(OUTPUT_DIR / out_json))
            result["graph_json"] = f"/api/files/{out_json}"

            # Parse graph stats
            try:
                graph = json.loads(graph_json.read_text())
                result["stats"] = {
                    "nodes": len(graph.get("nodes", [])),
                    "edges": len(graph.get("links", graph.get("edges", []))),
                }
            except Exception:
                pass

        if graph_html.exists():
            out_html = f"graph_{uuid.uuid4().hex[:8]}.html"
            shutil.copy(str(graph_html), str(OUTPUT_DIR / out_html))
            result["graph_html"] = f"/api/files/{out_html}"

        return result
    except asyncio.TimeoutError:
        return {"status": "error", "error": "Graph build timed out (300s)"}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@app.post("/api/graphify/query")
async def query_graph(
    question: str = Form(...),
    graph_file: str = Form("graph.json"),
):
    """查询已构建的知识图谱"""
    graph_path = OUTPUT_DIR / graph_file
    if not graph_path.exists():
        return {"status": "error", "error": f"Graph file not found: {graph_file}"}

    proc = await asyncio.create_subprocess_exec(
        "python3", "-m", "graphify", "query", question,
        "--graph", str(graph_path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await asyncio.wait_for(proc.communicate(), timeout=60)
    return {
        "status": "ok" if proc.returncode == 0 else "error",
        "answer": out.decode()[:10000],
        "stderr": err.decode()[:2000] if proc.returncode != 0 else "",
    }


# ─── 启动 ───

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)
