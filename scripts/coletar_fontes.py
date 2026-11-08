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
# Consultas leves: P31 direto com VALUES (nada de wdt:P279* em classes enormes), o filtro mais
# restritivo primeiro. Nomes e apelidos vêm depois, pela API wbgetentities, 50 itens por vez.
CONSULTAS: dict[str, tuple[str, int]] = {
    "musicas-brasileiras": (f"""
        VALUES ?t {{ wd:Q7366 wd:Q134556 wd:Q105543609 }}
        {{ ?item wdt:P495 {BR} ; wdt:P31 ?t . }}
        UNION {{ ?a wdt:P27 {BR} . ?item wdt:P175 ?a ; wdt:P31 ?t . }}""", 1),
    "filmes-brasileiros": (f"""
        ?item wdt:P495 {BR} ; wdt:P31 wd:Q11424 ; wdt:P577 ?d . FILTER(YEAR(?d) >= 2000)""", 1),
    "livros": ("""
        VALUES ?t { wd:Q7725634 wd:Q571 wd:Q8261 wd:Q47461344 }
        ?item wdt:P31 ?t ; wdt:P577 ?d . FILTER(YEAR(?d) >= 2000)""", 3),
    "atores-brasileiros": (f"""
        VALUES ?o {{ wd:Q33999 wd:Q10800557 wd:Q10798782 wd:Q2405480 wd:Q2259451 }}
        ?item wdt:P27 {BR} ; wdt:P106 ?o .""", 1),
    "apresentadores-de-tv": (f"""
        VALUES ?o {{ wd:Q947873 }}
        ?item wdt:P27 {BR} ; wdt:P106 ?o .""", 1),
    "influenciadores": (f"""
        VALUES ?o {{ wd:Q17125263 wd:Q94791573 wd:Q50279140 wd:Q2045208 wd:Q1414443 }}
        ?item wdt:P27 {BR} ; wdt:P106 ?o .""", 1),
    "bandas": (f"""
        VALUES ?t {{ wd:Q215380 wd:Q5741069 }}
        ?item wdt:P495 {BR} ; wdt:P31 ?t ; wdt:P136 ?g . ?g wdt:P279* wd:Q11399 .""", 1),
    "series-de-tv": ("""
        ?item wdt:P495 wd:Q30 ; wdt:P31 wd:Q5398426 ; wdt:P580 ?d .
        FILTER(YEAR(?d) >= 2000 && YEAR(?d) <= 2009)""", 2),
    "atores-de-hollywood": ("""
        VALUES ?premio { wd:Q103916 wd:Q103618 wd:Q106291 wd:Q106301 }
        ?item wdt:P166 ?premio .""", 1),
    "pintores-e-artistas": (f"""
        VALUES ?o {{ wd:Q1028181 wd:Q483501 wd:Q1281618 wd:Q33231 }}
        ?item wdt:P27 {BR} ; wdt:P106 ?o .""", 1),
    "marcas-famosas": ("""
        VALUES ?t { wd:Q431289 wd:Q167270 wd:Q4830453 wd:Q891723 wd:Q6881511 }
        ?item wdt:P31 ?t .""", 25),
    "lojas": (f"""
        VALUES ?t {{ wd:Q507619 wd:Q216107 wd:Q180846 wd:Q1631129 }}
        ?item wdt:P17 {BR} ; wdt:P31 ?t .""", 1),
    "pontos-turisticos": ("""
        VALUES ?t { wd:Q570116 wd:Q4989906 wd:Q33506 wd:Q16970 wd:Q23413 wd:Q12518 }
        ?item wdt:P31 ?t .""", 30),
    "sobrenomes": ("""?item wdt:P31 wd:Q101352 .""", 6),
    "nomes-femininos": ("""?item wdt:P31 wd:Q11879590 .""", 6),
    "nomes-masculinos": ("""?item wdt:P31 wd:Q12308941 .""", 6),
    "cientistas-e-inventores": ("""
        VALUES ?o { wd:Q901 wd:Q205375 wd:Q169470 wd:Q593644 wd:Q170790 wd:Q864503 wd:Q11063 wd:Q81096 }
        ?item wdt:P106 ?o .""", 30),
    "atletas-brasileiros": (f"""
        ?item wdt:P27 {BR} ; wdt:P1344 ?jogos . ?jogos wdt:P31 wd:Q159821 .""", 3),
    "estadios": ("""
        VALUES ?t { wd:Q1154710 wd:Q483110 }
        ?item wdt:P31 ?t .""", 3),
    "doencas": ("""
        VALUES ?t { wd:Q12136 wd:Q18123741 wd:Q929833 wd:Q112193867 }
        ?item wdt:P31 ?t .""", 5),
    "arvores": ("""?item wdt:P2974 wd:Q10884 .""", 2),
}

MOLDE = """
SELECT ?item ?links ?pt ?mul ?en WHERE {{
  {{ SELECT DISTINCT ?item ?links WHERE {{
    {corpo}
    ?item wikibase:sitelinks ?links . FILTER(?links >= {minimo})
  }} LIMIT 20000 }}
  OPTIONAL {{ ?item rdfs:label ?pt . FILTER(LANG(?pt) = "pt") }}
  OPTIONAL {{ ?item rdfs:label ?mul . FILTER(LANG(?mul) = "mul") }}
  OPTIONAL {{ ?item rdfs:label ?en . FILTER(LANG(?en) = "en") }}
}}
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
        except Exception as e:  # noqa: BLE001  (rede caiu, resposta cortada etc.)
            print(f"    erro de rede ({e}), tentando de novo...", file=sys.stderr)
            time.sleep(espera * (i + 1))
    raise RuntimeError(f"desisti de {url[:80]}")


def wikidata(cat: str) -> list[list[str]]:
    corpo, minimo = CONSULTAS[cat]
    consulta = MOLDE.format(corpo=corpo, minimo=minimo)
    bruto = pegar(SPARQL, urllib.parse.urlencode({"query": consulta, "format": "json"}).encode(), tentativas=3)
    itens: dict[str, tuple[int, list[str]]] = {}
    for b in json.loads(bruto, strict=False)["results"]["bindings"]:
        q = b["item"]["value"].rsplit("/", 1)[-1]
        nomes = [b[k]["value"].strip() for k in ("pt", "mul", "en") if k in b]
        if not ("pt" in b or "mul" in b):
            continue  # sem nome em português: pula
        links, antes = itens.get(q, (0, []))
        itens[q] = (max(links, int(b["links"]["value"])), antes + nomes)
    print(f"  {len(itens)} itens com nome", file=sys.stderr)
    linhas = []
    for q, (_, nomes) in sorted(itens.items(), key=lambda kv: -kv[1][0]):
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
