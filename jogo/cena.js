// Cena do Nicho: a viagem do foguete, da Terra até o fundo do espaço.
//
// Duas camadas:
//   - #cena: pixel art numa tela pequena, ampliada sem suavização
//     (fundo com dithering, Terra, planetas, foguete, mascote, partículas);
//   - #camada: alta resolução por cima (textos, réguas, caixinhas das palavras,
//     brilho e vinheta), para o texto ficar nítido.
//
// A câmera segue a profundidade em anos-luz (AL). Cada resposta desce
// pontos × 10 AL, sempre no mesmo tempo (DURACAO_DESCIDA): a resposta rara
// percorre muito mais espaço nesse tempo, então cai rápido; a óbvia mal se mexe.

const AL_POR_PONTO = 10;
const PX_POR_AL = 0.5; // pixels da cena por ano-luz
const DURACAO_DESCIDA = 2400; // ms, igual para toda resposta

// Faixas de raridade. "min" é em pontos da resposta.
const FAIXAS = [
  { id: "rara", min: 50, nome: "RARA", cor: "#c38bff", emoji: "☄️", frase: "Quase ninguém chega tão fundo." },
  { id: "incomum", min: 20, nome: "INCOMUM", cor: "#ffd23f", emoji: "🪐", frase: "Poucos foram por esse caminho." },
  { id: "comum", min: 5, nome: "COMUM", cor: "#5fe1ff", emoji: "🌙", frase: "Boa, mas ainda perto de casa." },
  { id: "obvia", min: 0, nome: "ÓBVIA", cor: "#e8f0ff", emoji: "🛰️", frase: "Todo mundo pensou nessa." },
];
const SUPERNOVA = { id: "supernova", nome: "SUPERNOVA", cor: "#ff4fd8", emoji: "🌟", frase: "Você achou a resposta escondida desta pergunta!" };

function faixaDe(pontos, supernova) {
  if (supernova) return SUPERNOVA;
  return FAIXAS.find((f) => pontos >= f.min);
}

// Marcos do caminho (AL) e curiosidades escritas nas laterais.
const MARCOS = [
  { al: 150, nome: "LUA", corpo: "lua" },
  { al: 400, nome: "MARTE", corpo: "marte" },
  { al: 800, nome: "CINTURÃO DE ASTEROIDES", cinturao: true },
  { al: 1200, nome: "JÚPITER", corpo: "jupiter" },
  { al: 1800, nome: "SATURNO", corpo: "saturno" },
  { al: 2500, nome: "URANO", corpo: "urano" },
  { al: 3300, nome: "NETUNO", corpo: "netuno" },
  { al: 4200, nome: "PLUTÃO", corpo: "plutao" },
  { al: 5500, nome: "CINTURÃO DE KUIPER", cinturao: true },
  { al: 7000, nome: "NUVEM DE OORT", cinturao: true },
  { al: 9000, nome: "ALFA CENTAURI", corpo: "estrela" },
  { al: 12000, nome: "NEBULOSA DE ÓRION", nebulosa: true },
  { al: 16000, nome: "BURACO NEGRO", corpo: "buraco" },
];
const CURIOSIDADES = [
  [40, "aqui o céu azul começa a virar preto"],
  [100, "a Estação Espacial dá 16 voltas na Terra por dia"],
  [280, "a Lua se afasta da Terra 3,8 cm por ano"],
  [600, "um dia em Marte dura quase 24 h e 40 min"],
  [1000, "Júpiter tem mais de 90 luas"],
  [1500, "a Grande Mancha Vermelha é maior que a Terra"],
  [2100, "Saturno flutuaria numa banheira gigante"],
  [2900, "Urano gira deitado de lado"],
  [3800, "Netuno tem os ventos mais rápidos do Sistema Solar"],
  [4800, "Plutão é menor que a nossa Lua"],
  [6200, "a Voyager 1 é o objeto humano mais distante da Terra"],
  [8000, "a Nuvem de Oort guarda trilhões de cometas"],
  [10500, "Alfa Centauri é o sistema estelar mais perto do Sol"],
  [14000, "na Nebulosa de Órion nascem estrelas novas"],
  [17000, "nem a luz escapa de um buraco negro"],
];

// Cor do fundo por profundidade: céu claro perto da Terra, escurecendo até o preto.
const PARADAS_FUNDO = [
  [0, [196, 234, 255]],
  [60, [140, 202, 250]],
  [200, [66, 128, 224]],
  [500, [28, 52, 140]],
  [1200, [14, 18, 74]],
  [4000, [9, 5, 38]],
  [12000, [3, 1, 12]],
];

// ---------- utilidades ----------

