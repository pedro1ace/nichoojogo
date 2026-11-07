#!/usr/bin/env python3
"""Puxa MUITA resposta de uma vez, de fontes abertas (sem chave de API), para rodar no seu computador.

Fontes:
    wikidata     consulta SPARQL em query.wikidata.org (nome em português, apelidos e quantas
                 Wikipédias têm artigo, que vira a ordem de fama)
    ibge         nomes do Censo (servicodados.ibge.gov.br), por década, sexo e estado
    openlibrary  livros em português de 2000 para cá (openlibrary.org)

Cada categoria vira um arquivo em dados/fontes/engordar/<cat>.<fonte>.txt, no formato que o
scripts/engordar.py lê ("Nome | apelido | apelido"). Depois:
    python3 scripts/engordar.py               # junta tudo nas listas (não repete, não tira nada)
    python3 scripts/fama.py                   # refaz fama e pontos
    python3 scripts/fama.py --conferir
    git add dados/fontes/engordar && git commit && git push   (ou me manda os .txt)

Uso:
    python3 scripts/coletar_fontes.py                     # tudo (demora uns 20 a 40 minutos)
    python3 scripts/coletar_fontes.py musicas-brasileiras # só uma categoria
    python3 scripts/coletar_fontes.py --listar            # mostra o que cada categoria puxa
    python3 scripts/coletar_fontes.py --fonte ibge        # só uma fonte

Se uma consulta do Wikidata der timeout, rode de novo só aquela categoria: as outras ficam salvas.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FONTES = RAIZ / "dados" / "fontes" / "engordar"
UA = "nichoojogo-coletor/1.0 (https://github.com/pedro1ace/nichoojogo)"
SPARQL = "https://query.wikidata.org/sparql"

# ---------------------------------------------------------------- Wikidata
# Cada consulta só precisa dizer quem é ?item. O resto (nome em português, apelidos, fama) é igual
# para todas. MIN = quantas Wikipédias precisam ter artigo (corta o que ninguém conhece).
BR = "wd:Q155"
CONSULTAS: dict[str, tuple[str, int]] = {
    "musicas-brasileiras": (f"""
        {{ ?item wdt:P31/wdt:P279* wd:Q7366 ; wdt:P495 {BR} . }}
        UNION {{ ?item wdt:P31/wdt:P279* wd:Q7366 ; wdt:P175 ?a . ?a wdt:P27 {BR} . }}
        UNION {{ ?item wdt:P31/wdt:P279* wd:Q7366 ; wdt:P175 ?a . ?a wdt:P495 {BR} . }}""", 1),
    "filmes-brasileiros": (f"""
        ?item wdt:P31/wdt:P279* wd:Q11424 ; wdt:P495 {BR} ; wdt:P577 ?d .
        FILTER(YEAR(?d) >= 2000)""", 1),
    "livros": ("""
        ?item wdt:P31/wdt:P279* wd:Q7725634 ; wdt:P577 ?d .
        FILTER(YEAR(?d) >= 2000)""", 3),
    "atores-brasileiros": (f"""
        ?item wdt:P106/wdt:P279* wd:Q33999 ; wdt:P27 {BR} .""", 2),
    "apresentadores-de-tv": (f"""
        ?item wdt:P106 wd:Q947873 ; wdt:P27 {BR} .""", 1),
    "influenciadores": (f"""
        ?item wdt:P106 ?o ; wdt:P27 {BR} .
        VALUES ?o {{ wd:Q17125263 wd:Q94791573 wd:Q50279140 wd:Q2045208 wd:Q1414443 }}""", 1),
    "bandas": (f"""
        ?item wdt:P31/wdt:P279* wd:Q215380 ; wdt:P495 {BR} ; wdt:P136/wdt:P279* wd:Q11399 .""", 1),
    "series-de-tv": ("""
        ?item wdt:P31/wdt:P279* wd:Q5398426 ; wdt:P495 wd:Q30 ; wdt:P580 ?d .
        FILTER(YEAR(?d) >= 2000 && YEAR(?d) <= 2009)""", 2),
    "atores-de-hollywood": ("""
        ?item p:P166 ?pr . ?pr ps:P166 ?premio .
        VALUES ?premio { wd:Q103916 wd:Q103618 wd:Q106291 wd:Q106301 }""", 1),
    "pintores-e-artistas": (f"""
        ?item wdt:P106 wd:Q1028181 ; wdt:P27 {BR} .""", 1),
    "marcas-famosas": ("""
        { ?item wdt:P31/wdt:P279* wd:Q431289 . } UNION { ?item wdt:P31/wdt:P279* wd:Q167270 . }""", 15),
    "lojas": (f"""
        ?item wdt:P31/wdt:P279* wd:Q507619 ; wdt:P17 {BR} .""", 1),
    "pontos-turisticos": ("""
        { ?item wdt:P31/wdt:P279* wd:Q570116 . } UNION { ?item wdt:P1435 wd:Q9259 . }""", 12),
    "sobrenomes": ("""
        ?item wdt:P31 wd:Q101352 .
        ?art schema:about ?item ; schema:isPartOf <https://pt.wikipedia.org/> .""", 1),
    "nomes-femininos": ("""
        ?item wdt:P31 wd:Q11879590 .
        ?art schema:about ?item ; schema:isPartOf <https://pt.wikipedia.org/> .""", 1),
    "nomes-masculinos": ("""
        ?item wdt:P31 wd:Q12308941 .
        ?art schema:about ?item ; schema:isPartOf <https://pt.wikipedia.org/> .""", 1),
    "cientistas-e-inventores": ("""
        { ?item wdt:P106/wdt:P279* wd:Q901 . } UNION { ?item wdt:P106 wd:Q205375 . }""", 30),
    "atletas-brasileiros": (f"""
        ?item wdt:P27 {BR} ; wdt:P1344 ?jogos . ?jogos wdt:P31 wd:Q159821 .
        ?item p:P1344 ?part . ?part pq:P1352 ?colocacao . FILTER(?colocacao <= 3)
        FILTER NOT EXISTS {{ ?item wdt:P106 wd:Q937857 }}""", 1),
    "estadios": ("""
        ?item wdt:P31/wdt:P279* wd:Q1154710 .""", 2),
    "doencas": ("""
        ?item wdt:P31/wdt:P279* wd:Q12136 .""", 5),
    "arvores": ("""
        ?item wdt:P31 wd:Q16521 ; wdt:P171* wd:Q25314 .
        ?art schema:about ?item ; schema:isPartOf <https://pt.wikipedia.org/> .""", 1),
}

