#!/usr/bin/env python3
"""Gera uma categoria a partir de uma receita em dados/fontes/<id>.json.

Uso:
    python3 scripts/importar.py elementos-quimicos              # consulta o Wikidata e grava o .txt
    python3 scripts/importar.py elementos-quimicos --conferir   # só compara com o .txt atual
    python3 scripts/importar.py elementos-quimicos --offline    # usa a última consulta guardada
    python3 scripts/importar.py                                 # todas as receitas

A receita diz o que buscar e como limpar; as validações são as mesmas para todas
as categorias. O pontuar.py não muda: ele continua lendo dados/categorias/<id>.txt.

Campos da receita (só "titulo", "pergunta" e "wikidata.classe" são obrigatórios):
    titulo, pergunta          cabeçalho da categoria
    wikidata.classe           Q... da classe (instância de, P31). Pode ser uma lista.
    wikidata.subclasses       true para aceitar também subclasses (P31/P279*)
    wikidata.ordem            propriedade numérica que ordena e identifica (ex.: P1086, número atômico)
    wikidata.ordem_faixa      [min, max] dessa propriedade
    wikidata.propriedades_apelido  propriedades cujo valor vira apelido (ex.: P246, símbolo)
    wikidata.filtros_sparql   linhas SPARQL extras, usando ?item
    contagem                  {"min": n, "max": n}: faixa esperada de respostas
    ordem_completa            true se toda a ordem_faixa tem que aparecer, sem buraco
    apelidos_remover          apelidos a tirar (comparação sem maiúsculas)
    apelidos_remover_prefixos apelidos que começam assim saem
    apelidos_remover_regex    apelidos que casam com a expressão saem
    correcoes                 {"<ordem ou Q...>": {"nome": "...", "adicionar_apelidos": [...]}}
                              o nome antigo vira apelido
    apelidos_curtos           "avisar" (padrão), "remover" ou "permitir" para apelidos de até 3 letras
    icf_palavra_comum         até que ICF um apelido do léxico conta como palavra comum (padrão 10)

Validações:
    erro (não grava): contagem fora da faixa, buraco na ordem, resposta sem nome,
        nomes repetidos, o mesmo apelido em duas respostas diferentes
    aviso: apelidos curtos (até 3 letras) e apelidos que são palavra comum do
        português (no léxico da base pt-br e com ICF baixo; rode scripts/baixar_dados.sh)

A resposta bruta do Wikidata fica em dados/brutos/fontes/<id>.json (fora do git),
para rodar de novo com --offline sem consultar.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pontuar import normalizar  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
FONTES = RAIZ / "dados" / "fontes"
CATEGORIAS = RAIZ / "dados" / "categorias"
BRUTOS = RAIZ / "dados" / "brutos" / "fontes"
LEXICO = RAIZ / "dados" / "brutos" / "pt-br" / "lexico"
ICF = RAIZ / "dados" / "brutos" / "pt-br" / "icf"
# Palavra do léxico com ICF até aqui conta como "comum" (no=4,8; se=4,9; ar=8,5; fe=11,8).
# Acima disso o léxico tem muita grafia variante legítima (azoto, neon, crômio).
ICF_PALAVRA_COMUM = 10.0
AGENTE = "NichoBot/1.0 (https://github.com/pedro1ace/nichoojogo; open-source daily game)"


class ErroDeValidacao(Exception):
    pass


# ---------- consulta ----------


def montar_sparql(wd: dict) -> str:
    classes = wd["classe"] if isinstance(wd["classe"], list) else [wd["classe"]]
    caminho = "wdt:P31/wdt:P279*" if wd.get("subclasses") else "wdt:P31"
    linhas = []
    if len(classes) == 1:
        linhas.append(f"?item {caminho} wd:{classes[0]} .")
    else:
        valores = " ".join(f"wd:{c}" for c in classes)
        linhas.append(f"VALUES ?classe {{ {valores} }} ?item {caminho} ?classe .")
    if wd.get("ordem"):
        linhas.append(f"?item wdt:{wd['ordem']} ?ordem .")
        if wd.get("ordem_faixa"):
            a, b = wd["ordem_faixa"]
            linhas.append(f"FILTER(xsd:integer(?ordem) >= {a} && xsd:integer(?ordem) <= {b})")
    linhas += wd.get("filtros_sparql", [])
    linhas.append('OPTIONAL { ?item rdfs:label ?nomePtBr . FILTER(LANG(?nomePtBr) = "pt-br") }')
    linhas.append('OPTIONAL { ?item rdfs:label ?nomePt . FILTER(LANG(?nomePt) = "pt") }')
    variaveis = []
    for i, prop in enumerate(wd.get("propriedades_apelido", [])):
        linhas.append(f"OPTIONAL {{ ?item wdt:{prop} ?prop{i} }}")
        variaveis.append(f"?prop{i}")
    linhas.append('OPTIONAL { ?item skos:altLabel ?apelido . FILTER(LANG(?apelido) in ("pt-br", "pt")) }')
    linhas.append('SERVICE wikibase:label { bd:serviceParam wikibase:language "pt-br,pt,en". }')
    ordem = " ?ordem" if wd.get("ordem") else ""
    ordenar = "ORDER BY xsd:integer(?ordem)" if wd.get("ordem") else "ORDER BY ?item"
    corpo = "\n  ".join(linhas)
    return (f"SELECT DISTINCT ?item{ordem} ?itemLabel ?nomePtBr ?nomePt ?apelido {' '.join(variaveis)} WHERE {{\n"
            f"  {corpo}\n}}\n{ordenar}\n")


def consultar(sparql: str) -> list[dict]:
    url = "https://query.wikidata.org/sparql?query=" + urllib.parse.quote(sparql) + "&format=json"
    pedido = urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(pedido, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))["results"]["bindings"]


# ---------- montagem ----------


def valor(linha: dict, campo: str) -> str | None:
    v = linha.get(campo, {}).get("value")
    return v.strip() if v else None


def agrupar(linhas: list[dict], receita: dict) -> dict:
    """Junta as linhas da consulta por item (ou pela ordem, se houver)."""
    wd = receita["wikidata"]
    n_props = len(wd.get("propriedades_apelido", []))
    # apelidos num dict (ordem de chegada), não num set: com set, a grafia que sobra entre
    # "niônio" e "Niônio" mudava de uma execução para outra
    itens: dict = defaultdict(lambda: {"nome": "", "apelidos": {}, "qid": None})
    for linha in linhas:
        qid = valor(linha, "item").rsplit("/", 1)[-1]
        chave = int(valor(linha, "ordem")) if wd.get("ordem") else qid
        item = itens[chave]
        item["qid"] = item["qid"] or qid
        pt_br, pt = valor(linha, "nomePtBr"), valor(linha, "nomePt")
        nome = pt_br or pt or valor(linha, "itemLabel")
        if nome and not item["nome"]:
            item["nome"] = nome
        for i in range(n_props):
            if valor(linha, f"prop{i}"):
                item["apelidos"].setdefault(valor(linha, f"prop{i}"))
        if valor(linha, "apelido"):
            item["apelidos"].setdefault(valor(linha, "apelido"))
        if pt and pt_br and pt.lower() != pt_br.lower():
            item["apelidos"].setdefault(pt)
    return itens


def capitalizar(texto: str) -> str:
    return texto[0].upper() + texto[1:] if texto else ""


def compacto(texto: str) -> str:
    return normalizar(texto).replace(" ", "")


def ler_lexico() -> dict[str, float]:
    """Palavras do léxico pt-br com o menor ICF de cada grafia (menor = mais comum)."""
    if not LEXICO.exists():
        return {}
    icf: dict[str, float] = {}
    if ICF.exists():
        for linha in ICF.read_text(encoding="utf-8").splitlines():
            palavra, _, v = linha.rpartition(",")
            if palavra:
                chave = compacto(palavra)
                icf[chave] = min(icf.get(chave, 99.0), float(v))
    return {compacto(l): icf.get(compacto(l), 99.0) for l in LEXICO.read_text(encoding="utf-8").splitlines() if l.strip()}


def montar(itens: dict, receita: dict, lexico: dict[str, float]) -> tuple[list[str], list[str]]:
    """Aplica correções e filtros e valida. Devolve (linhas do .txt, avisos)."""
    erros, avisos = [], []
    contagem = receita.get("contagem", {})
    n = len(itens)
    if n < contagem.get("min", 1) or n > contagem.get("max", 10**9):
        erros.append(f"contagem {n} fora da faixa esperada {contagem.get('min')}–{contagem.get('max')}")
    faixa = receita["wikidata"].get("ordem_faixa")
    if receita.get("ordem_completa") and faixa:
        faltando = sorted(set(range(faixa[0], faixa[1] + 1)) - set(itens))
        if faltando:
            erros.append(f"faltam na ordem: {faltando}")

    remover = {a.lower() for a in receita.get("apelidos_remover", [])}
    prefixos = [p.lower() for p in receita.get("apelidos_remover_prefixos", [])]
    regexes = [re.compile(r) for r in receita.get("apelidos_remover_regex", [])]
    curtos = receita.get("apelidos_curtos", "avisar")
    correcoes = receita.get("correcoes", {})

    linhas, nomes_vistos = [], {}
    dono_apelido: dict[str, str] = {}
    curtos_vistos, comuns_vistos = [], []
    for chave in sorted(itens, key=lambda k: (isinstance(k, str), k)):
        item = itens[chave]
        corr = correcoes.get(str(chave)) or correcoes.get(item["qid"] or "")
        if corr:
            if "nome" in corr:
                item["apelidos"].setdefault(item["nome"])
                item["nome"] = corr["nome"]
            for a in corr.get("adicionar_apelidos", []):
                item["apelidos"].setdefault(a)
        nome = capitalizar(item["nome"].strip())
        if not nome:
            erros.append(f"{chave} ({item['qid']}) sem nome")
            continue
        if compacto(nome) in nomes_vistos:
            erros.append(f"nome repetido: {nome} ({chave}) e {nomes_vistos[compacto(nome)]}")
        nomes_vistos[compacto(nome)] = f"{nome} ({chave})"

        apelidos, vistos = [], {nome.lower()}
        for a in item["apelidos"]:
            a = a.strip()
            baixo = a.lower()
            if not a or baixo in vistos or baixo in remover:
                continue
            if any(baixo.startswith(p) for p in prefixos) or any(r.search(a) for r in regexes):
                continue
            if len(compacto(a)) <= 3:
                if curtos == "remover":
                    continue
                if curtos == "avisar":
                    curtos_vistos.append(f"{a} ({nome})")
            limite = receita.get("icf_palavra_comum", ICF_PALAVRA_COMUM)
            if lexico.get(compacto(a), 99.0) <= limite and compacto(a) != compacto(nome):
                comuns_vistos.append(f"{a} ({nome})")
            vistos.add(baixo)
            apelidos.append(a)
        apelidos.sort(key=lambda x: (len(x), x.lower()))

        for forma in [nome, *apelidos]:
            dono = dono_apelido.setdefault(compacto(forma), nome)
            if dono != nome:
                erros.append(f"'{forma}' serve para duas respostas: {dono} e {nome}")
        linhas.append(" | ".join([nome, *apelidos]))

    if curtos_vistos:
        avisos.append(f"{len(curtos_vistos)} apelidos curtos (até 3 letras): " + ", ".join(curtos_vistos))
    if comuns_vistos:
        avisos.append(f"{len(comuns_vistos)} apelidos que são palavra comum (podem casar sem querer): "
                      + ", ".join(comuns_vistos))
    if not lexico:
        avisos.append("léxico não encontrado; rode scripts/baixar_dados.sh para checar palavras comuns")
    if erros:
        raise ErroDeValidacao("\n  ".join(["receita não passou nas validações:", *erros]))
    return linhas, avisos


def gerar_texto(receita: dict, linhas: list[str]) -> str:
    cabecalho = [
        f"# titulo: {receita['titulo']}",
        f"# pergunta: {receita['pergunta']}",
        '# formato: uma resposta por linha; apelidos separados por " | "',
    ]
    return "\n".join(cabecalho + linhas) + "\n"


# ---------- linha de comando ----------


def importar(cat_id: str, offline: bool, conferir: bool, lexico: dict[str, float]) -> bool:
    receita = json.loads((FONTES / f"{cat_id}.json").read_text(encoding="utf-8"))
    bruto = BRUTOS / f"{cat_id}.json"
    if offline:
        if not bruto.exists():
            sys.exit(f"{cat_id}: sem consulta guardada em {bruto}; rode sem --offline")
        linhas_wd = json.loads(bruto.read_text(encoding="utf-8"))
    else:
        print(f"{cat_id}: consultando o Wikidata...")
        linhas_wd = consultar(montar_sparql(receita["wikidata"]))
        bruto.parent.mkdir(parents=True, exist_ok=True)
        bruto.write_text(json.dumps(linhas_wd, ensure_ascii=False) + "\n", encoding="utf-8")

    linhas, avisos = montar(agrupar(linhas_wd, receita), receita, lexico)
    for aviso in avisos:
        print(f"  aviso: {aviso}")
    texto = gerar_texto(receita, linhas)
    destino = CATEGORIAS / f"{cat_id}.txt"
    atual = destino.read_text(encoding="utf-8") if destino.exists() else ""
    if conferir:
        igual = texto == atual
        print(f"  {'idêntico' if igual else 'DIFERENTE'} de {destino.relative_to(RAIZ)}")
        if not igual:
            import difflib

            sys.stdout.writelines(difflib.unified_diff(atual.splitlines(True), texto.splitlines(True),
                                                       "atual", "gerado", n=0))
        return igual
    destino.write_text(texto, encoding="utf-8")
    print(f"  gravado {destino.relative_to(RAIZ)} com {len(linhas)} respostas"
          + ("" if texto == atual else " (mudou; revise o diff e rode o pontuar.py)"))
    return True


def main() -> None:
    p = argparse.ArgumentParser(description="Gera dados/categorias/<id>.txt a partir de dados/fontes/<id>.json")
    p.add_argument("ids", nargs="*", help="receitas a rodar (padrão: todas)")
    p.add_argument("--offline", action="store_true", help="usa a última consulta guardada em dados/brutos/fontes/")
    p.add_argument("--conferir", action="store_true", help="não grava; diz se o .txt gerado é igual ao atual")
    args = p.parse_args()
    ids = args.ids or [f.stem for f in sorted(FONTES.glob("*.json"))]
    lexico = ler_lexico()
    ok = True
    for cat_id in ids:
        try:
            ok = importar(cat_id, args.offline, args.conferir, lexico) and ok
        except ErroDeValidacao as erro:
            print(f"{cat_id}: {erro}")
            ok = False
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
