#!/usr/bin/env python3
"""Monta a categoria "artista com poucos ouvintes" pelo Last.fm.

Roda no computador de qualquer pessoa: só Python 3.9+ e internet.

    python lastfm_ouvintes.py SUA_API_KEY

A chave é grátis e sai na hora: entre (ou crie conta) em last.fm, abra
https://www.last.fm/api/account/create, preencha só o nome do app (ex.: Nicho) e
copie a "API key".

O que ele faz:
  1. Pega no Wikidata os artistas e bandas que têm ID no MusicBrainz (o mesmo do Last.fm).
  2. Pergunta ao Last.fm quantos ouvintes cada um tem.
Grava tudo em nicho_lastfm.json, na mesma pasta. Se cair ou você fechar, rode de novo:
continua de onde parou (pode parar no meio e mandar o arquivo assim mesmo).
No fim, mande o nicho_lastfm.json para o Claude no chat do projeto.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

AGENTE = "NichoJogo/1.0 (https://github.com/pedro1ace/nichoojogo; jogo de palavras gratuito)"
SAIDA = Path(__file__).resolve().parent / "nicho_lastfm.json"
PAUSA = 0.25  # o Last.fm pede no máximo uns 5 pedidos por segundo
# artistas com artigo em algumas Wikipédias: vem gente que alguém pode lembrar, sem virar milhões
SPARQL = """SELECT ?item ?mbid (SAMPLE(?rp) AS ?pt) (SAMPLE(?re) AS ?en) (SAMPLE(?l) AS ?links)
(GROUP_CONCAT(DISTINCT ?pais; separator="|") AS ?paises) WHERE {
  ?item wdt:P434 ?mbid ; wikibase:sitelinks ?l . FILTER(?l >= %d && ?l < %d)
  OPTIONAL { ?item rdfs:label ?rp FILTER(LANG(?rp) = "pt") }
  OPTIONAL { ?item rdfs:label ?re FILTER(LANG(?re) = "en") }
  OPTIONAL { ?item wdt:P27|wdt:P495 ?p . ?p wdt:P297 ?pais . }
} GROUP BY ?item ?mbid"""
FATIAS = ((40, 100000), (20, 40), (12, 20), (8, 12), (6, 8), (5, 6), (4, 5), (3, 4))


def pedir(url: str, cab: dict | None = None) -> dict:
    for tentativa in range(8):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": AGENTE, **(cab or {})})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            corpo = e.read().decode("utf-8", "replace")
            if e.code in (400, 403, 404):
                if '"error":10' in corpo.replace(" ", "") or '"error":26' in corpo.replace(" ", ""):
                    raise SystemExit("A API key do Last.fm não foi aceita. Confira se copiou a 'API key' certa.")
                return {"erro": e.code}
            espera = int(e.headers.get("Retry-After") or 0) or min(60, 2 ** (tentativa + 2))
            print(f"   servidor respondeu {e.code}; esperando {espera}s...")
            time.sleep(espera)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            espera = min(60, 2 ** (tentativa + 2))
            print(f"   sem conexão ({e}); tentando de novo em {espera}s...")
            time.sleep(espera)
        except json.JSONDecodeError:
            time.sleep(3)
    return {}


def artistas_do_wikidata() -> list[dict]:
    saida, vistos = [], set()
    for minimo, maximo in FATIAS:
        print(f"   Wikidata: artistas com artigo em {minimo} a {maximo - 1} Wikipédias...")
        url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode(
            {"query": SPARQL % (minimo, maximo), "format": "json"})
        r = pedir(url, {"Accept": "application/sparql-results+json"})
        for b in r.get("results", {}).get("bindings", []):
            mbid = b["mbid"]["value"]
            if mbid in vistos:
                continue
            vistos.add(mbid)
            saida.append({
                "mbid": mbid, "qid": b["item"]["value"].rsplit("/", 1)[-1],
                "nome": (b.get("pt") or b.get("en") or {}).get("value"),
                "sitelinks": int(b.get("links", {}).get("value", 0) or 0),
                "paises": [p for p in b.get("paises", {}).get("value", "").split("|") if p]})
        print(f"   {len(saida)} artistas até agora")
        time.sleep(5)
    return saida


def ouvintes(chave: str, a: dict) -> dict | None:
    base = {"method": "artist.getinfo", "api_key": chave, "format": "json", "autocorrect": "0"}
    r = pedir("https://ws.audioscrobbler.com/2.0/?" + urllib.parse.urlencode({**base, "mbid": a["mbid"]}))
    if not r.get("artist") and a.get("nome"):  # o Last.fm nem sempre conhece o MBID: tenta pelo nome
        time.sleep(PAUSA)
        r = pedir("https://ws.audioscrobbler.com/2.0/?" + urllib.parse.urlencode({**base, "artist": a["nome"]}))
    art = r.get("artist")
    if not art:
        return None
    st = art.get("stats") or {}
    return {"nome": art.get("name"), "ouvintes": int(st.get("listeners") or 0),
            "plays": int(st.get("playcount") or 0),
            "tags": [t["name"] for t in (art.get("tags") or {}).get("tag", []) if isinstance(t, dict)]}


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    chave = sys.argv[1]
    res = json.loads(SAIDA.read_text(encoding="utf-8")) if SAIDA.exists() else {}
    if not res.get("artistas"):
        print("1. Lista de artistas")
        res = {"artistas": artistas_do_wikidata(), "ouvintes": {}}
        SAIDA.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
    falta = [a for a in res["artistas"] if a["mbid"] not in res["ouvintes"]]
    print(f"2. Ouvintes no Last.fm: faltam {len(falta)} artistas (uns {len(falta) * PAUSA * 1.3 / 60:.0f} min)")
    for k, a in enumerate(falta, 1):
        res["ouvintes"][a["mbid"]] = ouvintes(chave, a)
        time.sleep(PAUSA)
        if k % 200 == 0:
            res["gerado_em"] = time.strftime("%Y-%m-%d %H:%M")
            SAIDA.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
            print(f"   {k} de {len(falta)}")
    res["gerado_em"] = time.strftime("%Y-%m-%d %H:%M")
    SAIDA.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
    print(f"\nPronto! Mande este arquivo para o Claude no chat do projeto:\n   {SAIDA}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nParado. Rode de novo para continuar de onde parou.")
