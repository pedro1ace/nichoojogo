#!/usr/bin/env python3
"""Gera jogo/fontes.css: Press Start 2P e Space Mono embutidas no próprio jogo.

Antes o jogo baixava as fontes de fonts.googleapis.com, o que manda o IP de cada
jogador para o Google antes de qualquer consentimento (problema na LGPD e no GDPR).
Com as fontes dentro do CSS, nenhum pedido sai para o Google por causa delas,
e o jogar.html passa a funcionar sem internet com as fontes certas.

Uso: python3 scripts/gerar_fontes.py   (só Python 3, precisa de internet uma vez)

Baixa só os recortes latin e latin-ext (cobrem o português e nomes estrangeiros)
e grava o texto das licenças em licencas/. As duas fontes são da SIL Open Font
License 1.1, que permite embutir e redistribuir junto com o jogo.
"""
import base64
import re
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "jogo" / "fontes.css"
LICENCAS = RAIZ / "licencas"
CSS = "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Press+Start+2P&display=swap"
# Com um navegador moderno no User-Agent, o Google responde com woff2 e unicode-range
AGENTE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
RECORTES = {"latin", "latin-ext"}
OFL = {
    "OFL-PressStart2P.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/pressstart2p/OFL.txt",
    "OFL-SpaceMono.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/spacemono/OFL.txt",
}


def baixar(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": AGENTE}), timeout=30) as r:
        return r.read()


def main() -> None:
    css = baixar(CSS).decode("utf-8")
    blocos = re.findall(r"/\* ([\w-]+) \*/\s*(@font-face \{.*?\})", css, flags=re.S)
    saida = [
        "/* Gerado por scripts/gerar_fontes.py. Não edite à mão.",
        "   Press Start 2P (CodeMan38) e Space Mono (Colophon Foundry), SIL Open Font License 1.1.",
        "   Licenças em licencas/OFL-PressStart2P.txt e licencas/OFL-SpaceMono.txt. */",
    ]
    for recorte, bloco in blocos:
        if recorte not in RECORTES:
            continue
        url = re.search(r"url\((https://[^)]+\.woff2)\)", bloco).group(1)
        dados = base64.b64encode(baixar(url)).decode("ascii")
        bloco = bloco.replace(url, "data:font/woff2;base64," + dados)
        saida.append(f"/* {recorte} */\n{bloco}")
    SAIDA.write_text("\n".join(saida) + "\n", encoding="utf-8")
    LICENCAS.mkdir(exist_ok=True)
    for nome, url in OFL.items():
        (LICENCAS / nome).write_bytes(baixar(url))
    print(f"{SAIDA.relative_to(RAIZ)} e licencas/ atualizados")


if __name__ == "__main__":
    main()
