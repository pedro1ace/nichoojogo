#!/usr/bin/env python3
"""Prepara o jogo para abrir com dois cliques, sem servidor.

Uso: python3 scripts/montar_jogo.py   (o pontuar.py já chama no fim)

Gera:
    jogo/dados.js   as perguntas de dados/pesos/ num arquivo JS (o navegador
                    não deixa uma página aberta do computador ler arquivos JSON)
    jogar.html      o jogo inteiro num arquivo só: estilo, código e perguntas.
                    Dá para mandar esse arquivo para alguém e abrir direto.
"""
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PESOS = RAIZ / "dados" / "pesos"
JOGO = RAIZ / "jogo"


def gerar_dados_js() -> str:
    indice = json.loads((PESOS / "indice.json").read_text(encoding="utf-8"))
    categorias = {
        c["id"]: json.loads((PESOS / f"{c['id']}.json").read_text(encoding="utf-8")) for c in indice
    }
    dados = json.dumps({"indice": indice, "categorias": categorias}, ensure_ascii=False, separators=(",", ":"))
    return "// Gerado por scripts/montar_jogo.py. Não edite à mão.\nwindow.NICHO_DADOS = " + dados + ";\n"


def main() -> None:
    dados_js = gerar_dados_js()
    (JOGO / "dados.js").write_text(dados_js, encoding="utf-8")

    html = (JOGO / "index.html").read_text(encoding="utf-8")
    css = (JOGO / "estilo.css").read_text(encoding="utf-8")
    # embute todo <script src="..."> de jogo/index.html, na mesma ordem
    nomes = re.findall(r'<script src="([^"]+)"></script>', html)
    scripts = {n: dados_js if n == "dados.js" else (JOGO / n).read_text(encoding="utf-8") for n in nomes}
    html = html.replace('<link rel="stylesheet" href="estilo.css">', "<style>\n" + css + "</style>")
    acentos = (JOGO / "fonte-acentos.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="fonte-acentos.css">', "<style>\n" + acentos + "</style>")
    for nome, codigo in scripts.items():
        marca = f'<script src="{nome}"></script>'
        assert marca in html, f"faltou {marca} em jogo/index.html"
        html = html.replace(marca, "<script>\n" + codigo.replace("</script", "<\\/script") + "</script>")
    (RAIZ / "jogar.html").write_text(html, encoding="utf-8")
    print("jogo/dados.js e jogar.html atualizados")


if __name__ == "__main__":
    main()