MOLDE = """
SELECT ?item ?pt ?en (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?apelidos) ?links WHERE {{
  {{
    SELECT DISTINCT ?item WHERE {{ {corpo} }} LIMIT 60000
  }}
  ?item wikibase:sitelinks ?links . FILTER(?links >= {minimo})
  ?item rdfs:label ?pt . FILTER(LANG(?pt) = "pt")
  OPTIONAL {{ ?item rdfs:label ?en . FILTER(LANG(?en) = "en") }}
  OPTIONAL {{ ?item skos:altLabel ?alias . FILTER(LANG(?alias) IN ("pt", "pt-br")) }}
}} GROUP BY ?item ?pt ?en ?links ORDER BY DESC(?links)
"""


def pegar(url: str, dados: bytes | None = None, tentativas: int = 5, espera: float = 10) -> bytes:
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, data=dados, headers={
                "User-Agent": UA, "Accept": "application/json",
                **({"Content-Type": "application/x-www-form-urlencoded"} if dados else {})})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                pausa = float(e.headers.get("Retry-After") or espera * (i + 1))
                print(f"    {e.code}, esperando {pausa:.0f}s...", file=sys.stderr)
                time.sleep(pausa)
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"    erro de rede ({e}), tentando de novo...", file=sys.stderr)
            time.sleep(espera * (i + 1))
    raise RuntimeError(f"desisti de {url[:80]}")


def wikidata(cat: str) -> list[list[str]]:
    corpo, minimo = CONSULTAS[cat]
    consulta = MOLDE.format(corpo=corpo, minimo=minimo)
    bruto = pegar(SPARQL, urllib.parse.urlencode({"query": consulta, "format": "json"}).encode())
    linhas = []
    for b in json.loads(bruto)["results"]["bindings"]:
        pt = b["pt"]["value"].strip()
        nomes = [pt]
        if "en" in b and b["en"]["value"].strip() != pt:
            nomes.append(b["en"]["value"].strip())
        nomes += [a.strip() for a in b.get("apelidos", {}).get("value", "").split("|") if a.strip()]
        # "Fulano (cantor)" -> "Fulano"
        nomes = [n.split(" (")[0].strip() if n.endswith(")") else n for n in nomes]
        linhas.append(list(dict.fromkeys(n for n in nomes if n and not n.startswith("Q"))))
    return linhas


