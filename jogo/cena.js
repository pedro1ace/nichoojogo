// Cena em tela cheia, em pixel art: o foguete parte da Terra e desce pelo espaço.
//
// A câmera segue a "profundidade" (anos-luz acumulados). Cada resposta faz o
// foguete descer pelos pontos que ela vale, sempre no mesmo tempo
// (DURACAO_DESCIDA): uma resposta rara percorre muito mais espaço nesse tempo,
// então desce rápido; uma óbvia quase não sai do lugar.
//
// Tudo é desenhado numa tela pequena (cerca de 1/4 da janela) e ampliado sem
// suavização, para cada pixel do desenho virar um bloco nítido.

const PX_POR_AL = 1.5; // pixels da cena por ano-luz
const DURACAO_DESCIDA = 2200; // ms, igual para toda resposta
const FONTE = "8px 'Press Start 2P', monospace";

// Marcos do caminho. "al" é a profundidade em anos-luz.
const MARCOS = [
  { al: 15, nome: "LUA", corpo: { r: 6, cores: ["#c9cede", "#8a90a8", "#6b7088"], crateras: true } },
  { al: 40, nome: "MARTE", corpo: { r: 7, cores: ["#e0623a", "#b8452a", "#7d2a1a"] } },
  { al: 80, nome: "CINTURÃO DE ASTEROIDES", cinturao: true },
  { al: 120, nome: "JÚPITER", corpo: { r: 16, cores: ["#e8c9a0", "#c08a5a", "#8a5a3a"], faixas: true } },
  { al: 180, nome: "SATURNO", corpo: { r: 12, cores: ["#f0dc9a", "#c9a85a", "#8f7440"], anel: "#e8d8a8" } },
  { al: 250, nome: "URANO", corpo: { r: 10, cores: ["#a8f0f0", "#6ccfd8", "#3a8f9a"], anel: "#bfe" } },
  { al: 330, nome: "NETUNO", corpo: { r: 10, cores: ["#5a8cff", "#3a5ad8", "#22338f"], faixas: true } },
  { al: 420, nome: "PLUTÃO", corpo: { r: 4, cores: ["#e8d0b8", "#b89a80", "#7d6a58"] } },
  { al: 550, nome: "CINTURÃO DE KUIPER", cinturao: true },
  { al: 700, nome: "NUVEM DE OORT", cinturao: true },
  { al: 900, nome: "ALFA CENTAURI", corpo: { r: 9, cores: ["#fff6c0", "#ffd23f", "#ff9a1f"], estrela: true } },
  { al: 1200, nome: "NEBULOSA DE ÓRION", nebulosa: true },
  { al: 1600, nome: "BURACO NEGRO", corpo: { r: 14, cores: ["#000000", "#000000", "#000000"], anel: "#ff9a1f" } },
];

// Cor do fundo por profundidade: céu claro perto da Terra, escurecendo até o preto.
const PARADAS_FUNDO = [
  [0, [176, 228, 255]],
  [12, [130, 196, 250]],
  [35, [60, 120, 220]],
  [80, [26, 46, 130]],
  [160, [13, 14, 66]],
  [400, [8, 4, 34]],
  [1200, [2, 1, 8]],
];

const FOGUETE = [
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
].reverse(); // de ponta-cabeça: o foguete desce
const CHAMA = [
  ["....FFF....", ".....f....."],
  ["....FfF....", "....fFf....", ".....f....."],
  ["...FFfFF...", "...fFFFf...", "....fFf....", ".....f....."],
];
const SATELITE = ["CC.....CC", "CC..W..CC", "CCWWWWWCC", "CC..W..CC", "CC.....CC"];
const CORES = {
  W: "#f4f4ff", G: "#9aa3c7", R: "#ff3d6e", B: "#3ad7ff", F: "#ffd23f", f: "#ff7b00", C: "#3ad7ff",
};

