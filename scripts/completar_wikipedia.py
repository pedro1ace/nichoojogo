#!/usr/bin/env python3
"""Completa e confere as listas do Nicho pela Wikipédia em português e pelo Wikidata.

Feito para rodar no computador de qualquer pessoa, sem git e sem instalar nada:
só Python 3.9+ e internet. A versão mandada no chat já traz as listas dentro do arquivo;
rodando de dentro do repositório, ele lê dados/categorias.

    python completar_wikipedia.py            (no Windows também serve: py completar_wikipedia.py)

O que ele faz, categoria por categoria:
  1. Confere cada resposta da lista: se tem artigo na Wikipédia em português e
     quantas visitas o artigo teve nos últimos 60 dias (a fama).
  2. Procura respostas que faltam (Wikidata e categorias da Wikipédia) e mede
     a fama delas também.

Grava tudo em nicho_wikipedia.json, na mesma pasta. Se cair a internet ou você
fechar a janela, rode de novo: ele continua de onde parou.
No fim, mande o nicho_wikipedia.json para o Claude no chat do projeto.

Regras da Wikimedia respeitadas: User-Agent com contato, um pedido por vez,
pausa entre pedidos e espera quando o servidor pede (erro 429 ou maxlag).
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

AGENTE = "NichoJogo/1.0 (https://github.com/pedro1ace/nichoojogo; jogo de palavras sem fins lucrativos)"
PAUSA_API = 1.0      # segundos entre pedidos à Wikipédia
PAUSA_SPARQL = 5.0   # segundos entre consultas ao Wikidata
SAIDA = Path(__file__).resolve().parent / "nicho_wikipedia.json"
# De onde vêm as listas atuais: embutidas no próprio arquivo (a versão mandada no chat),
# a pasta dados/categorias do repositório (se o script rodar de dentro dele) ou o site.
LOCAL = Path(__file__).resolve().parent.parent / "dados" / "categorias"
SITES = ["https://claude-project-thread-0a1rvy.nichoojogo.pages.dev", "https://nichoojogo.pages.dev"]
LISTAS_EMBUTIDAS: dict[str, str] = {}
MAX_CANDIDATAS = 4000

# Onde procurar respostas que faltam. "sparql": itens do Wikidata com artigo na
# Wikipédia em português. "categoria": artigos de uma categoria da Wikipédia
# (e das subcategorias, até a profundidade dada).
SPARQL_BASE = """SELECT ?item ?artigo (SAMPLE(?r) AS ?rotulo) (SAMPLE(?l) AS ?links)
(GROUP_CONCAT(DISTINCT ?a; separator="|") AS ?apelidos) WHERE {
  %s
  ?artigo schema:about ?item ; schema:isPartOf <https://pt.wikipedia.org/> .
  OPTIONAL { ?item rdfs:label ?r FILTER(LANG(?r) = "pt") }
  OPTIONAL { ?item skos:altLabel ?a FILTER(LANG(?a) IN ("pt", "pt-br")) }
  OPTIONAL { ?item wikibase:sitelinks ?l }
} GROUP BY ?item ?artigo LIMIT 6000"""

FONTES = {
    "racas-de-cachorro": [("sparql", "?item wdt:P31 wd:Q39367 ."), ("categoria", "Raças de cães", 2)],
    "instrumentos-musicais": [("sparql", "?item wdt:P31/wdt:P279* wd:Q34379 ."), ("categoria", "Instrumentos musicais", 3)],
    "dinossauros": [("sparql", "?item wdt:P171+ wd:Q430 ; wdt:P105 wd:Q34740 ."), ("categoria", "Dinossauros", 3)],
    "frutas": [("categoria", "Frutos", 2), ("categoria", "Frutas", 2)],
    "animais-do-brasil": [("categoria", "Fauna do Brasil", 3)],
    "times-de-futebol": [("sparql", "?item wdt:P31 wd:Q476028 ; wdt:P17 wd:Q155 ."), ("categoria", "Clubes de futebol do Brasil", 3)],
    "comidas-tipicas": [("categoria", "Culinária do Brasil", 3)],
    "festa-junina": [("categoria", "Festa junina", 2)],
    "partes-do-corpo": [("categoria", "Anatomia humana", 2)],
    "marcas-de-carro": [("sparql", "?item wdt:P31/wdt:P279* wd:Q786820 ."), ("categoria", "Fabricantes de automóveis", 2)],
    "esportes-olimpicos": [("sparql", "?item wdt:P31 wd:Q212434 ."), ("categoria", "Desportos olímpicos", 2)],
    "poetas-brasileiros": [("sparql", "?item wdt:P106 wd:Q49757 ; wdt:P27 wd:Q155 ."), ("categoria", "Poetas do Brasil", 2)],
    "filmes-tom-hanks": [("sparql", "?item wdt:P161 wd:Q2685 ; wdt:P31/wdt:P279* wd:Q11424 .")],
    "plantas-de-casa": [("categoria", "Plantas ornamentais", 2)],
    "girias-brasileiras": [("categoria", "Gírias", 2)],
    "estrelas": [("sparql", "?item wdt:P31/wdt:P279* wd:Q523 .")],
    "corpos-do-sistema-solar": [("sparql", "VALUES ?tipo { wd:Q2537 wd:Q3863 wd:Q3559 wd:Q1022867 } ?item wdt:P31 ?tipo ."),
                                ("categoria", "Satélites naturais", 2), ("categoria", "Cometas", 2)],
    "paises": [("sparql", "?item wdt:P31 wd:Q3624078 .")],
    "paises-acima-do-equador": [],
    "coisas-com-dentes": [], "protecao-do-sol": [], "coisas-com-casca": [], "bagagem-do-astronauta": [],
    "coisas-que-brilham-no-ceu": [], "defesas-dos-animais": [], "elementos-quimicos": [], "constelacoes": [],
    "palavras-astro-e-cosmo": [],
}


def pedir(url: str, sparql: bool = False) -> dict:
    cab = {"User-Agent": AGENTE, "Accept": "application/sparql-results+json" if sparql else "application/json"}
    for tentativa in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=cab), timeout=90) as r:
                dados = json.loads(r.read().decode("utf-8"))
            if isinstance(dados, dict) and dados.get("error", {}).get("code") == "maxlag":
                time.sleep(10 + 5 * tentativa)
                continue
            return dados
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {}
            espera = int(e.headers.get("Retry-After") or 0) or min(60, 2 ** (tentativa + 2))
            print(f"   servidor respondeu {e.code}; esperando {espera}s...")
            time.sleep(espera)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            espera = min(60, 2 ** (tentativa + 2))
            print(f"   sem conexão ({e}); tentando de novo em {espera}s...")
            time.sleep(espera)
        except json.JSONDecodeError:
            time.sleep(5)
    print("   desisti deste pedido depois de várias tentativas")
    return {}


def api(**params) -> dict:
    time.sleep(PAUSA_API)
    params = {"format": "json", "formatversion": "2", "maxlag": "5", **params}
    return pedir("https://pt.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))


def baixar_lista(cat: str) -> list[list[str]]:
    texto = LISTAS_EMBUTIDAS.get(cat)
    if texto is None and (LOCAL / f"{cat}.txt").exists():
        texto = (LOCAL / f"{cat}.txt").read_text(encoding="utf-8")
    for site in ([] if texto is not None else SITES):
        try:
            pedido = urllib.request.Request(f"{site}/dados/categorias/{cat}.txt", headers={"User-Agent": AGENTE})
            with urllib.request.urlopen(pedido, timeout=60) as r:
                texto = r.read().decode("utf-8")
            break
        except urllib.error.URLError:
            continue
    return [[n.strip() for n in l.split("|") if n.strip()] for l in (texto or "").splitlines()
            if l.strip() and not l.startswith("#")]


def visitas(titulos: list[str]) -> dict[str, dict]:
    """Visitas dos últimos 60 dias, de 50 em 50 títulos, seguindo redirecionamentos."""
    saida = {}
    for k in range(0, len(titulos), 50):
        lote = titulos[k:k + 50]
        r = api(action="query", prop="pageviews|pageprops", ppprop="disambiguation", pvipdays="60",
                redirects="1", titles="|".join(lote))
        q = r.get("query", {})
        destino = {}
        for grupo in ("normalized", "redirects"):
            for x in q.get(grupo, []):
                destino[x["from"]] = x["to"]
        paginas = {p["title"]: p for p in q.get("pages", [])}
        for t in lote:
            alvo = t
            while alvo in destino and destino[alvo] != alvo:
                alvo = destino[alvo]
            p = paginas.get(alvo, {})
            existe = bool(p) and not p.get("missing") and not p.get("invalid")
            pv = p.get("pageviews") or {}
            saida[t] = {
                "titulo": alvo if existe else None,
                "visitas_60d": sum(v or 0 for v in pv.values()) if existe else 0,
                "desambiguacao": "disambiguation" in (p.get("pageprops") or {}),
            }
        if (k // 50) % 10 == 9:
            print(f"   {min(k + 50, len(titulos))} de {len(titulos)}")
    return saida


def da_categoria(nome: str, profundidade: int) -> list[str]:
    vistos, paginas, fila = set(), [], [(f"Categoria:{nome}", 0)]
    while fila and len(paginas) < MAX_CANDIDATAS:
        cat, nivel = fila.pop(0)
        if cat in vistos:
            continue
        vistos.add(cat)
        cont = None
        while True:
            params = {"action": "query", "list": "categorymembers", "cmtitle": cat, "cmlimit": "500",
                      "cmtype": "page|subcat"}
            if cont:
                params["cmcontinue"] = cont
            r = api(**params)
            for m in r.get("query", {}).get("categorymembers", []):
                if m["ns"] == 14 and nivel < profundidade:
                    fila.append((m["title"], nivel + 1))
                elif m["ns"] == 0:
                    paginas.append(m["title"])
            cont = r.get("continue", {}).get("cmcontinue")
            if not cont:
                break
    return paginas


def do_wikidata(filtro: str) -> list[dict]:
    time.sleep(PAUSA_SPARQL)
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": SPARQL_BASE % filtro, "format": "json"})
    r = pedir(url, sparql=True)
    saida = []
    for b in r.get("results", {}).get("bindings", []):
        titulo = urllib.parse.unquote(b["artigo"]["value"].rsplit("/wiki/", 1)[-1]).replace("_", " ")
        saida.append({
            "titulo": titulo,
            "qid": b["item"]["value"].rsplit("/", 1)[-1],
            "rotulo": b.get("rotulo", {}).get("value"),
            "apelidos": [a for a in b.get("apelidos", {}).get("value", "").split("|") if a],
            "sitelinks": int(b.get("links", {}).get("value", 0) or 0),
        })
    return saida


def chave(texto: str) -> str:
    import unicodedata
    t = unicodedata.normalize("NFD", texto.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return "".join(c for c in t if c.isalnum())


def processar(cat: str, fontes: list) -> dict:
    itens = baixar_lista(cat)
    print(f"   {len(itens)} respostas na lista atual")
    conhecidas = {chave(n) for it in itens for n in it}
    # 1. confere a lista atual (pelo nome principal; se não achar, pelo primeiro apelido)
    nomes = [it[0] for it in itens]
    medidas = visitas(nomes)
    faltou = [it for it in itens if not medidas[it[0]]["titulo"] and len(it) > 1]
    if faltou:
        extra = visitas([it[1] for it in faltou])
        for it in faltou:
            if extra[it[1]]["titulo"]:
                medidas[it[0]] = {**extra[it[1]], "pelo_apelido": it[1]}
    # 2. procura as que faltam
    candidatas: dict[str, dict] = {}
    for fonte in fontes:
        if fonte[0] == "sparql":
            print("   consultando o Wikidata...")
            for c in do_wikidata(fonte[1]):
                candidatas.setdefault(c["titulo"], {**c, "fonte": "wikidata"})
        else:
            print(f"   lendo a categoria '{fonte[1]}' da Wikipédia...")
            for t in da_categoria(fonte[1], fonte[2]):
                candidatas.setdefault(t, {"titulo": t, "fonte": f"categoria:{fonte[1]}"})
    novas = [c for t, c in candidatas.items()
             if chave(t.split(" (")[0]) not in conhecidas and chave(c.get("rotulo") or t) not in conhecidas]
    novas = novas[:MAX_CANDIDATAS]
    if novas:
        print(f"   {len(novas)} possíveis respostas novas; medindo a fama delas...")
        vv = visitas([c["titulo"] for c in novas])
        for c in novas:
            c["visitas_60d"] = vv[c["titulo"]]["visitas_60d"]
            c["desambiguacao"] = vv[c["titulo"]]["desambiguacao"]
    return {"respostas": medidas, "candidatas": novas, "completo": True}


def main() -> None:
    resultado = json.loads(SAIDA.read_text(encoding="utf-8")) if SAIDA.exists() else {"versao": 1, "categorias": {}}
    so = sys.argv[1:]
    todas = [c for c in FONTES if not so or c in so]
    inicio = time.time()
    for i, cat in enumerate(todas, 1):
        if resultado["categorias"].get(cat, {}).get("completo"):
            print(f"[{i}/{len(todas)}] {cat}: já feita, pulando")
            continue
        print(f"[{i}/{len(todas)}] {cat}")
        resultado["categorias"][cat] = processar(cat, FONTES[cat])
        resultado["gerado_em"] = time.strftime("%Y-%m-%d %H:%M")
        SAIDA.write_text(json.dumps(resultado, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"   ok, salvo ({(time.time() - inicio) / 60:.0f} min até agora)")
    print(f"\nPronto! Mande este arquivo para o Claude no chat do projeto:\n   {SAIDA}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nParado. Rode de novo para continuar de onde parou.")
