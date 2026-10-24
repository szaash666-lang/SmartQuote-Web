"""Domain rules for pump RFQ extraction and deterministic selection."""

from __future__ import annotations

import json
import math
import re
import secrets
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

FIELD_DEFINITIONS: dict[str, dict[str, Any]] = {
    "customer_name": {"label": "客户名称", "unit": "", "required": False},
    "project_name": {"label": "项目名称", "unit": "", "required": False},
    "quantity": {"label": "数量", "unit": "台", "required": True},
    "flow_m3h": {"label": "流量", "unit": "m³/h", "required": True},
    "head_m": {"label": "扬程", "unit": "m", "required": True},
    "medium": {"label": "介质", "unit": "", "required": True},
    "temperature_c": {"label": "介质温度", "unit": "°C", "required": True},
    "voltage_v": {"label": "电压", "unit": "V", "required": True},
    "frequency_hz": {"label": "频率", "unit": "Hz", "required": True},
    "material_requirement": {
        "label": "材质要求",
        "unit": "",
        "required": False,
    },
    "installation_environment": {
        "label": "安装环境",
        "unit": "",
        "required": False,
    },
    "delivery_date": {"label": "期望交期", "unit": "", "required": False},
    "budget_cny": {"label": "预算", "unit": "CNY", "required": False},
    "soft_preferences": {"label": "其他偏好", "unit": "", "required": False},
}

REQUIRED_FIELDS = tuple(
    key for key, definition in FIELD_DEFINITIONS.items() if definition["required"]
)

MEDIUM_ALIASES = {
    "清水": "clean_water",
    "净水": "clean_water",
    "自来水": "clean_water",
    "clean water": "clean_water",
    "water": "clean_water",
    "弱腐蚀": "mild_corrosive",
    "轻微腐蚀": "mild_corrosive",
    "mild corrosive": "mild_corrosive",
}

MEDIUM_LABELS = {
    "clean_water": "清水",
    "mild_corrosive": "弱腐蚀性液体",
}

CATALOG_HEADERS = [
    "sku",
    "model_name",
    "flow_min_m3h",
    "flow_max_m3h",
    "head_min_m",
    "head_max_m",
    "compatible_media",
    "temp_min_c",
    "temp_max_c",
    "wetted_material",
    "motor_power_kw",
    "voltage_v",
    "frequency_hz",
    "ip_rating",
    "seal_type",
    "reference_price_cny",
    "lead_time_days",
    "price_note",
    "active",
]

