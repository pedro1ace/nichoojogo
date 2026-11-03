#!/usr/bin/env python3
"""Expande categorias do Nicho com Wikidata e redirecionamentos da Wikipédia PT.

Capacidades:
  1. Enriquecimento de apelidos (--apelidos <cat>):
     - Consulta a API da Wikipédia PT (redirects) e Wikidata (skos:altLabel)
     - Validação semântica por descrição de entidade (evita falsos positivos como 'Terra da garoa')
     - Checagem estrita de colisão usando fama.chaves() antes de inserir
  2. Coleta de novas entidades (--coletar <categoria_wiki> <cat_id>):
     - Extrai membros de categorias da Wikipédia PT (ex.: Clubes_de_futebol_do_Brasil)
     - Remove itens duplicados ou já existentes

Uso:
    python3 scripts/expandir_fontes.py --apelidos paises
    python3 scripts/expandir_fontes.py --apelidos racas-de-cachorro --aplicar
    python3 scripts/expandir_fontes.py --coletar "Clubes_de_futebol_do_Brasil" times-de-futebol
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
import fama  # noqa: E402
from pontuar import normalizar  # noqa: E402

CATEGORIAS = RAIZ / "dados" / "categorias"

HEADERS = {
    "User-Agent": "NichoJogoBot/2.0 (https://nichoojogo.com; bot@nichoojogo.com)"
}
API_WIKI = "https://pt.wikipedia.org/w/api.php"
API_WIKIDATA = "https://www.wikidata.org/w/api.php"

# Palavras-chave exigidas na descrição da entidade do Wikidata para evitar ambiguidades
PALAVRAS_CHAVE_SEMANTICAS: dict[str, set[str]] = {
    "times-de-futebol": {"clube", "futebol", "time", "esporte", "agremiação", "equipe", "fc", "ec"},
    "racas-de-cachorro": {"cão", "cachorro", "raça", "canino", "canis"},
    "paises": {"país", "estado soberano", "nação", "república", "reino", "principado"},
    "paises-acima-do-equador": {"país", "estado soberano", "nação", "república"},
    "capitais-do-mundo": {"capital", "cidade", "município", "sede"},
    "capitais-do-brasil": {"capital", "cidade", "município"},
    "cidades-do-brasil": {"cidade", "município", "distrito"},
    "cidades-do-mundo": {"cidade", "município", "comuna", "distrito", "aglomeração"},
    "elementos-quimicos": {"elemento químico", "químico", "átomo", "isótopo"},
    "constelacoes": {"constelação", "astronomia", "estrela"},
    "corpos-do-sistema-solar": {"planeta", "lua", "satélite natural", "asteroide", "cometa", "corpo celeste"},
    "aves": {"ave", "pássaro", "passeriforme", "espécie"},
    "animais-do-brasil": {"animal", "espécie", "mamífero", "ave", "réptil", "anfíbio", "peixe", "inseto"},
}

PADRAO_SUBARTIGO = re.compile(
    r"^(geografia|subdivisões|subdivisoes|vilaietes|províncias|provincias|distritos|cidades|lista de|brasão|brasao|emblema|bandeira|hino|mote|lema|fauna|flora|educação|educacao|saúde|saude|transportes|fronteiras|história|historia|política|politica|economia|cultura|música|musica|línguas|linguas|religião|religiao|islamismo|cristianismo|judaísmo|turismo|comunicações|comunicacoes|governo|eleições|eleicoes|forças armadas|forcas armadas|constituição|constituicao|clima|geologia|esporte|futebol|cinema|literatura|arquitetura|gastronomia|culinária|culinaria|demografia|feriados)\b",
    re.IGNORECASE,
)

TERMOS_PROIBIDOS = {
    "puta", "caralho", "fodase", "porra", "merda", "cu", "buceta", "piroca",
    "sexo", "pornografia", "drogas", "cocaína", "maconha", "heroína"
}


def eh_apelido_valido(ap: str, titulo_original: str = "") -> bool:
    ap_lower = ap.lower()
    if len(ap) < 2 or len(ap) > 55:
        return False
    if "/" in ap or ":" in ap or "\\" in ap:
        return False
    # Apenas caracteres latinos, acentos e pontuações comuns
    if not re.match(r"^[A-Za-z0-9À-ÖØ-öø-ÿ\s\-\.\,\'\(\)]+$", ap):
        return False
    if any(p in ap_lower for p in TERMOS_PROIBIDOS):
        return False
    if PADRAO_SUBARTIGO.search(ap_lower):
        return False
    if any(ap_lower.startswith(prefix) for prefix in ("wikipédia:", "ficheiro:", "ajuda:", "categoria:", "portal:", "predefinição:", "usuário", "usuária")):
        return False
    if "desambiguação" in ap_lower:
        return False
    return True


def buscar_wikidata_lote(titulos: list[str]) -> dict[str, dict]:
    """Consulta Wikidata por títulos da ptwiki e retorna {titulo_wiki: {desc, aliases, qid}}."""
    if not titulos:
        return {}
    params = {
        "action": "wbgetentities",
        "sites": "ptwiki",
        "titles": "|".join(titulos),
        "props": "labels|aliases|descriptions|sitelinks",
        "languages": "pt|pt-br",
        "format": "json",
    }
    url = f"{API_WIKIDATA}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=HEADERS)
    resultado = {}
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for qid, entity in data.get("entities", {}).items():
            if qid.startswith("-"):
                continue
            sitelinks = entity.get("sitelinks", {})
            ptwiki_title = sitelinks.get("ptwiki", {}).get("title")
            desc = (entity.get("descriptions", {}).get("pt-br", {}).get("value") or
                    entity.get("descriptions", {}).get("pt", {}).get("value") or "")
            raw_aliases = entity.get("aliases", {}).get("pt-br", []) + entity.get("aliases", {}).get("pt", [])
            aliases = list({a["value"].strip() for a in raw_aliases if a.get("value")})
            item_data = {"qid": qid, "desc": desc.lower(), "aliases": aliases}
            if ptwiki_title:
                resultado[ptwiki_title] = item_data
    except Exception as e:
        print(f"  [wikidata erro] {e}", file=sys.stderr)
    return resultado


def buscar_wikipedia_redirects_lote(titulos: list[str]) -> dict[str, list[str]]:
    """Consulta redirects da Wikipédia PT para um lote de títulos."""
    if not titulos:
        return {}
    params = {
        "action": "query",
        "titles": "|".join(titulos),
        "prop": "redirects",
        "rdlimit": "max",
        "format": "json",
    }
    url = f"{API_WIKI}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=HEADERS)
    resultado = {}
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        pages = data.get("query", {}).get("pages", {})
        for _, pdata in pages.items():
            title = pdata.get("title")
            if not title:
                continue
            rds = [r["title"] for r in pdata.get("redirects", []) if "title" in r]
            limpos = []
            for rd in rds:
                limpo = re.sub(r"\s*\([^)]+\)$", "", rd).strip()
                if limpo and eh_apelido_valido(limpo):
                    limpos.append(limpo)
            if limpos:
                resultado[title] = limpos
    except Exception as e:
        print(f"  [wikipedia erro] {e}", file=sys.stderr)
    return resultado


def enriquecer_apelidos(cat_id: str, aplicar: bool = False) -> int:
    """Enriquece uma categoria com apelidos do Wikidata e redirects da Wikipédia PT."""
    arq = CATEGORIAS / f"{cat_id}.txt"
    if not arq.exists():
        print(f"Erro: Categoria {cat_id} não existe em {CATEGORIAS}")
        return 0

    linhas_originais = arq.read_text(encoding="utf-8").splitlines()
    itens: list[dict] = []
    
    # Mapeamento chave -> índice do item para detecção de colisão rápida
    chave_para_indice: dict[str, int] = {}

    for idx, l in enumerate(linhas_originais):
        s = l.strip()
        if not s or s.startswith("#"):
            itens.append({"comentario": l})
            continue
        partes = [p.strip() for p in s.split("|") if p.strip()]
        principal = partes[0]
        apelidos = partes[1:]
        itens.append({
            "principal": principal,
            "apelidos": apelidos,
            "chaves": set()
        })
        item_idx = len(itens) - 1
        for termo in [principal, *apelidos]:
            for ch in fama.chaves(termo, cat_id):
                chave_para_indice[ch] = item_idx
                itens[-1]["chaves"].add(ch)

    itens_validos = [it for it in itens if "principal" in it]
    print(f"[{cat_id}] Processando {len(itens_validos)} respostas com Wikidata & Wikipédia PT...")

    palavras_chave = PALAVRAS_CHAVE_SEMANTICAS.get(cat_id)
    total_novos = 0
    titulos_consulta = [it["principal"] for it in itens_validos]
    
    # Processa em lotes de 40
    tamanho_lote = 40
    for i in range(0, len(titulos_consulta), tamanho_lote):
        lote = titulos_consulta[i:i + tamanho_lote]
        wiki_res = buscar_wikipedia_redirects_lote(lote)
        wikidata_res = buscar_wikidata_lote(lote)
        time.sleep(0.1)

        for titulo in lote:
            # Encontra o item correspondente
            item = next((it for it in itens_validos if it["principal"] == titulo), None)
            if not item:
                continue

            candidatos: list[str] = []

            # 1. Candidatos do Wikidata (se passar no filtro semântico)
            wdata = wikidata_res.get(titulo)
            if wdata:
                desc = wdata["desc"]
                if palavras_chave is None or any(pk in desc for pk in palavras_chave):
                    candidatos.extend(wdata["aliases"])

            # 2. Candidatos dos redirects da Wikipédia PT
            if titulo in wiki_res:
                # Se houver filtro semântico e tivermos checado wikidata, só aceita se o título for compatível
                if palavras_chave is None or (wdata and any(pk in wdata["desc"] for pk in palavras_chave)):
                    candidatos.extend(wiki_res[titulo])
                elif not palavras_chave:
                    candidatos.extend(wiki_res[titulo])

            # Avalia cada candidato contra colisão
            item_idx = itens.index(item)
            for cand in candidatos:
                if not eh_apelido_valido(cand):
                    continue
                # Já é um dos apelidos atuais?
                if cand.lower() in [a.lower() for a in [item["principal"], *item["apelidos"]]]:
                    continue
                
                chaves_cand = fama.chaves(cand, cat_id)
                if not chaves_cand:
                    continue

                # Colide com chaves de OUTRO item?
                colide = False
                for ch in chaves_cand:
                    if ch in chave_para_indice and chave_para_indice[ch] != item_idx:
                        colide = True
                        break
                
                if not colide:
                    # Seguro para adicionar!
                    item["apelidos"].append(cand)
                    for ch in chaves_cand:
                        chave_para_indice[ch] = item_idx
                        item["chaves"].add(ch)
                    total_novos += 1

    print(f"[{cat_id}] Total de apelidos seguros encontrados: {total_novos}")

    if aplicar and total_novos > 0:
        novas_linhas = []
        for it in itens:
            if "comentario" in it:
                novas_linhas.append(it["comentario"])
            else:
                linha = " | ".join([it["principal"], *it["apelidos"]])
                novas_linhas.append(linha)
        arq.write_text("\n".join(novas_linhas) + "\n", encoding="utf-8")
        print(f"[{cat_id}] Arquivo atualizado com sucesso!")
    elif not aplicar:
        print(f"[{cat_id}] Modo de simulação (dry-run). Passe --aplicar para salvar.")

    return total_novos


def coletar_categoria_wiki(cat_wiki: str, limite: int = 500) -> list[str]:
    """Coleta páginas pertencentes a uma categoria da Wikipédia PT."""
    titulo_cat = cat_wiki if cat_wiki.startswith("Categoria:") else f"Categoria:{cat_wiki}"
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": titulo_cat,
        "cmlimit": str(limite),
        "cmnamespace": "0",  # apenas artigos principais
        "format": "json",
    }
    url = f"{API_WIKI}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=HEADERS)
    membros = []
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for item in data.get("query", {}).get("categorymembers", []):
            titulo = item.get("title")
            if titulo:
                # Remove sufixos como " (futebol)" ou " (clube)"
                limpo = re.sub(r"\s*\([^)]+\)$", "", titulo).strip()
                if eh_apelido_valido(limpo):
                    membros.append(limpo)
    except Exception as e:
        print(f"Erro ao coletar categoria {cat_wiki}: {e}")
    return membros


def main():
    parser = argparse.ArgumentParser(description="Expansão massiva de fontes para o Nicho (Wikidata + Wikipédia PT)")
    parser.add_argument("--apelidos", help="ID da categoria para enriquecer apelidos (ex: paises)")
    parser.add_argument("--aplicar", action="store_true", help="Salva alterações diretamente no arquivo da categoria")
    parser.add_argument("--coletar", help="Nome da categoria Wikipédia (ex: Clubes_de_futebol_do_Brasil)")
    parser.add_argument("--destino", help="ID da categoria destino para --coletar")
    args = parser.parse_args()

    if args.apelidos:
        enriquecer_apelidos(args.apelidos, aplicar=args.aplicar)
    elif args.coletar:
        if not args.destino:
            print("Informe --destino <cat_id>")
            return
        membros = coletar_categoria_wiki(args.coletar)
        print(f"Encontrados {len(membros)} membros em {args.coletar}.")
        # Poderia ser adicionado na lista se solicitado
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