# ---------------------------------------------------------------- IBGE (nomes do Censo)
UFS = [11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 35, 41, 42, 43, 50, 51, 52, 53]
DECADAS = [1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010]


def ibge(sexo: str) -> list[list[str]]:
    base = "https://servicodados.ibge.gov.br/api/v2/censos/nomes/ranking"
    contagem: dict[str, int] = {}
    pedidos = [{"sexo": sexo}] + [{"sexo": sexo, "decada": d} for d in DECADAS] + \
              [{"sexo": sexo, "localidade": u} for u in UFS] + \
              [{"sexo": sexo, "localidade": u, "decada": d} for u in UFS for d in DECADAS]
    for i, p in enumerate(pedidos, 1):
        try:
            dados = json.loads(pegar(base + "?" + urllib.parse.urlencode(p)))
        except Exception as e:  # noqa: BLE001
            print(f"    pulei {p}: {e}", file=sys.stderr)
            continue
        for bloco in dados:
            for r in bloco.get("res", []):
                nome = r["nome"].strip().title()
                contagem[nome] = max(contagem.get(nome, 0), int(r.get("frequencia", 0)))
        if i % 50 == 0:
            print(f"    {i}/{len(pedidos)} pedidos, {len(contagem)} nomes", file=sys.stderr)
        time.sleep(0.2)
    return [[n] for n, _ in sorted(contagem.items(), key=lambda x: -x[1])]


# ---------------------------------------------------------------- Open Library (livros)
def openlibrary(paginas: int = 60) -> list[list[str]]:
    vistos: dict[str, list[str]] = {}
    for pagina in range(1, paginas + 1):
        q = {"q": "language:por first_publish_year:[2000 TO 2030]", "fields": "title,subtitle,edition_count",
             "sort": "editions", "limit": 100, "page": pagina}
        try:
            dados = json.loads(pegar("https://openlibrary.org/search.json?" + urllib.parse.urlencode(q)))
        except Exception as e:  # noqa: BLE001
            print(f"    pulei a página {pagina}: {e}", file=sys.stderr)
            continue
        docs = dados.get("docs", [])
        if not docs:
            break
        for d in docs:
            t = (d.get("title") or "").strip()
            if t and t.lower() not in vistos:
                vistos[t.lower()] = [t]
        print(f"    página {pagina}: {len(vistos)} livros", file=sys.stderr)
        time.sleep(1)
    return list(vistos.values())


# ---------------------------------------------------------------- tudo junto
TAREFAS: list[tuple[str, str]] = [(c, "wikidata") for c in CONSULTAS] + [
    ("nomes-femininos", "ibge"), ("nomes-masculinos", "ibge"), ("livros", "openlibrary")]


def rodar(cat: str, fonte: str) -> None:
    print(f"{cat} ({fonte})...", file=sys.stderr)
    if fonte == "wikidata":
        linhas = wikidata(cat)
    elif fonte == "ibge":
        linhas = ibge("F" if cat == "nomes-femininos" else "M")
    else:
        linhas = openlibrary()
    arq = FONTES / f"{cat}.{fonte}.txt"
    cab = f"# gerado por scripts/coletar_fontes.py ({fonte}) em {time.strftime('%Y-%m-%d')}; não edite à mão"
    arq.write_text("\n".join([cab] + [" | ".join(l) for l in linhas]) + "\n", encoding="utf-8")
    print(f"  {cat}: {len(linhas)} respostas em {arq.relative_to(RAIZ)}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("categorias", nargs="*")
    ap.add_argument("--fonte", choices=["wikidata", "ibge", "openlibrary"])
    ap.add_argument("--listar", action="store_true")
    args = ap.parse_args()
    tarefas = [(c, f) for c, f in TAREFAS
               if (not args.categorias or c in args.categorias) and (not args.fonte or f == args.fonte)]
    if args.listar:
        for c, f in tarefas:
            print(f"{c:28} {f}")
        return
    falhas = []
    for c, f in tarefas:
        try:
            rodar(c, f)
        except Exception as e:  # noqa: BLE001
            print(f"  {c}: FALHOU ({e}); rode de novo só ela depois", file=sys.stderr)
            falhas.append(c)
        time.sleep(5 if f == "wikidata" else 1)
    print("\nPronto. Agora: python3 scripts/engordar.py && python3 scripts/fama.py && python3 scripts/fama.py --conferir")
    if falhas:
        print("Falharam (rode de novo): " + " ".join(falhas))


if __name__ == "__main__":
    main()
