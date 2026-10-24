"""SQLite persistence for the RFQ assistant plugin."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import aiosqlite

from .domain import DEFAULT_PRODUCTS, dump_json, utc_now


class CaseNotFoundError(KeyError):
    """Raised when an RFQ case does not exist."""


class RevisionConflictError(RuntimeError):
    """Raised when a stale workbench revision attempts to overwrite a case."""


class InvalidTransitionError(RuntimeError):
    """Raised when a case workflow transition is not currently allowed."""


class RfqStorage:
    """Persist RFQ cases, catalog snapshots, approvals, and audit records."""

    def __init__(self, db_path: Path) -> None:
        """Initialize the storage facade.

        Args:
            db_path: Plugin-owned SQLite file.
        """
        self.db_path = db_path

    async def _connect(self) -> aiosqlite.Connection:
        """Open a configured database connection.

        Returns:
            An aiosqlite connection with named rows and foreign keys enabled.
        """
        connection = await aiosqlite.connect(self.db_path)
        connection.row_factory = aiosqlite.Row
        await connection.execute("PRAGMA foreign_keys = ON")
        await connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    async def initialize(self) -> None:
        """Create the database schema and seed the demo catalog."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = await self._connect()
        try:
            await connection.execute("PRAGMA journal_mode = WAL")
            await connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS catalog_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_name TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    catalog_version_id INTEGER NOT NULL,
                    sku TEXT NOT NULL,
                    model_name TEXT NOT NULL,
                    product_json TEXT NOT NULL,
                    FOREIGN KEY (catalog_version_id) REFERENCES catalog_versions(id)
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_product_version_sku
                    ON products(catalog_version_id, sku);
                CREATE TABLE IF NOT EXISTS cases (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    customer_name TEXT,
                    project_name TEXT,
                    source_text TEXT NOT NULL,
                    active_revision INTEGER NOT NULL,
                    created_by TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS case_revisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT NOT NULL,
                    revision_no INTEGER NOT NULL,
                    requirements_json TEXT NOT NULL,
                    missing_json TEXT NOT NULL,
                    response_text TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
                    UNIQUE(case_id, revision_no)
                );
                CREATE TABLE IF NOT EXISTS attachments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    stored_path TEXT NOT NULL,
                    content_type TEXT,
                    size_bytes INTEGER NOT NULL,
                    extracted_text TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS recommendation_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT NOT NULL,
                    revision_no INTEGER NOT NULL,
                    catalog_version_id INTEGER NOT NULL,
                    candidates_json TEXT NOT NULL,
                    conflicts_json TEXT NOT NULL,
                    evidence_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
                    FOREIGN KEY (catalog_version_id) REFERENCES catalog_versions(id)
                );
                CREATE TABLE IF NOT EXISTS approvals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT NOT NULL,
                    revision_no INTEGER NOT NULL,
                    approval_type TEXT NOT NULL,
                    decision TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    comment TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS audit_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT,
                    event_type TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    details_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_cases_updated ON cases(updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_recommendation_case_revision
                    ON recommendation_runs(case_id, revision_no, id DESC);
                CREATE INDEX IF NOT EXISTS idx_approval_case_revision
                    ON approvals(case_id, revision_no, id);
                """
            )
            await connection.commit()
            cursor = await connection.execute(
                "SELECT id FROM catalog_versions WHERE active = 1 LIMIT 1"
            )
            active = await cursor.fetchone()
        finally:
            await connection.close()
        if active is None:
            await self.import_catalog(DEFAULT_PRODUCTS, "内置虚构演示目录")

    async def import_catalog(
        self, products: list[dict[str, Any]], source_name: str
    ) -> int:
        """Atomically install a new active catalog version.

        Args:
            products: Validated product dictionaries.
            source_name: Human-readable import source.

        Returns:
            Newly created catalog version ID.
        """
        connection = await self._connect()
        try:
            await connection.execute("BEGIN IMMEDIATE")
            await connection.execute("UPDATE catalog_versions SET active = 0")
            cursor = await connection.execute(
                "INSERT INTO catalog_versions(source_name, active, created_at) VALUES (?, 1, ?)",
                (source_name, utc_now()),
            )
            version_id = int(cursor.lastrowid or 0)
            await connection.executemany(
                """
                INSERT INTO products(catalog_version_id, sku, model_name, product_json)
                VALUES (?, ?, ?, ?)
                """,
                [
                    (
                        version_id,
                        item["sku"],
                        item["model_name"],
                        dump_json(item),
                    )
                    for item in products
                ],
            )
            await connection.execute(
                """
                INSERT INTO audit_events(case_id, event_type, actor, details_json, created_at)
                VALUES (NULL, 'catalog_imported', 'dashboard', ?, ?)
                """,
                (
                    dump_json({"version_id": version_id, "source_name": source_name}),
                    utc_now(),
                ),
            )
            await connection.commit()
            return version_id
        except Exception:
            await connection.rollback()
            raise
        finally:
            await connection.close()

    async def active_catalog(self) -> tuple[int, list[dict[str, Any]]]:
        """Load the currently active product catalog.

        Returns:
            Active catalog version ID and product dictionaries.

        Raises:
            RuntimeError: If no active catalog exists.
        """
        connection = await self._connect()
        try:
            cursor = await connection.execute(
                "SELECT id FROM catalog_versions WHERE active = 1 ORDER BY id DESC LIMIT 1"
            )
            row = await cursor.fetchone()
            if row is None:
                raise RuntimeError("没有可用的产品目录")
            version_id = int(row["id"])
            cursor = await connection.execute(
                "SELECT product_json FROM products WHERE catalog_version_id = ? ORDER BY sku",
                (version_id,),
            )
            products = [
                json.loads(item["product_json"]) for item in await cursor.fetchall()
            ]
            return version_id, products
        finally:
            await connection.close()

    async def create_case(
        self,
        *,
        case_id: str,
        source_text: str,
        requirements: dict[str, Any],
        missing: list[str],
        response_text: str,
        actor: str,
    ) -> dict[str, Any]:
        """Create an RFQ and its first immutable requirement revision.

        Args:
            case_id: Pre-generated RFQ identifier.
            source_text: Original customer text.
            requirements: Normalized requirements.
            missing: Missing hard constraints.
            response_text: Initial editable response draft.
            actor: Chat or dashboard identity.

        Returns:
            Full newly created case.
        """
        timestamp = utc_now()
        status = "needs_clarification" if missing else "awaiting_sales_confirmation"
        customer = requirements.get("customer_name", {}).get("value")
        project = requirements.get("project_name", {}).get("value")
        connection = await self._connect()
        try:
            await connection.execute("BEGIN IMMEDIATE")
            await connection.execute(
                """
                INSERT INTO cases(
                    id, status, customer_name, project_name, source_text,
                    active_revision, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
                """,
                (
                    case_id,
                    status,
                    customer,
                    project,
                    source_text,
                    actor,
                    timestamp,
                    timestamp,
                ),
            )
            await connection.execute(
                """
                INSERT INTO case_revisions(
                    case_id, revision_no, requirements_json, missing_json,
                    response_text, created_by, created_at
                ) VALUES (?, 1, ?, ?, ?, ?, ?)
                """,
                (
                    case_id,
                    dump_json(requirements),
                    dump_json(missing),
                    response_text,
                    actor,
                    timestamp,
                ),
            )
            await connection.execute(
                """
                INSERT INTO audit_events(case_id, event_type, actor, details_json, created_at)
                VALUES (?, 'case_created', ?, ?, ?)
                """,
                (case_id, actor, dump_json({"revision": 1}), timestamp),
            )
            await connection.commit()
        except Exception:
            await connection.rollback()
            raise
        finally:
            await connection.close()
        return await self.get_case(case_id)

    async def update_case(
        self,
        *,
        case_id: str,
        requirements: dict[str, Any],
        missing: list[str],
        response_text: str,
        actor: str,
        expected_revision: int,
        source_text_append: str = "",
    ) -> dict[str, Any]:
        """Append a case revision and invalidate approvals by versioning.

        Args:
            case_id: RFQ identifier.
            requirements: New normalized requirements.
            missing: New missing-field list.
            response_text: Updated response draft.
            actor: Chat or dashboard identity.
            expected_revision: Optimistic-lock revision from the caller.
            source_text_append: Optional clarification appended to source history.

        Returns:
            Updated full case.

        Raises:
            CaseNotFoundError: If the case is absent.
            RevisionConflictError: If the case changed since it was read.
        """
        connection = await self._connect()
        try:
            await connection.execute("BEGIN IMMEDIATE")
            cursor = await connection.execute(
                "SELECT active_revision, source_text FROM cases WHERE id = ?",
                (case_id,),
            )
            current = await cursor.fetchone()
            if current is None:
                raise CaseNotFoundError(case_id)
            if int(current["active_revision"]) != int(expected_revision):
                raise RevisionConflictError("询价已被其他操作更新，请刷新后重试")
            revision = int(current["active_revision"]) + 1
            timestamp = utc_now()
            status = "needs_clarification" if missing else "awaiting_sales_confirmation"
            source_text = str(current["source_text"])
            if source_text_append.strip():
                source_text = (
                    f"{source_text}\n\n[补充信息]\n{source_text_append.strip()}"
                )
            await connection.execute(
                """
                UPDATE cases SET status = ?, customer_name = ?, project_name = ?,
                    source_text = ?, active_revision = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    status,
                    requirements.get("customer_name", {}).get("value"),
                    requirements.get("project_name", {}).get("value"),
                    source_text,
                    revision,
                    timestamp,
                    case_id,
                ),
            )
            await connection.execute(
                """
                INSERT INTO case_revisions(
                    case_id, revision_no, requirements_json, missing_json,
                    response_text, created_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    case_id,
                    revision,
                    dump_json(requirements),
                    dump_json(missing),
                    response_text,
                    actor,
                    timestamp,
                ),
            )
            await connection.execute(
                """
                INSERT INTO audit_events(case_id, event_type, actor, details_json, created_at)
                VALUES (?, 'requirements_updated', ?, ?, ?)
                """,
                (case_id, actor, dump_json({"revision": revision}), timestamp),
            )
            await connection.commit()
        except Exception:
            await connection.rollback()
            raise
        finally:
            await connection.close()
        return await self.get_case(case_id)

    async def add_attachment(
        self,
        *,
        case_id: str,
        filename: str,
        stored_path: str,
        content_type: str | None,
        size_bytes: int,
        extracted_text: str,
    ) -> None:
        """Persist attachment metadata and extracted source text.

        Args:
            case_id: RFQ identifier.
            filename: Sanitized display name.
            stored_path: Plugin-owned absolute path.
            content_type: Client-provided MIME type.
            size_bytes: Stored file size.
            extracted_text: Locally parsed text.
        """
        connection = await self._connect()
        try:
            await connection.execute(
                """
                INSERT INTO attachments(
                    case_id, filename, stored_path, content_type, size_bytes,
                    extracted_text, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    case_id,
                    filename,
                    stored_path,
                    content_type,
                    size_bytes,
                    extracted_text,
                    utc_now(),
                ),
            )
            await connection.commit()
        finally:
            await connection.close()

    async def attachment_text(self, case_id: str) -> str:
        """Return concatenated attachment text for analysis.

        Args:
            case_id: RFQ identifier.

        Returns:
            Extracted attachment text with filename boundaries.
        """
        connection = await self._connect()
        try:
            cursor = await connection.execute(
                "SELECT filename, extracted_text FROM attachments WHERE case_id = ? ORDER BY id",
                (case_id,),
            )
            rows = await cursor.fetchall()
            return "\n\n".join(
                f"[附件 {row['filename']}]\n{row['extracted_text']}" for row in rows
            )
        finally:
            await connection.close()

    async def save_recommendations(
        self,
        *,
        case_id: str,
        revision_no: int,
        catalog_version_id: int,
        candidates: list[dict[str, Any]],
        conflicts: list[dict[str, Any]],
        evidence: list[dict[str, Any]],
        actor: str,
    ) -> None:
        """Store a reproducible recommendation snapshot.

        Args:
            case_id: RFQ identifier.
            revision_no: Requirement revision used for selection.
            catalog_version_id: Product snapshot used for selection.
            candidates: Ranked product snapshots.
            conflicts: Rejected products and hard-constraint reasons.
            evidence: Optional knowledge-base excerpts.
            actor: Operation identity.
        """
        timestamp = utc_now()
        connection = await self._connect()
        try:
            await connection.execute(
                """
                INSERT INTO recommendation_runs(
                    case_id, revision_no, catalog_version_id, candidates_json,
                    conflicts_json, evidence_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    case_id,
                    revision_no,
                    catalog_version_id,
                    dump_json(candidates),
                    dump_json(conflicts),
                    dump_json(evidence),
                    timestamp,
                ),
            )
            await connection.execute(
                """
                INSERT INTO audit_events(case_id, event_type, actor, details_json, created_at)
                VALUES (?, 'recommendations_generated', ?, ?, ?)
                """,
                (
                    case_id,
                    actor,
                    dump_json(
                        {
                            "revision": revision_no,
                            "catalog_version": catalog_version_id,
                            "candidate_count": len(candidates),
                        }
                    ),
                    timestamp,
                ),
            )
            await connection.commit()
        finally:
            await connection.close()

    async def list_cases(
        self, search: str = "", status: str = ""
    ) -> list[dict[str, Any]]:
        """List RFQ cases for the workbench rail.

        Args:
            search: Optional substring matched against ID, customer, and project.
            status: Optional exact workflow status.

        Returns:
            Case summaries ordered by latest update.
        """
        clauses = []
        params: list[Any] = []
        if search.strip():
            clauses.append(
                "(id LIKE ? OR COALESCE(customer_name, '') LIKE ? OR COALESCE(project_name, '') LIKE ?)"
            )
            needle = f"%{search.strip()}%"
            params.extend([needle, needle, needle])
        if status.strip():
            clauses.append("status = ?")
            params.append(status.strip())
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        connection = await self._connect()
        try:
            cursor = await connection.execute(
                f"""
                SELECT id, status, customer_name, project_name, active_revision,
                    created_by, created_at, updated_at
                FROM cases {where} ORDER BY updated_at DESC
                """,
                params,
            )
            return [dict(row) for row in await cursor.fetchall()]
        finally:
            await connection.close()

    async def get_case(self, case_id: str) -> dict[str, Any]:
        """Load a complete workbench representation of a case.

        Args:
            case_id: RFQ identifier.

        Returns:
            Case, active revision, latest recommendation, approvals, files, and audit.

        Raises:
            CaseNotFoundError: If the case is absent.
        """
        connection = await self._connect()
        try:
            cursor = await connection.execute(
                "SELECT * FROM cases WHERE id = ?", (case_id,)
            )
            case_row = await cursor.fetchone()
            if case_row is None:
                raise CaseNotFoundError(case_id)
            case = dict(case_row)
            revision_no = int(case["active_revision"])
            cursor = await connection.execute(
                """
                SELECT * FROM case_revisions
                WHERE case_id = ? AND revision_no = ?
                """,
                (case_id, revision_no),
            )
            revision_row = await cursor.fetchone()
            assert revision_row is not None
            revision = dict(revision_row)
            revision["requirements"] = json.loads(revision.pop("requirements_json"))
            revision["missing"] = json.loads(revision.pop("missing_json"))

            cursor = await connection.execute(
                """
                SELECT * FROM recommendation_runs
                WHERE case_id = ? AND revision_no = ? ORDER BY id DESC LIMIT 1
                """,
                (case_id, revision_no),
            )
            recommendation_row = await cursor.fetchone()
            recommendation = None
            if recommendation_row:
                recommendation = dict(recommendation_row)
                recommendation["candidates"] = json.loads(
                    recommendation.pop("candidates_json")
                )
                recommendation["conflicts"] = json.loads(
                    recommendation.pop("conflicts_json")
                )
                recommendation["evidence"] = json.loads(
                    recommendation.pop("evidence_json")
                )

            cursor = await connection.execute(
                """
                SELECT approval_type, decision, actor, comment, created_at
                FROM approvals WHERE case_id = ? AND revision_no = ? ORDER BY id
                """,
                (case_id, revision_no),
            )
            approvals = [dict(row) for row in await cursor.fetchall()]
            cursor = await connection.execute(
                """
                SELECT id, filename, content_type, size_bytes, created_at
                FROM attachments WHERE case_id = ? ORDER BY id
                """,
                (case_id,),
            )
            attachments = [dict(row) for row in await cursor.fetchall()]
            cursor = await connection.execute(
                """
                SELECT event_type, actor, details_json, created_at
                FROM audit_events WHERE case_id = ? ORDER BY id DESC LIMIT 100
                """,
                (case_id,),
            )
            audit = []
            for row in await cursor.fetchall():
                item = dict(row)
                item["details"] = json.loads(item.pop("details_json"))
                audit.append(item)
            return {
                **case,
                "revision": revision,
                "recommendation": recommendation,
                "approvals": approvals,
                "attachments": attachments,
                "audit": audit,
            }
        finally:
            await connection.close()

    async def confirm_requirements(
        self,
        case_id: str,
        expected_revision: int,
        actor: str,
        comment: str = "",
    ) -> dict[str, Any]:
        """Record sales confirmation for a complete case revision.

        Args:
            case_id: RFQ identifier.
            expected_revision: Current optimistic-lock revision.
            actor: Dashboard identity.
            comment: Optional confirmation note.

        Returns:
            Updated full case.
        """
        connection = await self._connect()
        try:
            await connection.execute("BEGIN IMMEDIATE")
            cursor = await connection.execute(
                "SELECT active_revision, status FROM cases WHERE id = ?", (case_id,)
            )
            case = await cursor.fetchone()
            if case is None:
                raise CaseNotFoundError(case_id)
            if int(case["active_revision"]) != int(expected_revision):
                raise RevisionConflictError("询价已被其他操作更新，请刷新后重试")
            cursor = await connection.execute(
                "SELECT missing_json FROM case_revisions WHERE case_id = ? AND revision_no = ?",
                (case_id, expected_revision),
            )
            revision = await cursor.fetchone()
            if revision is None or json.loads(revision["missing_json"]):
                raise InvalidTransitionError("必填参数尚未补齐，不能确认需求")
            cursor = await connection.execute(
                """
                SELECT candidates_json FROM recommendation_runs
                WHERE case_id = ? AND revision_no = ? ORDER BY id DESC LIMIT 1
                """,
                (case_id, expected_revision),
            )
            recommendation = await cursor.fetchone()
            if recommendation is None or not json.loads(
                recommendation["candidates_json"]
            ):
                raise InvalidTransitionError("当前没有可提交工程审批的候选方案")
            timestamp = utc_now()
            await connection.execute(
                """
                INSERT INTO approvals(
                    case_id, revision_no, approval_type, decision, actor, comment, created_at
                ) VALUES (?, ?, 'requirements', 'approved', ?, ?, ?)
                """,
                (case_id, expected_revision, actor, comment, timestamp),
            )
            await connection.execute(
                "UPDATE cases SET status = 'awaiting_technical_review', updated_at = ? WHERE id = ?",
                (timestamp, case_id),
            )
            await connection.execute(
                """
                INSERT INTO audit_events(case_id, event_type, actor, details_json, created_at)
                VALUES (?, 'requirements_confirmed', ?, ?, ?)
                """,
                (case_id, actor, dump_json({"revision": expected_revision}), timestamp),
            )
            await connection.commit()
        except Exception:
            await connection.rollback()
            raise
        finally:
            await connection.close()
        return await self.get_case(case_id)

    async def approve_solutions(
        self,
        case_id: str,
        expected_revision: int,
        actor: str,
        decision: str,
        comment: str = "",
    ) -> dict[str, Any]:
        """Record the engineering decision for the current candidate set.

        Args:
            case_id: RFQ identifier.
            expected_revision: Current optimistic-lock revision.
            actor: Dashboard identity.
            decision: ``approved`` or ``rejected``.
            comment: Optional engineering note.

        Returns:
            Updated full case.
        """
        if decision not in {"approved", "rejected"}:
            raise ValueError("decision 必须为 approved 或 rejected")
        connection = await self._connect()
        try:
            await connection.execute("BEGIN IMMEDIATE")
            cursor = await connection.execute(
                "SELECT active_revision, status FROM cases WHERE id = ?", (case_id,)
            )
            case = await cursor.fetchone()
            if case is None:
                raise CaseNotFoundError(case_id)
            if int(case["active_revision"]) != int(expected_revision):
                raise RevisionConflictError("询价已被其他操作更新，请刷新后重试")
            if case["status"] != "awaiting_technical_review":
                raise InvalidTransitionError("请先完成销售需求确认")
            timestamp = utc_now()
            await connection.execute(
                """
                INSERT INTO approvals(
                    case_id, revision_no, approval_type, decision, actor, comment, created_at
                ) VALUES (?, ?, 'technical', ?, ?, ?, ?)
                """,
                (case_id, expected_revision, decision, actor, comment, timestamp),
            )
            status = (
                "approved_for_export"
                if decision == "approved"
                else "awaiting_sales_confirmation"
            )
            await connection.execute(
                "UPDATE cases SET status = ?, updated_at = ? WHERE id = ?",
                (status, timestamp, case_id),
            )
            await connection.execute(
                """
                INSERT INTO audit_events(case_id, event_type, actor, details_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    case_id,
                    "solutions_approved"
                    if decision == "approved"
                    else "solutions_rejected",
                    actor,
                    dump_json({"revision": expected_revision, "comment": comment}),
                    timestamp,
                ),
            )
            await connection.commit()
        except Exception:
            await connection.rollback()
            raise
        finally:
            await connection.close()
        return await self.get_case(case_id)

    async def mark_exported(self, case_id: str, actor: str) -> dict[str, Any]:
        """Audit a generated export without changing the approved revision.

        Args:
            case_id: RFQ identifier.
            actor: Dashboard identity.

        Returns:
            Updated full case while preserving ``approved_for_export`` status.
        """
        case = await self.get_case(case_id)
        if case["status"] != "approved_for_export":
            raise InvalidTransitionError("需完成销售确认和工程审批后才能导出")
        timestamp = utc_now()
        connection = await self._connect()
        try:
            await connection.execute(
                "UPDATE cases SET updated_at = ? WHERE id = ?",
                (timestamp, case_id),
            )
            await connection.execute(
                """
                INSERT INTO audit_events(case_id, event_type, actor, details_json, created_at)
                VALUES (?, 'reference_export_generated', ?, ?, ?)
                """,
                (
                    case_id,
                    actor,
                    dump_json({"revision": case["active_revision"]}),
                    timestamp,
                ),
            )
            await connection.commit()
        finally:
            await connection.close()
        return await self.get_case(case_id)
