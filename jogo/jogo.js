// Nicho: regras do jogo diário.
// Cada pergunta pede uma palavra de um tema; o jogador tem 25 segundos.
// Quanto mais nichada a resposta, mais pontos e mais fundo o foguete desce.
// Acertar a "singularidade" (a resposta secreta da pergunta; no código, "supernova") dobra os pontos.
// Vem de outros arquivos: window.NICHO_DADOS (dados.js), Som (som.js),
// criarCena, faixaDe, FAIXAS, viagem, DURACAO_DESCIDA (cena.js).

const RODADAS_POR_DIA = 7;
const SEGUNDOS = 25;
const LANCAMENTO = "2026-10-28"; // dia #1
// Modo teste: abrir com ?aleatorio no fim do endereço (jogar.html?aleatorio) sorteia
// outras categorias a cada vez e não guarda o progresso do dia.
const ALEATORIO = new URLSearchParams(location.search).has("aleatorio");
// Link do botão "Apoie o criador" no fim do jogo. Enquanto estiver vazio, o botão
// aparece como "EM BREVE" e não clica. Para ativar, cole o link entre as aspas.
const LINK_APOIO = "";
const LINK_JOGO = "https://nichoojogo.com/jogar";

// ---------- texto e autocorreção ----------

// Mesma regra de scripts/pontuar.py: minúsculas, sem acento, hífen vira espaço.
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Tira artigos do começo ("o Acre", "a Lua") e espaços, para comparar.
function compactar(texto) {
  return normalizar(texto).replace(/^(o|a|os|as|um|uma) /, "").replaceAll(" ", "");
}

// Distância de edição com troca de letras vizinhas: quantas letras faltam,
// sobram, estão erradas ou trocadas de lugar ("eroupa" -> "europa" = 1).
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// Palavras curtas precisam vir quase certas; longas aceitam mais erros.
function tolerancia(tamanho) {
  if (tamanho <= 3) return 0;
  if (tamanho <= 5) return 1;
  if (tamanho <= 9) return 2;
  return 3;
}

// Procura a resposta. Devolve { resposta, nome, exato } ou null.
// "nome" é a grafia que casou (pode ser um apelido), para mostrar ao jogador.
function buscar(cat, texto) {
  const alvo = compactar(texto);
  if (!alvo) return null;
  if (cat.mapa.has(alvo)) return { ...cat.mapa.get(alvo), exato: true };
  const limite = tolerancia(alvo.length);
  let melhor = null;
  let menor = Infinity;
  for (const [chave, item] of cat.mapa) {
    if (Math.abs(chave.length - alvo.length) > limite) continue;
    const d = distancia(alvo, chave);
    if (d < menor) {
      menor = d;
      melhor = item;
    }
  }
  return menor <= limite ? { ...melhor, exato: false } : null;
}

// ---------- dia, sorteio e progresso ----------

function geradorDoDia(data) {
  let semente = Number(data.replaceAll("-", ""));
  return () => {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente / 2147483648;
  };
}

