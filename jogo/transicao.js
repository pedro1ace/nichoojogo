// Troca de skin com "teletransporte": o boneco antigo se desfaz em pixels de baixo
// para cima e o novo se materializa de cima para baixo, com a borda acesa em ciano,
// como num feixe de luz. Serve para o mascote da cena e para os desenhos do menu.
//
// quadroTransicao(antiga, nova, t) devolve um canvas com a mistura dos dois sprites
// no instante t (0 = só o antigo, 1 = só o novo). Os dois podem ter tamanhos diferentes:
// ficam centralizados num canvas do tamanho do maior.
const Transicao = (() => {
  const DURACAO = 900; // ms
  const BRILHO = ["#ffffff", "#c9f6ff", "#5fe1ff"];
  // ruído fixo por pixel, para o desfazer ter "grão" e não ser uma linha reta
  const ruido = (x, y) => {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const tela = document.createElement("canvas");
  const g = tela.getContext("2d");

  function pixels(img, w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const cg = c.getContext("2d");
    cg.drawImage(img, Math.floor((w - img.width) / 2), Math.floor((h - img.height) / 2));
    return cg.getImageData(0, 0, w, h).data;
  }
  const cache = new WeakMap();
  function dados(img, w, h) {
    let porTam = cache.get(img);
    if (!porTam) { porTam = new Map(); cache.set(img, porTam); }
    const k = w + "x" + h;
    if (!porTam.has(k)) porTam.set(k, pixels(img, w, h));
    return porTam.get(k);
  }

  function quadroTransicao(antiga, nova, t) {
    const w = Math.max(antiga.width, nova.width), h = Math.max(antiga.height, nova.height);
    if (tela.width !== w || tela.height !== h) { tela.width = w; tela.height = h; }
    const a = dados(antiga, w, h), b = dados(nova, w, h);
    const saida = g.createImageData(w, h);
    const o = saida.data;
    // primeira metade: o antigo some (de baixo para cima); segunda: o novo aparece (de cima para baixo)
    const sai = Math.min(1, t * 2), entra = Math.max(0, t * 2 - 1);
    const faixa = 0.16;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = ruido(x, y) * 0.55;
      const kSai = (1 - y / h) * 0.45 + n; // de baixo para cima
      const kEntra = (y / h) * 0.45 + n;   // de cima para baixo
      let cor = null, alfa = 0;
      if (entra > 0 && b[i + 3] > 0) {
        const lim = entra * (1 + faixa);
        if (kEntra < lim - faixa) { cor = [b[i], b[i + 1], b[i + 2]]; alfa = b[i + 3]; }
        else if (kEntra < lim) { cor = hex(BRILHO[Math.floor(ruido(y, x) * 3)]); alfa = 255; }
      } else if (sai < 1 && a[i + 3] > 0) {
        const lim = sai * (1 + faixa);
        if (kSai >= lim) { cor = [a[i], a[i + 1], a[i + 2]]; alfa = a[i + 3]; }
        else if (kSai >= lim - faixa) { cor = hex(BRILHO[Math.floor(ruido(y, x) * 3)]); alfa = 230; }
      }
      if (!cor) continue;
      o[i] = cor[0]; o[i + 1] = cor[1]; o[i + 2] = cor[2]; o[i + 3] = alfa;
    }
    g.putImageData(saida, 0, 0);
    return tela;
  }
  const hexCache = {};
  function hex(c) {
    return hexCache[c] || (hexCache[c] = [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16)));
  }

  // Anima a troca num canvas pequeno do menu (o desenho fica parado, só troca).
  function animarCanvas(destino, antiga, nova, aoFim) {
    const dg = destino.getContext("2d");
    dg.imageSmoothingEnabled = false;
    const inicio = performance.now();
    destino.classList.remove("materializando");
    void destino.offsetWidth;
    destino.classList.add("materializando");
    const passo = (agora) => {
      const t = Math.min(1, (agora - inicio) / DURACAO);
      dg.clearRect(0, 0, destino.width, destino.height);
      const q = quadroTransicao(antiga, nova, t);
      dg.drawImage(q, Math.floor((destino.width - q.width) / 2), Math.floor((destino.height - q.height) / 2));
      if (t < 1) requestAnimationFrame(passo);
      else if (aoFim) aoFim();
    };
    requestAnimationFrame(passo);
  }

  return { DURACAO, quadroTransicao, animarCanvas };
})();
