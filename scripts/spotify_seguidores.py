#!/usr/bin/env python3
"""Monta a categoria "artista com menos de N seguidores no Spotify".

Roda no computador de qualquer pessoa: só Python 3.9+ e internet.

    python spotify_seguidores.py CLIENT_ID CLIENT_SECRET

A chave é grátis: developer.spotify.com/dashboard -> Create app (qualquer nome,
Redirect URI http://127.0.0.1:8888, marque "Web API"). Copie o Client ID e o Client secret.

O que ele faz:
  1. Pega no Wikidata todos os artistas e bandas que têm ID do Spotify (P1902).
  2. Pergunta ao Spotify quantos seguidores cada um tem, de 50 em 50.
Grava tudo em nicho_spotify.json, na mesma pasta. Se cair, rode de novo: continua de onde parou.
No fim, mande o nicho_spotify.json para o Claude no chat do projeto.
"""
from __future__ import annotations

import base64
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

AGENTE = "NichoJogo/1.0 (https://github.com/pedro1ace/nichoojogo; jogo de palavras gratuito)"
SAIDA = Path(__file__).resolve().parent / "nicho_spotify.json"
# artistas com artigo em pelo menos uma Wikipédia (para vir gente que alguém pode lembrar)
SPARQL = """SELECT ?item ?spotify (SAMPLE(?rp) AS ?pt) (SAMPLE(?re) AS ?en) (SAMPLE(?l) AS ?links)
(GROUP_CONCAT(DISTINCT ?pais; separator="|") AS ?paises) WHERE {
  ?item wdt:P1902 ?spotify ; wikibase:sitelinks ?l . FILTER(?l >= %d && ?l < %d)
  OPTIONAL { ?item rdfs:label ?rp FILTER(LANG(?rp) = "pt") }
  OPTIONAL { ?item rdfs:label ?re FILTER(LANG(?re) = "en") }
  OPTIONAL { ?item wdt:P27|wdt:P495 ?p . ?p wdt:P297 ?pais . }
} GROUP BY ?item ?spotify"""


def pedir(url: str, cab: dict, dados: bytes | None = None) -> dict:
    for tentativa in range(8):
        try:
            req = urllib.request.Request(url, data=dados, headers={"User-Agent": AGENTE, **cab})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (400, 401, 403, 404):
                print(f"   erro {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")
                if e.code in (401, 403):
                    raise SystemExit("A chave do Spotify não foi aceita. Confira o Client ID e o Client secret.")
                return {}
            espera = int(e.headers.get("Retry-After") or 0) or min(60, 2 ** (tentativa + 2))
            print(f"   servidor respondeu {e.code}; esperando {espera}s...")
            time.sleep(espera)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            espera = min(60, 2 ** (tentativa + 2))
            print(f"   sem conexão ({e}); tentando de novo em {espera}s...")
            time.sleep(espera)
    return {}


def artistas_do_wikidata() -> list[dict]:
    saida, vistos = [], set()
    # em fatias por fama, para a consulta não estourar o tempo do Wikidata
    for minimo, maximo in ((40, 100000), (20, 40), (10, 20), (6, 10), (4, 6), (3, 4), (2, 3), (1, 2)):
        print(f"   Wikidata: artistas com artigo em {minimo} a {maximo - 1} Wikipédias...")
        url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode(
            {"query": SPARQL % (minimo, maximo), "format": "json"})
        r = pedir(url, {"Accept": "application/sparql-results+json"})
        for b in r.get("results", {}).get("bindings", []):
            sid = b["spotify"]["value"]
            if sid in vistos:
                continue
            vistos.add(sid)
            saida.append({
                "spotify": sid, "qid": b["item"]["value"].rsplit("/", 1)[-1],
                "nome": (b.get("pt") or b.get("en") or {}).get("value"),
                "sitelinks": int(b.get("links", {}).get("value", 0) or 0),
                "paises": [p for p in b.get("paises", {}).get("value", "").split("|") if p]})
        print(f"   {len(saida)} artistas até agora")
        time.sleep(5)
    return saida


def token(cid: str, segredo: str) -> str:
    chave = base64.b64encode(f"{cid}:{segredo}".encode()).decode()
    r = pedir("https://accounts.spotify.com/api/token",
              {"Authorization": f"Basic {chave}", "Content-Type": "application/x-www-form-urlencoded"},
              b"grant_type=client_credentials")
    if not r.get("access_token"):
        raise SystemExit("Não consegui entrar no Spotify com essa chave.")
    return r["access_token"]


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    cid, segredo = sys.argv[1], sys.argv[2]
    res = json.loads(SAIDA.read_text(encoding="utf-8")) if SAIDA.exists() else {}
    if not res.get("artistas"):
        print("1. Lista de artistas")
        res = {"artistas": artistas_do_wikidata(), "seguidores": {}}
        SAIDA.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
    print("2. Seguidores no Spotify")
    tk, desde = token(cid, segredo), time.time()
    falta = [a["spotify"] for a in res["artistas"] if a["spotify"] not in res["seguidores"]]
    for k in range(0, len(falta), 50):
        if time.time() - desde > 3000:  # o token vale 1 hora
            tk, desde = token(cid, segredo), time.time()
        lote = falta[k:k + 50]
        r = pedir("https://api.spotify.com/v1/artists?ids=" + ",".join(lote), {"Authorization": f"Bearer {tk}"})
        for a in r.get("artists") or []:
            if a:
                res["seguidores"][a["id"]] = {"nome": a.get("name"), "seguidores": (a.get("followers") or {}).get("total"),
                                              "popularidade": a.get("popularity"), "generos": a.get("genres", [])}
        for sid in lote:
            res["seguidores"].setdefault(sid, None)
        if (k // 50) % 20 == 19:
            SAIDA.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
            print(f"   {k + 50} de {len(falta)}")
        time.sleep(0.3)
    res["gerado_em"] = time.strftime("%Y-%m-%d %H:%M")
    SAIDA.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
    print(f"\nPronto! Mande este arquivo para o Claude no chat do projeto:\n   {SAIDA}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nParado. Rode de novo para continuar de onde parou.")
