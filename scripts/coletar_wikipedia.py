#!/usr/bin/env python3
"""Coleta respostas da Wikipédia PT pelos dumps públicos (sem API, sem limite de pedidos).

A API da Wikipédia e o Wikidata barram pedidos de servidor em lote; os dumps em
dumps.wikimedia.org não. Com eles dá para andar pelas categorias da Wikipédia PT (e subcategorias),
pegar os artigos e usar os redirecionamentos como apelidos ("Pelé" -> "Edson Arantes do Nascimento").

Passo 1, uma vez (uns 550 MB baixados e ~10 min montando o banco local, fora do git):
    python3 scripts/coletar_wikipedia.py --baixar
    python3 scripts/coletar_wikipedia.py --preparar

Passo 2, por categoria: a receita fica em dados/fontes/engordar/<cat>.wiki.json:
    {
      "categorias": ["Atores_do_Brasil", "Atrizes_do_Brasil"],   # raízes na Wikipédia PT
      "profundidade": 2,                     # quantos níveis de subcategoria descer
      "excluir_categorias": ["regex", ...],  # subcategorias que não descem (sem acento, minúsculas)
      "excluir_titulos": ["regex", ...],     # artigos que não entram (ex.: "^lista de")
      "min_tamanho": 3000,                   # tamanho mínimo do artigo em bytes (corta os esboços)
      "max": 3000,                           # no máximo tantas, das de artigo maior
      "apelidos": true,                      # redirecionamentos viram apelidos
      "so_categorias": ["regex", ...],       # (opcional) só descem subcategorias que casam
      "so_titulos": ["regex", ...],          # (opcional) só entram artigos que casam
      "excluir_de": ["Futebolistas_do_Brasil"],   # (opcional) tira quem também está nessas
      "tirar_prefixo": ["Bolo de "],         # (opcional) "Bolo de cenoura" vira "Cenoura" (o nome inteiro fica de apelido)
      "desambiguacoes": false,               # (opcional) aceita páginas de desambiguação
      "modo": "prenome" | "sobrenome",       # (opcional) em vez do título, a primeira/última palavra dos
                                             # artigos de gente, pelos nomes mais repetidos
      "outro_genero": [...], "min_repeticoes": 2   # (com modo prenome) categorias do outro gênero
    }
    python3 scripts/coletar_wikipedia.py atores-brasileiros     # grava dados/fontes/engordar/<cat>.wiki.txt
    python3 scripts/engordar.py atores-brasileiros              # põe na lista sem repetir
    python3 scripts/fama.py atores-brasileiros                  # refaz os pontos

O artigo maior vem primeiro: tamanho do artigo é um sinal grosseiro de fama.
"""
from __future__ import annotations

import argparse
import gzip
import json
import re
import sqlite3
import subprocess
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
BRUTOS = RAIZ / "dados" / "brutos" / "ptwiki"
BANCO = BRUTOS / "ptwiki.db"
FONTES = RAIZ / "dados" / "fontes" / "engordar"
TABELAS = ("page", "linktarget", "categorylinks", "redirect", "page_props")
AGENTE = "NichoBot/1.0 (https://github.com/pedro1ace/nichoojogo; open-source daily game)"

S = r"'((?:[^'\\]|\\.)*)'"  # string SQL
PADROES = {
    "page": re.compile(r"\((\d+),(0|14)," + S + r",([01]),[01],[^,]+,'[^']*',(?:'[^']*'|NULL),\d+,(\d+),"),
    "linktarget": re.compile(r"\((\d+),14," + S + r"\)"),
    "categorylinks": re.compile(r"\((\d+)," + S + r",'[^']*'," + S + r",'(page|subcat)',\d+,(\d+)\)"),
    "redirect": re.compile(r"\((\d+),0," + S + r","),
    "page_props": re.compile(r"\((\d+),'(wikibase_item|disambiguation)'," + S),
}


