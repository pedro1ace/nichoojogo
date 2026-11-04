#!/usr/bin/env python3
"""Executa o plantão diário de revisão de forma 100% automatizada.

Etapas:
  1. Baixa as respostas recusadas do dia no ar de https://nichoojogo.com/api/respostas?recusadas=1
  2. Salva o CSV de auditoria em dados/sinais/revisao/recusadas-<dia>.csv
  3. Identifica erros de digitação óbvios (n >= 2, similaridade >= 0.88) e adiciona apelidos seguros
  4. Executa fama.py nas categorias modificadas
  5. Sincroniza carga do D1 (banco/carga_dias.sql) e empacota o jogo (jogar.html)
  6. Confere integridade dos próximos dias (fama.py --conferir)
  7. Gera PLANTAO_RESUMO.md para a descrição do Pull Request automático no GitHub
"""
from __future__ import annotations

import csv
import datetime as dt
import difflib
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
import fama  # noqa: E402
from pontuar import ler_categoria, normalizar  # noqa: E402

CATEGORIAS = RAIZ / "dados" / "categorias"
REVISAO = RAIZ / "dados" / "sinais" / "revisao"
API_RECUSADAS = "https://nichoojogo.com/api/respostas"


def baixar_recusadas(dia: str) -> list[dict]:
    """Baixa lista de palavras recusadas da API do Nicho."""
    url = f"{API_RECUSADAS}?dia={dia}&recusadas=1"
    req = urllib.request.Request(url, headers={"User-Agent": "nicho-plantao-auto/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r).get("recusadas", [])
    except Exception as e:
        print(f"[aviso] Não foi possível consultar a API de recusadas ({e}). Continuando offline.")
        # Se houver CSV local recente, usa como fallback
        local_csv = REVISAO / f"recusadas-{dia}.csv"
        if local_csv.exists():
            with local_csv.open(encoding="utf-8") as f:
                return list(csv.DictReader(f))
        return []


def avaliar_recusada(texto: str, cat: dict) -> tuple[str, str, float]:
    """Retorna (motivo, resposta_alvo, similaridade)."""
    alvo = normalizar(texto)
    nomes: dict[str, str] = {}
    for r in cat["respostas"]:
        for n in [r["resposta"], *r["apelidos"]]:
            nomes.setdefault(normalizar(n), r["resposta"])

    # Pontas (primeiro ou último nome)
    pontas: dict[str, set[str]] = {}
    for n, resposta in nomes.items():
        partes = n.split()
        if len(partes) > 1:
            for p in (partes[0], partes[-1]):
                pontas.setdefault(p, set()).add(resposta)

    if alvo in pontas and len(pontas[alvo]) == 1:
        return "primeiro ou último nome", next(iter(pontas[alvo])), 0.95

    # Erro de digitação / similaridade
    perto = difflib.get_close_matches(alvo, list(nomes), n=1, cutoff=0.82)
    if perto:
        sim = difflib.SequenceMatcher(None, alvo, perto[0]).ratio()
        return "parecida", nomes[perto[0]], sim

    return "", "", 0.0


def executar_plantao() -> dict:
    hoje = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date().isoformat()
    REVISAO.mkdir(parents=True, exist_ok=True)

    print(f"=== Iniciando Plantão Diário Automático: {hoje} ===")
    recusadas = baixar_recusadas(hoje)
    print(f"Total de respostas recusadas recebidas: {len(recusadas)}")

    linhas_csv = []
    apelidos_adicionados: list[dict] = []
    categorias_modificadas: set[str] = set()
    cache_cat: dict[str, dict] = {}

    for r in recusadas:
        cid = r.get("categoria", "")
        texto = r.get("texto", "").strip()
        n = int(r.get("n", 1))
        arq_cat = CATEGORIAS / f"{cid}.txt"
        if not arq_cat.exists():
            continue

        cat = cache_cat.setdefault(cid, ler_categoria(arq_cat))
        como, resposta_alvo, sim = avaliar_recusada(texto, cat)

        linhas_csv.append({
            "categoria": cid,
            "texto": texto,
            "n": n,
            "como": como,
            "na_lista": resposta_alvo,
        })

        # Adição automática segura:
        # Se 2 ou mais pessoas digitaram, tem alta similaridade (>= 0.88), e não colide
        if n >= 2 and como == "parecida" and sim >= 0.88 and resposta_alvo:
            # Verifica colisão
            chaves_novo = fama.chaves(texto, cid)
            colide = False
            for resp in cat["respostas"]:
                if resp["resposta"] == resposta_alvo:
                    continue
                for nome_existente in [resp["resposta"], *resp["apelidos"]]:
                    if chaves_novo & fama.chaves(nome_existente, cid):
                        colide = True
                        break
                if colide:
                    break

            if not colide:
                # Insere o apelido na linha da categoria
                conteudo = arq_cat.read_text(encoding="utf-8").splitlines()
                novas_linhas = []
                adicionou = False
                for linha in conteudo:
                    if not linha.startswith("#") and linha.split("|")[0].strip() == resposta_alvo:
                        novos_apelidos = [p.strip() for p in linha.split("|")]
                        if texto.lower() not in [a.lower() for a in novos_apelidos]:
                            novos_apelidos.append(texto)
                            linha = " | ".join(novos_apelidos)
                            adicionou = True
                    novas_linhas.append(linha)

                if adicionou:
                    arq_cat.write_text("\n".join(novas_linhas) + "\n", encoding="utf-8")
                    categorias_modificadas.add(cid)
                    apelidos_adicionados.append({
                        "categoria": cid,
                        "texto": texto,
                        "resposta": resposta_alvo,
                        "vezes": n
                    })

    # Grava CSV de auditoria
    csv_path = REVISAO / f"recusadas-{hoje}.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["categoria", "texto", "n", "como", "na_lista"])
        w.writeheader()
        w.writerows(sorted(linhas_csv, key=lambda x: -int(x["n"])))
    print(f"CSV de recusadas gravado em: {csv_path.name}")

    # Regera dados para categorias afetadas
    for cid in categorias_modificadas:
        print(f"Recalculando fama de {cid}...")
        subprocess.run([sys.executable, "-X", "utf8", "scripts/fama.py", cid], check=True)

    # Sincroniza D1 e jogo
    print("Sincronizando carga do D1 e montando jogo...")
    subprocess.run([sys.executable, "-X", "utf8", "scripts/sincronizar_d1.py"], check=True)
    subprocess.run([sys.executable, "-X", "utf8", "scripts/montar_jogo.py"], check=True)

    # Confere integridade dos dias futuros
    print("Conferindo integridade da fila...")
    conferir_res = subprocess.run(
        [sys.executable, "-X", "utf8", "scripts/fama.py", "--conferir"],
        capture_output=True,
        text=True,
        encoding="utf-8"
    )
    status_conferir = conferir_res.stdout.strip()
    erros_conferir = conferir_res.returncode == 0

    # Monta resumo para o Pull Request
    resumo_md = [
        f"# 🤖 Relatório do Plantão Diário — {hoje}",
        "",
        f"- **Recusadas analisadas**: {len(recusadas)}",
        f"- **Novos apelidos seguros adicionados**: {len(apelidos_adicionados)}",
        f"- **Status de conferência da fila futura**: {'✅ 0 problemas' if erros_conferir else '⚠️ Atenção necessária'}",
        "",
    ]

    if apelidos_adicionados:
        resumo_md.extend([
            "### 🎯 Apelidos / Erros Comuns Adicionados Automaticamente",
            "| Categoria | Termo Digitado | Resposta Oficial | Frequência |",
            "|---|---|---|---|",
        ])
        for ap in apelidos_adicionados:
            resumo_md.append(f"| `{ap['categoria']}` | **{ap['texto']}** | {ap['resposta']} | {ap['vezes']}x |")
        resumo_md.append("")

    if recusadas:
        top_recusadas = sorted(linhas_csv, key=lambda x: -int(x["n"]))[:10]
        resumo_md.extend([
            "### 🔍 Top 10 Recusadas do Dia (para conferência visual)",
            "| Categoria | Texto | Frequência | Diagnóstico | Parecida na Lista |",
            "|---|---|---|---|---|",
        ])
        for tr in top_recusadas:
            resumo_md.append(f"| `{tr['categoria']}` | {tr['texto']} | {tr['n']}x | {tr['como']} | {tr['na_lista']} |")
        resumo_md.append("")

    resumo_md.extend([
        "---",
        f"Arquivo de auditoria completo salvo em `dados/sinais/revisao/recusadas-{hoje}.csv`.",
        "",
        "*(Este PR foi gerado automaticamente pelo bot do Plantão Diário do Nicho)*"
    ])

    relatorio_texto = "\n".join(resumo_md)
    (RAIZ / "PLANTAO_RESUMO.md").write_text(relatorio_texto, encoding="utf-8")
    print("PLANTAO_RESUMO.md gerado com sucesso!")

    return {
        "data": hoje,
        "recusadas": len(recusadas),
        "apelidos": len(apelidos_adicionados),
        "conferir_ok": erros_conferir
    }


if __name__ == "__main__":
    executar_plantao()
