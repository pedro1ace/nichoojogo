// Satélite e Estação Espacial (ISS), desenhados pixel a pixel no mesmo estilo
// do tardígrado: poucos tons, luz de cima, sem contorno escuro (as bordas são
// o próprio tom, meio transparentes). A cena desenha um brilho leve em volta.
function criarNaves() {
  const tela = (w, h) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  };
  // retângulo com volume: linha de cima clara, de baixo escura, cantos macios
  function bloco(g, x, y, w, h, [escuro, medio, claro, brilho]) {
    g.fillStyle = medio; g.fillRect(x, y, w, h);
    g.fillStyle = claro; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
    if (brilho) { g.fillStyle = brilho; g.fillRect(x + 1, y, Math.max(1, Math.floor(w / 3)), 1); }
    g.fillStyle = escuro; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y + 1, 1, h - 1);
    // cantos meio transparentes: some o "recorte" duro
    g.clearRect(x, y, 1, 1); g.clearRect(x + w - 1, y, 1, 1);
    g.clearRect(x, y + h - 1, 1, 1); g.clearRect(x + w - 1, y + h - 1, 1, 1);
    g.globalAlpha = 0.5;
    g.fillStyle = claro; g.fillRect(x, y, 1, 1); g.fillRect(x + w - 1, y, 1, 1);
    g.fillStyle = escuro; g.fillRect(x, y + h - 1, 1, 1); g.fillRect(x + w - 1, y + h - 1, 1, 1);
    g.globalAlpha = 1;
  }
  // placa solar: faixas de células e um reflexo suave no alto
  function placa(g, x, y, w, h, tons) {
    bloco(g, x, y, w, h, [tons[0], tons[1], tons[2]]);
    g.globalAlpha = 0.7; g.fillStyle = tons[0];
    for (let i = x + 2; i < x + w - 1; i += 2) g.fillRect(i, y + 1, 1, h - 2);
    g.fillRect(x + 1, y + Math.floor(h / 2), w - 2, 1);
    g.globalAlpha = 0.45; g.fillStyle = tons[3];
    g.fillRect(x + 1, y + 1, w - 2, 1);
    g.globalAlpha = 1;
  }

  const OURO = ["#6b3a12", "#b06c24", "#e0a048", "#ffd890"]; // manta térmica dourada
  const PAINEL = ["#1a2a5a", "#2c4a8c", "#4a72b8", "#9fc4ff"]; // azul das placas
  const COBRE = ["#5a2c14", "#94521f", "#c98236", "#ffd08a"]; // placas da ISS (vistas do Sol, puxam pro dourado)
  const METAL = ["#5a6078", "#9aa2bc", "#d4dbee", "#ffffff"];
  const BRANCO = ["#8a92ac", "#d0d6e8", "#f2f4fc", "#ffffff"];

  // satélite (26 x 13): corpo dourado, duas asas azuis e uma antena-prato
  const satelite = tela(26, 13);
  {
    const g = satelite.getContext("2d");
    placa(g, 0, 3, 9, 7, PAINEL);
    placa(g, 17, 3, 9, 7, PAINEL);
    g.fillStyle = METAL[1]; g.fillRect(9, 6, 8, 1);
    bloco(g, 10, 2, 6, 9, OURO);
    g.fillStyle = OURO[0]; g.fillRect(11, 6, 4, 1); // dobra da manta
    g.fillStyle = METAL[2]; g.fillRect(12, 0, 2, 2);
    g.fillStyle = METAL[1]; g.fillRect(12, 11, 2, 2);
    g.fillStyle = METAL[3]; g.fillRect(12, 0, 1, 1);
  }

  // ISS (52 x 22): treliça comprida, 4 pares de placas, módulos brancos no meio
  const iss = tela(52, 22);
  {
    const g = iss.getContext("2d");
    for (const x of [1, 9, 36, 44]) {
      placa(g, x, 0, 7, 9, COBRE);
      placa(g, x, 13, 7, 9, COBRE);
      g.fillStyle = METAL[0]; g.fillRect(x + 3, 9, 1, 4);
    }
    bloco(g, 0, 10, 52, 2, METAL);
    // módulos
    bloco(g, 19, 7, 14, 7, BRANCO);
    g.fillStyle = BRANCO[0]; g.fillRect(25, 8, 1, 5);
    bloco(g, 24, 3, 4, 15, BRANCO);
    bloco(g, 16, 8, 3, 5, METAL);
    bloco(g, 33, 8, 3, 5, METAL);
    // radiadores brancos, finos
    bloco(g, 21, 15, 2, 5, BRANCO);
    bloco(g, 29, 15, 2, 5, BRANCO);
  }
  // esfera com luz de cima à esquerda, poucos tons e dithering, sem contorno
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  function esferaMini(g, cx, cy, r, tons, extra) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d);
      let t = Math.max(0, -nx * 0.5 - ny * 0.6 + nz * 0.62) * (tons.length - 0.6);
      if (extra) t += extra(x, y, nx, ny);
      let k = Math.floor(t);
      if (t - k > BAYER[(y & 3) * 4 + (x & 3)]) k++;
      g.globalAlpha = d > 0.82 ? 0.75 : 1; // borda macia
      g.fillStyle = tons[Math.max(0, Math.min(tons.length - 1, k))];
      g.fillRect(x, y, 1, 1);
    }
    g.globalAlpha = 1;
  }

  // lua pequena com crateras (faixa comum)
  const lua = tela(11, 11);
  {
    const g = lua.getContext("2d");
    const crateras = [[3.5, 4, 1.4], [6.8, 6.6, 1.2], [4.8, 7.8, 0.9]];
    esferaMini(g, 5.5, 5.5, 5.2, ["#2a5470", "#4a8cb0", "#8ac8e4", "#d4f2ff"], (x, y) =>
      crateras.some(([a, b, r]) => (x + 0.5 - a) ** 2 + (y + 0.5 - b) ** 2 < r * r) ? -1 : 0);
  }

  // planetinha com anel (faixa incomum): o anel passa atrás e na frente
  const planeta = tela(19, 11);
  {
    const g = planeta.getContext("2d");
    const anel = (frente) => {
      for (let i = 0; i < 80; i++) {
        const a = (i / 80) * Math.PI * 2;
        const x = 9.5 + Math.cos(a) * 8.6, y = 5.5 + Math.sin(a) * 2.2;
        if ((Math.sin(a) > 0) !== frente) continue;
        g.fillStyle = Math.sin(a) > 0 ? "#fff0a8" : "#b8902a";
        g.fillRect(Math.floor(x), Math.floor(y), 1, 1);
      }
    };
    anel(false);
    esferaMini(g, 9.5, 5.5, 4.6, ["#7a5410", "#b8861e", "#ffd23f", "#fff0a0"], (x, y) => (y % 3 === 0 ? -0.6 : 0));
    anel(true);
  }

  // cabeça do cometa (faixa rara); a cauda a cena desenha ao longo da órbita
  const cometa = tela(9, 9);
  esferaMini(cometa.getContext("2d"), 4.5, 4.5, 4.1, ["#4a2a8a", "#8a5ae0", "#c38bff", "#f4e8ff"]);

  return { satelite, iss, lua, planeta, cometa };
}
