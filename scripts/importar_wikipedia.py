#!/usr/bin/env python3
"""Junta às categorias as respostas que o completar_wikipedia.py achou.

Uso: python3 scripts/importar_wikipedia.py nicho_wikipedia.json

Para cada categoria configurada em ACEITAR, lê as candidatas (artigos da Wikipédia
em português vindos do Wikidata ou de categorias da Wikipédia), filtra o que não
é resposta (listas, pessoas numa categoria de instrumentos, temporadas de
campeonato...) e:
  - se a candidata é o mesmo artigo de uma resposta que já existe (a resposta da
    lista redireciona para esse artigo), os nomes dela viram apelidos;
  - senão, entra como resposta nova, com peso manual em dados/ajustes pela fama:
    sitelinks do Wikidata (em quantas Wikipédias o artigo existe) ou visitas.
Apelido que já pertence a outra resposta é ignorado, para não juntar coisas diferentes.

Também grava dados/sinais/wikipedia/<cat>.json com o que a lista atual tem na
Wikipédia (título do artigo e visitas), para o agente de fama usar.
"""
from __future__ import annotations

import csv
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from casar import compactar  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
CATEGORIAS = RAIZ / "dados" / "categorias"
AJUSTES = RAIZ / "dados" / "ajustes"
SINAIS = RAIZ / "dados" / "sinais" / "wikipedia"

CLUBE = re.compile(r"^(associação|clube|club|esporte|sport|sociedade|grêmio|gremio|atlético|atletico|"
                   r"américa|america|futebol|centro|esporte clube|nacional|operário|ferroviário|"
                   r"independente|rio branco|botafogo|são |santa |união|uniao|ríver|river)", re.I)
NAO_CLUBE = re.compile(r"campeonato|temporada|confrontos|estádio|arena|copa |torneio|lista|futebolista|"
                       r"\(futebolista|treinador|seleção|clássico|\d{4}", re.I)
DINO = re.compile(r"(saurus|raptor|ceratops|titan|venator|nykus|tyrannus|dromeus|pelta)$", re.I)
NAO_ANIMAL = re.compile(r"^(animais|lista|fauna|espécies|especies|biodiversidade|reserva|parque)|"
                        r"(saurus|saura|suchus|titan|raptor)$", re.I)
# catálogos que ninguém digita (HD 171978, 3XMM J2150...)
CATALOGO = re.compile(r"^(HD|HIP|HR|BD|TYC|2MASS|\dXMM|SAO|CD|GJ|WISE|PSR|LHS|LP|NGC|KOI|TOI|K2|CoRoT|OGLE)\b|"
                      r"^\(?\d+\)?\s+\d")
NAO_MARCA = re.compile(r"^grupo |\bbrasil\b|\bdo brasil\b", re.I)
# da categoria de raças só entram raças (o resto é cão famoso ou tipo genérico)
RACAS_DA_CATEGORIA = {
    "Alaunt", "Altdeutscher Schäferhund", "American Bandog", "Antigo pointer espanhol", "Cão-pastor-italiano",
    "English White terrier", "Mastim alpino", "Buldogue catahoula", "Sabujo cântabro", "Galgo da campanha",
    "Bandog", "Cockapoo", "Foodle", "Husky Alemão", "Lurcher", "Puggle", "Salsichuahua", "Texas Heeler",
    "Utonagan", "Blue Paul Terrier", "Bullenbeisser", "Cão de água St. John", "Tesem", "Kuchi (cão)",
    "Podengo-crioulo", "Mastim Americano", "Shih-poo", "Cane da presa", "Askal"}

# fonte aceita: "wikidata", "categoria" ou os dois; filtro opcional pelo título.
ACEITAR = {
    "racas-de-cachorro": ({"wikidata", "categoria"}, None),  # categoria filtrada em RACAS_DA_CATEGORIA
    "times-de-futebol": ({"wikidata", "categoria"}, lambda t: CLUBE.search(t) and not NAO_CLUBE.search(t)),
    "marcas-de-carro": ({"wikidata"}, lambda t: not NAO_MARCA.search(t)),
    "poetas-brasileiros": ({"wikidata", "categoria"}, None),
    "estrelas": ({"wikidata"}, lambda t: not CATALOGO.search(t)),
    "corpos-do-sistema-solar": ({"wikidata"}, lambda t: not CATALOGO.search(t)),
    "animais-do-brasil": ({"categoria"}, lambda t: not NAO_ANIMAL.search(t)),
    "dinossauros": ({"wikidata", "categoria"}, lambda t: " " not in t.strip() and DINO.search(t)),
}
# encurtar nome oficial de clube para um apelido que o jogador digitaria
PALAVRAS_CLUBE = re.compile(r"\b(associação|associacao|atlética|atletica|esporte|esportiva|esportivo|"
                            r"clube|club|futebol|football|foot ball|sport|sociedade|recreativa|recreativo|"
                            r"cultural|desportiva|desportivo|de regatas|regatas|ltda|s\.?a\.?f\.?|saf|ec|fc|ac|"
                            r"e|de|do|da|dos|das)\b", re.I)