function embaralhar(lista, sortear) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(sortear() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// As categorias de cada dia saem de uma fila fixa (dados/ordem.txt, que vem em
// NICHO_DADOS.ordem): o dia #1 usa as 7 primeiras, o dia #2 as 7 seguintes, e assim por
// diante. Nenhuma categoria se repete; categoria nova entra no fim da fila. Se a fila
// acabar, a fila recomeça do início, para o jogo nunca ficar sem pergunta.
function categoriasDoDia(indice, data, ordem) {
  const porId = new Map(indice.map((c) => [c.id, c]));
  const fila = (ordem || []).filter((id) => porId.has(id));
  if (!fila.length) return indice.slice(0, RODADAS_POR_DIA);
  const inicio = Math.max(0, numeroDoDia(data) - 1) * RODADAS_POR_DIA;
  const dia = [];
  for (let k = inicio; dia.length < Math.min(RODADAS_POR_DIA, fila.length); k++) {
    const id = fila[k % fila.length];
    if (!dia.includes(id)) dia.push(id);
  }
  return dia.map((id) => porId.get(id));
}

function hojeLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Quantos dias seguidos você completou a viagem (contando hoje, se já terminou).
function sequencia() {
  const p = (n) => String(n).padStart(2, "0");
  const chave = (d) => `nicho:v7:${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const completo = (d) => {
    try {
      const v = JSON.parse(localStorage.getItem(chave(d)) || "null");
      return !!v && v.historico && v.historico.length >= RODADAS_POR_DIA;
    } catch {
      return false;
    }
  };
  const d = new Date();
  if (!completo(d)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (n < 3650 && completo(d)) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// ---------- skins ----------
// O mascote padrão é o tardígrado. O Neil (o alienígena no óvni) é liberado quando a sequência
// chega a DIAS_SKIN_ALIEN; depois disso fica liberado para sempre neste navegador,
// mesmo que a sequência zere. A escolha também fica guardada aqui.
const DIAS_SKIN_ALIEN = 10;
const SKINS = [
  { id: "tardigrado", nome: "TARDÍGRADO", criar: () => (typeof criarTardigrado === "function" ? criarTardigrado() : null) },
  { id: "alien", nome: "NEIL", criar: () => (typeof criarAlienigena === "function" ? criarAlienigena() : null), dias: DIAS_SKIN_ALIEN },
];
const lerChave = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravarChave = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

function skinLiberada(skin, seq) {
  if (!skin.dias) return true;
  if (lerChave(`nicho:skin-liberada:${skin.id}`) === "1") return true;
  if (seq >= skin.dias) { gravarChave(`nicho:skin-liberada:${skin.id}`, "1"); return true; }
  return false;
}
function skinEscolhida() {
  const id = lerChave("nicho:skin");
  const skin = SKINS.find((k) => k.id === id);
  return skin && skinLiberada(skin, 0) ? skin.id : "tardigrado";
}
function desenharSkin(tela, skin) {
  const s = skin.criar();
  if (!tela || !s) return;
  const g = tela.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, tela.width, tela.height);
  g.drawImage(s.andar[0], 0, 0);
}

// O mascote escolhido no cartão do modo, no menu inicial.
function desenharMascoteDoMenu() {
  desenharSkin($("modo-mascote"), SKINS.find((k) => k.id === skinEscolhida()));
}

// A grade da janela de skins. A trancada aparece apagada, com os dias que pede.
function montarSkins() {
  const caixa = $("grade-skins");
  if (!caixa) return;
  const seq = ALEATORIO ? 0 : sequencia();
  const atual = skinEscolhida();
  caixa.innerHTML = "";
  for (const skin of SKINS) {
    const livre = skinLiberada(skin, seq);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cartao-skin" + (livre ? "" : " trancada") + (skin.id === atual ? " escolhida" : "");
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(skin.id === atual));
    const tela = document.createElement("canvas");
    tela.width = 28; tela.height = 16;
    tela.setAttribute("aria-hidden", "true");
    desenharSkin(tela, skin);
    const nome = document.createElement("span");
    nome.className = "skin-nome";
    nome.textContent = skin.nome;
    const dias = document.createElement("span");
    dias.className = "skin-dias";
    dias.textContent = !skin.dias ? "PADRÃO" : livre ? `${skin.dias} DIAS SEGUIDOS ✓` : `🔒 ${skin.dias} DIAS SEGUIDOS`;
    b.append(tela, nome, dias);
    if (!livre) {
      const falta = document.createElement("span");
      falta.className = "skin-falta";
      falta.textContent = `você está com ${Math.min(seq, skin.dias)}`;
      b.append(falta);
    }
    if (!livre) {
      b.setAttribute("aria-disabled", "true");
      b.setAttribute("aria-label", `${skin.nome}: libera com ${skin.dias} dias seguidos (você está com ${seq})`);
    }
    b.addEventListener("click", () => {
      if (!livre) return;
      const antes = SKINS.find((k) => k.id === skinEscolhida());
      gravarChave("nicho:skin", skin.id);
      montarSkins();
      if (antes.id === skin.id) return;
      // fecha a janela e faz o teletransporte à vista: no mascote da cena e no cartão do modo
      $("janela-skins").close();
      cena.skin(skin.id, true);
      const de = antes.criar(), para = skin.criar();
      if (opcoes.semEfeitos || typeof Transicao !== "object" || !de || !para) desenharMascoteDoMenu();
      else Transicao.animarCanvas($("modo-mascote"), de.andar[0], para.andar[0]);
      Som.ligar();
      Som.materializar();
    });
    caixa.append(b);
  }
}

// ---------- opções ----------
// "Sem autocorreção": o jogo não sugere nem corrige a grafia (só vale a palavra exata).
// "Sem efeitos": sem tremor, clarões, explosões e animações, para quem acha o jogo
// estimulante demais. As duas ficam guardadas neste navegador.
const opcoes = { semCorrecao: false, semEfeitos: false };
try { Object.assign(opcoes, JSON.parse(lerChave("nicho:opcoes") || "{}")); } catch {}
function aplicarOpcoes() {
  document.documentElement.classList.toggle("sem-efeitos", !!opcoes.semEfeitos);
  cena.semEfeitos(!!opcoes.semEfeitos);
  if (opcoes.semCorrecao) $("sugestao").hidden = true;
  document.querySelectorAll(".opcao").forEach((b) => b.setAttribute("aria-checked", String(!!opcoes[b.dataset.opcao])));
}
document.querySelectorAll(".opcao").forEach((b) => b.addEventListener("click", () => {
  opcoes[b.dataset.opcao] = !opcoes[b.dataset.opcao];
  gravarChave("nicho:opcoes", JSON.stringify(opcoes));
  aplicarOpcoes();
}));

// As janelas do menu da lateral: abrem por cima, fecham no X, no Esc ou clicando fora.
function abrirJanela(id) {
  const j = $(id);
  if (typeof j.showModal !== "function") return;
  if (id === "janela-skins") montarSkins();
  j.showModal();
  (j.querySelector(".escolhida, .opcao") || j.querySelector(".fechar")).focus();
}
for (const j of document.querySelectorAll(".janela-menu")) {
  j.querySelector(".fechar").addEventListener("click", () => j.close());
  j.addEventListener("click", (e) => { if (e.target === j) j.close(); });
  // devolve o foco ao campo de resposta se a viagem estiver rolando
  j.addEventListener("close", () => { if (estado.ativa) $("palpite").focus(); });
}

// No fim do dia que completa a sequência certa, avisa que a skin nova saiu
// (e já troca para ela, para a pessoa ver na próxima viagem).
function avisarSkinNova(seq) {
  const aviso = $("fim-skin");
  if (!aviso) return;
  aviso.hidden = true;
  for (const skin of SKINS) {
    if (!skin.dias || seq < skin.dias) continue;
    if (lerChave(`nicho:skin-liberada:${skin.id}`) === "1") continue;
    skinLiberada(skin, seq);
    gravarChave("nicho:skin", skin.id);
    cena.skin(skin.id);
    aviso.textContent = `🛸 NOVO PERSONAGEM LIBERADO: NEIL · ${skin.dias} dias seguidos!`;
    aviso.hidden = false;
    montarSkins();
    desenharMascoteDoMenu();
  }
}

// "DIA #3 · SEQUÊNCIA 2" no menu e no fim. A sequência são os dias seguidos com a viagem
// completa, guardados neste navegador; ela zera quando você pula um dia.
function mostrarDiaESequencia() {
  const seq = ALEATORIO ? 0 : sequencia();
  const texto = `DIA #${numeroDoDia(estado.data)} · SEQUÊNCIA ${seq}`;
  $("dia").textContent = texto;
  $("fim-dia").textContent = texto;
  return seq;
}

function numeroDoDia(data) {
  return Math.round((new Date(data + "T12:00") - new Date(LANCAMENTO + "T12:00")) / 86400000) + 1;
}

// Progresso do dia fica no navegador, para não perder ao recarregar.
// Se o armazenamento estiver bloqueado, o jogo funciona igual, só não lembra.
function salvarProgresso() {
  if (ALEATORIO) return;
  try {
    localStorage.setItem(`nicho:v7:${estado.data}`, JSON.stringify({ historico: estado.historico, total: estado.total }));
  } catch {}
}
function lerProgresso() {
  if (ALEATORIO) return null;
  try {
    return JSON.parse(localStorage.getItem(`nicho:v7:${estado.data}`) || "null");
  } catch {
    return null;
  }
}

// ---------- estado e tela ----------

const $ = (id) => document.getElementById(id);
const cena = criarCena($("cena"), $("camada"), $("tela"));
const numero = (n) => Math.round(n).toLocaleString("pt-BR");

const ICONE_NORMAL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAmklEQVR4nGNgGAWjYBQMMGBEF3ixJO0/NoUSMbMYqSGPDpiIdSmtANxVuFxObYAeEoMnBPYWmNElBGDAecIpRgaGQRACLPTyefiMswwMDAwMKzOMUcQHPAQY6R336GDAQ4BloCweNLkAXg7U2cvQJS00HXwySEtC9BBAdymt5AdPCHy6sQPFhXwaHig+oJX8gIfAKBgFo2DAAQB7DUGE6CgeGgAAAABJRU5ErkJggg==";
const ICONE_OURO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAmklEQVR4nGNgGAWjYBQMMGBEF/j/cdl/rAr5oxipIY8OmIh1Ka0A3FW4XE51C9FCYvCEwKdDBnQJARjgs7vAyMAwCEKAhV4+90i6wMDAwMCwY54BiviAhwAjveMeHQx4CLAMlMWDJhfAy4EVBTx0SQsRE74M0pIQPQTQXUor+cETAv9/P0BxISOrAooPaCU/4CEwCkbBKBhwAAD6hUIFtihZUgAAAABJRU5ErkJggg==";

function atualizarIconeAba(dourado = false) {
  let link = document.querySelector("link[rel*='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/png";
  link.href = dourado ? ICONE_OURO : ICONE_NORMAL;
}

const estado = {
  data: hojeLocal(),
  categorias: [],
  rodada: 0,
  total: 0,
  totalMostrado: 0,
  historico: [], // { categoria, resposta, pontos, supernova, percentil }
  relogio: null,
  fimDoTempo: 0,
  ativa: false, // aceitando respostas agora
};

cena.aoQuadro((al) => {
  // a distância conta a partir do ponto de partida (o céu escuro), não da Terra
  $("distancia").textContent = `${numero(anosLuz(al))} AL`;
  // os pontos sobem contando, junto com a descida
  if (estado.totalMostrado < estado.total) {
    estado.totalMostrado = Math.min(estado.total, estado.totalMostrado + Math.max(0.4, (estado.total - estado.totalMostrado) * 0.06));
    $("pontos").textContent = numero(estado.totalMostrado);
  }
});

function prepararCategoria(cat) {
  const mapa = new Map();
  for (const r of cat.respostas) {
    for (const nome of [r.resposta, ...r.apelidos]) mapa.set(compactar(nome), { resposta: r, nome });
  }
  return { ...cat, mapa };
}

function iniciar() {
  const dados = window.NICHO_DADOS;
  if (!dados) {
    $("regras").textContent = "Não achei as perguntas (jogo/dados.js). Rode python3 scripts/pontuar.py.";
    $("comecar").hidden = true;
    return;
  }
  const escolhidas = ALEATORIO
    ? embaralhar(dados.indice, Math.random).slice(0, RODADAS_POR_DIA)
    : categoriasDoDia(dados.indice, estado.data, dados.ordem);
  estado.categorias = escolhidas.map((c) => prepararCategoria(dados.categorias[c.id]));

  // título com as letras soltas, para a onda
  const titulo = $("titulo");
  [..."NICHO"].forEach((letra, i) => {
    const s = document.createElement("span");
    s.textContent = letra;
    s.style.animationDelay = `${i * -0.25}s`;
    s.setAttribute("aria-hidden", "true");
    titulo.append(s);
  });
  $("regras").textContent = `${estado.categorias.length} incursões · ${SEGUNDOS} segundos cada · quanto mais rara, mais fundo`;
  mostrarDiaESequencia();
  $("modo-info").textContent = `${estado.categorias.length} incursões · ${SEGUNDOS} s`;
  cena.skin(skinEscolhida());
  aplicarOpcoes();
  desenharMascoteDoMenu();
  montarSkins();
  $("som").classList.toggle("mudo", Som.estaMudo());

  const salvo = lerProgresso();
  if (salvo) {
    estado.historico = salvo.historico;
    estado.total = estado.totalMostrado = salvo.total;
    estado.rodada = salvo.historico.length;
    cena.irPara(AL_INICIAL + profundidade());
    if (salvo.historico.some((h) => h.supernova)) { cena.dourado(false); atualizarIconeAba(true); }
    $("pontos").textContent = numero(estado.total);
  }
  montarQuadrados();
  if (estado.rodada >= estado.categorias.length) {
    $("inicio").hidden = true;
    $("hud").hidden = false;
    $("abrir-skins").hidden = true;
    mostrarFim(false);
    return;
  }
  if (estado.rodada > 0) {
    $("comecar").textContent = "▼ CONTINUAR VIAGEM ▼";
  }
}

// profundidade total do dia: soma da viagem de cada resposta
const DESCIDA_INICIAL = 1400;

// Quanto você viajou hoje. A câmera fica em AL_INICIAL + isso (ver cena.js).
// Em anos-luz de verdade (1 ponto = 62 AL, ver cena.js).
const anosLuzDoDia = () => Math.round(profundidade() * AL_POR_U);
// O marco mais fundo que você já passou (para o relatório).
function ultimoMarco() {
  const al = anosLuzDoDia();
  return MARCOS.filter((m) => m.real != null && m.real <= al).pop();
}
function profundidade() {
  return estado.historico.reduce((soma, h) => soma + viagem(h.pontos), 0);
}

function mostrarPergunta(ligada) {
  $("cartao-pergunta").hidden = !ligada;
  $("painel-resposta").hidden = !ligada;
}

function montarQuadrados() {
  const caixa = $("quadrados");
  caixa.innerHTML = "";
  estado.categorias.forEach((_, i) => {
    const q = document.createElement("span");
    const h = estado.historico[i];
    if (h) q.style.background = h.resposta ? faixaDe(h.pontos, h.supernova).cor : "#3a3470";
    if (i === estado.rodada && !h) q.className = "atual";
    caixa.append(q);
  });
  const n = Math.min(estado.rodada + 1, estado.categorias.length);
  $("rotulo-rodada").textContent = `INCURSÃO ${n} DE ${estado.categorias.length}`;
}

function comecar() {
  Som.ligar();
  Som.ceu(false);
  Som.katchin();
  Som.inicio(); // toca sempre, também ao continuar a viagem
  $("inicio").hidden = true;
  $("hud").hidden = false;
  // a skin só troca na tela inicial: com a viagem começada, o botão some
  $("abrir-skins").hidden = true;
  if ($("janela-skins").open) $("janela-skins").close();
  if (estado.rodada === 0) {
    // sai do ladinho da Terra e desce até o céu escuro; aí começa a primeira incursão
    // modo teste: ?ir=20000 na URL começa a viagem já nesses anos-luz (para ver o fundo de perto)
    const ir = Number(new URLSearchParams(location.search).get("ir")) || 0;
    cena.irAte(U(Math.max(0, ir)), DESCIDA_INICIAL);
    setTimeout(iniciarRodada, DESCIDA_INICIAL - 200);
    return;
  }
  iniciarRodada();
}

// ---------- rodada ----------

function iniciarRodada() {
  const cat = estado.categorias[estado.rodada];
  buscarContagem();
  cena.novaRodada(cat);
  montarQuadrados();
  $("rotulo-pergunta").textContent = `INCURSÃO ${estado.rodada + 1} DE ${estado.categorias.length}`;
  $("pergunta").textContent = cat.pergunta || cat.titulo;
  $("formulario").hidden = true;
  $("relogio").hidden = true;
  $("sugestao").hidden = true;
  avisar("", "");
  $("palpite").value = "";
  mostrarPergunta(true);
  Som.pergunta(); // avisa que chegou pergunta nova

  // contagem antes do relógio, para dar tempo de ler
  let n = 3;
  const contar = () => {
    if (n === 0) {
      $("aviso").hidden = true;
      abrirRelogio();
      return;
    }
    $("aviso").innerHTML = `preparando a incursão · o relógio começa em <b>${n}</b>`;
    $("aviso").hidden = false;
    if (n < 3) Som.contagem(false); // no "3" quem toca é o som da pergunta nova
    n--;
    setTimeout(contar, 1000);
  };
  contar();
}

function abrirRelogio() {
  Som.contagem(true);
  cena.relogio();
  estado.ativa = true;
  estado.fimDoTempo = performance.now() + SEGUNDOS * 1000;
  $("formulario").hidden = false;
  $("relogio").hidden = false;
  $("palpite").focus();
  let ultimoSegundo = SEGUNDOS + 1;
  const atualizar = () => {
    const resta = Math.max(0, estado.fimDoTempo - performance.now()) / 1000;
    $("barra-tempo").style.width = `${(resta / SEGUNDOS) * 100}%`;
    const s = Math.ceil(resta);
    $("tempo").textContent = String(s).padStart(2, "0");
    desenharRadar(resta / SEGUNDOS, s <= 5);
    // nos últimos segundos: relógio treme, número fica vermelho e as bordas da tela avermelham
    $("relogio").classList.toggle("urgente", s <= 5);
    $("alerta").classList.toggle("ligado", s <= 5 && resta > 0);
    if (s < ultimoSegundo) {
      ultimoSegundo = s;
      if (s <= 5 && s > 0) Som.tique(true);
    }
    if (resta <= 0) {
      tempoEsgotado();
      return;
    }
    estado.relogio = requestAnimationFrame(atualizar);
  };
  atualizar();
}

// Relógio-radar: um mini sistema solar com o feixe de um radar girando.
// O anel de fora é o tempo que resta; a lua corre na ponta do feixe e
// "acende" os pontinhos por onde passa. No fim, tudo fica vermelho e acelera.
const PONTOS_RADAR = [[0.6, 0.9], [2.4, 0.55], [3.9, 0.8], [5.2, 0.4]];
function desenharRadar(fracao, urgente) {
  const tela = $("radar");
  const tamanho = 64;
  const dpr = window.devicePixelRatio || 1;
  if (tela.width !== tamanho * dpr) {
    tela.width = tela.height = tamanho * dpr;
    tela.style.width = tela.style.height = `${tamanho}px`;
  }
  const c = tela.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, tamanho, tamanho);
  const m = tamanho / 2;
  const cor = urgente ? [255, 70, 90] : [95, 225, 255];
  const rgba = (a) => `rgba(${cor[0]}, ${cor[1]}, ${cor[2]}, ${a})`;
  const giro = (performance.now() / 1000) * Math.PI * (urgente ? 2.6 : 1.1);

  // fundo
  c.save();
  c.beginPath();
  c.arc(m, m, 26, 0, Math.PI * 2);
  const fundo = c.createRadialGradient(m, m, 2, m, m, 26);
  fundo.addColorStop(0, urgente ? "#2a0818" : "#121048");
  fundo.addColorStop(1, "#05021a");
  c.fillStyle = fundo;
  c.fill();
  c.clip();
  // órbitas
  c.strokeStyle = rgba(0.22);
  c.lineWidth = 1;
  c.setLineDash([2, 3]);
  for (const r of [9, 16, 23]) {
    c.beginPath();
    c.arc(m, m, r, 0, Math.PI * 2);
    c.stroke();
  }
  c.setLineDash([]);
  // feixe do radar: fatias cada vez mais transparentes atrás da ponta
  for (let i = 0; i < 28; i++) {
    const a0 = giro - i * 0.05;
    c.beginPath();
    c.moveTo(m, m);
    c.arc(m, m, 26, a0 - 0.05, a0);
    c.closePath();
    c.fillStyle = rgba(0.32 * (1 - i / 28));
    c.fill();
  }
  // pontinhos que acendem quando o feixe passa
  for (const [ang, dist] of PONTOS_RADAR) {
    const atras = (((giro - ang) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const brilho = Math.max(0, 1 - atras / 2.5);
    c.fillStyle = rgba(0.15 + 0.85 * brilho);
    c.fillRect(m + Math.cos(ang) * dist * 24 - 1, m + Math.sin(ang) * dist * 24 - 1, 2, 2);
  }
  c.restore();
  // miolo escuro: o número do tempo fica em cima
  c.fillStyle = "rgba(5, 3, 24, 0.85)";
  c.beginPath();
  c.arc(m, m, 13, 0, Math.PI * 2);
  c.fill();
  // lua na ponta do feixe
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(m + Math.cos(giro) * 16, m + Math.sin(giro) * 16, 2, 0, Math.PI * 2);
  c.fill();
  // anel do tempo que resta
  c.lineWidth = 3.5;
  c.lineCap = "round";
  c.strokeStyle = "rgba(255, 255, 255, 0.08)";
  c.beginPath();
  c.arc(m, m, 29, 0, Math.PI * 2);
  c.stroke();
  c.shadowColor = rgba(0.9);
  c.shadowBlur = 6;
  c.strokeStyle = rgba(1);
  c.beginPath();
  c.arc(m, m, 29, -Math.PI / 2, -Math.PI / 2 + Math.max(0.001, fracao) * Math.PI * 2);
  c.stroke();
  c.shadowBlur = 0;
}

function pararRelogio() {
  estado.ativa = false;
  $("alerta").classList.remove("ligado");
  cancelAnimationFrame(estado.relogio);
}

function avisar(texto, classe) {
  $("mensagem").textContent = texto;
  $("mensagem").className = classe;
}

// Enquanto digita: se parece um erro de digitação, oferece a correção.
let esperaSugestao = 0;
function aoDigitar() {
  Som.tecla();
  $("palpite").classList.remove("tremendo");
  clearTimeout(esperaSugestao);
  esperaSugestao = setTimeout(() => {
    const texto = $("palpite").value.trim();
    const busca = texto.length >= 3 ? buscar(estado.categorias[estado.rodada], texto) : null;
    if (busca && !busca.exato && !opcoes.semCorrecao) mostrarSugestao(busca.nome);
    else $("sugestao").hidden = true;
  }, 250);
}

function mostrarSugestao(nome) {
  $("sugestao").textContent = `você quis dizer “${nome}”? (Tab para usar)`;
  $("sugestao").dataset.nome = nome;
  $("sugestao").hidden = false;
}

// Preenche o campo com a correção, mas não envia: o jogador confirma.
function usarSugestao() {
  const nome = $("sugestao").dataset.nome;
  if (!nome) return;
  clearTimeout(esperaSugestao);
  $("palpite").value = nome;
  $("sugestao").hidden = true;
  avisar(`Corrigido para “${nome}”. Aperte LANÇAR para confirmar.`, "aviso");
  Som.sugestao();
  $("palpite").focus();
}

function palpitar(evento) {
  evento.preventDefault();
  if (!estado.ativa) return;
  const cat = estado.categorias[estado.rodada];
  const texto = $("palpite").value.trim();
  if (!texto) return;
  let busca = buscar(cat, texto);
  // sem autocorreção: escrita quase certa conta como não achada
  if (busca && !busca.exato && opcoes.semCorrecao) busca = null;

  if (!busca) {
    if (texto.length >= 3) enviarResposta(cat, { recusada: texto });
    avisar(`“${texto}” não está no mapa estelar. Tente outra.`, "erro");
    $("palpite").classList.remove("tremendo");
    void $("palpite").offsetWidth; // reinicia a animação
    $("palpite").classList.add("tremendo");
    $("palpite").select();
    Som.erro();
    return;
  }
  if (!busca.exato) {
    // escrito quase certo: corrige no campo e espera a confirmação
    $("sugestao").dataset.nome = busca.nome;
    usarSugestao();
    avisar(`Você digitou “${texto}”. Corrigido para “${busca.nome}”: aperte LANÇAR para confirmar.`, "aviso");
    return;
  }

  pararRelogio();
  const achada = busca.resposta;
  const supernova = achada.resposta === cat.supernova;
  const aoVivo = famaAoVivo(cat, achada);
  const pontos = supernova ? achada.pontos * 2 : aoVivo.pontos;
  const percentil = aoVivo.acima;
  enviarResposta(cat, { resposta: achada.resposta });
  mostrarPergunta(false);
  cena.descer(achada.resposta, pontos, supernova);
  Som.descer(Math.min(1, pontos / 100));
  registrar(cat, achada.resposta, pontos, supernova, percentil);
  // nas raras, a festa da chegada aparece sozinha antes do resultado
  const pausa = supernova ? 1000 : pontos >= 60 ? 900 : pontos >= 35 ? 600 : 200;
  setTimeout(() => mostrarResultado(cat, achada.resposta, pontos, supernova), duracaoQueda(pontos, supernova) + pausa);
}

function tempoEsgotado() {
  pararRelogio();
  const cat = estado.categorias[estado.rodada];
  mostrarPergunta(false);
  Som.erro();
  registrar(cat, null, 0, false, 0);
  mostrarResultado(cat, null, 0, false);
}

function registrar(cat, resposta, pontos, supernova, percentil) {
  estado.total += pontos;
  estado.historico.push({ categoria: cat.titulo, resposta, pontos, supernova, percentil });
  salvarProgresso();
}

function mostrarResultado(cat, resposta, pontos, supernova) {
  const faixa = resposta
    ? faixaDe(pontos, supernova)
    : { id: "nada", nome: "TEMPO ESGOTADO", cor: "#ff6b81", frase: "O relógio zerou. Esta fica sem pontos." };
  const card = $("resultado");
  card.style.setProperty("--cor-faixa", faixa.cor);
  $("icone").src = cena.icones[faixa.id];
  $("nome-faixa").textContent = faixa.nome;
  $("palavra").textContent = resposta ? `“${resposta}”` : "";
  $("linha-pontos").innerHTML = resposta
    ? `<b>+${pontos} PONTOS</b> · viajou ${numero(Math.round(viagem(pontos) * AL_POR_U))} AL`
    : "+0 PONTOS";
  $("frase").textContent = faixa.frase;

  // nome da faixa entra com um "pop" (maior nas raras) e os pontos sobem contando
  const nivel = !resposta ? 0 : supernova ? 4 : ["obvia", "comum", "incomum", "rara", "lendaria"].indexOf(faixa.id);
  const nome = $("nome-faixa");
  nome.className = "";
  void nome.offsetWidth;
  nome.className = `pop nivel-${Math.max(0, nivel)}`;
  const alvo = $("linha-pontos").querySelector("b");
  if (alvo && pontos > 0) {
    const inicio = performance.now();
    const dura = 300 + Math.min(900, pontos * 8);
    const contar = (agora) => {
      const t = Math.min(1, (agora - inicio) / dura);
      alvo.textContent = `+${Math.round(pontos * (1 - Math.pow(1 - t, 3)))} PONTOS`;
      if (t < 1) requestAnimationFrame(contar);
    };
    requestAnimationFrame(contar);
  }
  const ultima = estado.rodada + 1 >= estado.categorias.length;
  $("proxima").textContent = ultima ? "VOLTAR ▲" : "VIAJAR ▼";
  if (supernova) { cena.dourado(true); atualizarIconeAba(true); }
  card.hidden = false;
  cena.resultado();
  if (supernova) Som.supernova();
  else if (resposta) Som.faixa(FAIXAS.length - 1 - FAIXAS.indexOf(faixa));
  Som.profundidade(anosLuzDoDia());
  montarQuadrados();
  if (ultima) $("rotulo-rodada").textContent = "VIAGEM COMPLETA";
  $("proxima").focus();
}

function proxima() {
  $("resultado").hidden = true;
  estado.rodada += 1;
  if (estado.rodada < estado.categorias.length) {
    iniciarRodada();
    return;
  }
  // fim da viagem: o cenário sobe devagar de volta até a Terra, e aí vem o relatório
  $("proxima").disabled = true;
  cena.subir(SUBIDA);
  Som.subir(SUBIDA);
  setTimeout(() => {
    $("proxima").disabled = false;
    mostrarFim(true);
  }, SUBIDA - 300);
}
const SUBIDA = 4200;

// ---------- fim ----------

function mostrarFim(comSom) {
  if (LINK_APOIO) {
    const apoio = $("apoio-link");
    apoio.href = LINK_APOIO;
    apoio.textContent = "APOIAR";
    apoio.removeAttribute("aria-disabled");
  }
  Som.fundo(false);
  if (comSom) Som.fim();
  else cena.irPara(0);
  cena.limpar();
  mostrarPergunta(false);
  $("fim").hidden = false;
  montarQuadrados();
  $("rotulo-rodada").textContent = "VIAGEM COMPLETA";
  $("fim-pontos").textContent = numero(estado.total);
  const marco = ultimoMarco();
  $("fim-profundidade").textContent = `↓ ${numero(anosLuzDoDia())} AL de profundidade` + (marco ? ` · além de ${marco.nome.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())}` : "");
  const media = estado.historico.reduce((s, h) => s + (h.percentil || 0), 0) / Math.max(1, estado.historico.length);
  $("fim-comparacao").textContent = `Em média, suas respostas foram mais nichadas que as de ${Math.min(99, Math.round(media * 100))}% dos jogadores.`;
  montarGrafico();
  mostrarCurva();
  montarFaixas();
  montarRespostas();

  const seq = mostrarDiaESequencia();
  if (!ALEATORIO) avisarSkinNova(seq);
  const icones = estado.historico.map((h) => (h.resposta ? faixaDe(h.pontos, h.supernova).emoji : "⚫"));
  $("compartilhar").textContent =
    `NICHO · DIA #${numeroDoDia(estado.data)}${seq > 1 ? ` · 🔥 ${seq} dias seguidos` : ""}\n${icones.join(" ")}\n${numero(estado.total)} pontos · ↓ ${numero(anosLuzDoDia())} AL ${skinEscolhida() === "alien" ? "🛸" : "🐻"}\n${LINK_JOGO}`;
  $("enviar").hidden = !navigator.share;
  contarAteAmanha();
}

function montarGrafico() {
  const g = $("grafico");
  g.innerHTML = "";
  const maximo = Math.max(100, ...estado.historico.map((h) => h.pontos));
  const altura = 200;
  [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
    const e = document.createElement("div");
    e.className = "eixo";
    e.style.top = `${f * altura}px`;
    e.textContent = Math.round(f * maximo);
    g.append(e);
  });
  estado.historico.forEach((h, i) => {
    const faixa = h.resposta ? faixaDe(h.pontos, h.supernova) : { id: "nada", cor: "#ff6b81" };
    const col = document.createElement("div");
    col.className = "coluna";
    col.style.color = faixa.cor;
    const fio = document.createElement("div");
    fio.className = "fio";
    fio.style.height = `${Math.max(2, (h.pontos / maximo) * altura)}px`;
    const img = document.createElement("img");
    img.src = cena.icones[faixa.id];
    img.alt = "";
    const num = document.createElement("span");
    num.className = "numero";
    num.textContent = i + 1;
    const dica = document.createElement("span");
    dica.className = "dica-coluna";
    dica.textContent = h.resposta ? `${h.categoria}: ${h.resposta} (+${h.pontos})` : `${h.categoria}: sem resposta`;
    // a dica fica logo acima do ícone, só enquanto o mouse estiver em cima
    dica.style.top = `${Math.max(2, (h.pontos / maximo) * altura) - 34}px`;
    col.setAttribute("aria-label", dica.textContent);
    col.append(fio, img, num, dica);
    g.append(col);
  });
}

// ---------- fama ao vivo ----------
// Os pontos vêm do que os jogadores de hoje responderam (/api/respostas, functions/api/respostas.js).
// Antes de haver gente, vale o chute de partida da simulação de 1000 jogadores (scripts/fama.py),
// que entra na conta como se fosse FORCA_DO_CHUTE jogadores. Com umas 100 pessoas, a contagem
// real já pesa tanto quanto o chute, e daí para a frente manda. Aberto do computador (file://),
// sem internet, ou numa categoria sem simulação, ficam os pontos fixos de dados.js.
const API_RESPOSTAS = "/api/respostas";
const FORCA_DO_CHUTE = 100;
// A mesma régua do scripts/pontuar.py (REGUA_FIXA): quantos em 1000 dão a resposta -> pontos.
const REGUA_FIXA = [
  [150, 15, 8, 15], // óbvia: 15 ou mais em 1000
  [15, 4, 18, 34], // comum
  [4, 1, 35, 58], // incomum
];
let contagemDoDia = null; // { [categoria]: { total, contagem: { [resposta]: n } } }

function buscarContagem() {
  if (location.protocol === "file:") return;
  fetch(`${API_RESPOSTAS}?dia=${estado.data}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => {
      if (c && c.categorias) contagemDoDia = c.categorias;
    })
    .catch(() => {});
}

// Cada navegador conta uma resposta aceita por categoria por dia; recusadas contam a cada tentativa.
function enviarResposta(cat, corpo) {
  if (location.protocol === "file:" || ALEATORIO || !cat.id) return;
  const chave = `nicho:resposta:${estado.data}:${cat.id}`;
  if (corpo.resposta) {
    if (lerChave(chave)) return;
    gravarChave(chave, "1");
  }
  fetch(API_RESPOSTAS, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dia: estado.data, categoria: cat.id, ...corpo }),
    keepalive: true,
  }).catch(() => {});
}

function pontosDaRegua(emMil) {
  for (const [de, ate, pDe, pAte] of REGUA_FIXA) {
    if (emMil >= ate) {
      const k = (Math.log(Math.min(emMil, de)) - Math.log(de)) / (Math.log(ate) - Math.log(de));
      return Math.round(pDe + (pAte - pDe) * Math.max(0, Math.min(1, k)));
    }
  }
  return null; // menos de 1 em 1000: rara
}

// { pontos, acima }: acima = a parte dos jogadores que deu (ou daria) uma resposta mais óbvia.
function famaAoVivo(cat, achada) {
  const fixo = {
    pontos: achada.pontos,
    acima: typeof achada.acima === "number"
      ? achada.acima
      : cat.respostas.filter((r) => r.pontos < achada.pontos).length / cat.respostas.length,
  };
  const dia = contagemDoDia && contagemDoDia[cat.id];
  if (!dia || !dia.total || typeof achada.l !== "number") return fixo;
  const fatia = (r) =>
    (((dia.contagem[r.resposta] || 0) + FORCA_DO_CHUTE * ((r.l || 0) / 1000)) / (dia.total + FORCA_DO_CHUTE)) * 1000;
  const minha = fatia(achada);
  let mais = 0;
  let igual = 0;
  let soma = 0;
  for (const r of cat.respostas) {
    const f = fatia(r);
    soma += f;
    if (r === achada) continue;
    if (f > minha) mais += f;
    else if (f === minha) igual += f;
  }
  const regua = pontosDaRegua(minha);
  return {
    // rara (menos de 1 em 1000): fica com a ordem da cauda de dados.js, no mínimo 60
    pontos: regua === null ? Math.max(60, achada.pontos) : regua,
    acima: soma ? (mais + igual / 2) / soma : fixo.acima,
  };
}

// ---------- curva dos viajantes ----------
// No fim, a pontuação do dia vai (anônima: só o dia e os pontos) para /api/pontuacao,
// que devolve quantos viajantes terminaram em cada faixa de 10 pontos. A curva mostra
// onde você ficou. Cada navegador manda uma vez por dia. Aberto do computador (file://)
// ou sem internet, a seção simplesmente não aparece.
const API_PONTUACAO = "/api/pontuacao";

function mostrarCurva() {
  $("secao-curva").hidden = true;
  if (location.protocol === "file:") return;
  const chave = `nicho:enviado:${estado.data}`;
  let jaEnviou = false;
  try {
    jaEnviou = !!localStorage.getItem(chave);
  } catch {}
  const mandar = !ALEATORIO && !jaEnviou;
  const pedido = mandar
    ? fetch(API_PONTUACAO, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dia: estado.data, pontos: Math.round(estado.total) }),
      })
    : fetch(`${API_PONTUACAO}?dia=${estado.data}`);
  pedido
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => {
      if (!c || !Array.isArray(c.contagem)) return;
      if (mandar) {
        try {
          localStorage.setItem(chave, "1");
        } catch {}
      }
      desenharCurva(c, Math.round(estado.total));
    })
    .catch(() => {});
}

// Fração dos viajantes que ficaram abaixo de você (empates contam metade).
function percentilNaCurva(c, pontos) {
  const k = Math.min(c.contagem.length - 1, Math.floor(pontos / c.largura));
  let abaixo = c.contagem[k] / 2;
  for (let i = 0; i < k; i++) abaixo += c.contagem[i];
  return c.total ? abaixo / c.total : 0;
}

// Passar o mouse (ou o dedo) na curva mostra a pontuação daquele ponto
// e quantos por cento dos viajantes ficaram abaixo dela.
let curvaAtual = null;
function mirarCurva(e) {
  const caixa = $("curva");
  const mira = $("curva-mira");
  if (!curvaAtual) return;
  const r = $("curva-svg").getBoundingClientRect();
  const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const { c, fimX, suave, topo, alturaUtil } = curvaAtual;
  const v = Math.round(f * fimX);
  const i = Math.min(suave.length - 1, Math.floor(v / c.largura));
  const pct = Math.round(percentilNaCurva(c, v) * 100);
  mira.hidden = false;
  mira.style.left = `${f * 100}%`;
  mira.style.setProperty("--y", `${(1 - (suave[i] / topo) * alturaUtil) * r.height}px`);
  const rotulo = mira.querySelector("span");
  rotulo.textContent = `${numero(v)} pts · acima de ${pct}%`;
  rotulo.style.transform = `translateX(${f < 0.2 ? 0 : f > 0.8 ? -100 : -50}%)`;
  caixa.classList.add("mirando");
}
function soltarCurva() {
  $("curva-mira").hidden = true;
  $("curva").classList.remove("mirando");
}
$("curva").addEventListener("pointermove", mirarCurva);
$("curva").addEventListener("pointerdown", mirarCurva);
$("curva").addEventListener("pointerleave", soltarCurva);

function desenharCurva(c, pontos) {
  const secao = $("secao-curva");
  const svg = $("curva-svg");
  const eixo = $("curva-eixo");
  svg.innerHTML = "";
  eixo.innerHTML = "";
  secao.hidden = false;
  if (c.total < 5) {
    $("curva").hidden = true;
    $("curva-texto").textContent = "Você está entre os primeiros viajantes de hoje. Volte mais tarde para ver onde ficou na curva.";
    return;
  }
  $("curva").hidden = false;

  // eixo x: de 0 até um pouco além da última viagem (ou da sua), em centenas
  const ultima = c.contagem.reduce((m, n, i) => (n ? i : m), 0);
  const fimX = Math.min(c.contagem.length * c.largura, Math.max(200, Math.ceil(Math.max((ultima + 1) * c.largura, pontos + 20) / 100) * 100));
  const nBarras = Math.ceil(fimX / c.largura);

  // suaviza o histograma (núcleo gaussiano) para virar uma curva
  const sigma = 1.6;
  const suave = [];
  for (let i = 0; i < nBarras; i++) {
    let s = 0;
    for (let j = 0; j < c.contagem.length; j++) s += c.contagem[j] * Math.exp(-((i - j) ** 2) / (2 * sigma * sigma));
    suave.push(s);
  }
  const topo = Math.max(...suave) || 1;
  const L = 600, A = 160, margem = 8;
  const px = (v) => (v / fimX) * L;
  const py = (s) => A - (s / topo) * (A - margem);
  const pts = suave.map((s, i) => [px((i + 0.5) * c.largura), py(s)]);
  pts.unshift([0, py(suave[0])]);
  pts.push([L, py(suave[suave.length - 1])]);
  const linha = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const area = `${linha}L${L},${A}L0,${A}Z`;
  const xVoce = Math.min(L, px(pontos));
  curvaAtual = { c, fimX, suave, topo, alturaUtil: (A - margem) / A };

  const ns = "http://www.w3.org/2000/svg";
  const el = (tag, attrs) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.append(e);
    return e;
  };
  svg.innerHTML = `<defs>
      <linearGradient id="curva-fundo" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5fe1ff" stop-opacity="0.32"/><stop offset="1" stop-color="#5fe1ff" stop-opacity="0.03"/>
      </linearGradient>
      <linearGradient id="curva-sua" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ff4f8b" stop-opacity="0.6"/><stop offset="1" stop-color="#ff4f8b" stop-opacity="0.08"/>
      </linearGradient>
      <clipPath id="curva-ate-voce"><rect x="0" y="0" width="${xVoce.toFixed(1)}" height="${A}"/></clipPath>
    </defs>`;
  el("path", { d: area, fill: "url(#curva-fundo)" });
  el("path", { d: area, fill: "url(#curva-sua)", "clip-path": "url(#curva-ate-voce)" });
  el("path", { d: linha, fill: "none", stroke: "#5fe1ff", "stroke-width": 2, "vector-effect": "non-scaling-stroke" });
  el("line", { x1: xVoce, x2: xVoce, y1: 0, y2: A, stroke: "#ff4f8b", "stroke-width": 2, "stroke-dasharray": "4 3", "vector-effect": "non-scaling-stroke" });

  // rótulos em HTML (o SVG estica com a largura, o texto não)
  for (let v = 0; v <= fimX; v += 100) {
    const t = document.createElement("span");
    t.textContent = v;
    t.style.left = `${(v / fimX) * 100}%`;
    eixo.append(t);
  }
  const voce = document.createElement("span");
  voce.className = "voce";
  voce.textContent = `VOCÊ · ${numero(pontos)}`;
  const f = xVoce / L;
  voce.style.left = `${f * 100}%`;
  voce.style.transform = `translateX(${f < 0.15 ? 0 : f > 0.85 ? -100 : -50}%)`;
  $("curva").append(voce);
  $("curva").querySelectorAll(".voce").forEach((v) => v !== voce && v.remove());

  const pct = Math.round(percentilNaCurva(c, pontos) * 100);
  $("curva-texto").textContent = ALEATORIO
    ? `Modo teste: sua viagem não entrou na curva, mas ficaria acima de ${pct}% dos viajantes de hoje.`
    : pct >= 99
      ? "Você foi mais fundo que 99% dos viajantes de hoje. Poucos chegaram tão longe!"
      : `Você foi mais fundo que ${pct}% dos viajantes de hoje.`;
}

// Tabela das faixas, da mais rara para a mais óbvia; as que você alcançou hoje ficam acesas.
function montarFaixas() {
  const lista = $("tabela-faixas");
  lista.innerHTML = "";
  const alcancadas = new Set(estado.historico.filter((h) => h.resposta).map((h) => faixaDe(h.pontos, h.supernova).id));
  const linhas = [
    { ...SUPERNOVA, faixa: "★ 1 por pergunta", texto: "A resposta escondida. Só existe uma." },
    ...FAIXAS.map((f, i) => ({
      ...f,
      faixa: i === 0 ? `${f.min}+ pts` : `${f.min}–${FAIXAS[i - 1].min - 1} pts`,
      texto: f.frase,
    })),
  ];
  for (const l of linhas) {
    const li = document.createElement("li");
    li.style.setProperty("--c", l.cor);
    if (alcancadas.has(l.id)) li.className = "sua";
    const img = document.createElement("img");
    img.src = cena.icones[l.id];
    img.alt = "";
    const pts = document.createElement("span");
    pts.className = "faixa-pts";
    pts.textContent = l.faixa;
    const txt = document.createElement("span");
    txt.textContent = `${l.nome[0]}${l.nome.slice(1).toLowerCase()}. ${l.texto}`;
    li.append(img, pts, txt);
    lista.append(li);
  }
}

// Cada incursão do dia: a pergunta, a sua resposta, a faixa e os pontos.
function montarRespostas() {
  const lista = $("respostas-dia");
  lista.innerHTML = "";
  estado.historico.forEach((h, i) => {
    const faixa = h.resposta ? faixaDe(h.pontos, h.supernova) : { id: "nada", cor: "#6b6a99", nome: "" };
    const li = document.createElement("li");
    li.style.setProperty("--c", faixa.cor);
    if (!h.resposta) li.className = "vazia";
    const n = document.createElement("span");
    n.className = "n";
    n.textContent = i + 1;
    const img = document.createElement("img");
    img.src = cena.icones[faixa.id];
    img.alt = "";
    const cat = document.createElement("span");
    cat.className = "cat";
    cat.textContent = h.categoria;
    const resp = document.createElement("span");
    resp.className = "resp";
    resp.textContent = h.resposta || "— tempo esgotado";
    const pts = document.createElement("span");
    pts.className = "pts";
    pts.textContent = `+${h.pontos}`;
    const extra = document.createElement("span");
    extra.className = "extra";
    extra.textContent = !h.resposta
      ? ""
      : h.supernova
        ? "Singularidade! A resposta escondida desta pergunta."
        : `${faixa.nome[0]}${faixa.nome.slice(1).toLowerCase()} · mais nichada que ${Math.min(99, Math.round((h.percentil || 0) * 100))}% dos jogadores`;
    const seta = document.createElement("span");
    seta.className = "seta";
    seta.textContent = "▾";
    li.append(n, img, cat, resp, pts, extra, seta);
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-expanded", "false");
    li.title = "Ver todas as respostas desta pergunta";
    const alternar = (e) => {
      // dentro da lista aberta, os filtros e a busca continuam funcionando;
      // clicar em qualquer outro canto dela fecha
      if (e.target.closest(".banco button, .banco input")) return;
      const abrir = !li.classList.contains("aberta");
      // só uma aberta por vez: abrir outra fecha a anterior
      if (abrir) lista.querySelectorAll(":scope > li.aberta").forEach(fecharBanco);
      li.classList.toggle("aberta", abrir);
      li.setAttribute("aria-expanded", String(abrir));
      if (abrir && !li.querySelector(".banco")) li.append(montarBanco(estado.categorias[i], h.resposta));
    };
    li.addEventListener("click", alternar);
    li.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !e.target.closest(".banco")) { e.preventDefault(); alternar(e); }
    });
    lista.append(li);
  });
}
function fecharBanco(li) {
  li.classList.remove("aberta");
  li.setAttribute("aria-expanded", "false");
}
// Clicar fora da lista ou apertar Esc fecha a aba de respostas aberta.
document.addEventListener("click", (e) => {
  if (!e.target.closest("#respostas-dia")) document.querySelectorAll("#respostas-dia > li.aberta").forEach(fecharBanco);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const aberta = document.querySelector("#respostas-dia > li.aberta");
  if (aberta) { fecharBanco(aberta); aberta.focus(); }
});

// Uma curiosidade para cada resposta escondida (supernova).
const CURIOSIDADE_SUPERNOVA = {
  "capitais-do-brasil": "A capital planejada mais nova do Brasil, fundada em 1989.",
  constelacoes: "A única constelação com nome de uma pessoa real: a rainha Berenice II, do Egito.",
  "estados-do-brasil": "O estado mais ao norte: lá fica o Monte Caburaí, o ponto mais setentrional do país.",
  estrelas: "No telescópio ela vira duas: uma dourada e uma azul, lado a lado.",
  "luas-do-sistema-solar": "Lua de Saturno que pode esconder um oceano debaixo do gelo.",
  paises: "Tem só uns 20 km de litoral, todos na cidadezinha de Neum.",
  "planetas-e-planetas-anoes": "Foi a descoberta dela, em 2005, que tirou Plutão da lista de planetas.",
  "agencias-espaciais": "Criada em 1994, lança foguetes de Alcântara, no Maranhão, bem pertinho da linha do Equador.",
  "bagagem-do-astronauta": "Em 1971, o astronauta Alan Shepard levou um taco escondido e deu tacadas de golfe na Lua.",
  "coisas-com-casca": "A casquinha da ferida é o curativo do próprio corpo, feito de sangue seco.",
  "coisas-que-brilham-no-ceu": "A luz do vaga-lume é fria: quase toda a energia vira luz, quase nada vira calor.",
  "palavras-astro-e-cosmo": "Os navegadores portugueses mediam a altura das estrelas com ele para saber onde estavam no mar.",
  "animais-do-brasil": "O menor tamanduá do mundo: cabe na palma da mão e vive no alto das árvores.",
  astronautas: "Astronauta francês que voou numa Soyuz russa em 1992 e num ônibus espacial da NASA em 1999.",
  "cidades-do-brasil": "A cidade mais ao sul do Brasil: um lado da avenida principal já é o Uruguai.",
  "coisas-com-dentes": "O caracol tem milhares de dentinhos numa espécie de língua-lixa, a rádula.",
  "comidas-tipicas": "Caldo nordestino com farinha e ovo, servido bem quente.",
  "corpos-do-sistema-solar": "A primeira lua descoberta em volta de um asteroide (o Ida), vista pela sonda Galileo.",
  "defesas-dos-animais": "O lagarto-de-chifres espirra sangue dos olhos para assustar quem quer comê-lo.",
  dinossauros: "Um dos maiores predadores já achados no Brasil, desenterrado em Mato Grosso.",
  "esportes-olimpicos": "Foi esporte olímpico de verdade, de 1900 a 1920.",
  exoplanetas: "Um planeta gigante que gira em volta de uma estrela que está virando gigante vermelha.",
  "festa-junina": "Bolo de mandioca ralada, típico do Centro-Oeste.",
  "filmes-tom-hanks": "O primeiro filme do Tom Hanks, um terror de 1980 em que ele aparece pouquinho.",
  frutas: "Frutinha amarela da Mata Atlântica, coberta de uma penugem fininha.",
  "girias-brasileiras": "Gíria dos anos 70 para o pessoal hippie e natureba.",
  "instrumentos-musicais": "Tocado com arco de violino, o serrote faz um som que parece de fantasma.",
  "marcas-de-carro": "Considerado o primeiro carro fabricado no Brasil, em 1956, em Santa Bárbara d'Oeste.",
  "missoes-espaciais": "Faz parte do Gaganyaan, o programa da Índia para levar astronautas ao espaço com foguete próprio.",
  "paises-acima-do-equador": "Pegadinha: Roraima, o Amapá e pedaços do Amazonas e do Pará ficam acima do Equador.",
  "palavras-em-io": "O bugio é o macaco do ronco: dá para ouvir o grito dele a quilômetros.",
  "partes-do-corpo": "É o espacinho liso entre as sobrancelhas, logo acima do nariz.",
  "plantas-de-casa": "Uma samambaia que cresce presa no tronco das árvores, sem terra nenhuma.",
  "poetas-brasileiros": "Poeta simbolista baiano, redescoberto décadas depois de morrer pelos poetas concretos.",
  "protecao-do-sol": "Elefantes e porcos rolam na lama para proteger a pele do sol.",
  "racas-de-cachorro": "Raça brasileira dos pampas gaúchos, criada para caçar veados.",
  "times-de-futebol": "O time pernambucano famoso por ser chamado de \"pior time do mundo\".",
  "elementos-quimicos": "O elemento mais pesado já criado: só uns poucos átomos existiram, por menos de um milissegundo.",
  "aves": "Papagaio gordo da Nova Zelândia que não voa, é noturno e faz um \"bum\" grave para chamar a fêmea.",
  "bebidas": "Bebida fermentada de milho ou de casca de abacaxi, das festas do Nordeste.",
  "brincadeiras": "Brinquedo de uma bola furada presa por um cordão a um bastão: o desafio é encaixar a bola no bastão.",
  "capitais-do-mundo": "A capital de Palau, uma das menores capitais do mundo, com poucas centenas de moradores.",
  "coisas-amarelas": "Elemento químico em pó amarelo vivo que, quando queima, solta cheiro de ovo podre.",
  "coisas-da-praia": "Bichinho que se enterra na areia molhada quando a onda volta, deixando só um furinho.",
  "coisas-que-voam": "As sementes dessa plantinha voam com paraquedas e podem viajar quilômetros pelo vento.",
  "coisas-redondas": "Pãozinho redondo, branco e fininho que é distribuído na missa.",
  "cores": "O primeiro pigmento sintético moderno, descoberto por acaso em Berlim por volta de 1706.",
  "criaturas-do-folclore": "Monstro do sertão nordestino que mora no fim do mundo: tem um olho só no meio da testa e pés redondos.",
  "deuses-e-deusas": "Deusa inuíte do fundo do mar: as focas e as baleias nasceram dos dedos dela.",
  "doces-e-sobremesas": "Doce português de amêndoa e gema que, apesar do nome, não leva toucinho nenhum.",
  "idiomas": "A \"língua geral\" da Amazônia, criada a partir do tupi e ainda falada no Rio Negro.",
  "ilhas": "A \"Ilha das Cobras\" do litoral paulista, tão cheia de jararacas que a visita é proibida.",
  "insetos": "Inseto com uma \"cauda\" curvada que parece ferrão de escorpião, mas é totalmente inofensiva.",
  "jogadores-da-selecao": "O primeiro grande craque do futebol brasileiro: fez o gol do título sul-americano de 1919.",
  "jogos-de-videogame": "Jogo japonês em que você rola uma bola que vai grudando tudo pelo caminho, até ficar do tamanho de uma estrela.",
  "legumes-e-verduras": "Folha de um cacto rica em proteína, chamada em Minas de \"carne de pobre\".",
  "material-escolar": "Papel grosso que chupava o excesso de tinta das canetas-tinteiro, antes das esferográficas.",
  "musicos-brasileiros": "O \"Nego Dito\" da Vanguarda Paulista, que fazia uma música que não cabia em gênero nenhum.",
  "objetos-da-cozinha": "Fatiador de lâmina afiadíssima que corta legumes em fatias finíssimas como papel.",
  "ossos-do-corpo": "O único osso do corpo que não se encaixa em nenhum outro: fica solto no pescoço, segurando a língua.",
  "pedras-preciosas": "Pedra que muda de cor: é verde na luz do dia e fica vermelha na luz de lâmpada.",
  "peixes": "Eleito o animal mais feio do mundo, mas só fica assim fora d'água: lá no fundo do mar tem cara de peixe normal.",
  "profissoes": "Quem cuidava do farol, deixando a luz acesa a noite toda para guiar os navios.",
  "queijos": "Queijo feito com leite de búfala na Ilha de Marajó, no Pará.",
  "rios": "Rio africano que nunca chega ao mar: some num delta no meio do deserto do Kalahari.",
  "ritmos-musicais": "Dança e ritmo de Mato Grosso, tocado com viola de cocho, ganzá e mocho.",
  "super-herois-e-viloes": "Heroína da Marvel que, nos quadrinhos, já venceu o Thanos e o Doutor Destino com a ajuda de esquilos.",
  "temperos-e-especiarias": "A \"baunilha da Amazônia\": semente perfumada que dá cheiro de baunilha a doces e sorvetes.",
};

// Todas as respostas aceitas de uma pergunta, com os pontos, filtro por faixa e busca.
function montarBanco(cat, sua) {
  const banco = document.createElement("div");
  banco.className = "banco";
  const itens = cat.respostas
    .map((r) => {
      const sn = r.resposta === cat.supernova;
      const pontos = sn ? r.pontos * 2 : r.pontos;
      return { nome: r.resposta, pontos, faixa: faixaDe(pontos, sn), sn };
    })
    .sort((a, b) => b.sn - a.sn || b.pontos - a.pontos || a.nome.localeCompare(b.nome, "pt"));
  const filtros = [{ id: "todas", nome: "Todas", cor: "#eef0ff" }, SUPERNOVA, ...FAIXAS];
  let ativo = "todas";
  const chips = document.createElement("div");
  chips.className = "chips";
  for (const f of filtros) {
    const qtd = f.id === "todas" ? itens.length : itens.filter((it) => it.faixa.id === f.id).length;
    if (!qtd) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.style.setProperty("--c", f.cor);
    b.innerHTML = `${f.id === "todas" ? "Todas" : f.nome[0] + f.nome.slice(1).toLowerCase()} <b>${qtd}</b>`;
    if (f.id === ativo) b.className = "ativo";
    b.addEventListener("click", () => {
      ativo = f.id;
      chips.querySelectorAll("button").forEach((x) => x.classList.toggle("ativo", x === b));
      desenhar();
    });
    chips.append(b);
  }
  const campo = document.createElement("input");
  campo.type = "search";
  campo.placeholder = "procurar uma resposta…";
  campo.setAttribute("aria-label", "Procurar uma resposta");
  campo.addEventListener("input", () => desenhar());
  const lista = document.createElement("ul");
  const rodape = document.createElement("p");
  rodape.className = "rodape-banco";
  function desenhar() {
    const q = compactar(campo.value || "");
    const vis = itens.filter((it) => (ativo === "todas" || it.faixa.id === ativo) && (!q || compactar(it.nome).includes(q)));
    lista.innerHTML = "";
    for (const it of vis) {
      const li = document.createElement("li");
      li.style.setProperty("--c", it.faixa.cor);
      if (it.nome === sua) li.className = "sua";
      const img = document.createElement("img");
      img.src = cena.icones[it.faixa.id];
      img.alt = "";
      const nome = document.createElement("span");
      nome.className = "nome";
      nome.textContent = it.nome + (it.nome === sua ? "  ← você" : "");
      const pts = document.createElement("span");
      pts.className = "pts";
      pts.textContent = `+${it.pontos}`;
      li.append(img, nome, pts);
      if (it.sn) {
        const nota = document.createElement("span");
        nota.className = "nota";
        nota.textContent = `★ Singularidade. ${CURIOSIDADE_SUPERNOVA[cat.id] || "A resposta escondida desta pergunta."}`;
        li.append(nota);
      }
      lista.append(li);
    }
    rodape.textContent = `${vis.length} de ${itens.length} respostas`;
  }
  desenhar();
  banco.append(chips, campo, lista, rodape);
  return banco;
}

// "PRÓXIMA INCURSÃO EM 04:12:09" com um reloginho girando e os dígitos rolando
// como num odômetro; à meia-noite vira "PRONTA · recarregar".
let relogioAmanha = null;
function contarAteAmanha() {
  const el = $("amanha");
  el.innerHTML = '<span class="rotulo-amanha">PRÓXIMA INCURSÃO EM</span><span class="relogio-amanha" aria-hidden="true"><i></i></span><span class="digitos"></span>';
  const digitos = el.querySelector(".digitos");
  let anterior = "";
  const atualizar = () => {
    const agora = new Date();
    const amanha = new Date(agora);
    amanha.setHours(24, 0, 0, 0);
    const s = Math.floor((amanha - agora) / 1000);
    if (s <= 0 || agora.toDateString() !== diaDoJogo) {
      clearInterval(relogioAmanha);
      el.innerHTML = '<span class="rotulo-amanha">PRÓXIMA INCURSÃO EM</span> <b class="pronta">PRONTA</b> <a href="#" class="recarregar">recarregar</a>';
      el.querySelector(".recarregar").addEventListener("click", (e) => { e.preventDefault(); location.reload(); });
      return;
    }
    const p = (n) => String(n).padStart(2, "0");
    const texto = `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
    if (texto.length !== anterior.length) digitos.innerHTML = [...texto].map((c) => `<span>${c}</span>`).join("");
    [...texto].forEach((c, i) => {
      if (c === anterior[i]) return;
      const d = digitos.children[i];
      d.textContent = c;
      d.classList.remove("rolar");
      void d.offsetWidth; // reinicia a animação
      d.classList.add("rolar");
    });
    anterior = texto;
  };
  const diaDoJogo = new Date().toDateString();
  clearInterval(relogioAmanha);
  atualizar();
  relogioAmanha = setInterval(atualizar, 1000);
}

function copiar() {
  const texto = $("compartilhar").textContent;
  const selecionar = () => {
    // sem acesso à área de transferência: seleciona o texto para copiar à mão
    const faixaTexto = document.createRange();
    faixaTexto.selectNodeContents($("compartilhar"));
    getSelection().removeAllRanges();
    getSelection().addRange(faixaTexto);
    $("copiar").textContent = "SELECIONADO, É SÓ COPIAR";
  };
  try {
    navigator.clipboard.writeText(texto).then(() => ($("copiar").textContent = "COPIADO!"), selecionar);
  } catch {
    selecionar();
  }
}

function enviar() {
  navigator.share?.({ text: $("compartilhar").textContent }).catch(() => {});
}

// ---------- eventos ----------

$("comecar").addEventListener("click", comecar);
// Botão de jogar: inclina para o lado do mouse (efeito 3D) e faz um "tuuu" grave ao pairar.
(() => {
  const b = $("comecar");
  b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") Som.pairar(); });
  b.addEventListener("pointermove", (e) => {
    const r = b.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    b.style.setProperty("--rx", (-y * 14).toFixed(2) + "deg");
    b.style.setProperty("--ry", (x * 10).toFixed(2) + "deg");
  });
  b.addEventListener("pointerleave", () => { b.style.removeProperty("--rx"); b.style.removeProperty("--ry"); });
  b.addEventListener("pointerdown", () => b.classList.add("apertado"));
  ["pointerup", "pointerleave"].forEach((ev) => b.addEventListener(ev, () => b.classList.remove("apertado")));
})();
// O navegador só toca som depois do primeiro toque/tecla: aí liga o céu da tela inicial
// (vento e bipes de satélite), que some quando a viagem começa.
const ligarCeuDoInicio = () => {
  if ($("inicio").hidden) return;
  Som.ligar();
  Som.ceu(true);
};
["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, ligarCeuDoInicio, { once: true }));
// Privacidade, termos e créditos abrem numa janela por cima do jogo, sem sair da página
// nem perder a viagem. As páginas continuam existindo sozinhas para quem chega por link direto.
// Ctrl/Cmd+clique ou botão do meio ainda abrem numa aba nova, como um link normal.
const janela = $("janela-info");
const quadro = $("janela-quadro");
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a || !/(privacidade|termos|creditos)\.html$/.test(a.getAttribute("href"))) return;
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || typeof janela.showModal !== "function") return;
  e.preventDefault();
  if (quadro.dataset.pagina !== a.href) {
    quadro.dataset.pagina = a.href;
    quadro.src = a.href;
  }
  janela.showModal();
  quadro.focus();
});
// clicar no fundo escuro (fora do quadro) fecha
janela.addEventListener("click", (e) => { if (e.target === janela) janela.close(); });
// Esc dentro do quadro: a própria página avisa (veja o fim de privacidade.html)
window.addEventListener("message", (e) => {
  if (e.source === quadro.contentWindow && e.data === "nicho:fechar") janela.close();
});
$("abrir-como").addEventListener("click", () => {
  const d = $("como-jogar");
  d.open = !d.open;
  $("abrir-como").setAttribute("aria-expanded", String(d.open));
});
$("formulario").addEventListener("submit", palpitar);
$("palpite").addEventListener("input", aoDigitar);
// Enter e o botão LANÇAR chamam palpitar() direto, sem depender do envio do formulário:
// em visualizadores que abrem o jogo numa moldura sem formulários (prévia de arquivo do
// celular, por exemplo), o envio é bloqueado e a resposta não saía.
$("formulario").querySelector("button[type=submit]").addEventListener("click", palpitar);
$("palpite").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) {
    palpitar(e);
    return;
  }
  if (e.key === "Tab" && !$("sugestao").hidden) {
    e.preventDefault();
    usarSugestao();
  }
});
$("sugestao").addEventListener("click", usarSugestao);
$("proxima").addEventListener("click", proxima);
$("copiar").addEventListener("click", copiar);
$("enviar").addEventListener("click", enviar);
$("abrir-skins").addEventListener("click", () => abrirJanela("janela-skins"));
$("abrir-opcoes").addEventListener("click", () => abrirJanela("janela-opcoes"));
$("som").addEventListener("click", () => {
  Som.ligar();
  $("som").classList.toggle("mudo", Som.alternar());
});

iniciar();