DEFAULT_PRODUCTS: list[dict[str, Any]] = [
    {
        "sku": "CP-32-125E",
        "model_name": "CP-32-125E 标准清水泵",
        "flow_min_m3h": 5,
        "flow_max_m3h": 25,
        "head_min_m": 12,
        "head_max_m": 28,
        "compatible_media": ["clean_water"],
        "temp_min_c": 0,
        "temp_max_c": 80,
        "wetted_material": "HT200",
        "motor_power_kw": 2.2,
        "voltage_v": 380,
        "frequency_hz": 50,
        "ip_rating": "IP55",
        "seal_type": "机械密封",
        "reference_price_cny": 4800,
        "lead_time_days": 7,
        "price_note": "虚构演示参考价，是否含税及运费需商务核实",
        "active": True,
    },
    {
        "sku": "CP-40-160E",
        "model_name": "CP-40-160E 高效清水泵",
        "flow_min_m3h": 15,
        "flow_max_m3h": 45,
        "head_min_m": 20,
        "head_max_m": 40,
        "compatible_media": ["clean_water"],
        "temp_min_c": 0,
        "temp_max_c": 80,
        "wetted_material": "HT200",
        "motor_power_kw": 5.5,
        "voltage_v": 380,
        "frequency_hz": 50,
        "ip_rating": "IP55",
        "seal_type": "机械密封",
        "reference_price_cny": 8500,
        "lead_time_days": 14,
        "price_note": "虚构演示参考价，是否含税及运费需商务核实",
        "active": True,
    },
    {
        "sku": "CP-40-160S",
        "model_name": "CP-40-160S 不锈钢泵",
        "flow_min_m3h": 12,
        "flow_max_m3h": 48,
        "head_min_m": 18,
        "head_max_m": 42,
        "compatible_media": ["clean_water", "mild_corrosive"],
        "temp_min_c": -10,
        "temp_max_c": 110,
        "wetted_material": "304",
        "motor_power_kw": 7.5,
        "voltage_v": 380,
        "frequency_hz": 50,
        "ip_rating": "IP55",
        "seal_type": "机械密封",
        "reference_price_cny": 12600,
        "lead_time_days": 21,
        "price_note": "虚构演示参考价，是否含税及运费需商务核实",
        "active": True,
    },
    {
        "sku": "CP-50-200H",
        "model_name": "CP-50-200H 高扬程泵",
        "flow_min_m3h": 20,
        "flow_max_m3h": 80,
        "head_min_m": 25,
        "head_max_m": 55,
        "compatible_media": ["clean_water"],
        "temp_min_c": 0,
        "temp_max_c": 100,
        "wetted_material": "HT200",
        "motor_power_kw": 15,
        "voltage_v": 380,
        "frequency_hz": 50,
        "ip_rating": "IP55",
        "seal_type": "机械密封",
        "reference_price_cny": 16800,
        "lead_time_days": 28,
        "price_note": "虚构演示参考价，是否含税及运费需商务核实",
        "active": True,
    },
    {
        "sku": "CP-65-250H",
        "model_name": "CP-65-250H 大流量泵",
        "flow_min_m3h": 50,
        "flow_max_m3h": 140,
        "head_min_m": 45,
        "head_max_m": 80,
        "compatible_media": ["clean_water"],
        "temp_min_c": 0,
        "temp_max_c": 90,
        "wetted_material": "HT200",
        "motor_power_kw": 37,
        "voltage_v": 380,
        "frequency_hz": 50,
        "ip_rating": "IP55",
        "seal_type": "机械密封",
        "reference_price_cny": 29800,
        "lead_time_days": 35,
        "price_note": "虚构演示参考价，是否含税及运费需商务核实",
        "active": True,
    },
]


class ExtractedField(BaseModel):
    """One field returned by the extraction model."""

    value: Any = None
    unit: str | None = None
    evidence: str = ""
    origin: Literal["explicit", "inferred"] = "inferred"


class ExtractionPayload(BaseModel):
    """Validated model payload for RFQ extraction."""

    fields: dict[str, ExtractedField] = Field(default_factory=dict)
    soft_preferences: list[str] = Field(default_factory=list)


def utc_now() -> str:
    """Return a stable UTC timestamp for persistence.

    Returns:
        An ISO 8601 UTC timestamp.
    """
    return datetime.now(timezone.utc).isoformat()


def new_case_id(now: datetime | None = None) -> str:
    """Create a human-readable RFQ identifier.

    Args:
        now: Optional timestamp used by deterministic tests.

    Returns:
        An identifier such as ``RFQ-20261019-A7C3``.
    """
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%d")
    return f"RFQ-{stamp}-{secrets.token_hex(2).upper()}"


def empty_requirements() -> dict[str, dict[str, Any]]:
    """Create the fixed pump-requirement structure.

    Returns:
        A mapping containing every supported requirement field.
    """
    return {
        key: {
            "value": [] if key == "soft_preferences" else None,
            "unit": definition["unit"],
            "evidence": "",
            "origin": "inferred",
        }
        for key, definition in FIELD_DEFINITIONS.items()
    }


def _number(value: Any) -> float | None:
    """Parse the first finite number from a model or form value.

    Args:
        value: Raw numeric-like value.

    Returns:
        A finite float, or ``None`` when parsing fails.
    """
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int | float):
        number = float(value)
    else:
        match = re.search(r"[-+]?\d+(?:\.\d+)?", str(value).replace(",", ""))
        if not match:
            return None
        number = float(match.group(0))
    return number if math.isfinite(number) else None


