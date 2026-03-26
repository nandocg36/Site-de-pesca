#!/usr/bin/env python3
"""
Extrai extremos de maré do PDF da tábua EPAGRI (Balneário Rincão) para JSON.
Uso: python3 scripts/extract_epagri_tides.py <entrada.pdf> <saida.json>
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict

import pdfplumber

DAY_RE = re.compile(r"^(\d{1,2})/(\d{1,2})$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
MOON_SYMS = frozenset("○◐◑●")
MONTH_NAMES = {
    "JANEIRO": 1,
    "FEVEREIRO": 2,
    "MARÇO": 3,
    "ABRIL": 4,
    "MAIO": 5,
    "JUNHO": 6,
    "JULHO": 7,
    "AGOSTO": 8,
    "SETEMBRO": 9,
    "OUTUBRO": 10,
    "NOVEMBRO": 11,
    "DEZEMBRO": 12,
}


def year_from_page(page) -> int:
    text = page.extract_text() or ""
    m = re.search(r"TÁBUA DE MARÉ.*?(\d{4})", text, re.I)
    return int(m.group(1)) if m else 2026


def month_centers(words) -> list[tuple[int, float]]:
    found = []
    for w in words:
        t = w["text"].strip().upper()
        if t in MONTH_NAMES:
            xc = (w["x0"] + w["x1"]) / 2
            found.append((MONTH_NAMES[t], xc))
    found.sort(key=lambda x: x[1])
    return found


def boundaries(centers: list[float]) -> list[tuple[float, float]]:
    """Faixas [lo, hi) para cada coluna de mês (3 colunas por página)."""
    if len(centers) < 3:
        return []
    xc = sorted(centers)
    b = [0.0]
    for i in range(len(xc) - 1):
        b.append((xc[i] + xc[i + 1]) / 2)
    b.append(10_000.0)
    out = []
    for i in range(len(xc)):
        out.append((b[i], b[i + 1]))
    return out


def strip_for_x(x: float, month_centers_list: list[tuple[int, float]]) -> int | None:
    centers = [c for _, c in month_centers_list]
    if len(centers) < 3:
        return None
    bounds = boundaries(centers)
    for i, (lo, hi) in enumerate(bounds):
        if lo <= x < hi:
            return month_centers_list[i][0]
    return None


def parse_alt_token(s: str) -> tuple[bool, float] | None:
    s = s.replace(" ", "")
    m = re.match(r"^([▲▼])(-?\d+),(\d+)$", s)
    if not m:
        return None
    hi = m.group(1) == "▲"
    val = float(f"{m.group(2)}.{m.group(3)}")
    return hi, val


def parse_strip_tokens_stateful(
    tokens: list[tuple[float, str]],
    year: int,
    month: int,
    day_carry: int | None,
) -> tuple[list[dict], int | None]:
    """Uma linha de uma coluna de mês; mantém o dia entre linhas (continuação da tábua)."""
    events: list[dict] = []
    texts = [t[1] for t in tokens]
    current_day = day_carry
    i = 0

    while i < len(texts):
        t = texts[i]
        dm = DAY_RE.match(t)
        if dm:
            # PDF em dia/mês (ex.: 13/1 = 13 de janeiro).
            day = int(dm.group(1))
            month_pdf = int(dm.group(2))
            if month_pdf != month:
                i += 1
                continue
            current_day = day
            i += 1
            if i < len(texts) and texts[i] in MOON_SYMS:
                i += 1
            while i < len(texts):
                if DAY_RE.match(texts[i]):
                    break
                if TIME_RE.match(texts[i]):
                    if i + 1 >= len(texts):
                        break
                    alt = parse_alt_token(texts[i + 1])
                    if alt is None:
                        i += 1
                        continue
                    hi, meters = alt
                    hh, mm = map(int, texts[i].split(":"))
                    events.append(
                        {
                            "y": year,
                            "m": month,
                            "d": current_day,
                            "hh": hh,
                            "mm": mm,
                            "h_m": meters,
                            "hi": hi,
                        }
                    )
                    i += 2
                    continue
                i += 1
            continue
        if TIME_RE.match(t) and current_day is not None:
            if i + 1 >= len(texts):
                break
            alt = parse_alt_token(texts[i + 1])
            if alt is None:
                i += 1
                continue
            hi, meters = alt
            hh, mm = map(int, t.split(":"))
            events.append(
                {
                    "y": year,
                    "m": month,
                    "d": current_day,
                    "hh": hh,
                    "mm": mm,
                    "h_m": meters,
                    "hi": hi,
                }
            )
            i += 2
            continue
        i += 1
    return events, current_day


def extract_pdf(path: str) -> tuple[int, list[dict]]:
    all_events: list[dict] = []
    year = 2026
    strip_day: dict[tuple[int, int], int | None] = {}
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            year = year_from_page(page)
            words = page.extract_words(use_text_flow=False)
            centers = month_centers(words)
            if len(centers) < 3:
                continue
            rows: dict[float, list] = defaultdict(list)
            for w in words:
                top = round(w["top"], 1)
                rows[top].append(w)
            for top in sorted(rows.keys()):
                if top < 125:
                    continue
                line = rows[top]
                strips: dict[int, list[tuple[float, str]]] = defaultdict(list)
                for w in line:
                    xc = (w["x0"] + w["x1"]) / 2
                    mo = strip_for_x(xc, centers)
                    if mo is None:
                        continue
                    strips[mo].append((w["x0"], w["text"].strip()))
                for mo, pairs in strips.items():
                    pairs.sort(key=lambda p: p[0])
                    key = (year, mo)
                    carry = strip_day.get(key)
                    new_ev, new_carry = parse_strip_tokens_stateful(pairs, year, mo, carry)
                    strip_day[key] = new_carry
                    all_events.extend(new_ev)
    return year, all_events


def dedupe(events: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for e in events:
        k = (e["y"], e["m"], e["d"], e["hh"], e["mm"], e["h_m"], e["hi"])
        if k not in seen:
            seen.add(k)
            out.append(e)
    out.sort(key=lambda e: (e["y"], e["m"], e["d"], e["hh"], e["mm"]))
    return out


def build_by_date(events: list[dict]) -> dict[str, list[dict]]:
    by_date: dict[str, list[dict]] = defaultdict(list)
    for e in events:
        key = f"{e['y']}-{e['m']:02d}-{e['d']:02d}"
        by_date[key].append(
            {
                "t": f"{e['hh']:02d}:{e['mm']:02d}",
                "h_m": e["h_m"],
                "hi": e["hi"],
            }
        )
    for k in by_date:
        by_date[k].sort(key=lambda x: x["t"])
    return dict(sorted(by_date.items()))


def main():
    if len(sys.argv) != 3:
        print("Uso: python3 extract_epagri_tides.py <pdf> <json>", file=sys.stderr)
        sys.exit(1)
    pdf_path, json_path = sys.argv[1], sys.argv[2]
    year, events = extract_pdf(pdf_path)
    events = dedupe(events)
    payload = {
        "source": "EPAGRI — Tábua de maré Balneário Rincão (PDF fornecido)",
        "location": "Balneário Rincão, SC",
        "year": year,
        "timezone_note": "Horários locais (mesmo fuso da previsão no app).",
        "extremesByDate": build_by_date(events),
    }
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"OK: {len(events)} eventos, {len(payload['extremesByDate'])} dias -> {json_path}")


if __name__ == "__main__":
    main()
