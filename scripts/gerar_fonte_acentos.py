#!/usr/bin/env python3
"""Gera jogo/fonte-acentos.css: maiúsculas acentuadas da Press Start 2P em tamanho cheio.

Na Press Start 2P, as maiúsculas com acento (Á, Ô, É...) são desenhadas encolhidas
para o acento caber na mesma altura, e ficam parecendo minúsculas ("IOIô").
Este script monta uma fontezinha só com essas letras: a maiúscula normal, inteira,
com o acento desenhado em pixels por cima (um pixel de folga, como nas fontes de fliperama). O jogo usa essa fonte antes da
Press Start 2P (font-family: "Nicho Pixel", "Press Start 2P"), só para esses caracteres.

Uso: python3 scripts/gerar_fonte_acentos.py   (precisa de: pip install fonttools brotli)
Vale também para o Ç, que na original também sai encolhido.
A Press Start 2P é de CodeMan38, sob a SIL Open Font License 1.1, que permite derivados.
"""
import base64
import io
import unicodedata
import urllib.request
from pathlib import Path

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "jogo" / "fonte-acentos.css"
FONTE = "https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK3nVivM.woff2"
NOME = "Nicho Pixel"
LETRAS = "ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÑÇ"
PIXEL = 125  # a fonte é desenhada numa grade de 8x8 pixels, 1000 unidades por em
TOPO = 1000  # topo das maiúsculas
# Acentos em pixels, duas linhas (a de cima primeiro), colunas 0 a 6 (a letra tem 7 de largura)
ACENTOS = {
    "\u0301": ["....XX.", "...XX.."],  # agudo
    "\u0300": [".XX....", "..XX..."],  # grave
    "\u0302": ["..XXX..", ".XX.XX."],  # circunflexo
    "\u0303": [".XXX.X.", ".X.XXX."],  # til
    "\u0308": ["", ".XX.XX."],  # trema
    "\u0327": ["...X...", "..XX..."],  # cedilha (vai embaixo da letra)
}
EMBAIXO = {"\u0327"}


def main() -> None:
    fonte = TTFont(io.BytesIO(urllib.request.urlopen(FONTE).read()))
    fonte.flavor = None
    glifos = fonte.getGlyphSet()
    cmap = fonte.getBestCmap()
    glyf = fonte["glyf"]
    for letra in LETRAS:
        base, acento = unicodedata.normalize("NFD", letra)
        caneta = TTGlyphPen(glifos)
        glifos[cmap[ord(base)]].draw(caneta)
        for linha, desenho in enumerate(ACENTOS[acento]):
            if acento in EMBAIXO:
                y = PIXEL * (0 - linha)  # a letra começa na linha 1; a cedilha ocupa a 0 e a -1
            else:
                y = TOPO + PIXEL * (2 - linha)  # deixa uma linha vazia entre a letra e o acento
            for coluna, marca in enumerate(desenho):
                if marca == "X":  # um quadradinho por pixel, no sentido horário
                    x = coluna * PIXEL
                    caneta.moveTo((x, y))
                    caneta.lineTo((x, y + PIXEL))
                    caneta.lineTo((x + PIXEL, y + PIXEL))
                    caneta.lineTo((x + PIXEL, y))
                    caneta.closePath()
        glyf[cmap[ord(letra)]] = caneta.glyph()
    opcoes = Options()
    opcoes.flavor = "woff2"
    opcoes.name_IDs = []
    opcoes.layout_features = []
    sub = Subsetter(opcoes)
    sub.populate(unicodes=[ord(c) for c in LETRAS])
    sub.subset(fonte)
    fonte["hhea"].ascent = fonte["OS/2"].usWinAscent = TOPO + 3 * PIXEL
    fonte["OS/2"].sTypoAscender = 1000
    for registro in fonte["name"].names:
        registro.string = {1: NOME, 4: NOME, 6: NOME.replace(" ", "")}.get(registro.nameID, registro.toUnicode())
    buf = io.BytesIO()
    fonte.flavor = "woff2"
    fonte.save(buf)
    dados = base64.b64encode(buf.getvalue()).decode()
    faixa = ", ".join(f"U+{ord(c):04X}" for c in LETRAS)
    SAIDA.write_text(
        "/* Gerado por scripts/gerar_fonte_acentos.py. Não edite à mão.\n"
        "   Maiúsculas acentuadas da Press Start 2P (CodeMan38, SIL OFL 1.1) em tamanho cheio. */\n"
        f'@font-face {{ font-family: "{NOME}"; src: url(data:font/woff2;base64,{dados}) format("woff2"); '
        f"unicode-range: {faixa}; font-display: block; }}\n",
        encoding="utf-8",
    )
    print(f"{SAIDA.relative_to(RAIZ)} gerado ({len(buf.getvalue())} bytes de fonte)")


if __name__ == "__main__":
    main()
