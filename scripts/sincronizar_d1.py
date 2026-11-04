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
sys.path.insert(0, str(RAIZ / "scripts"))
import singularidades  # noqa: E402

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
        # descrição da singularidade (dados/singularidades.txt), mostrada no cartão do resultado
        "curiosidade": singularidades.descricao(cat.get("id")),
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
    # toda singularidade dos dias precisa de descrição (dados/singularidades.txt)
    singularidades.conferir({cid: json.loads((PESOS / f"{cid}.json").read_text(encoding="utf-8"))
                             for cid in fila[:total_dias * RODADAS_POR_DIA] if (PESOS / f"{cid}.json").exists()})
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


LIMITE_COMANDO = 90_000  # bytes por pedaço; o D1 aceita até 100 KB por comando


def fatiar(texto: str) -> list[str]:
    """Corta o texto em pedaços já escapados para SQL ('' no lugar de '), cada um com até LIMITE_COMANDO bytes."""
    pedacos, atual, tamanho = [], [], 0
    for ch in texto:
        esc = "''" if ch == "'" else ch
        n = len(esc.encode("utf-8"))
        if tamanho + n > LIMITE_COMANDO:
            pedacos.append("".join(atual))
            atual, tamanho = [], 0
        atual.append(esc)
        tamanho += n
    pedacos.append("".join(atual))
    return pedacos


def exportar_sql(dias: dict[str, dict]) -> None:
    linhas_sql = [
        "-- Carga dos dias no Cloudflare D1",
        "CREATE TABLE IF NOT EXISTS dias (dia TEXT NOT NULL PRIMARY KEY, payload TEXT NOT NULL, criado_em TEXT NOT NULL DEFAULT (datetime('now')));",
        "CREATE TABLE IF NOT EXISTS resumo_dias (dia TEXT NOT NULL PRIMARY KEY, numero INTEGER NOT NULL, titulos TEXT NOT NULL);",
    ]
    for dia_str, payload in dias.items():
        payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        # O D1 recusa comando SQL com mais de 100 KB (SQLITE_TOOBIG) e um dia passa de 1 MB.
        # Então o payload entra em pedaços: o INSERT com o primeiro, e cada UPDATE emenda o próximo.
        pedacos = fatiar(payload_json)
        linhas_sql.append(
            f"INSERT INTO dias (dia, payload) VALUES ('{dia_str}', '{pedacos[0]}') "
            f"ON CONFLICT(dia) DO UPDATE SET payload = excluded.payload, criado_em = datetime('now');"
        )
        for pedaco in pedacos[1:]:
            linhas_sql.append(f"UPDATE dias SET payload = payload || '{pedaco}' WHERE dia = '{dia_str}';")
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
        cmd = ["npx", "wrangler", "d1", "execute", "nicho", "--remote", f"--file={SQL_OUT}"]  # "nicho" é o nome do banco; DB é só o nome do binding no Pages
        try:
            res = subprocess.run(cmd, check=True, capture_output=True, text=True)
            print(res.stdout)
        except Exception as e:
            print(f"Erro ao executar wrangler: {e}")


if __name__ == "__main__":
    main()