// Faixas de pontos: cor da caixinha e ícone do resultado.
const FAIXAS = [
  { min: 50, nome: "planeta", cor: "#b06bff" }, // profundo: roxo, denso, afunda rápido
  { min: 20, nome: "lua", cor: "#ffd23f" },
  { min: 5, nome: "satelite", cor: "#3ad7ff" },
  { min: 0, nome: "satelite", cor: "#e8f0ff" }, // raso: claro e lento
];

function faixa(pontos, supernova) {
  if (supernova) return "supernova";
  return FAIXAS.find((f) => pontos >= f.min).nome;
}

function corDaFaixa(pontos, supernova) {
  if (supernova) return "#ff3dd6";
  return FAIXAS.find((f) => pontos >= f.min).cor;
}

// Número pseudoaleatório fixo para cada par (a, b): o cenário é sempre o mesmo.
function sorte(a, b) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function misturar(c1, c2, t) {
  return c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
}

function corDoFundo(al) {
  if (al <= PARADAS_FUNDO[0][0]) return PARADAS_FUNDO[0][1];
  for (let i = 1; i < PARADAS_FUNDO.length; i++) {
    const [a0, c0] = PARADAS_FUNDO[i - 1];
    const [a1, c1] = PARADAS_FUNDO[i];
    if (al <= a1) return misturar(c0, c1, (al - a0) / (a1 - a0));
  }
  return PARADAS_FUNDO[PARADAS_FUNDO.length - 1][1];
}

// Quantas estrelas aparecem: nenhuma no céu da Terra, muitas no espaço
// próximo, e cada vez menos lá no fundo (sensação de distância).
function densidadeEstrelas(al) {
  if (al < 8) return 0;
  if (al < 40) return (al - 8) / 32;
  if (al < 300) return 1;
  return Math.max(0.2, 1 - (al - 300) / 1200);
}

const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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

function desenharCorpo(ctx, cx, cy, corpo, semente) {
  const { r, cores } = corpo;
  cx = Math.round(cx);
  cy = Math.round(cy);
  const anel = (frente) => {
    if (!corpo.anel) return;
    ctx.fillStyle = corpo.anel;
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      const x = Math.round(cx + Math.cos(a) * r * 1.9);
      const y = Math.round(cy + Math.sin(a) * r * 0.45);
      if ((y >= cy) === frente) ctx.fillRect(x, y, 1, 1);
    }
  };
  anel(false);
  if (corpo.estrela) {
    ctx.fillStyle = "rgba(255, 210, 63, 0.18)";
    ctx.fillRect(cx - r * 2, cy - 1, r * 4, 3);
    ctx.fillRect(cx - 1, cy - r * 2, 3, r * 4);
  }
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      let cor = cores[0];
      if (corpo.faixas && (dy + r) % 4 === 1) cor = cores[1];
      if (corpo.crateras && sorte(dx + 50 + semente, dy + 50) > 0.88) cor = cores[1];
      if (dx + dy > r * 0.7) cor = cores[2]; // sombra
      ctx.fillStyle = cor;
      ctx.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }
  anel(true);
}

function desenharAsteroide(ctx, x, y, tamanho, semente) {
  for (let dy = -tamanho; dy <= tamanho; dy++) {
    for (let dx = -tamanho; dx <= tamanho; dx++) {
      if (dx * dx + dy * dy > tamanho * tamanho + sorte(semente + dx, dy) * 3) continue;
      ctx.fillStyle = dx + dy > 0 ? "#5a4f48" : "#8a7a6a";
      ctx.fillRect(Math.round(x) + dx, Math.round(y) + dy, 1, 1);
    }
  }
}

