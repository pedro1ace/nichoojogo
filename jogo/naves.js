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
  return { satelite, iss };
}