def _normalize_value(key: str, value: Any, unit: str | None = None) -> Any:
    """Normalize one requirement value to the plugin's canonical units.

    Args:
        key: Fixed requirement key.
        value: Raw value returned by a model or submitted manually.
        unit: Optional source unit.

    Returns:
        Canonical value, or ``None`` when it is unusable.
    """
    if value is None or value == "":
        return [] if key == "soft_preferences" else None
    if key == "soft_preferences":
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return [
            part.strip() for part in re.split(r"[,，;；]", str(value)) if part.strip()
        ]
    if key == "medium":
        lowered = str(value).strip().lower()
        return MEDIUM_ALIASES.get(
            lowered, lowered if lowered in MEDIUM_LABELS else None
        )
    if key in {
        "quantity",
        "flow_m3h",
        "head_m",
        "temperature_c",
        "voltage_v",
        "frequency_hz",
        "budget_cny",
    }:
        number = _number(value)
        if number is None:
            return None
        source_unit = (unit or "").lower().replace("³", "3").replace(" ", "")
        if key == "flow_m3h":
            if source_unit in {"l/s", "lps"}:
                number *= 3.6
            elif source_unit in {"l/min", "lpm"}:
                number *= 0.06
        elif key == "temperature_c" and source_unit in {"f", "°f", "fahrenheit"}:
            number = (number - 32) * 5 / 9
        if key == "quantity":
            return int(number) if number >= 1 and number.is_integer() else None
        return round(number, 4)
    text = str(value).strip()
    return text or None


def merge_extraction(
    base: dict[str, dict[str, Any]] | None,
    payload: ExtractionPayload | dict[str, Any],
    source_text: str,
) -> dict[str, dict[str, Any]]:
    """Merge validated model fields while rejecting unsupported claims.

    Explicit model fields count as complete only when their evidence appears in
    the source. This prevents inferred values from silently becoming hard facts.

    Args:
        base: Existing requirement revision, if any.
        payload: Parsed extraction payload.
        source_text: Untrusted customer and attachment text.

    Returns:
        A complete normalized requirement mapping.
    """
    parsed = (
        payload
        if isinstance(payload, ExtractionPayload)
        else ExtractionPayload.model_validate(payload)
    )
    merged = deepcopy(base) if base else empty_requirements()
    normalized_source = " ".join(source_text.lower().split())
    for key, extracted in parsed.fields.items():
        if key not in FIELD_DEFINITIONS:
            continue
        normalized = _normalize_value(key, extracted.value, extracted.unit)
        if normalized is None or normalized == []:
            continue
        evidence = extracted.evidence.strip()
        evidence_is_present = (
            bool(evidence) and " ".join(evidence.lower().split()) in normalized_source
        )
        origin = (
            "explicit"
            if extracted.origin == "explicit" and evidence_is_present
            else "inferred"
        )
        existing_origin = merged.get(key, {}).get("origin")
        if origin == "inferred" and existing_origin in {"explicit", "manual"}:
            continue
        merged[key] = {
            "value": normalized,
            "unit": FIELD_DEFINITIONS[key]["unit"],
            "evidence": evidence,
            "origin": origin,
        }
    if parsed.soft_preferences:
        merged["soft_preferences"] = {
            "value": [
                str(item).strip()
                for item in parsed.soft_preferences
                if str(item).strip()
            ],
            "unit": "",
            "evidence": "",
            "origin": "inferred",
        }
    return merged


