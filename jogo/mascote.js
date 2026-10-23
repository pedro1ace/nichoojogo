// Tardígrado mascote (28x16), desenhado pixel a pixel por código.
// Sóbrio, sem cara de desenho infantil: corpo em barril com dobras, cabeça
// rombuda com a boquinha em tubo, 8 patinhas curtas com garras claras.
// Sem contorno: a borda é o próprio tom do corpo meio transparente, e o brilho
// quente em volta é desenhado na cena. Olha para a direita; a cena espelha.
function criarTardigrado() {
  const LW = 28, LH = 16;
  const MARROM = ["#3a1a0c", "#663218", "#934d24", "#bd7036", "#dd9a5a", "#f0c08a"];
  // dourado: depois de achar uma supernova, ele fica assim pelo resto do dia
  const OURO = ["#5a3a06", "#8f6410", "#c3921c", "#e8bd34", "#fbdc6a", "#fff4b8"];
  let TONS = MARROM;
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const CORPO = { cx: 12.5, cy: 7.2, rx: 11, ry: 5.0 };
  const CABECA = { cx: 23, cy: 7.9, rx: 3.6, ry: 3.5 };
  const DOBRAS = [6.2, 10.4, 14.6, 18.6];
  const se = (x, y, e, p = 2.6) => 1 - Math.abs((x - e.cx) / e.rx) ** p - Math.abs((y - e.cy) / e.ry) ** p;
  const valor = (x, y) => {
    // dorso com gomos: cada dobra afunda um pouco o contorno de cima
    let afunda = 0;
    for (const d of DOBRAS) afunda = Math.max(afunda, Math.max(0, 1 - Math.abs(x - d) / 1.3) * 0.55);
    const yy = y < CORPO.cy ? y - afunda : y;
    return Math.max(se(x, yy, CORPO), se(x, y, CABECA, 2.2));
  };
  const dentro = (x, y) => valor(x, y) >= 0;

  function quadro(passo, olhoFechado) {
    const c = document.createElement("canvas");
    c.width = LW; c.height = LH;
    const g = c.getContext("2d");
    const px = (x, y, cor, a = 1) => { g.globalAlpha = a; g.fillStyle = cor; g.fillRect(x, y, 1, 1); g.globalAlpha = 1; };

    // patinha: toco de 2 px de largura, garras claras viradas para a frente
    const pata = (bx, fase, escura) => {
      const s = Math.sin(passo + fase);
      const ergue = s > 0.35 ? 1 : 0;
      const dx = Math.cos(passo + fase) > 0 ? 1 : 0;
      const a = escura ? TONS[1] : TONS[2], b = escura ? TONS[0] : TONS[1];
      const y0 = 11, y1 = 13 - ergue;
      for (let y = y0; y <= y1; y++) { const d = y === y1 ? dx : 0; px(bx + d, y, a); px(bx + 1 + d, y, b); }
      const gx = bx + dx;
      px(gx + 1, y1 + 1, escura ? "#b89478" : "#f2d8b8", escura ? 0.6 : 0.95);
      px(gx + 2, y1 + 1, escura ? "#b89478" : "#f2d8b8", escura ? 0.4 : 0.7);
    };
    [7, 12, 17].forEach((x, i) => pata(x, i * 1.6 + Math.PI, true));

    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const cx = x + 0.5, cy = y + 0.5, v = valor(cx, cy);
      if (v < 0) {
        if (v > -0.22 && dentro(cx, cy + 1)) px(x, y, TONS[3], 0.35); // borda de cima esfumada
        continue;
      }
      // luz de cima: claro no dorso, escuro na barriga
      const ny = (cy - 2) / 10.5;
      let t = 5.2 - ny * 5.4 - (cx < 4 ? 0.6 : 0) + Math.min(0, (v - 0.25) * 2.5);
      for (const d of DOBRAS) {
        const dist = Math.abs(cx - d - (cy - 4) * 0.12);
        if (dist < 0.6 && cy > 2 && cy < 10.5) t -= 1.1;
      }
      let k = Math.floor(t);
      if (t - k > 0.25 + BAYER4[(y & 3) * 4 + (x & 3)] * 0.5) k++;
      k = Math.max(0, Math.min(5, k));
      const borda = !dentro(cx - 1, cy) || !dentro(cx + 1, cy) || !dentro(cx, cy - 1) || !dentro(cx, cy + 1);
      px(x, y, TONS[k], borda ? 0.7 : 1);
    }

    [5, 10, 15, 20].forEach((x, i) => pata(x, i * 1.6, false));
    // par de trás, saindo do fim do corpo
    px(2, 10, TONS[2]); px(3, 10, TONS[1]); px(1, 11, TONS[2]); px(2, 11, TONS[1]);
    px(0, 12, "#f2d8b8", 0.85); px(1, 12, "#f2d8b8", 0.6);

    // olho: um ponto escuro, sem expressão
    if (olhoFechado) { px(23, 6, TONS[1]); }
    else { px(23, 6, "#140803"); px(24, 6, "#140803", 0.55); }
    // boca em tubo na ponta do focinho
    px(26, 8, TONS[1]); px(27, 8, "#1e0c05", 0.9); px(27, 9, TONS[2], 0.5);
    return c;
  }

  const jogo = (tons) => {
    TONS = tons;
    const andar = [0, 1, 2, 3].map((i) => quadro((i / 4) * Math.PI * 2, false));
    return { andar, feliz: andar, piscar: quadro(0, true) };
  };
  const normal = jogo(MARROM);
  const dourado = jogo(OURO);
  TONS = MARROM;
  return { ...normal, dourado, largura: LW, altura: LH };
}