// Número pseudoaleatório fixo para cada par (a, b): o cenário é sempre o mesmo.
function sorte(a, b) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul((b | 0) + 1013904223, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Ruído suave (interpolado), para manchas orgânicas como continentes e nuvens.
function ruido(x, y, semente) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = (x - xi) * (x - xi) * (3 - 2 * (x - xi));
  const v = (y - yi) * (y - yi) * (3 - 2 * (y - yi));
  const a = sorte(xi + semente, yi);
  const b = sorte(xi + 1 + semente, yi);
  const c = sorte(xi + semente, yi + 1);
  const d = sorte(xi + 1 + semente, yi + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
const misturar = (c1, c2, t) => c1.map((v, i) => v + (c2[i] - v) * t);
const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function corDoFundo(al) {
  if (al <= 0) return PARADAS_FUNDO[0][1];
  for (let i = 1; i < PARADAS_FUNDO.length; i++) {
    const [a0, c0] = PARADAS_FUNDO[i - 1];
    const [a1, c1] = PARADAS_FUNDO[i];
    if (al <= a1) return misturar(c0, c1, (al - a0) / (a1 - a0));
  }
  return PARADAS_FUNDO[PARADAS_FUNDO.length - 1][1];
}

// 0 perto da Terra, 1 lá no fundo: controla vinheta, brilho e estrelas.
const escuridao = (al) => Math.min(1, Math.max(0, al / 4000));

function novaTela(l, a) {
  const c = document.createElement("canvas");
  c.width = l;
  c.height = a;
  return c;
}

// ---------- sprites ----------

const PALETA = {
  O: "#140f36", // contorno
  W: "#f4f4ff", w: "#b8bfe0", // casco / sombra
  R: "#ff3d6e", r: "#a81d48", // vermelho
  B: "#5fe1ff", b: "#1f6fa8", H: "#ffffff", // vidro
  G: "#7a80a0", g: "#3a3f58", // metal
  Y: "#ffd23f", y: "#e08a00", // amarelo
  P: "#ff8fc8", // bochecha
  F: "#fff3a0", f: "#ffb020", e: "#ff5a1f", // chama
};

function desenharSprite(ctx, linhas, x, y, paleta = PALETA) {
  for (let j = 0; j < linhas.length; j++) {
    for (let i = 0; i < linhas[j].length; i++) {
      const cor = paleta[linhas[j][i]];
      if (!cor) continue;
      ctx.fillStyle = cor;
      ctx.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
    }
  }
}

const FOGUETE = [
  "......O......",
  ".....ORO.....",
  "....ORRrO....",
  "....OWWwO....",
  "...OWWWWwO...",
  "...OWWBBwO...",
  "...OWBHbwO...",
  "...OWWBBwO...",
  "...OWWWWwO...",
  "...OWWWWwO...",
  "...ORRRRrO...",
  "...OWWWWwO...",
  "..ORWWWWwRO..",
  ".ORRWWWWwRrO.",
  "ORRrOGGGOrRrO",
  "OrO.OgggO.OrO",
  "....OOOOO....",
].reverse(); // de ponta-cabeça: o foguete desce

// Mascote: o astronautinha que acompanha a viagem (dois quadros de animação).
const MASCOTE = [
  [
    ".....Y......",
    ".....O......",
    "...OOOOOO...",
    "..OWWWWWWO..",
    ".OWBBBBBBWO.",
    ".OWBHBBBBWO.",
    ".OWBBHBbBWO.",
    ".OWPbBBbPwO.",
    "..OWWWWWwO..",
    ".OOWRWWRWOO.",
    "OWOWWWWWwOWO",
    "OwOWWYYWwOwO",
    ".O.OWWWwwO.O",
    "...OWO.OwO..",
    "...OOO.OOO..",
  ],
  [
    "......Y.....",
    ".....O......",
    "...OOOOOO...",
    "..OWWWWWWO..",
    ".OWBBBBBBWO.",
    ".OWBHBBBBWO.",
    ".OWBBHBbBWO.",
    ".OWPbBBbPwO.",
    "..OWWWWWwO.O",
    ".OOWRWWRWOOW",
    "OWOWWWWWwO.O",
    "OwOWWYYWwO..",
    ".O.OWWWwwO..",
    "...OwO.OWO..",
    "...OOO.OOO..",
  ],
];

const SATELITE = [
  "BBb.....bBB",
  "BBbO...ObBB",
  "BBbOWWWObBB",
  "BBGGWHWGGBB",
  "BBbOWwWObBB",
  "BBbO.G.ObBB",
  "BBb..O..bBB",
];

// Esfera com luz vinda de cima à esquerda, em tons com dithering e contorno.
function esfera(ctx, cx, cy, r, tons, opcoes = {}) {
  const luz = [-0.55, -0.6, 0.58];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const nx = dx / r;
      const ny = dy / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let i = Math.max(0, nx * luz[0] + ny * luz[1] + nz * luz[2]);
      if (opcoes.faixas) i *= 0.85 + 0.15 * Math.sin((dy / r) * 9 + sorte(dy, 3) * 0.6);
      if (opcoes.crateras && sorte(Math.floor((dx + 40) / 2), Math.floor((dy + 40) / 2)) > 0.86) i *= 0.7;
      const v = i * (tons.length - 1);
      let k = Math.floor(v);
      if (v - k > BAYER[((cy + dy) & 3) * 4 + ((cx + dx) & 3)]) k++;
      k = Math.min(tons.length - 1, k);
      ctx.fillStyle = d2 > (r - 1) * (r - 1) && r > 3 ? "#140f36" : tons[k];
      ctx.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }
}

function anel(ctx, cx, cy, r, cor, frente) {
  for (let a = 0; a < Math.PI * 2; a += 0.01) {
    for (const k of [1.7, 1.85, 2.0]) {
      const x = Math.round(cx + Math.cos(a) * r * k);
      const y = Math.round(cy + Math.sin(a) * r * 0.42 * k);
      if ((y >= cy) !== frente) continue;
      ctx.fillStyle = k === 1.85 ? cor : "#140f36";
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// Desenha cada corpo uma vez numa tela própria (é caro para refazer a cada quadro).
function criarCorpos() {
  const tons = {
    lua: ["#3a3f58", "#6b7088", "#a3a8c0", "#d6daea", "#f4f6ff"],
    marte: ["#4a1408", "#8a2a12", "#c8481e", "#ee7a40", "#ffb07a"],
    jupiter: ["#4a2a18", "#8a5a3a", "#c08a5a", "#e8c9a0", "#fff0d8"],
    saturno: ["#4a3a18", "#8f7440", "#c9a85a", "#f0dc9a", "#fff6d0"],
    urano: ["#0f3a4a", "#2a7a8a", "#5ac0d0", "#a8f0f0", "#e8ffff"],
    netuno: ["#0a1450", "#1a2f9a", "#3a5ad8", "#6c8cff", "#b8c8ff"],
    plutao: ["#3a2a20", "#7d6a58", "#b89a80", "#e8d0b8", "#fff0e0"],
    estrela: ["#ff7a00", "#ffb020", "#ffd23f", "#fff3a0", "#ffffff"],
  };
  const raio = { lua: 8, marte: 9, jupiter: 22, saturno: 15, urano: 12, netuno: 12, plutao: 5, estrela: 11, buraco: 13 };
  const corpos = {};
  for (const nome of Object.keys(raio)) {
    const r = raio[nome];
    const tela = novaTela(r * 6, r * 6);
    const ctx = tela.getContext("2d");
    const c = r * 3;
    if (nome === "saturno" || nome === "urano") anel(ctx, c, c, r, nome === "saturno" ? "#e8d8a8" : "#bfeaf0", false);
    if (nome === "estrela") {
      ctx.fillStyle = "rgba(255, 210, 63, 0.25)";
      ctx.fillRect(c - r * 3, c - 1, r * 6, 3);
      ctx.fillRect(c - 1, c - r * 3, 3, r * 6);
    }
    if (nome === "buraco") {
      for (let a = 0; a < Math.PI * 2; a += 0.004) {
        const d = r + 2 + sorte(Math.floor(a * 300), 1) * 5;
        ctx.fillStyle = sorte(Math.floor(a * 300), 2) > 0.5 ? "#ff9a1f" : "#ffd23f";
        ctx.fillRect(Math.round(c + Math.cos(a) * d * 1.8), Math.round(c + Math.sin(a) * d * 0.5), 1, 1);
      }
      esfera(ctx, c, c, r, ["#000000", "#000000"]);
    } else {
      esfera(ctx, c, c, r, tons[nome], { faixas: ["jupiter", "saturno", "netuno"].includes(nome), crateras: nome === "lua" || nome === "plutao" });
    }
    if (nome === "saturno" || nome === "urano") anel(ctx, c, c, r, nome === "saturno" ? "#e8d8a8" : "#bfeaf0", true);
    corpos[nome] = tela;
  }
  return corpos;
}

// Ícones das faixas (cartão de resultado e diário de bordo), 24x24.
function criarIcones() {
  const icones = {};
  const fazer = (id, desenhar) => {
    const t = novaTela(24, 24);
    desenhar(t.getContext("2d"));
    icones[id] = t.toDataURL();
  };
  fazer("obvia", (ctx) => desenharSprite(ctx, SATELITE, 6, 8));
  fazer("comum", (ctx) => esfera(ctx, 12, 12, 9, ["#3a3f58", "#6b7088", "#a3a8c0", "#d6daea", "#f4f6ff"], { crateras: true }));
  fazer("incomum", (ctx) => {
    anel(ctx, 12, 12, 6, "#ffe9a0", false);
    esfera(ctx, 12, 12, 6, ["#6a4a10", "#b8861e", "#ffd23f", "#fff0a0"], { faixas: true });
    anel(ctx, 12, 12, 6, "#ffe9a0", true);
  });
  fazer("rara", (ctx) => {
    for (let t = 0; t < 14; t++) {
      ctx.fillStyle = t % 3 ? "rgba(195, 139, 255, 0.55)" : "rgba(255, 143, 200, 0.5)";
      ctx.fillRect(9 + t, 14 - t, 2, 2);
      if (t % 2) ctx.fillRect(10 + t, 16 - t, 1, 1);
    }
    esfera(ctx, 7, 17, 5, ["#3a1a7a", "#7a3cff", "#c38bff", "#f0e0ff"]);
  });
  fazer("supernova", (ctx) => {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const tam = a % 2 ? 7 : 11;
      for (let d = 4; d < tam; d++) {
        ctx.fillStyle = d > tam - 3 ? "#ff4fd8" : "#ffd23f";
        ctx.fillRect(Math.round(12 + Math.cos(ang) * d), Math.round(12 + Math.sin(ang) * d), 1, 1);
      }
    }
    esfera(ctx, 12, 12, 4, ["#ffd23f", "#fff3a0", "#ffffff"]);
  });
  fazer("nada", (ctx) => esfera(ctx, 12, 12, 6, ["#1a1440", "#2a2458", "#3a3470"]));
  return icones;
}

// A Terra vista de baixo, desenhada uma vez: oceano, continentes, nuvens e atmosfera.
function desenharTerra(largura, altura) {
  const tela = novaTela(largura, altura);
  const ctx = tela.getContext("2d");
  const raio = Math.max(largura, altura * 2) * 1.2;
  const cx = largura / 2;
  const cy = altura - 4 - raio;
  const oceano = ["#163a8a", "#1f52b8", "#2f6fe0", "#4a8cf0"];
  const verde = ["#1f6a34", "#2f9a4a", "#3fbf5f", "#7ad87a"];
  for (let y = 0; y < altura; y++) {
    const meia = Math.sqrt(Math.max(0, raio * raio - (y - cy) * (y - cy)));
    for (let x = Math.max(0, Math.floor(cx - meia)); x <= Math.min(largura - 1, cx + meia); x++) {
      const borda = raio - Math.hypot(x - cx, y - cy);
      const luz = Math.min(1, borda / 40); // mais escuro perto da borda
      const v = luz * 3;
      let k = Math.floor(v);
      if (v - k > BAYER[(y & 3) * 4 + (x & 3)]) k++;
      k = Math.min(3, k);
      // vista inclinada: as manchas ficam achatadas na vertical
      const terra = ruido(x / 46, y / 14, 0) * 0.62 + ruido(x / 15, y / 5, 50) * 0.28 + ruido(x / 5, y / 2, 90) * 0.1;
      const nuvem = ruido(x / 26, y / 6, 300) * 0.7 + ruido(x / 8, y / 2.5, 400) * 0.3;
      let cor = terra > 0.56 ? verde[k] : oceano[k];
      if (terra > 0.53 && terra <= 0.56) cor = k > 1 ? "#e8d8a0" : "#a89860"; // praia
      const limiar = BAYER[(y & 3) * 4 + (x & 3)] * 0.05;
      if (nuvem > 0.66 + limiar && borda > 5) cor = k > 1 ? "#ffffff" : "#c8d8f0";
      else if (nuvem > 0.62 + limiar && borda > 5) cor = k > 1 ? "#dcebff" : "#a8b8d8";
      if (borda < 1.5) cor = "#e8fbff";
      else if (borda < 3) cor = "#9fe0ff";
      ctx.fillStyle = cor;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return tela;
}

// ---------- cena ----------

function criarCena(telaPixel, telaTexto, raiz) {
  const ctx = telaPixel.getContext("2d");
  const tx = telaTexto.getContext("2d");
  const reduzirMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const corpos = criarCorpos();
  const icones = criarIcones();

  let L = 0, A = 0, escala = 2, focoY = 0, dpr = 1;
  let terra = null, imagem = null, pixels = null;

  const camera = { de: 0, para: 0, inicio: 0, atual: 0, velocidade: 0 };
  let rodadaAl = 0; // onde começou a pergunta atual (para as linhas das faixas)
  let mostrarLinhas = false;
  const caixas = [];
  const particulas = [];
  const mascote = { x: 0, y: 0, pulo: 0 };
  // o foguete acompanha a câmera com um atraso suave (mola), ao lado da palavra
  const foguete = { al: 0, x: 0, y: 0 };
  let flash = 0;
  let quadro = 0;
  let anterior = performance.now();
  let aoQuadro = () => {};

  function ajustarTamanho() {
    dpr = window.devicePixelRatio || 1;
    escala = Math.max(2, Math.round(Math.min(innerWidth, innerHeight) / 230));
    L = Math.ceil(innerWidth / escala);
    A = Math.ceil(innerHeight / escala);
    telaPixel.width = L;
    telaPixel.height = A;
    telaTexto.width = Math.round(innerWidth * dpr);
    telaTexto.height = Math.round(innerHeight * dpr);
    focoY = Math.round(A * 0.36);
    terra = desenharTerra(L, Math.round(A * 0.6));
    imagem = ctx.createImageData(L, A);
    pixels = new Uint32Array(imagem.data.buffer);
    ctx.imageSmoothingEnabled = false;
    mascote.x = L / 2 + 60;
    mascote.y = focoY;
  }
  ajustarTamanho();
  addEventListener("resize", ajustarTamanho);

  const naTela = (al) => focoY + (al - camera.atual) * PX_POR_AL; // em pixels da cena
  const naTelaTexto = (al) => naTela(al) * escala; // em pixels CSS

  function atualizarCamera(agora) {
    const t = Math.min(1, (agora - camera.inicio) / DURACAO_DESCIDA);
    const nova = camera.de + (camera.para - camera.de) * suave(t);
    const dt = Math.max(1, agora - anterior) / 1000;
    camera.velocidade = (nova - camera.atual) / dt;
    camera.atual = nova;
  }

  // Fundo: cada linha tem a cor da sua profundidade, misturada com a próxima faixa
  // por dithering (padrão de Bayer), o que dá o degradê "pixelado fino".
  function desenharFundo() {
    const FAIXA = 24;
    const empacotar = (c) => (255 << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0]);
    for (let y = 0; y < A; y++) {
      const al = camera.atual + (y - focoY) / PX_POR_AL;
      const base = Math.floor(al / FAIXA) * FAIXA;
      const c0 = empacotar(corDoFundo(base));
      const c1 = empacotar(corDoFundo(base + FAIXA));
      const frac = (al - base) / FAIXA;
      const linha = y * L;
      const b = (y & 3) * 4;
      const padrao = [0, 1, 2, 3].map((i) => (frac > BAYER[b + i] ? c1 : c0));
      for (let x = 0; x < L; x++) pixels[linha + x] = padrao[x & 3];
    }
    ctx.putImageData(imagem, 0, 0);
  }

  // Raios de luz vindos da Terra, que somem conforme você se afasta.
  function desenharRaios() {
    const forca = Math.max(0, 1 - camera.atual / 2500);
    if (forca <= 0) return;
    for (let i = 0; i < 5; i++) {
      const base = (sorte(i, 11) * 1.4 - 0.2) * L + Math.sin(quadro / 200 + i) * 6;
      const largura = 10 + sorte(i, 12) * 22;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.05 * forca})`;
      ctx.beginPath();
      ctx.moveTo(base, 0);
      ctx.lineTo(base + largura, 0);
      ctx.lineTo(base + largura - A * 0.35, A);
      ctx.lineTo(base - A * 0.35, A);
      ctx.fill();
    }
  }

  function densidadeEstrelas(al) {
    if (al < 60) return 0;
    if (al < 400) return (al - 60) / 340;
    if (al < 3000) return 1;
    return Math.max(0.15, 1 - (al - 3000) / 12000);
  }

  function desenharEstrelas() {
    const camadas = [
      { f: 0.15, cor: "#5a4fb8", n: 7 },
      { f: 0.35, cor: "#9a92ff", n: 5 },
      { f: 0.7, cor: "#ffffff", n: 3 },
    ];
    const BLOCO = 40;
    camadas.forEach((c, ci) => {
      const desvio = camera.atual * PX_POR_AL * c.f;
      const primeiro = Math.floor((desvio - focoY) / BLOCO);
      const ultimo = Math.floor((desvio - focoY + A) / BLOCO);
      const rastro = reduzirMovimento ? 0 : Math.min(16, (camera.velocidade * PX_POR_AL * c.f) / 30);
      for (let k = primeiro; k <= ultimo; k++) {
        for (let i = 0; i < c.n; i++) {
          const yMundo = k * BLOCO + sorte(k, i * 7 + ci) * BLOCO;
          if (sorte(k, i * 7 + ci + 3) > densidadeEstrelas(yMundo / (PX_POR_AL * c.f))) continue;
          const x = Math.floor(sorte(k, i * 7 + ci + 1) * L);
          const y = Math.floor(yMundo - desvio + focoY);
          ctx.globalAlpha = sorte(k * 31 + i, (quadro >> 4) + ci) > 0.96 ? 0.35 : 1;
          ctx.fillStyle = c.cor;
          ctx.fillRect(x, y, 1, 1 + Math.round(rastro));
          if (ci === 2 && sorte(k, i + 77) > 0.85) {
            // estrela maior, em cruz
            ctx.globalAlpha *= 0.5;
            ctx.fillRect(x - 1, y, 3, 1);
            ctx.fillRect(x, y - 1, 1, 3);
          }
        }
      }
    });
    ctx.globalAlpha = 1;
  }

  // Nuvens perto da Terra, que andam devagar para o lado.
  function desenharNuvens() {
    for (let i = 0; i < 7; i++) {
      const al = 8 + sorte(i, 21) * 70;
      const y = Math.round(naTela(al));
      if (y < -20 || y > A + 20) continue;
      const largura = 18 + Math.floor(sorte(i, 22) * 26);
      const x = Math.round(((sorte(i, 23) * (L + 80) + quadro * (0.04 + sorte(i, 24) * 0.05)) % (L + 80)) - 40);
      for (let b = 0; b < 5; b++) {
        const r = 3 + Math.floor(sorte(i, 30 + b) * 4);
        const bx = x + Math.floor((b / 4) * largura);
        const by = y - Math.floor(sorte(i, 40 + b) * 3);
        for (let dy = -r; dy <= r; dy++) {
          const meia = Math.floor(Math.sqrt(r * r - dy * dy));
          ctx.fillStyle = dy > r * 0.3 ? "#d6ecff" : "#ffffff";
          ctx.fillRect(bx - meia, by + dy, meia * 2 + 1, 1);
        }
      }
    }
  }

  function desenharTerraNaCena() {
    const fundo = Math.round(naTela(0)) - 34;
    if (fundo < 0) return;
    ctx.drawImage(terra, 0, fundo - terra.height);
    if (fundo > terra.height) {
      ctx.fillStyle = "#163a8a";
      ctx.fillRect(0, 0, L, fundo - terra.height);
    }
    // estação espacial na borda da Terra (o "barquinho" do início)
    const ex = Math.round(L * 0.3);
    const ey = fundo - 2;
    ctx.fillStyle = "#140f36";
    ctx.fillRect(ex - 12, ey, 25, 2);
    ctx.fillRect(ex - 2, ey - 3, 5, 7);
    ctx.fillStyle = "#5fe1ff";
    ctx.fillRect(ex - 11, ey - 2, 7, 5);
    ctx.fillRect(ex + 5, ey - 2, 7, 5);
    ctx.fillStyle = "#ff3d6e";
    ctx.fillRect(ex, ey - 6, 1, 3);
  }

  // Rochas escuras nas laterais (silhuetas), com um pouco de paralaxe.
  function desenharLaterais() {
    const BLOCO = 60;
    const f = 0.8;
    const desvio = camera.atual * PX_POR_AL * f;
    const primeiro = Math.floor((desvio - focoY - 40) / BLOCO);
    const ultimo = Math.floor((desvio - focoY + A + 40) / BLOCO);
    const forca = Math.min(1, Math.max(0, (camera.atual - 150) / 600));
    if (forca <= 0) return;
    for (let k = Math.max(0, primeiro); k <= ultimo; k++) {
      for (const lado of [0, 1]) {
        if (sorte(k, 200 + lado) > 0.6) continue;
        const r = 6 + Math.floor(sorte(k, 210 + lado) * 18);
        const cx = lado ? L - Math.floor(sorte(k, 220) * 18) : Math.floor(sorte(k, 221) * 18);
        const cy = Math.round(k * BLOCO + sorte(k, 230 + lado) * BLOCO - desvio + focoY);
        for (let dy = -r; dy <= r; dy++) {
          const meia = Math.floor(Math.sqrt(r * r - dy * dy) * (0.8 + sorte(k + dy, 240) * 0.3));
          ctx.fillStyle = `rgba(4, 2, 18, ${0.55 * forca})`;
          ctx.fillRect(cx - meia, cy + dy, meia * 2 + 1, 1);
          if (dy < -r * 0.5) {
            ctx.fillStyle = `rgba(120, 110, 200, ${0.08 * forca})`; // luz no topo da rocha
            ctx.fillRect(cx - meia, cy + dy, meia, 1);
          }
        }
      }
    }
  }

  function desenharAsteroide(x, y, tamanho, semente) {
    const tons = ["#2a2230", "#4a3f48", "#7a6a68", "#a89888"];
    for (let dy = -tamanho; dy <= tamanho; dy++) {
      for (let dx = -tamanho; dx <= tamanho; dx++) {
        if (dx * dx + dy * dy > tamanho * tamanho + sorte(semente + dx, dy) * 3) continue;
        const k = dx + dy < -1 ? 3 : dx + dy < 1 ? 2 : dx + dy < tamanho ? 1 : 0;
        ctx.fillStyle = tons[k];
        ctx.fillRect(Math.round(x) + dx, Math.round(y) + dy, 1, 1);
      }
    }
  }

  // Objetos soltos: satélites perto da Terra, asteroides, cometas mais fundo.
  function desenharObjetos() {
    const BLOCO = 90;
    const desvio = camera.atual * PX_POR_AL;
    const primeiro = Math.max(1, Math.floor((desvio - focoY - 30) / BLOCO));
    const ultimo = Math.floor((desvio - focoY + A + 30) / BLOCO);
    for (let k = primeiro; k <= ultimo; k++) {
      if (sorte(k, 501) > 0.5) continue;
      const yMundo = k * BLOCO + sorte(k, 502) * BLOCO;
      const al = yMundo / PX_POR_AL;
      let x = sorte(k, 503) * L + Math.sin(quadro / 300 + k) * 4;
      if (Math.abs(x - L / 2) < 40) x += x < L / 2 ? -50 : 50;
      const y = yMundo - desvio + focoY;
      if (al < 300) desenharSprite(ctx, SATELITE, x, y);
      else if (al < 8000 && sorte(k, 504) > 0.25) desenharAsteroide(x, y, 1 + Math.floor(sorte(k, 505) * 3), k);
      else {
        ctx.fillStyle = "#e8fbff";
        ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
        for (let t = 1; t < 14; t++) {
          ctx.fillStyle = `rgba(160, 220, 255, ${0.5 - t * 0.035})`;
          ctx.fillRect(Math.round(x) + t, Math.round(y) - t, 1, 1);
        }
      }
    }
  }

  function desenharMarcosPixel() {
    for (const m of MARCOS) {
      const y = Math.round(naTela(m.al));
      if (y < -80 || y > A + 80) continue;
      if (m.corpo) {
        const img = corpos[m.corpo];
        ctx.drawImage(img, Math.round(L * 0.78 - img.width / 2), Math.round(y - img.height / 2));
      }
      if (m.cinturao) {
        for (let i = 0; i < 40; i++) {
          desenharAsteroide(sorte(m.al, i) * L, y + (sorte(m.al, i + 50) - 0.5) * 30, Math.floor(sorte(m.al, i + 99) * 3), i);
        }
      }
      if (m.nebulosa) {
        for (let i = 0; i < 500; i++) {
          const a = sorte(i, 7) * Math.PI * 2;
          const d = Math.sqrt(sorte(i, 8)) * 60;
          ctx.fillStyle = i % 3 ? "rgba(255, 79, 216, 0.28)" : "rgba(95, 225, 255, 0.28)";
          ctx.fillRect(Math.round(L * 0.7 + Math.cos(a) * d * 1.5), Math.round(y + Math.sin(a) * d * 0.6), 2, 2);
        }
      }
    }
  }

  function desenharFoguete() {
    const descendo = camera.velocidade > 20;
    foguete.al += (camera.atual - foguete.al) * 0.12;
    foguete.al = Math.max(foguete.al, camera.atual - 50); // atrasa um pouco, mas nunca sai da tela
    const balanco = reduzirMovimento ? 0 : Math.sin(quadro / 40) * 2;
    const lado = reduzirMovimento ? 0 : Math.sin(quadro / 110) * 5;
    foguete.x = L / 2 + 40 + lado;
    foguete.y = naTela(foguete.al) - 18 + balanco;
    const x = Math.round(foguete.x - 6);
    const y = Math.round(foguete.y - 8);
    // chama por cima, porque o foguete está de cabeça para baixo
    const tamanho = descendo ? Math.min(14, 4 + camera.velocidade / 60) : 3 + (quadro >> 3) % 2;
    for (let j = 0; j < tamanho; j++) {
      const largura = Math.max(1, Math.round(3 - j * 0.25 + Math.random() * 0.8));
      ctx.fillStyle = j < 2 ? PALETA.F : j < tamanho * 0.6 ? PALETA.f : PALETA.e;
      ctx.fillRect(x + 6 - Math.floor(largura / 2), y - 1 - j, largura, 1);
    }
    desenharSprite(ctx, FOGUETE, x, y);
    return { x: x + 6, y: y + 8 };
  }

  function desenharMascote(foguete) {
    // segue o foguete com atraso, flutuando
    const alvoX = foguete.x + 22 + Math.sin(quadro / 70) * 5;
    const alvoY = foguete.y - 6 + Math.sin(quadro / 45) * 3 - mascote.pulo;
    mascote.x += (alvoX - mascote.x) * 0.06;
    mascote.y += (alvoY - mascote.y) * 0.06;
    mascote.pulo *= 0.9;
    const q = MASCOTE[(quadro >> 5) % 2];
    desenharSprite(ctx, q, mascote.x - 6, mascote.y - 7);
  }

  // Poeirinha subindo, como bolhas: dá a sensação de movimento.
  function desenharParticulas(foguete) {
    if (quadro % 4 === 0 && particulas.length < 60) {
      particulas.push({
        x: foguete.x + (Math.random() - 0.5) * 60,
        al: camera.atual + (Math.random() * 40 + 10) / PX_POR_AL * 0.5,
        vida: 1,
        sobe: 3 + Math.random() * 6,
      });
    }
    for (let i = particulas.length - 1; i >= 0; i--) {
      const p = particulas[i];
      p.al -= p.sobe / 60;
      p.vida -= 0.006;
      const y = Math.round(naTela(p.al));
      if (p.vida <= 0 || y < -5) {
        particulas.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = p.vida * 0.8;
      ctx.fillStyle = camera.atual < 300 ? "#ffffff" : "#bfe9ff";
      ctx.fillRect(Math.round(p.x), y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- camada de texto (alta resolução) ----------

  function linhaTracejada(y, x0, x1, cor, alfa) {
    tx.globalAlpha = alfa;
    tx.fillStyle = cor;
    for (let x = x0; x < x1; x += 10) tx.fillRect(x, Math.round(y), 5, 1.5);
    tx.globalAlpha = 1;
  }

  function desenharTextos(agora) {
    const W = innerWidth;
    const H = innerHeight;
    tx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tx.clearRect(0, 0, W, H);
    const escuro = escuridao(camera.atual);
    const corSuave = camera.atual < 250 ? "rgba(20, 30, 80, 0.75)" : "rgba(200, 210, 240, 0.55)";
    const centro0 = W * 0.16;
    const centro1 = W * 0.84;

    // régua da direita
    tx.font = "14px VT323, monospace";
    tx.textAlign = "right";
    tx.textBaseline = "middle";
    const alTopo = camera.atual - focoY / PX_POR_AL;
    const alBase = camera.atual + (A - focoY) / PX_POR_AL;
    tx.fillStyle = corSuave;
    tx.fillRect(W - 10, 0, 1, H);
    for (let al = Math.max(0, Math.ceil(alTopo / 100) * 100); al < alBase; al += 100) {
      const y = naTelaTexto(al);
      const grande = al % 500 === 0;
      tx.fillRect(W - (grande ? 22 : 15), Math.round(y), grande ? 12 : 5, 1);
      if (grande) tx.fillText(`${al.toLocaleString("pt-BR")} AL`, W - 26, y);
    }

    // marcos e curiosidades
    tx.textAlign = "left";
    for (const m of MARCOS) {
      const y = naTelaTexto(m.al);
      if (y < -20 || y > H + 20) continue;
      linhaTracejada(y, centro0, centro1, "#ffd23f", 0.45);
      tx.font = "18px VT323, monospace";
      tx.fillStyle = "#ffd23f";
      tx.fillText(`${m.al.toLocaleString("pt-BR")} AL · ${m.nome}`, centro0, y - 12);
    }
    tx.font = "17px VT323, monospace";
    CURIOSIDADES.forEach(([al, texto], i) => {
      const y = naTelaTexto(al);
      if (y < -20 || y > H + 20) return;
      tx.fillStyle = corSuave;
      if (i % 2) {
        tx.textAlign = "right";
        tx.fillText(`${texto} ——`, W - 110, y);
      } else {
        tx.textAlign = "left";
        tx.fillText(`—— ${texto}`, 16, y);
      }
    });

    // linhas das faixas: até onde cada faixa de raridade levaria nesta pergunta
    if (mostrarLinhas) {
      tx.textAlign = "right";
      tx.font = "16px VT323, monospace";
      for (const f of FAIXAS) {
        if (!f.min) continue;
        const y = naTelaTexto(rodadaAl + f.min * AL_POR_PONTO);
        if (y < -20 || y > H + 20) continue;
        linhaTracejada(y, centro0, centro1, f.cor, 0.7);
        tx.fillStyle = f.cor;
        tx.fillText(`▾ ${f.nome} · ${f.min}+`, centro1, y - 10);
      }
    }

    desenharCaixas(agora);

    // brilho em volta do foguete e vinheta, mais fortes no escuro
    const fx = foguete.x * escala;
    const fy = foguete.y * escala;
    if (escuro > 0.05) {
      const brilho = tx.createRadialGradient(fx, fy, 0, fx, fy, 160);
      brilho.addColorStop(0, `rgba(95, 225, 255, ${0.13 * escuro})`);
      brilho.addColorStop(1, "rgba(95, 225, 255, 0)");
      tx.fillStyle = brilho;
      tx.fillRect(fx - 160, fy - 160, 320, 320);
    }
    const vinheta = tx.createRadialGradient(fx, H * 0.45, Math.min(W, H) * 0.3, fx, H * 0.45, Math.max(W, H) * 0.8);
    vinheta.addColorStop(0, "rgba(0, 0, 10, 0)");
    vinheta.addColorStop(1, `rgba(0, 0, 10, ${0.25 + 0.5 * escuro})`);
    tx.fillStyle = vinheta;
    tx.fillRect(0, 0, W, H);

    if (flash > 0) {
      tx.fillStyle = `rgba(255, 240, 255, ${flash})`;
      tx.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - 0.025);
    }
  }

  function desenharCaixas(agora) {
    const W = innerWidth;
    for (let i = caixas.length - 1; i >= 0; i--) {
      const c = caixas[i];
      const t = agora - c.inicio;
      // cai junto com a câmera e fica onde parou; as antigas vão ficando para trás
      const al = c.de + (c.para - c.de) * suave(Math.min(1, t / DURACAO_DESCIDA));
      const entrada = Math.max(0, 1 - t / 260); // ao aparecer, cai um pouquinho de cima
      const y = naTelaTexto(al) + 18 - entrada * entrada * 40;
      if (y < -60) {
        caixas.splice(i, 1);
        continue;
      }
      const texto = `“${c.texto}” ▾`;
      tx.font = "bold 20px 'Pixelify Sans', monospace";
      const w = Math.ceil(tx.measureText(texto).width) + 28;
      const h = 40;
      // no centro da tela; o foguete fica ao lado
      const x = Math.max(8, Math.min(W - w - 40, W / 2 - w / 2 - 30));
      tx.save();
      tx.globalAlpha = Math.min(1, t / c.surgir);
      tx.translate(x + w / 2, y);
      tx.rotate(c.angulo);
      // caixa com cantos recortados (estilo pixel)
      tx.fillStyle = "rgba(12, 8, 40, 0.88)";
      tx.beginPath();
      const m = 6;
      tx.moveTo(-w / 2 + m, -h / 2);
      tx.lineTo(w / 2 - m, -h / 2);
      tx.lineTo(w / 2, -h / 2 + m);
      tx.lineTo(w / 2, h / 2 - m);
      tx.lineTo(w / 2 - m, h / 2);
      tx.lineTo(-w / 2 + m, h / 2);
      tx.lineTo(-w / 2, h / 2 - m);
      tx.lineTo(-w / 2, -h / 2 + m);
      tx.closePath();
      tx.fill();
      tx.shadowColor = c.cor;
      tx.shadowBlur = c.brilho;
      tx.fillStyle = c.cor;
      tx.textAlign = "center";
      tx.textBaseline = "middle";
      tx.fillText(texto, 0, 1);
      tx.restore();
      // satélites em volta das respostas óbvias: muita gente foi nessa
      for (let s = 0; s < c.satelites; s++) {
        const a = agora / 900 + (s / c.satelites) * Math.PI * 2;
        const sx = x + w / 2 + Math.cos(a) * (w / 2 + 12);
        const sy = y + Math.sin(a) * 26;
        tx.globalAlpha = Math.min(1, t / c.surgir) * 0.9;
        tx.fillStyle = "#5fe1ff";
        tx.fillRect(sx - 4, sy - 1, 3, 3);
        tx.fillRect(sx + 2, sy - 1, 3, 3);
        tx.fillStyle = "#ffffff";
        tx.fillRect(sx - 1, sy - 1, 3, 3);
        tx.globalAlpha = 1;
      }
    }
  }

  function passo(agora) {
    quadro++;
    atualizarCamera(agora);
    anterior = agora;
    desenharFundo();
    desenharRaios();
    desenharEstrelas();
    desenharLaterais();
    desenharNuvens();
    desenharTerraNaCena();
    desenharObjetos();
    desenharMarcosPixel();
    const foguete = desenharFoguete();
    desenharParticulas(foguete);
    desenharMascote(foguete);
    desenharTextos(agora);
    aoQuadro(camera.atual);
    requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);

  function tremer(forca, duracao) {
    if (reduzirMovimento || !raiz.animate) return;
    const passos = [];
    for (let i = 0; i < 14; i++) {
      const f = forca * (1 - i / 14);
      passos.push({ transform: `translate(${(Math.random() - 0.5) * 2 * f}px, ${(Math.random() - 0.5) * 2 * f}px)` });
    }
    passos.push({ transform: "translate(0, 0)" });
    raiz.animate(passos, { duration: duracao, easing: "linear" });
  }

  return {
    icones,
    // Marca o começo de uma pergunta: as linhas das faixas partem daqui.
    novaRodada() {
      rodadaAl = camera.para;
      mostrarLinhas = true;
    },
    // Desce o foguete pelos pontos da resposta e solta a palavra numa caixinha.
    descer(texto, pontos, supernova) {
      const agora = performance.now();
      const peso = Math.min(1, pontos / 100);
      const faixa = faixaDe(pontos, supernova);
      const distancia = pontos * AL_POR_PONTO;
      camera.de = camera.atual;
      camera.para = camera.atual + distancia;
      camera.inicio = agora;
      caixas.push({
        texto: texto.toUpperCase(),
        cor: faixa.cor,
        de: camera.de,
        para: camera.para,
        inicio: agora,
        surgir: 120 + 400 * (1 - peso), // as óbvias aparecem um pouco mais devagar
        angulo: (Math.random() - 0.5) * 0.08,
        brilho: 6 + 18 * peso,
        satelites: faixa.id === "obvia" ? 6 : faixa.id === "comum" ? 3 : 0,
      });
      mascote.pulo = 6 + 10 * peso;
      tremer(2 + 16 * peso + (supernova ? 12 : 0), 300 + 1000 * peso);
      if (supernova) flash = 0.85;
    },
    tremer,
    // Tela final: some com as caixinhas e as linhas das faixas.
    limpar() {
      caixas.length = 0;
      mostrarLinhas = false;
    },
    // Coloca a câmera numa profundidade sem animação (ao retomar o dia).
    irPara(al) {
      camera.de = camera.para = camera.atual = foguete.al = al;
    },
    aoQuadro(fn) {
      aoQuadro = fn;
    },
  };
}