// A Terra é grande demais para desenhar pixel a pixel a cada quadro:
// desenha uma vez numa tela separada e só copia.
function desenharTerra(largura, altura) {
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  const ctx = tela.getContext("2d");
  const raio = Math.max(largura, altura) * 1.3;
  const cx = largura / 2;
  const cy = altura - 1 - raio;
  for (let y = 0; y < altura; y++) {
    const meia = Math.sqrt(Math.max(0, raio * raio - (y - cy) * (y - cy)));
    for (let x = Math.floor(cx - meia); x <= cx + meia; x++) {
      if (x < 0 || x >= largura) continue;
      const borda = raio - Math.hypot(x - cx, y - cy);
      let cor = "#2f6fe0";
      // continentes: manchas grandes com borda irregular
      const terra = sorte(Math.floor(x / 26), Math.floor(y / 14)) * 0.8 + sorte(Math.floor(x / 6), Math.floor(y / 4)) * 0.35;
      if (terra > 0.72) cor = "#3fbf5f";
      if (terra > 0.95) cor = "#2f9a4a";
      if (sorte(Math.floor(x / 9) + 999, Math.floor(y / 3)) > 0.965) cor = "#f4f4ff"; // nuvens
      if (borda < 3) cor = "#bfe9ff"; // atmosfera
      ctx.fillStyle = cor;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return tela;
}

function criarCena(canvas, tela) {
  const ctx = canvas.getContext("2d");
  const reduzirMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let L = 0; // largura da cena em pixels
  let A = 0; // altura
  let focoY = 0; // altura do foguete na tela
  let terra = null;

  const camera = { de: 0, para: 0, inicio: 0, atual: 0, velocidade: 0 };
  const caixas = []; // palavras flutuando
  let flash = 0;
  let quadro = 0;
  let anterior = performance.now();
  let aoQuadro = () => {};

  function ajustarTamanho() {
    const escala = Math.max(2, Math.round(Math.min(innerWidth, innerHeight) / 220));
    L = Math.ceil(innerWidth / escala);
    A = Math.ceil(innerHeight / escala);
    canvas.width = L;
    canvas.height = A;
    focoY = Math.round(A * 0.3);
    terra = desenharTerra(L, focoY);
    ctx.imageSmoothingEnabled = false;
  }
  ajustarTamanho();
  addEventListener("resize", ajustarTamanho);

  // profundidade (anos-luz) -> linha da tela
  const naTela = (al) => focoY + (al - camera.atual) * PX_POR_AL;

  function atualizarCamera(agora) {
    const t = Math.min(1, (agora - camera.inicio) / DURACAO_DESCIDA);
    const nova = camera.de + (camera.para - camera.de) * suave(t);
    const dt = Math.max(1, agora - anterior) / 1000;
    camera.velocidade = (nova - camera.atual) / dt; // anos-luz por segundo
    camera.atual = nova;
  }

  function desenharFundo() {
    for (let y = 0; y < A; y += 2) {
      const al = camera.atual + (y - focoY) / PX_POR_AL;
      const [r, g, b] = corDoFundo(Math.floor(al / 3) * 3); // faixas, estilo pixel
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, y, L, 2);
    }
  }

  function desenharEstrelas() {
    const camadas = [
      { f: 0.2, cor: "#4a3f9e", n: 5 },
      { f: 0.45, cor: "#8f86ff", n: 4 },
      { f: 1, cor: "#ffffff", n: 3 },
    ];
    const BLOCO = 40;
    camadas.forEach((c, ci) => {
      const desvio = camera.atual * PX_POR_AL * c.f;
      const primeiro = Math.floor((desvio - focoY) / BLOCO);
      const ultimo = Math.floor((desvio - focoY + A) / BLOCO);
      const rastro = reduzirMovimento ? 0 : Math.min(12, (camera.velocidade * PX_POR_AL * c.f) / 25);
      for (let k = primeiro; k <= ultimo; k++) {
        for (let i = 0; i < c.n; i++) {
          const yMundo = k * BLOCO + sorte(k, i * 7 + ci) * BLOCO;
          const al = yMundo / (PX_POR_AL * c.f);
          if (sorte(k, i * 7 + ci + 3) > densidadeEstrelas(al)) continue;
          const x = Math.floor(sorte(k, i * 7 + ci + 1) * L);
          const y = Math.floor(yMundo - desvio + focoY);
          const pisca = sorte(k + quadro >> 5, i) > 0.97 ? 0.3 : 1;
          ctx.globalAlpha = pisca;
          ctx.fillStyle = c.cor;
          ctx.fillRect(x, y, 1, 1 + Math.round(rastro));
        }
      }
    });
    ctx.globalAlpha = 1;
  }

  // Objetos soltos no caminho: satélites perto da Terra, asteroides, cometas.
  function desenharObjetos() {
    const BLOCO = 70;
    const desvio = camera.atual * PX_POR_AL;
    const primeiro = Math.max(1, Math.floor((desvio - focoY - 30) / BLOCO));
    const ultimo = Math.floor((desvio - focoY + A + 30) / BLOCO);
    for (let k = primeiro; k <= ultimo; k++) {
      if (sorte(k, 501) > 0.55) continue;
      const yMundo = k * BLOCO + sorte(k, 502) * BLOCO;
      const al = yMundo / PX_POR_AL;
      let x = sorte(k, 503) * L;
      if (Math.abs(x - L / 2) < 20) x += x < L / 2 ? -30 : 30; // longe do foguete
      const y = yMundo - desvio + focoY;
      if (al < 30) desenharSprite(ctx, SATELITE, x, y);
      else if (al < 900 && sorte(k, 504) > 0.25) desenharAsteroide(ctx, x, y, 1 + Math.floor(sorte(k, 505) * 3), k);
      else {
        // cometa: cabeça e cauda
        ctx.fillStyle = "#bfe9ff";
        ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
        ctx.fillStyle = "rgba(191, 233, 255, 0.4)";
        for (let t = 1; t < 10; t++) ctx.fillRect(Math.round(x) + t, Math.round(y) - t, 1, 1);
      }
    }
  }

  function desenharMarcos() {
    ctx.font = FONTE;
    ctx.textBaseline = "middle";
    for (const m of MARCOS) {
      const y = Math.round(naTela(m.al));
      if (y < -60 || y > A + 60) continue;
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      for (let x = 0; x < L; x += 4) ctx.fillRect(x, y, 2, 1);
      if (m.corpo) desenharCorpo(ctx, L * 0.8, y, m.corpo, m.al);
      if (m.cinturao) {
        for (let i = 0; i < 28; i++) {
          desenharAsteroide(ctx, sorte(m.al, i) * L, y + (sorte(m.al, i + 50) - 0.5) * 24, Math.floor(sorte(m.al, i + 99) * 2), i);
        }
      }
      if (m.nebulosa) {
        for (let i = 0; i < 260; i++) {
          const a = sorte(i, 7) * Math.PI * 2;
          const d = Math.sqrt(sorte(i, 8)) * 40;
          ctx.fillStyle = i % 3 ? "rgba(255, 61, 214, 0.35)" : "rgba(58, 215, 255, 0.35)";
          ctx.fillRect(Math.round(L * 0.75 + Math.cos(a) * d * 1.4), Math.round(y + Math.sin(a) * d * 0.6), 2, 2);
        }
      }
      const rotulo = `${m.al} AL · ${m.nome}`;
      const largura = Math.ceil(ctx.measureText(rotulo).width) + 6;
      ctx.fillStyle = "rgba(7, 3, 31, 0.7)";
      ctx.fillRect(3, y - 6, largura, 11);
      ctx.fillStyle = "#ffd23f";
      ctx.fillText(rotulo, 6, y);
    }
  }

  function desenharTerraNaCena() {
    const fundoTerra = Math.round(naTela(0)) - 10; // a superfície fica logo acima do foguete no início
    if (fundoTerra < 0) return;
    ctx.drawImage(terra, 0, fundoTerra - terra.height);
    if (fundoTerra > terra.height) {
      ctx.fillStyle = "#2f6fe0";
      ctx.fillRect(0, 0, L, fundoTerra - terra.height);
    }
  }

  function desenharFoguete() {
    const descendo = camera.velocidade > 5;
    const balanco = reduzirMovimento || descendo ? 0 : Math.round(Math.sin(quadro / 25));
    const tremido = !reduzirMovimento && descendo ? Math.round((Math.random() - 0.5) * 2) : 0;
    const x = Math.round(L / 2 - 5) + tremido;
    const y = focoY - 6 + balanco;
    const nivel = camera.velocidade > 60 ? 2 : descendo ? 1 : 0;
    const chama = CHAMA[nivel];
    // a chama fica em cima, porque o foguete está de cabeça para baixo
    desenharSprite(ctx, [...chama].reverse().map((l) => (quadro >> 2) % 2 ? l : l.replaceAll("F", "f")), x, y - chama.length);
    desenharSprite(ctx, FOGUETE, x, y);
  }

  function desenharCaixas(agora) {
    ctx.font = FONTE;
    ctx.textBaseline = "middle";
    for (let i = caixas.length - 1; i >= 0; i--) {
      const c = caixas[i];
      const t = agora - c.inicio;
      // afunda junto com o foguete; depois sobe devagar em direção à superfície
      let al;
      if (t < DURACAO_DESCIDA) al = c.de + (c.para - c.de) * suave(t / DURACAO_DESCIDA);
      else al = c.para - ((t - DURACAO_DESCIDA) / 1000) * c.subida;
      const y = Math.round(naTela(al));
      if (y < -30) {
        caixas.splice(i, 1);
        continue;
      }
      const texto = `${c.texto} +${c.pontos}`;
      const w = Math.ceil(ctx.measureText(texto).width) + 8;
      let x = Math.round(c.lado < 0 ? L / 2 - 10 - w : L / 2 + 10);
      x = Math.max(2, Math.min(L - w - 2, x)); // não sai da tela em celular
      ctx.globalAlpha = Math.min(1, t / c.surgir);
      ctx.fillStyle = "rgba(7, 3, 31, 0.85)";
      ctx.fillRect(x, y - 7, w, 13);
      ctx.fillStyle = c.cor;
      ctx.fillRect(x, y - 7, w, 1);
      ctx.fillRect(x, y + 5, w, 1);
      ctx.fillRect(x, y - 7, 1, 13);
      ctx.fillRect(x + w - 1, y - 7, 1, 13);
      ctx.fillText(texto, x + 4, y);
    }
    ctx.globalAlpha = 1;
  }

  function passo(agora) {
    quadro++;
    atualizarCamera(agora);
    anterior = agora;
    desenharFundo();
    desenharEstrelas();
    desenharTerraNaCena();
    desenharObjetos();
    desenharMarcos();
    desenharFoguete();
    desenharCaixas(agora);
    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flash})`;
      ctx.fillRect(0, 0, L, A);
      flash = Math.max(0, flash - 0.03);
    }
    aoQuadro(camera.atual);
    requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);

  function tremer(forca, duracao) {
    if (reduzirMovimento || !tela.animate) return;
    const passos = [];
    for (let i = 0; i < 12; i++) {
      const f = forca * (1 - i / 12);
      passos.push({ transform: `translate(${(Math.random() - 0.5) * 2 * f}px, ${(Math.random() - 0.5) * 2 * f}px)` });
    }
    passos.push({ transform: "translate(0, 0)" });
    tela.animate(passos, { duration: duracao, easing: "linear" });
  }

  return {
    // Desce o foguete pelos pontos da resposta e solta a palavra numa caixinha.
    descer(texto, pontos, supernova) {
      const agora = performance.now();
      const peso = Math.min(1, pontos / 100);
      camera.de = camera.atual;
      camera.para = camera.atual + pontos;
      camera.inicio = agora;
      caixas.push({
        texto: texto.toUpperCase(),
        pontos,
        cor: corDaFaixa(pontos, supernova),
        de: camera.de,
        para: camera.para + pontos * 0.25 * peso, // as densas afundam um pouco além do foguete
        inicio: agora,
        surgir: 80 + 1400 * (1 - peso), // as óbvias aparecem devagar
        subida: 6 - 4 * peso, // anos-luz por segundo subindo depois
        lado: caixas.length % 2 ? -1 : 1,
      });
      tremer(2 + 14 * peso + (supernova ? 10 : 0), 250 + 900 * peso);
      if (supernova) flash = 0.8;
    },
    // Coloca a câmera numa profundidade sem animação (ao retomar o dia).
    irPara(al) {
      camera.de = camera.para = camera.atual = al;
    },
    aoQuadro(fn) {
      aoQuadro = fn;
    },
  };
}