# Subcategorias que nunca descem (manutenção, listas, arte sobre o tema, ficção...) e artigos que não
# são resposta (listas, anos, temporadas). Comparação sem acento e em minúsculas.
EXCLUIR_CATEGORIAS = [
    r"^!", r"imagens", r"predefinic", r"^listas", r"lista de", r"porn", r"nas artes", r"em filmes", r"na cultura",
    r"ficticio", r"famosos", r"por ano", r"anatomia", r"ecologia", r"\bsaude\b", r"reproducao", r" e humanos",
    r"esbocos", r"artigos", r"wikipedia", r"premios", r"premiados", r"vencedores", r"historia d", r"temporadas",
    r"episodios", r"trilhas sonoras", r"albuns", r"discografia", r"canais de", r"empresas de", r"organizacoes",
]
EXCLUIR_TITULOS = [r"^lista", r"^\d{4}\b", r"\btemporada\b", r"^historia d", r"\bem \d{4}$", r"^anexo"]


def des(t: str) -> str:
    return re.sub(r"\\(.)", r"\1", t)


def baixar() -> None:
    BRUTOS.mkdir(parents=True, exist_ok=True)
    for t in TABELAS:
        url = f"https://dumps.wikimedia.org/ptwiki/latest/ptwiki-latest-{t}.sql.gz"
        print("baixando", url)
        subprocess.run(["curl", "-sS", "-A", AGENTE, "-o", str(BRUTOS / f"ptwiki-latest-{t}.sql.gz"), url], check=True)


def linhas_insert(t: str):
    with gzip.open(BRUTOS / f"ptwiki-latest-{t}.sql.gz", "rt", encoding="utf-8", errors="replace") as f:
        # o dump novo põe uma tupla por linha; juntamos em blocos para o regex andar rápido
        bloco = []
        for linha in f:
            if linha.startswith("(") or linha.startswith("INSERT INTO"):
                bloco.append(linha)
                if len(bloco) >= 50000:
                    yield "".join(bloco)
                    bloco = []
        if bloco:
            yield "".join(bloco)


def preparar() -> None:
    if BANCO.exists():
        BANCO.unlink()
    db = sqlite3.connect(BANCO)
    db.executescript("""
        CREATE TABLE page (id INTEGER PRIMARY KEY, ns INT, titulo TEXT, redir INT, tam INT);
        CREATE TABLE lt (id INTEGER PRIMARY KEY, titulo TEXT);
        CREATE TABLE cl (de INT, alvo INT, tipo TEXT);
        CREATE TABLE redir (de INT, titulo TEXT);
        CREATE TABLE props (pagina INT, nome TEXT, valor TEXT);
    """)
    for t in TABELAS:
        pad, n = PADROES[t], 0
        for linha in linhas_insert(t):
            achados = pad.findall(linha)
            if t == "page":
                db.executemany("INSERT INTO page VALUES (?,?,?,?,?)",
                               [(int(a), int(b), des(c), int(d), int(e)) for a, b, c, d, e in achados])
            elif t == "linktarget":
                db.executemany("INSERT INTO lt VALUES (?,?)", [(int(a), des(b)) for a, b in achados])
            elif t == "categorylinks":
                db.executemany("INSERT INTO cl VALUES (?,?,?)", [(int(a), int(e), d) for a, _, _, d, e in achados])
            elif t == "redirect":
                db.executemany("INSERT INTO redir VALUES (?,?)", [(int(a), des(b)) for a, b in achados])
            else:
                db.executemany("INSERT INTO props VALUES (?,?,?)", [(int(a), b, des(c)) for a, b, c in achados])
            n += len(achados)
        print(f"{t}: {n} linhas")
        db.commit()
    db.executescript("""
        CREATE INDEX page_t ON page(ns, titulo);
        CREATE INDEX lt_t ON lt(titulo);
        CREATE INDEX cl_alvo ON cl(alvo);
        CREATE INDEX redir_t ON redir(titulo);
        CREATE INDEX props_p ON props(pagina);
    """)
    db.commit()