def sem_parenteses(t: str) -> str:
    return re.sub(r"\s*\(.*?\)\s*", " ", t).strip()


def nome_e_apelidos(cid: str, c: dict) -> tuple[str, list[str]]:
    titulo = c["titulo"]
    base = sem_parenteses(c.get("rotulo") or titulo)
    apelidos = [sem_parenteses(titulo)] + [a for a in c.get("apelidos", []) if len(a) <= 40]
    if cid == "corpos-do-sistema-solar":
        m = re.match(r"^\(?(\d+)\)?\s+(.+)$", base)
        if m:  # "120347 Salácia" -> Salácia; "(55636) 2002 TX300" -> 2002 TX300
            apelidos.append(base)
            base = m.group(2)
    if cid == "times-de-futebol":
        curto = " ".join(PALAVRAS_CLUBE.sub(" ", base).split())
        if curto and curto.lower() != base.lower() and len(curto) >= 3:
            apelidos.append(curto)
    vistos, saida = {compactar(base)}, []
    for a in apelidos:
        k = compactar(a)
        if k and k not in vistos:
            vistos.add(k)
            saida.append(a)
    return base, saida


def peso_da_fama(c: dict) -> float:
    if c.get("sitelinks"):
        return round(max(60, min(95, 98 - 9 * math.log2(c["sitelinks"] + 1))), 2)
    if c.get("visitas_60d"):
        return round(max(55, min(95, 95 - 9 * math.log10(c["visitas_60d"] + 1))), 2)
    return 90.0


def ler(cid: str):
    linhas = (CATEGORIAS / f"{cid}.txt").read_text(encoding="utf-8").splitlines()
    cab = [l for l in linhas if l.startswith("#")]
    itens = [[n.strip() for n in l.split("|") if n.strip()] for l in linhas if l.strip() and not l.startswith("#")]
    return cab, itens


def importar(cid: str, dados: dict) -> tuple[int, int]:
    cab, itens = ler(cid)
    chave = {}
    for i, nomes in enumerate(itens):
        for n in nomes:
            chave.setdefault(compactar(n), i)
    # artigo da Wikipédia -> resposta existente (pelo que a conferência achou)
    por_artigo = {}
    for nome, m in dados["respostas"].items():
        if m.get("titulo") and not m.get("desambiguacao") and compactar(nome) in chave:
            por_artigo.setdefault(m["titulo"], chave[compactar(nome)])
    aj_path = AJUSTES / f"{cid}.csv"
    aj = list(csv.reader(aj_path.open(encoding="utf-8"))) if aj_path.exists() else [["resposta", "peso", "supernova"]]
    fontes, filtro = ACEITAR[cid]
    novas = apel = 0
    for c in dados["candidatas"]:
        if c.get("desambiguacao") or c["fonte"].split(":")[0] not in fontes:
            continue
        if ":" in c["titulo"] or c["titulo"].lower().startswith("lista"):
            continue
        if filtro and not (filtro(c["titulo"]) and filtro(c.get("rotulo") or c["titulo"])):
            continue
        if cid == "racas-de-cachorro" and c["fonte"].startswith("categoria") and c["titulo"] not in RACAS_DA_CATEGORIA:
            continue
        base, apelidos = nome_e_apelidos(cid, c)
        alvo = por_artigo.get(c["titulo"])
        if alvo is None:
            alvo = chave.get(compactar(base))
        if alvo is not None:  # mesma coisa que já existe: só apelidos
            for a in [base] + apelidos:
                k = compactar(a)
                if k not in chave:
                    itens[alvo].append(a)
                    chave[k] = alvo
                    apel += 1
            continue
        nomes = [base] + [a for a in apelidos if compactar(a) not in chave]
        itens.append(nomes)
        for n in nomes:
            chave[compactar(n)] = len(itens) - 1
        aj.append([base, f"{peso_da_fama(c):.2f}", ""])
        novas += 1
    (CATEGORIAS / f"{cid}.txt").write_text("\n".join(cab + [" | ".join(n) for n in itens]) + "\n", encoding="utf-8")
    with aj_path.open("w", encoding="utf-8", newline="") as f:
        csv.writer(f).writerows(aj)
    return novas, apel


def main() -> None:
    dados = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["categorias"]
    SINAIS.mkdir(parents=True, exist_ok=True)
    for cid, d in sorted(dados.items()):
        (SINAIS / f"{cid}.json").write_text(json.dumps(
            {"fonte": "scripts/completar_wikipedia.py", "respostas": d["respostas"]},
            ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        if cid in ACEITAR:
            novas, apel = importar(cid, d)
            print(f"{cid}: +{novas} respostas, +{apel} apelidos")


if __name__ == "__main__":
    main()
