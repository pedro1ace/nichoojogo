# Uso: python3 scripts/gerar_favicon.py saida_ampliada.png  (rode da raiz do repositório)
# Favicon: tardígrado simples, sem fundo, virado para a direita. Grade 16x10, cada pixel = 2 unidades.
import base64, io, os, re, sys
from PIL import Image
G = [
"..HHH.HHH.HHH...",
".HHHHHHHHHHHHH..",
".BBBBBBBBBBBBBB.",
"BBBBBBBBBBBBBEB.",
"BBBBBBBBBBBBBBBB",
"BBBBBBBBBBBBBBB.",
".DDDDDDDDDDDDD..",
".DD..DD..DD..DD.",
".CC..CC..CC..CC.",
]
COR = {"H": "#e8a466", "B": "#bd7036", "D": "#7e3f1c", "E": "#140803", "C": "#f2d8b8"}
OY = (16 - len(G)) // 2 * 2 + 1
rects = {}
for y, linha in enumerate(G):
    for x, c in enumerate(linha):
        if c in COR: rects.setdefault(c, []).append(f"M{x*2},{OY+y*2}h2v2h-2z")
svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">' + "".join(
    f'<path d="{"".join(r)}" fill="{COR[c]}"/>' for c, r in rects.items()) + "</svg>"
def png_de(cores):
    im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    for y, linha in enumerate(G):
        for x, c in enumerate(linha):
            if c in cores:
                h = cores[c].lstrip("#"); rgb = tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
                for dy in range(2):
                    for dx in range(2): im.putpixel((x*2+dx, OY+y*2+dy), rgb + (255,))
    b = io.BytesIO(); im.save(b, "PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()
OURO = {"H": "#fff1a6", "B": "#f2c230", "D": "#a8700c", "E": "#3a2400", "C": "#fffbe0"}
j = open("jogo/jogo.js").read()
j = re.sub(r'(const ICONE_NORMAL = ")[^"]*', lambda m: m.group(1) + png_de(COR), j)
j = re.sub(r'(const ICONE_OURO = ")[^"]*', lambda m: m.group(1) + png_de(OURO), j)
open("jogo/jogo.js", "w").write(j)
im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
for y, linha in enumerate(G):
    for x, c in enumerate(linha):
        if c in COR:
            h = COR[c].lstrip("#"); rgb = tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
            for dy in range(2):
                for dx in range(2): im.putpixel((x*2+dx, OY+y*2+dy), rgb + (255,))
open("favicon.svg", "w").write(svg + "\n")
im.save("favicon.png")
# o .ico leva 48x48 porque o Google só mostra favicon com lado múltiplo de 48
im.resize((48, 48), Image.NEAREST).save("favicon.ico", sizes=[(48, 48), (32, 32), (16, 16)])
os.makedirs("imagens", exist_ok=True)
im.resize((192, 192), Image.NEAREST).save("imagens/icone-192.png")
# iPhone pinta fundo preto no que é transparente: fundo do jogo e um respiro em volta
toque = Image.new("RGBA", (180, 180), (7, 3, 31, 255))
toque.alpha_composite(im.resize((160, 160), Image.NEAREST), (10, 10))
toque.save("imagens/apple-touch-icon.png")
im.resize((256, 256), Image.NEAREST).save(sys.argv[1])
# As páginas apontam para os arquivos (/favicon.ico, /favicon.svg, /imagens/...).
# Não use data: no <head>: o Google não lê ícone embutido e mostra o globo cinza.