def apply_manual_fields(
    base: dict[str, dict[str, Any]], fields: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    """Apply dashboard edits as explicit manual facts.

    Args:
        base: Existing requirement mapping.
        fields: Field values submitted by the workbench.

    Returns:
        A new normalized requirement mapping.

    Raises:
        ValueError: If a submitted value cannot be normalized.
    """
    merged = deepcopy(base)
    for key, raw in fields.items():
        if key not in FIELD_DEFINITIONS:
            continue
        value = raw.get("value") if isinstance(raw, dict) else raw
        unit = raw.get("unit") if isinstance(raw, dict) else None
        normalized = _normalize_value(key, value, unit)
        if value not in (None, "", []) and normalized is None:
            raise ValueError(f"字段 {FIELD_DEFINITIONS[key]['label']} 的值无效")
        merged[key] = {
            "value": normalized,
            "unit": FIELD_DEFINITIONS[key]["unit"],
            "evidence": "由工作台人工填写",
            "origin": "manual",
        }
    return merged


def compute_missing(requirements: dict[str, dict[str, Any]]) -> list[str]:
    """Return required fields that are absent or only inferred.

    Args:
        requirements: Normalized requirement mapping.

    Returns:
        Missing fixed-field keys in display order.
    """
    missing = []
    for key in REQUIRED_FIELDS:
        field = requirements.get(key, {})
        if field.get("value") in (None, "", []) or field.get("origin") not in {
            "explicit",
            "manual",
        }:
            missing.append(key)
    return missing


def clarification_questions(missing: list[str]) -> list[str]:
    """Build user-facing questions for missing hard constraints.

    Args:
        missing: Missing field keys.

    Returns:
        Concise Chinese clarification questions.
    """
    prompts = {
        "quantity": "需要多少台泵？",
        "flow_m3h": "所需流量是多少（m³/h）？",
        "head_m": "所需扬程是多少（m）？",
        "medium": "输送介质是什么（例如清水或弱腐蚀性液体）？",
        "temperature_c": "介质温度是多少（°C）？",
        "voltage_v": "现场电压是多少（V）？",
        "frequency_hz": "电源频率是多少（Hz）？",
    }
    return [prompts[key] for key in missing if key in prompts]


def fallback_extract(text: str) -> ExtractionPayload:
    """Extract common explicit values when no chat provider is available.

    Args:
        text: Customer text and locally parsed attachment content.

    Returns:
        A conservative extraction payload containing only regex-backed facts.
    """
    fields: dict[str, ExtractedField] = {}
    patterns = {
        "quantity": r"(?P<evidence>\d+\s*(?:台|套))",
        "flow_m3h": r"(?P<evidence>(?:流量\s*[:：]?\s*)?\d+(?:\.\d+)?\s*(?:m[³3]/h|立方米/小时|l/s|l/min))",
        "head_m": r"(?P<evidence>(?:扬程\s*[:：]?\s*)?\d+(?:\.\d+)?\s*(?:m(?![³3/])|米))",
        "temperature_c": r"(?P<evidence>(?:温度\s*[:：]?\s*)?-?\d+(?:\.\d+)?\s*(?:°?c|℃))",
        "voltage_v": r"(?P<evidence>\d+(?:\.\d+)?\s*(?:v|伏))",
        "frequency_hz": r"(?P<evidence>\d+(?:\.\d+)?\s*(?:hz|赫兹))",
    }
    lowered = text.lower()
    for key, pattern in patterns.items():
        match = re.search(pattern, lowered, flags=re.IGNORECASE)
        if not match:
            continue
        evidence = text[match.start("evidence") : match.end("evidence")]
        unit_match = re.search(r"[a-z°³3/]+|℃|米|伏|赫兹", evidence.lower())
        fields[key] = ExtractedField(
            value=evidence,
            unit=unit_match.group(0) if unit_match else None,
            evidence=evidence,
            origin="explicit",
        )
    for alias, normalized in MEDIUM_ALIASES.items():
        if alias in lowered:
            start = lowered.index(alias)
            evidence = text[start : start + len(alias)]
            fields["medium"] = ExtractedField(
                value=normalized,
                evidence=evidence,
                origin="explicit",
            )
            break
    delivery_match = re.search(
        r"(?:月底|月末|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d+\s*天内)", text
    )
    if delivery_match:
        fields["delivery_date"] = ExtractedField(
            value=delivery_match.group(0),
            evidence=delivery_match.group(0),
            origin="explicit",
        )
    return ExtractionPayload(fields=fields)


def _range_score(value: float, minimum: float, maximum: float) -> float:
    """Score how centrally a requested point sits in an operating range.

    Args:
        value: Requested operating point.
        minimum: Product lower bound.
        maximum: Product upper bound.

    Returns:
        A score between zero and one.
    """
    if maximum <= minimum:
        return 1.0 if value == minimum else 0.0
    midpoint = (minimum + maximum) / 2
    half_width = (maximum - minimum) / 2
    return max(0.0, min(1.0, 1 - abs(value - midpoint) / half_width))


def recommend_products(
    products: list[dict[str, Any]], requirements: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """Filter the catalog by hard constraints and rank eligible pumps.

    Args:
        products: Active catalog snapshot.
        requirements: Current normalized requirements.

    Returns:
        Candidate snapshots and per-product rejection reasons.
    """
    if compute_missing(requirements):
        return {"candidates": [], "conflicts": []}
    values = {key: field.get("value") for key, field in requirements.items()}
    eligible: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    for product in products:
        reasons = []
        if not product["flow_min_m3h"] <= values["flow_m3h"] <= product["flow_max_m3h"]:
            reasons.append("流量超出工作区间")
        if not product["head_min_m"] <= values["head_m"] <= product["head_max_m"]:
            reasons.append("扬程超出工作区间")
        if values["medium"] not in product["compatible_media"]:
            reasons.append("介质兼容性不满足")
        if (
            not product["temp_min_c"]
            <= values["temperature_c"]
            <= product["temp_max_c"]
        ):
            reasons.append("介质温度超出范围")
        if float(product["voltage_v"]) != float(values["voltage_v"]):
            reasons.append("电压不匹配")
        if float(product["frequency_hz"]) != float(values["frequency_hz"]):
            reasons.append("频率不匹配")
        if reasons:
            conflicts.append({"sku": product["sku"], "reasons": reasons})
            continue
        eligible.append(deepcopy(product))

    if not eligible:
        return {"candidates": [], "conflicts": conflicts}
    prices = [float(item["reference_price_cny"]) for item in eligible]
    leads = [float(item["lead_time_days"]) for item in eligible]
    price_span = max(prices) - min(prices)
    lead_span = max(leads) - min(leads)
    for product in eligible:
        flow_score = _range_score(
            float(values["flow_m3h"]),
            float(product["flow_min_m3h"]),
            float(product["flow_max_m3h"]),
        )
        head_score = _range_score(
            float(values["head_m"]),
            float(product["head_min_m"]),
            float(product["head_max_m"]),
        )
        temp_score = _range_score(
            float(values["temperature_c"]),
            float(product["temp_min_c"]),
            float(product["temp_max_c"]),
        )
        price_score = (
            1.0
            if price_span == 0
            else 1 - (float(product["reference_price_cny"]) - min(prices)) / price_span
        )
        lead_score = (
            1.0
            if lead_span == 0
            else 1 - (float(product["lead_time_days"]) - min(leads)) / lead_span
        )
        product["fit_score"] = round(
            100
            * (
                0.35 * flow_score
                + 0.35 * head_score
                + 0.1 * temp_score
                + 0.1 * price_score
                + 0.1 * lead_score
            ),
            1,
        )
        product["match_reason"] = (
            f"满足 {values['flow_m3h']:g} m³/h、{values['head_m']:g} m、"
            f"{MEDIUM_LABELS.get(values['medium'], values['medium'])}、"
            f"{values['temperature_c']:g}°C、{values['voltage_v']:g} V/"
            f"{values['frequency_hz']:g} Hz 硬约束。"
        )
        risks = []
        requested_material = values.get("material_requirement")
        if (
            requested_material
            and str(requested_material).lower()
            not in str(product["wetted_material"]).lower()
        ):
            risks.append("材质要求需工程师复核")
        product["risks"] = risks
    eligible.sort(key=lambda item: (-item["fit_score"], item["sku"]))
    return {"candidates": eligible[:3], "conflicts": conflicts}


def build_response_text(
    case_id: str,
    requirements: dict[str, dict[str, Any]],
    missing: list[str],
    candidates: list[dict[str, Any]],
) -> str:
    """Build a deterministic customer-response draft.

    Args:
        case_id: RFQ identifier.
        requirements: Current requirement mapping.
        missing: Missing hard-constraint keys.
        candidates: Ranked candidate snapshots.

    Returns:
        Editable Chinese response copy without unsupported commercial claims.
    """
    if missing:
        questions = "\n".join(
            f"{index}. {question}"
            for index, question in enumerate(clarification_questions(missing), 1)
        )
        return (
            f"已建立询价任务 {case_id}。为避免选型偏差，请补充以下信息：\n{questions}"
        )
    if not candidates:
        return (
            f"询价任务 {case_id} 的必填参数已齐全，但当前产品目录中没有同时满足"
            "全部硬约束的型号。请由工程师复核约束或补充产品数据。"
        )
    lines = [f"询价任务 {case_id} 已形成以下参考方案："]
    for index, candidate in enumerate(candidates, 1):
        lines.append(
            f"{index}. {candidate['sku']}：匹配度 {candidate['fit_score']:.1f}，"
            f"参考单价 ¥{candidate['reference_price_cny']:,.0f}，"
            f"参考交期 {candidate['lead_time_days']} 天。"
        )
    lines.append("以上均为虚构演示参考价，需商务核价，不得直接作为正式报价。")
    return "\n".join(lines)


def dump_json(value: Any) -> str:
    """Serialize domain values consistently for SQLite.

    Args:
        value: JSON-compatible value.

    Returns:
        UTF-8-friendly JSON text.
    """
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
