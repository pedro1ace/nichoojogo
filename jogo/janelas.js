// Janelas que abrem e fecham como num computador antigo: contornos saem do botão que abriu
// e crescem em passos até o tamanho da janela (e voltam para ele ao fechar), com um "tic"
// baixinho de interface (Som.janelaAbrir / Som.janelaFechar, que respeitam o ♪).
//
// Vale para todo <dialog> da página, sem mudar como o resto do código abre e fecha:
// showModal() e close() continuam iguais (a janela fecha na hora; o contorno é só um eco).
// Sem efeitos (opções) ou com "reduzir movimento" no aparelho: só um surgir rápido.
//
// Janelas.confirmar(el): som de "deu certo" e um brilho verde na janela de el.

const Janelas = (() => {
  const PASSOS_ABRIR = 6;
  const PASSOS_FECHAR = 5;
  const QUADRO_MS = 26; // devagar o bastante para ver cada contorno, como nos sistemas antigos
  const RASTRO = 3; // quantos contornos ficam na tela ao mesmo tempo

  const semMovimento = () =>
    document.documentElement.classList.contains("sem-efeitos") ||
    (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const som = (nome) => {
    if (typeof Som !== "object") return;
    Som.ligar();
    Som[nome]?.();
  };

  // o último botão tocado: é dele que a janela sai
  let origem = null;
  let quando = 0;
  const marcar = (e) => {
    const b = e.target?.closest?.("button, a, [role=button], [role=radio], [role=switch]");
    if (b) { origem = b; quando = performance.now(); }
  };
  document.addEventListener("pointerdown", marcar, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") marcar(e); }, true);

  const visivel = (el) => {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  };
  const caixa = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  const pontinho = (r) => ({ x: r.x + r.w / 2 - 14, y: r.y + r.h / 2 - 10, w: 28, h: 20 });
  const mistura = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t });
  // números inteiros: o contorno fica nítido, sem meio pixel borrado
  const posicionar = (el, r) => {
    el.style.left = Math.round(r.x) + "px";
    el.style.top = Math.round(r.y) + "px";
    el.style.width = Math.round(r.w) + "px";
    el.style.height = Math.round(r.h) + "px";
  };

  // Desenha os contornos de "de" até "para", um por quadro, deixando um rastro curto.
  function zoom(camada, de, para, passos, aoFim) {
    const contornos = [];
    let i = 0;
    const quadro = () => {
      i++;
      const t = i / passos;
      const r = document.createElement("i");
      r.className = "zoom-contorno";
      posicionar(r, mistura(de, para, t * t * (3 - 2 * t)));
      camada.append(r);
      contornos.push(r);
      if (contornos.length > RASTRO) contornos.shift().remove();
      contornos.forEach((c, k) => { c.style.opacity = String((k + 1) / contornos.length); });
      if (i < passos) setTimeout(quadro, QUADRO_MS);
      else setTimeout(() => { camada.remove(); aoFim?.(); }, QUADRO_MS);
    };
    quadro();
  }

  const dados = new WeakMap(); // janela -> { origem, rect, fim }

  function aoAbrir(d) {
    som("janelaAbrir");
    const recente = origem && performance.now() - quando < 2000 && !d.contains(origem) ? origem : null;
    const info = { origem: recente, rect: null, fim: null };
    dados.set(d, info);
    d.classList.remove("janela-pop", "janela-surge", "janela-abrindo");
    void d.offsetWidth; // reinicia a animação se a mesma janela abrir de novo logo em seguida
    const alvo = visivel(d);
    if (!alvo || semMovimento()) {
      d.classList.add("janela-surge");
      return;
    }
    info.rect = caixa(alvo);
    const de = visivel(recente) ? caixa(visivel(recente)) : pontinho(info.rect);
    // os contornos ficam dentro da janela (camada fixa), porque só ela está acima do fundo escurecido
    d.classList.add("janela-abrindo");
    const camada = document.createElement("div");
    camada.className = "zoom-camada";
    camada.setAttribute("aria-hidden", "true");
    d.append(camada);
    let feito = false;
    const terminar = () => {
      if (feito) return;
      feito = true;
      camada.remove();
      d.classList.remove("janela-abrindo");
      if (d.open) d.classList.add("janela-pop");
    };
    info.fim = terminar;
    zoom(camada, de, info.rect, PASSOS_ABRIR, terminar);
  }

  function aoFechar(d, outraAbriu) {
    const info = dados.get(d) || {};
    info.fim?.(); // fechou no meio da abertura
    d.classList.remove("janela-pop", "janela-surge", "janela-abrindo");
    if (outraAbriu) return; // trocou de janela (skins → apoio): o som e o contorno ficam com a nova
    som("janelaFechar");
    const rect = info.rect;
    if (!rect || semMovimento()) return;
    const destino = visivel(info.origem);
    const para = destino ? caixa(destino) : pontinho(rect);
    const camada = document.createElement("div");
    camada.className = "zoom-camada zoom-fechando";
    camada.setAttribute("aria-hidden", "true");
    const fundo = document.createElement("b");
    fundo.className = "zoom-fundo";
    camada.append(fundo);
    document.body.append(camada);
    zoom(camada, rect, para, PASSOS_FECHAR);
  }

  // guarda o tamanho da janela antes de fechar (fechada, ela some e não dá mais para medir)
  function medir(d) {
    const r = visivel(d);
    const info = dados.get(d);
    if (r && info && !d.classList.contains("janela-abrindo")) info.rect = caixa(r);
  }

  function vigiar(d) {
    if (d.dataset.janela) return;
    d.dataset.janela = "1";
    const fecharOriginal = d.close.bind(d);
    d.close = (valor) => {
      if (d.open) medir(d);
      return valor === undefined ? fecharOriginal() : fecharOriginal(valor);
    };
    d.addEventListener("cancel", () => medir(d)); // Esc
    d.addEventListener("animationend", (e) => {
      // cada classe tem a animação de mesmo nome
      if (e.target === d) d.classList.remove(e.animationName);
    });
  }

  // showModal() e close() mudam o atributo "open"; o observador avisa antes da tela ser desenhada
  const observador = new MutationObserver((mudancas) => {
    const abriram = [];
    const fecharam = [];
    for (const m of mudancas) {
      const d = m.target;
      const agora = d.hasAttribute("open");
      if (agora === (m.oldValue !== null)) continue;
      (agora ? abriram : fecharam).push(d);
    }
    fecharam.forEach((d) => aoFechar(d, abriram.length > 0));
    abriram.forEach(aoAbrir);
  });

  function preparar() {
    for (const d of document.querySelectorAll("dialog")) {
      if (typeof d.showModal !== "function") continue;
      vigiar(d);
      observador.observe(d, { attributes: true, attributeFilter: ["open"], attributeOldValue: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", preparar);
  else preparar();

  return {
    // "deu certo": o som de confirmação e um brilho verde passando pela janela
    confirmar(el) {
      som("confirmar");
      const d = el?.closest?.("dialog");
      if (!d || !d.open) return;
      d.classList.remove("janela-ok");
      void d.offsetWidth;
      d.classList.add("janela-ok");
    },
  };
})();
window.Janelas = Janelas;
