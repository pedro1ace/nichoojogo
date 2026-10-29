// Skin do Neil, o alienígena no óvni (28x16), no mesmo jeito do tardígrado: desenhada pixel a
// pixel por código, luz de cima, sombreado com dithering e sem contorno.
// Um disco voador largo, com uma escotilha aberta em cima, e o alienígena verde com a
// cabeça para fora (olhões pretos puxados e duas anteninhas). As luzes da borda do
// disco acendem uma de cada vez. Liberada com 10 dias seguidos (ver jogo.js).
// Devolve o mesmo formato de criarTardigrado(): { andar[4], feliz, piscar, dourado }.
function criarAlienigena() {
  const LW = 28, LH = 16, CX = 13.5;
  const PELE = ["#0e2a16", "#1c4f27", "#2c7d38", "#46ad4b", "#7cd86c", "#c4f7a6"];
  const METAL = ["#16182c", "#2d3150", "#4d5379", "#7c84ad", "#b4bbdc", "#eceeff"];
  // dourado: depois de achar uma supernova, o disco vira ouro (o ET continua verde)
  const OURO = ["#5a3a06", "#8f6410", "#c3921c", "#e8bd34", "#fbdc6a", "#fff4b8"];
  const LUZES = ["#ff4fd8", "#5fe1ff", "#ffd23f"];
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const se = (x, y, e, p = 2) => 1 - Math.abs((x - e.cx) / e.rx) ** p - Math.abs((y - e.cy) / e.ry) ** p;

  // disco: aba larga e fina, com uma barriga mais estreita embaixo
  const ABA = { cx: CX, cy: 11.2, rx: 13.9, ry: 2.3 };
  const BARRIGA = { cx: CX, cy: 12.6, rx: 7.2, ry: 2.9 };
  // tampa: a cúpula baixa em cima da aba, onde fica a escotilha
  const TAMPA = { cx: CX, cy: 10.2, rx: 8.6, ry: 2.4 };
  const ESCOTILHA = { cx: CX, cy: 8.9, rx: 4.6, ry: 1.05 };
  // cabeça em gota de ponta-cabeça: larga em cima, queixo fino lá embaixo
  const CABECA = { cx: CX, cy: 4.9, rx: 5.0, ry: 3.9 };
  const naCabeca = (x, y) => {
    const afina = Math.max(0, y - 4.2) * 0.42;
    return se(x, y, { ...CABECA, rx: CABECA.rx - afina }, 2.2);
  };
  const noDisco = (x, y) => Math.max(se(x, y, ABA, 2.4), se(x, y, BARRIGA, 2), se(x, y, TAMPA, 2));

  function quadro(fase, olhoFechado, TONS_DISCO) {
    const c = document.createElement("canvas");
    c.width = LW; c.height = LH;
    const g = c.getContext("2d");
    const px = (x, y, cor, a = 1) => { g.globalAlpha = a; g.fillStyle = cor; g.fillRect(x, y, 1, 1); g.globalAlpha = 1; };
    const tom = (tons, t, x, y) => {
      let k = Math.floor(t);
      if (t - k > 0.25 + BAYER4[(y & 3) * 4 + (x & 3)] * 0.5) k++;
      return tons[Math.max(0, Math.min(5, k))];
    };

    // anteninhas (atrás da cabeça), com a bolinha da ponta piscando
    const pontaAcesa = fase % 2 === 0;
    for (const [x0, x1] of [[11, 10], [16, 17]]) {
      px(x0, 1, PELE[2]); px(x1, 0, pontaAcesa ? "#d8ffb8" : PELE[4]);
    }

    // cabeça (só a parte acima da escotilha aparece)
    for (let y = 0; y < 9; y++) for (let x = 0; x < LW; x++) {
      const cx = x + 0.5, cy = y + 0.5, v = naCabeca(cx, cy);
      if (v < 0) continue;
      // luz de cima e um pouco da esquerda: testa clara, bochechas e queixo escuros
      const t = 5.0 - (cy - 1.2) / 7 * 4.2 - (cx - CX) * 0.12 + Math.min(0, (v - 0.3) * 2.2);
      const borda = naCabeca(cx - 1, cy) < 0 || naCabeca(cx + 1, cy) < 0 || naCabeca(cx, cy - 1) < 0;
      px(x, y, tom(PELE, t, x, y), borda ? 0.75 : 1);
    }
    // olhões pretos puxados para fora, com um brilhinho
    if (olhoFechado) {
      [10, 11, 12, 15, 16, 17].forEach((x) => px(x, 6, "#06140a", 0.9));
    } else {
      const olhos = [[10, 5], [11, 5], [11, 6], [12, 6], [10, 6, 0.6], [17, 5], [16, 5], [16, 6], [15, 6], [17, 6, 0.6]];
      for (const [x, y, a] of olhos) px(x, y, "#05070d", a || 1);
      px(11, 5, "#cfe9ff", 0.85); px(16, 5, "#cfe9ff", 0.55);
    }
    // boquinha
    px(13, 7, PELE[1], 0.85); px(14, 7, PELE[1], 0.85);

    // disco
    for (let y = 6; y < LH; y++) for (let x = 0; x < LW; x++) {
      const cx = x + 0.5, cy = y + 0.5, v = noDisco(cx, cy);
      if (v < 0) continue;
      const aba = se(cx, cy, ABA, 2.4) >= 0;
      // aba: clara em cima, uma faixa escura no meio (a junta), escura embaixo
      const tampa = se(cx, cy, TAMPA, 2) >= 0 && cy < 10.6;
      let t = tampa ? 4.6 - (cy - 8) * 0.55 - Math.abs(cx - CX) * 0.12
        : aba && cy < 12 ? 4.9 - (cy - 10) * 0.9 - Math.abs(cx - CX) * 0.05 : 2.4 - (cy - 12) * 0.7;
      if (Math.abs(cy - 11.5) < 0.5 && aba) t = 1.6;
      const borda = noDisco(cx - 1, cy) < 0 || noDisco(cx + 1, cy) < 0 || noDisco(cx, cy + 1) < 0;
      px(x, y, tom(TONS_DISCO, t, x, y), borda ? 0.75 : 1);
    }
    // escotilha aberta: o escuro de dentro, com o pescoço e o queixo saindo dela
    for (let y = 7; y < 10; y++) for (let x = 0; x < LW; x++) {
      const cx = x + 0.5, cy = y + 0.5, v = se(cx, cy, ESCOTILHA, 2);
      if (v < 0) continue;
      const pescoco = Math.abs(cx - CX) < 1.6 && cy < 9.4;
      if (pescoco) px(x, y, PELE[cx < CX ? 2 : 1]);
      else px(x, y, v > 0.35 ? "#070814" : TONS_DISCO[1], v > 0.35 ? 1 : 0.9);
    }
    // aro da escotilha, claro na frente
    for (let x = 9; x <= 18; x++) px(x, 9, TONS_DISCO[5], x === 9 || x === 18 ? 0.45 : 0.8);
    // luzes na junta: acendem em roda
    [2, 6, 10, 17, 21, 25].forEach((x, i) => {
      const acesa = (i + fase) % 3 === 0;
      const cor = LUZES[i % 3];
      px(x, 11, acesa ? cor : TONS_DISCO[2], acesa ? 1 : 0.9);
      if (acesa) { px(x, 12, cor, 0.35); px(x - 1, 11, cor, 0.3); px(x + 1, 11, cor, 0.3); }
    });
    // luzinha de baixo
    px(13, 15, fase % 2 ? "#a8f5ff" : "#5fe1ff", 0.8); px(14, 15, fase % 2 ? "#5fe1ff" : "#a8f5ff", 0.8);
    return c;
  }

  const jogo = (tons) => {
    const andar = [0, 1, 2, 3].map((i) => quadro(i, false, tons));
    return { andar, feliz: andar, piscar: quadro(0, true, tons) };
  };
  const normal = jogo(METAL);
  return { ...normal, dourado: jogo(OURO), largura: LW, altura: LH };
}
