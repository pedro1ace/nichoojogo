#!/usr/bin/env python3
"""Gera e sincroniza o payload de cada dia no banco Cloudflare D1 (tabelas 'dias' e 'resumo_dias').

'dias' guarda o pacote completo de cada dia (as 7 categorias com todas as respostas).
'resumo_dias' guarda só a data, o número e os 7 temas: é o que a aba ARQUIVOS lista
(/api/arquivo), sem precisar abrir os pacotes grandes.

Uso:
    python3 scripts/sincronizar_d1.py             # gera arquivo SQL para importar no D1
    python3 scripts/sincronizar_d1.py --executar  # executa direto via npx wrangler d1 se wrangler estiver instalado
"""
from __future__ import annotations

import datetime as dt
import json
import sqlite3
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PESOS = RAIZ / "dados" / "pesos"
ORDEM = RAIZ / "dados" / "ordem.txt"
SQL_OUT = RAIZ / "banco" / "carga_dias.sql"

CAMPOS_RESPOSTA = ("resposta", "apelidos", "pontos", "acima", "espertalhao", "frase")
LANCAMENTO = dt.date(2026, 10, 28)
RODADAS_POR_DIA = 7


def enxugar(cat: dict) -> dict:
    return {
        "id": cat.get("id"),
        "titulo": cat.get("titulo"),
        "pergunta": cat.get("pergunta"),
        "supernova": cat.get("supernova"),
        "respostas": [
            {k: r[k] for k in CAMPOS_RESPOSTA if k in r}
            for r in cat.get("respostas", [])
        ],
    }


def ler_fila() -> list[str]:
    linhas = ORDEM.read_text(encoding="utf-8").splitlines()
    return [l.strip() for l in linhas if l.strip() and not l.startswith(("#", "-"))]


def gerar_dias() -> dict[str, dict]:
    fila = ler_fila()
    indice = json.loads((PESOS / "indice.json").read_text(encoding="utf-8"))
    por_id = {c["id"]: c for c in indice}

    categorias_cache = {}

    def carregar_cat(cid: str) -> dict:
        if cid not in categorias_cache:
            p = PESOS / f"{cid}.json"
            if not p.exists():
                return {"id": cid, "titulo": cid, "pergunta": "", "respostas": []}
            categorias_cache[cid] = enxugar(json.loads(p.read_text(encoding="utf-8")))
        return categorias_cache[cid]

    total_dias = len(fila) // RODADAS_POR_DIA
    dias_dict = {}

    for d in range(total_dias):
        data = LANCAMENTO + dt.timedelta(days=d)
        data_str = data.isoformat()
        cids = fila[d * RODADAS_POR_DIA : (d + 1) * RODADAS_POR_DIA]

        cats_dia = [carregar_cat(cid) for cid in cids]
        payload = {
            "dia": data_str,
            "numero": d + 1,
            "categorias": cats_dia,
        }
        dias_dict[data_str] = payload

    return dias_dict


def exportar_sql(dias: dict[str, dict]) -> None:
    linhas_sql = [
        "-- Carga dos dias no Cloudflare D1",
        "CREATE TABLE IF NOT EXISTS dias (dia TEXT NOT NULL PRIMARY KEY, payload TEXT NOT NULL, criado_em TEXT NOT NULL DEFAULT (datetime('now')));",
        "CREATE TABLE IF NOT EXISTS resumo_dias (dia TEXT NOT NULL PRIMARY KEY, numero INTEGER NOT NULL, titulos TEXT NOT NULL);",
    ]
    for dia_str, payload in dias.items():
        payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        # Escapar aspas simples para SQL
        payload_esc = payload_json.replace("'", "''")
        linhas_sql.append(
            f"INSERT INTO dias (dia, payload) VALUES ('{dia_str}', '{payload_esc}') "
            f"ON CONFLICT(dia) DO UPDATE SET payload = excluded.payload, criado_em = datetime('now');"
        )
        titulos = json.dumps([c["titulo"] for c in payload["categorias"]], ensure_ascii=False).replace("'", "''")
        linhas_sql.append(
            f"INSERT INTO resumo_dias (dia, numero, titulos) VALUES ('{dia_str}', {payload['numero']}, '{titulos}') "
            f"ON CONFLICT(dia) DO UPDATE SET numero = excluded.numero, titulos = excluded.titulos;"
        )

    SQL_OUT.write_text("\n".join(linhas_sql) + "\n", encoding="utf-8")
    print(f"Gerado {SQL_OUT} com {len(dias)} dias ({LANCAMENTO} até {list(dias.keys())[-1]}).")


def main() -> None:
    dias = gerar_dias()
    exportar_sql(dias)

    if "--executar" in sys.argv:
        print("Executando carga no Cloudflare D1 via wrangler...")
        cmd = ["npx", "wrangler", "d1", "execute", "DB", f"--file={SQL_OUT}"]
        try:
            res = subprocess.run(cmd, check=True, capture_output=True, text=True)
            print(res.stdout)
        except Exception as e:
            print(f"Erro ao executar wrangler: {e}")


if __name__ == "__main__":
    main()
