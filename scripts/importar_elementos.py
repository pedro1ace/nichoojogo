#!/usr/bin/env python3
"""Baixa os 118 elementos químicos da Wikidata e gera dados/categorias/elementos-quimicos.txt.

Fonte: Wikidata (itens com instância de 'elemento químico' Q11344 e número atômico P1086 de 1 a 118).
Prioriza nomes em português brasileiro (pt-br), incluindo símbolos e variantes como apelidos.
Valida rigorosamente: exatamente 118 elementos, sem duplicatas.
"""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "dados" / "categorias" / "elementos-quimicos.txt"

SPARQL_QUERY = """
SELECT DISTINCT ?number ?item ?itemLabel ?itemLabelPtBr ?itemLabelPt ?symbol ?altLabel WHERE {
  ?item wdt:P31 wd:Q11344 ;
        wdt:P1086 ?number .
  FILTER(xsd:integer(?number) >= 1 && xsd:integer(?number) <= 118)
  
  OPTIONAL { ?item rdfs:label ?itemLabelPtBr . FILTER(LANG(?itemLabelPtBr) = "pt-br") }
  OPTIONAL { ?item rdfs:label ?itemLabelPt . FILTER(LANG(?itemLabelPt) = "pt") }
  OPTIONAL { ?item wdt:P246 ?symbol }
  OPTIONAL {
    ?item skos:altLabel ?altLabel .
    FILTER(LANG(?altLabel) in ("pt-br", "pt"))
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt-br,pt,en". }
}
ORDER BY xsd:integer(?number)
"""

CORRECOES = {
    # 113: nome principal vira Nihônio, mantendo Niônio como apelido
    113: {
        "nome": "Nihônio",
        "adicionar_apelidos": {"Niônio"},
    },
}

APELIDOS_REMOVER = {"vestium", "céltio", "kurchatovium", "nipónio", "niponio"}


def baixar_dados_wikidata() -> list[dict]:
    url = "https://query.wikidata.org/sparql?query=" + urllib.parse.quote(SPARQL_QUERY) + "&format=json"
    headers = {
        "User-Agent": "NichoBot/1.0 (https://github.com/pedro1ace/nichoojogo; open-source daily game)",
        "Accept": "application/sparql-results+json",
    }
    req = urllib.request.Request(url, headers=headers)
    print("Consultando Wikidata SPARQL endpoint...")
    with urllib.request.urlopen(req, timeout=30) as resp:
        conteudo = json.loads(resp.read().decode("utf-8"))
    return conteudo["results"]["bindings"]


def processar_elementos(linhas: list[dict]) -> dict[int, dict]:
    elementos: dict[int, dict] = defaultdict(lambda: {"nome": "", "apelidos": set()})

    for row in linhas:
        num = int(row["number"]["value"])
        # Prefere label em pt-br se houver, senão pt, senão itemLabel
        label_pt_br = row.get("itemLabelPtBr", {}).get("value")
        label_pt = row.get("itemLabelPt", {}).get("value")
        label_padrao = row.get("itemLabel", {}).get("value")

        nome = label_pt_br or label_pt or label_padrao
        if nome and not elementos[num]["nome"]:
            elementos[num]["nome"] = nome.strip()

        # Coleta símbolos e variantes
        if "symbol" in row:
            simbolo = row["symbol"]["value"].strip()
            if simbolo:
                elementos[num]["apelidos"].add(simbolo)

        if "altLabel" in row:
            alt = row["altLabel"]["value"].strip()
            if alt:
                elementos[num]["apelidos"].add(alt)

        # Se label_pt for diferente de label_pt_br, adiciona como apelido
        if label_pt and label_pt_br and label_pt.lower() != label_pt_br.lower():
            elementos[num]["apelidos"].add(label_pt.strip())

    return elementos


def capitalizar(texto: str) -> str:
    """Capitaliza apenas a primeira letra, preservando acentuação."""
    if not texto:
        return ""
    return texto[0].upper() + texto[1:]


def validar_e_formatar(elementos: dict[int, dict]) -> list[str]:
    total = len(elementos)
    if total != 118:
        raise ValueError(f"Esperado 118 elementos, mas foram encontrados {total}!")

    numeros = sorted(elementos.keys())
    if numeros != list(range(1, 119)):
        faltando = set(range(1, 119)) - set(numeros)
        raise ValueError(f"Faltam números atômicos: {faltando}")

    nomes_vistos = set()
    linhas_resultado = []

    for num in range(1, 119):
        info = elementos[num]
        if num in CORRECOES:
            corr = CORRECOES[num]
            if "nome" in corr:
                antigo = info["nome"]
                info["apelidos"].add(antigo)
                info["nome"] = corr["nome"]
            if "adicionar_apelidos" in corr:
                info["apelidos"].update(corr["adicionar_apelidos"])
        nome = capitalizar(info["nome"].strip())
        if not nome:
            raise ValueError(f"Elemento com número atômico {num} não possui nome!")

        nome_norm = nome.lower()
        if nome_norm in nomes_vistos:
            raise ValueError(f"Nome duplicado detectado: {nome} (número {num})")
        nomes_vistos.add(nome_norm)

        # Filtra apelidos: remove "elemento X", eka-*, unun*, unnil*, símbolos provisórios de 3 letras e o próprio nome
        apelidos_filtrados = []
        apelidos_vistos = {nome_norm}
        for a in info["apelidos"]:
            a_limpo = a.strip()
            a_lower = a_limpo.lower()
            if not a_limpo or a_lower in apelidos_vistos:
                continue
            if a_lower in APELIDOS_REMOVER:
                continue
            if a_lower.startswith("elemento "):
                continue
            if (
                a_lower.startswith("eka-")
                or a_lower.startswith("unun")
                or a_lower.startswith("unnil")
                or a_lower.startswith("unún")
            ):
                continue
            if len(a_limpo) == 3 and a_limpo.startswith("U") and a_limpo[1:].islower():
                continue
            apelidos_vistos.add(a_lower)
            apelidos_filtrados.append(a_limpo)

        # Ordena apelidos por tamanho e alfabeticamente
        apelidos_ordenados = sorted(apelidos_filtrados, key=lambda x: (len(x), x.lower()))

        if apelidos_ordenados:
            linhas_resultado.append(f"{nome} | {' | '.join(apelidos_ordenados)}")
        else:
            linhas_resultado.append(nome)

    return linhas_resultado


def main() -> None:
    linhas_wikidata = baixar_dados_wikidata()
    elementos = processar_elementos(linhas_wikidata)
    linhas_formatadas = validar_e_formatar(elementos)

    cabecalho = [
        "# titulo: Elementos químicos",
        "# pergunta: Cite um elemento químico da tabela periódica",
        '# formato: uma resposta por linha; apelidos separados por " | "',
    ]
    conteudo_final = "\n".join(cabecalho + linhas_formatadas) + "\n"

    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(conteudo_final, encoding="utf-8")
    print(f"Sucesso! Gerado {DESTINO.name} com {len(linhas_formatadas)} elementos validados (1 a 118).")


if __name__ == "__main__":
    main()
