// Cena em pixel art: foguete subindo por um campo de estrelas.
// Tudo é desenhado numa tela pequena (96x54) e ampliado sem suavização,
// então cada "pixel" do sprite vira um bloco nítido na tela.

const LARGURA = 96;
const ALTURA = 54;

const CORES = {
  W: "#f4f4ff", // casco
  G: "#9aa3c7", // sombra do casco
  R: "#ff3d6e", // aletas e bico
  B: "#3ad7ff", // janela
  F: "#ffd23f", // chama clara
  f: "#ff7b00", // chama escura
  P: "#b06bff", // planeta
  p: "#7a3cff", // faixa do planeta
  O: "#ffd23f", // anel
  L: "#c9cede", // lua
  l: "#8a90a8", // cratera
  S: "#ffffff", // estrela
  s: "#ffd23f", // brilho
  M: "#ff3dd6", // supernova
  C: "#3ad7ff", // satélite
};

// Sprites: cada string é uma linha, "." é transparente.
const SPRITES = {
  foguete: [
    ".....R.....",
    "....RRR....",
    "....WWW....",
    "...WWWWG...",
    "...WWBWG...",
    "...WBBBG...",
    "...WWBWG...",
    "...WWWWG...",
    "...WWWWG...",
    "..RWWWWGR..",
    ".RRWWWWGRR.",
    ".RR.GGG.RR.",
  ],
  chama: [
    ["....FFF....", ".....f.....", "..........."],
    ["....FfF....", "....fFf....", ".....f....."],
  ],
  satelite: [
    "CC.....CC",
    "CC..W..CC",
    "CCWWWWWCC",
    "CC..W..CC",
    "CC.....CC",
  ],
  lua: [
    "..LLLL..",
    ".LLlLLL.",
    "LLLLLlLL",
    "LlLLLLLL",
    "LLLLlLLL",
    "LLlLLLLL",
    ".LLLLlL.",
    "..LLLL..",
  ],
  planeta: [
    "....PPPPP....",
    "..PPPPPPPPP..",
    ".PPpppppPPPP.",
    "OOOOOOOOOOOOO",
    "PPPPPPPPPpppP",
    ".PpppPPPPPPP.",
    "..PPPPPPPPP..",
    "....PPPPP....",
  ],
  supernova: [
    "......s......",
    "...s..M..s...",
    "....MMMMM....",
    "...MMSSSMM...",
    "..MMSSSSSMM..",
    "s.MSSSSSSSM.s",
    "..MMSSSSSMM..",
    "...MMSSSMM...",
    "....MMMMM....",
    "...s..M..s...",
    "......s......",
  ],
};

function desenharSprite(ctx, linhas, x, y) {
  for (let j = 0; j < linhas.length; j++) {
    for (let i = 0; i < linhas[j].length; i++) {
      const cor = CORES[linhas[j][i]];
      if (!cor) continue;
      ctx.fillStyle = cor;
      ctx.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
    }
  }
}

// Fonte de 3x5 pixels só com dígitos e "+", para os números da cena.
const DIGITOS = {
  0: ["111", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"],
  7: ["111", "001", "010", "010", "010"],
  8: ["111", "101", "111", "101", "111"],
  9: ["111", "101", "111", "001", "111"],
  "+": ["000", "010", "111", "010", "000"],
};

function desenharTexto(ctx, texto, x, y, cor) {
  ctx.fillStyle = cor;
  [...texto].forEach((c, n) => {
    const d = DIGITOS[c];
    if (!d) return;
    d.forEach((linha, j) =>
      [...linha].forEach((v, i) => v === "1" && ctx.fillRect(x + n * 4 + i, y + j, 1, 1))
    );
  });
}

function criarCena(canvas) {
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const reduzirMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const estrelas = Array.from({ length: 45 }, () => ({
    x: Math.floor(Math.random() * LARGURA),
    y: Math.random() * ALTURA,
    camada: 1 + Math.floor(Math.random() * 3),
  }));
  let velocidade = 0.15;
  let alvo = 0.15;
  let visitante = null; // sprite que passa ao lado do foguete após uma resposta
  let quadro = 0;

  function passo() {
    quadro++;
    velocidade += (alvo - velocidade) * 0.05;
    alvo += (0.15 - alvo) * 0.01;

    ctx.fillStyle = "#0b0630";
    ctx.fillRect(0, 0, LARGURA, ALTURA);

    for (const e of estrelas) {
      e.y += velocidade * e.camada;
      if (e.y >= ALTURA) {
        e.y -= ALTURA;
        e.x = Math.floor(Math.random() * LARGURA);
      }
      ctx.fillStyle = e.camada === 3 ? "#ffffff" : e.camada === 2 ? "#8f86ff" : "#4a3f9e";
      ctx.fillRect(e.x, Math.floor(e.y), 1, 1);
      if (velocidade > 1 && e.camada === 3) ctx.fillRect(e.x, Math.floor(e.y) - 2, 1, 2);
    }

    if (visitante) {
      visitante.y += velocidade * 2;
      desenharSprite(ctx, SPRITES[visitante.tipo], visitante.x, visitante.y);
      desenharTexto(ctx, visitante.texto, visitante.x, visitante.y - 8, visitante.cor);
      if (visitante.y > ALTURA + 10) visitante = null;
    }

    const balanco = reduzirMovimento ? 0 : Math.round(Math.sin(quadro / 20));
    const fx = 42;
    const fy = 34 + balanco;
    desenharSprite(ctx, SPRITES.foguete, fx, fy);
    desenharSprite(ctx, SPRITES.chama[Math.floor(quadro / 6) % 2], fx, fy + 12);

    requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);

  return {
    // Mostra o sprite da faixa de pontos e acelera o foguete.
    comemorar(pontos, supernova) {
      const tipo = faixa(pontos, supernova);
      const cor = supernova ? "#ff3dd6" : pontos >= 50 ? "#ffd23f" : "#7ef0c1";
      visitante = { tipo, x: 70, y: -14, texto: "+" + pontos, cor };
      alvo = reduzirMovimento ? 0.3 : Math.min(3, 0.4 + pontos / 40);
    },
  };
}

function faixa(pontos, supernova) {
  if (supernova) return "supernova";
  if (pontos >= 50) return "planeta";
  if (pontos >= 15) return "lua";
  return "satelite";
}