def sem_acento(t: str) -> str:
    t = unicodedata.normalize("NFD", t.lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn").replace("_", " ")


def paginas_de(db: sqlite3.Connection, raizes: list[str], prof: int, excl_cat: list, so_cat: list) -> tuple[set[int], int]:
    """Artigos das categorias e das subcategorias até `prof` níveis."""
    vistas: set[str] = set()
    fronteira = [c.replace(" ", "_") for c in raizes]
    paginas: set[int] = set()
    for nivel in range(prof + 1):
        prox = []
        for cat in fronteira:
            if cat in vistas:
                continue
            vistas.add(cat)
            for de, tipo in db.execute("SELECT cl.de, cl.tipo FROM lt JOIN cl ON cl.alvo = lt.id WHERE lt.titulo = ?", (cat,)):
                if tipo == "page":
                    paginas.add(de)
                elif nivel < prof:
                    r = db.execute("SELECT titulo FROM page WHERE id = ? AND ns = 14", (de,)).fetchone()
                    if not r:
                        continue
                    t = sem_acento(r[0])
                    if any(p.search(t) for p in excl_cat) or (so_cat and not any(p.search(t) for p in so_cat)):
                        continue
                    prox.append(r[0])
        fronteira = prox
    return paginas, len(vistas)


# Pedaços de nome de gente que não são prenome nem sobrenome
NAO_NOME = {"junior", "júnior", "filho", "neto", "sobrinho", "jr", "jr.", "segundo", "terceiro", "ii", "iii", "da", "de",
            "do", "das", "dos", "e", "von", "van", "der", "del", "la", "le", "mc", "mac", "sao", "são", "santa", "santo",
            "dom", "dona", "padre", "frei", "irmã", "irmao", "mestre", "doutor", "dr", "dr.", "mc"}


def coletar_nomes(db, receita, cat_id, excl_cat, so_cat) -> list[str]:
    """Prenomes (primeira palavra) ou sobrenomes (última) dos artigos de gente, pelos mais repetidos."""
    modo = receita["modo"]
    contagem: dict[str, int] = {}
    outro: dict[str, int] = {}
    paginas, _ = paginas_de(db, receita["categorias"], receita.get("profundidade", 1), excl_cat, so_cat)
    paginas_outro, _ = paginas_de(db, receita.get("outro_genero", []), receita.get("profundidade", 1), excl_cat, so_cat) \
        if receita.get("outro_genero") else (set(), 0)

    def palavra(pid: int) -> str | None:
        r = db.execute("SELECT titulo FROM page WHERE id = ? AND ns = 0 AND redir = 0", (pid,)).fetchone()
        if not r:
            return None
        partes = [p for p in re.sub(r"\s*\([^)]*\)$", "", r[0].replace("_", " ")).split() if p.lower() not in NAO_NOME]
        if len(partes) < 2:
            return None
        p = partes[0] if modo == "prenome" else partes[-1]
        if not re.fullmatch(r"[A-ZÁÉÍÓÚÂÊÔÃÕÇÜ][a-záéíóúâêôãõçüàèìòùñ'-]{2,}", p):
            return None
        return p

    for pid in paginas:
        p = palavra(pid)
        if p:
            contagem[p] = contagem.get(p, 0) + 1
    for pid in paginas_outro:
        p = palavra(pid)
        if p:
            outro[p] = outro.get(p, 0) + 1
    minimo = receita.get("min_repeticoes", 2)
    fora = set(receita.get("excluir_nomes", []))
    nomes = [n for n, c in contagem.items() if c >= minimo and c >= 3 * outro.get(n, 0) and n not in fora]
    nomes.sort(key=lambda n: -contagem[n])
    return nomes[: receita.get("max", 100000)]


def coletar(cat_id: str) -> int:
    receita = json.loads((FONTES / f"{cat_id}.wiki.json").read_text(encoding="utf-8"))
    db = sqlite3.connect(BANCO)
    excl_cat = [re.compile(p) for p in EXCLUIR_CATEGORIAS + receita.get("excluir_categorias", [])]
    excl_tit = [re.compile(p) for p in EXCLUIR_TITULOS + receita.get("excluir_titulos", [])]
    so_cat = [re.compile(p) for p in receita.get("so_categorias", [])]
    so_tit = [re.compile(p) for p in receita.get("so_titulos", [])]
    cabeca = f"# gerado por scripts/coletar_wikipedia.py a partir de {cat_id}.wiki.json; não edite à mão"
    if receita.get("modo") in ("prenome", "sobrenome"):
        nomes = coletar_nomes(db, receita, cat_id, excl_cat, so_cat)
        (FONTES / f"{cat_id}.wiki.txt").write_text("\n".join([cabeca, *nomes]) + "\n", encoding="utf-8")
        print(f"{cat_id}: {len(nomes)} nomes")
        return len(nomes)
    paginas, n_cats = paginas_de(db, receita["categorias"], receita.get("profundidade", 1), excl_cat, so_cat)
    if receita.get("excluir_de"):
        fora, _ = paginas_de(db, receita["excluir_de"], receita.get("profundidade_excluir", 2), excl_cat, [])
        paginas -= fora
    desamb = set() if receita.get("desambiguacoes") else \
        {p for (p,) in db.execute("SELECT pagina FROM props WHERE nome = 'disambiguation'")}
    itens = []
    for pid in paginas:
        r = db.execute("SELECT titulo, tam FROM page WHERE id = ? AND ns = 0 AND redir = 0", (pid,)).fetchone()
        if not r or pid in desamb:
            continue
        titulo, tam = r[0].replace("_", " "), r[1]
        if tam < receita.get("min_tamanho", 0) or any(p.search(sem_acento(titulo)) for p in excl_tit):
            continue
        if so_tit and not any(p.search(sem_acento(titulo)) for p in so_tit):
            continue
        itens.append((tam, pid, titulo))
    itens.sort(reverse=True)
    itens = itens[: receita.get("max", 100000)]
    prefixos = receita.get("tirar_prefixo", [])
    saida = [cabeca]
    for tam, pid, titulo in itens:
        nome = re.sub(r"\s*\([^)]*\)$", "", titulo).strip()
        apelidos = [titulo] if nome != titulo else []
        if receita.get("apelidos", True):
            for (rt,) in db.execute("SELECT p.titulo FROM redir r JOIN page p ON p.id = r.de WHERE r.titulo = ? AND p.ns = 0",
                                    (titulo.replace(" ", "_"),)):
                rt = re.sub(r"\s*\([^)]*\)$", "", rt.replace("_", " ")).strip()
                # redirecionamento que é frase, código ou data não serve de apelido
                if 2 < len(rt) <= 40 and not re.search(r"[0-9:/]", rt):
                    apelidos.append(rt)
        for pre in prefixos:
            if nome.lower().startswith(pre.lower()) and len(nome) - len(pre) >= 3:
                apelidos.insert(0, nome)
                nome = nome[len(pre):].strip()
                nome = nome[0].upper() + nome[1:]
                break
        apelidos = [a for a in dict.fromkeys(apelidos) if a.lower() != nome.lower()]
        saida.append(" | ".join([nome, *apelidos]))
    (FONTES / f"{cat_id}.wiki.txt").write_text("\n".join(saida) + "\n", encoding="utf-8")
    print(f"{cat_id}: {n_cats} categorias da Wikipédia, {len(itens)} artigos")
    return len(itens)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("categorias", nargs="*")
    ap.add_argument("--baixar", action="store_true")
    ap.add_argument("--preparar", action="store_true")
    args = ap.parse_args()
    if args.baixar:
        baixar()
    if args.preparar:
        preparar()
    cats = args.categorias or ([] if (args.baixar or args.preparar) else
                               sorted(p.name[: -len(".wiki.json")] for p in FONTES.glob("*.wiki.json")))
    for c in cats:
        coletar(c)


if __name__ == "__main__":
    main()
