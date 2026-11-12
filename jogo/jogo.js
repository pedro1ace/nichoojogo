// Nicho: regras do jogo diário.
// Cada pergunta pede uma palavra de um tema; o jogador tem 25 segundos.
// Quanto mais nichada a resposta, mais pontos e mais fundo o foguete desce.
// Acertar a "singularidade" (a resposta secreta da pergunta; no código, "supernova") dobra os pontos.
// Vem de outros arquivos: window.NICHO_DADOS (dados.js, baixado só se a API falhar), Som (som.js),
// criarCena, faixaDe, FAIXAS, viagem, DURACAO_DESCIDA (cena.js).

const RODADAS_POR_DIA = 7;
const SEGUNDOS = 25;
const LANCAMENTO = "2026-10-28"; // dia #1
// Horário universal do jogo unificado com base no Brasil (Horário de Brasília / UTC-3).
const FUSO_BRASIL = "America/Sao_Paulo";
let deltaServidorMs = 0; // sincronização com relógio atômico de rede do servidor via header 'Date'

// Pergunta longa: diminui a fonte até o cartão parar de rolar (nunca corta o texto).
function caberPergunta() {
  const h = $("pergunta");
  h.style.fontSize = "";
  requestAnimationFrame(() => {
    const c = h.closest(".cartao");
    let px = parseFloat(getComputedStyle(h).fontSize);
    while (c && c.scrollHeight > c.clientHeight + 1 && px > 14) {
      px -= 1;
      h.style.fontSize = px + "px";
    }
  });
}
addEventListener("resize", () => { if ($("pergunta") && $("pergunta").textContent) caberPergunta(); });

// Teclado do celular aberto: no iPhone a página não encolhe, o navegador só rola para mostrar
// o campo, e a pergunta sumia lá em cima. Aqui a tela do jogo passa a ocupar só a parte que
// dá para ver (visualViewport) e o body ganha a classe "teclado", com um layout mais compacto.
(function acompanharTeclado() {
  const vv = window.visualViewport;
  if (!vv) return;
  const tela = document.getElementById("tela");
  let largura = 0, alturaCheia = 0; // maior altura vista com esta largura (teclado fechado)
  let aberto = false;
  const atualizar = () => {
    if (innerWidth !== largura) { largura = innerWidth; alturaCheia = 0; }
    alturaCheia = Math.max(alturaCheia, innerHeight, document.documentElement.clientHeight);
    const semZoom = Math.abs(vv.scale - 1) < 0.05;
    const digitando = document.activeElement && document.activeElement.tagName === "INPUT";
    const agora = semZoom && digitando && vv.height < alturaCheia - 120;
    if (agora) {
      tela.style.top = `${Math.round(vv.offsetTop)}px`;
      tela.style.height = `${Math.round(vv.height)}px`;
      tela.style.bottom = "auto";
    } else if (aberto) {
      tela.style.top = tela.style.height = tela.style.bottom = "";
    }
    if (agora !== aberto) {
      aberto = agora;
      document.body.classList.toggle("teclado", agora);
      if (document.getElementById("pergunta").textContent) caberPergunta();
    }
  };
  vv.addEventListener("resize", atualizar);
  vv.addEventListener("scroll", atualizar);
  addEventListener("focusin", () => setTimeout(atualizar, 50));
  addEventListener("focusout", () => setTimeout(atualizar, 50));
})();

function agoraSincronizado() {
  return new Date(Date.now() + deltaServidorMs);
}

function hojeBrasil(d = agoraSincronizado()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO_BRASIL,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    const dBr = new Date(d.getTime() - 3 * 3600000);
    const p = (n) => String(n).padStart(2, "0");
    return `${dBr.getUTCFullYear()}-${p(dBr.getUTCMonth() + 1)}-${p(dBr.getUTCDate())}`;
  }
}

function somarDias(diaStr, delta) {
  const [ano, mes, dia] = diaStr.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + delta, 12, 0, 0));
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function dataAmanhaBrasil(d = agoraSincronizado()) {
  return somarDias(hojeBrasil(d), 1);
}

function segundosAteMeiaNoiteBrasil(agora = agoraSincronizado()) {
  const proxDia = dataAmanhaBrasil(agora);
  const proximaMeiaNoite = Date.parse(proxDia + "T00:00:00-03:00");
  return Math.max(0, Math.floor((proximaMeiaNoite - agora.getTime()) / 1000));
}

const hojeLocal = hojeBrasil;

// Modo teste:
// - ?aleatorio sorteia categorias aleatórias;
// - ?dia=6 (ou ?dia=2026-11-02) ou ?amanha carrega as 7 perguntas exatas daquele dia;
// - ?categorias=flores,bandas joga essas categorias, na ordem (a página jogo/testes.html monta o link).
// Em qualquer modo teste, o jogo não grava o progresso do dia nem envia dados para a API.
const PARAMS = new URLSearchParams(location.search);
const ALEATORIO = PARAMS.has("aleatorio");
function dataDeTeste() {
  if (PARAMS.has("amanha")) {
    return dataAmanhaBrasil();
  }
  const pDia = PARAMS.get("dia");
  if (!pDia) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(pDia)) return pDia;
  return dataDoNumero(Number(pDia));
}
// "DIA #2" -> "2026-10-29"
function dataDoNumero(n) {
  if (!Number.isInteger(n) || n < 1 || n > 3650) return null;
  const d = new Date(LANCAMENTO + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + (n - 1));
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
const DATA_TESTE = dataDeTeste();
const CATEGORIAS_TESTE = (PARAMS.get("categorias") || "").split(",").map((c) => c.trim()).filter(Boolean);
const MODO_TESTE = ALEATORIO || DATA_TESTE !== null || CATEGORIAS_TESTE.length > 0;
// ARQUIVOS (dias anteriores):
// - No site, cada dia tem um endereço limpo: nichoojogo.com/dia/2 (o número do dia, como no jogo).
//   O _middleware.js serve o jogo nesses caminhos. Aberto do computador ou em /jogo/ continua
//   ?arquivo=2026-10-29. Links velhos com ?arquivo= seguem abrindo e trocam para o endereço limpo.
// - ?arquivo=2026-11-01 abre um dia que já passou. Se você nunca jogou aquele dia, essa é a sua
//   1ª viagem dele e fica guardada como a que conta (mas fora do dia não entra na curva nem no
//   placar futuro). Se já jogou, mostra o relatório da sua 1ª viagem.
// - ?arquivo=2026-11-01&novamente joga de novo um dia já terminado. Jogada extra: não conta,
//   não substitui a 1ª e não é enviada para lugar nenhum.
// O dia de hoje nunca abre pelo arquivo (nem tem "jogar novamente"): só dias anteriores.
const CAMINHO_DO_DIA = /^\/dia\/(\d+)\/?$/;
const NO_SITE = location.protocol !== "file:" && (location.pathname === "/" || CAMINHO_DO_DIA.test(location.pathname));
const ARQUIVO = (() => {
  const m = NO_SITE && location.pathname.match(CAMINHO_DO_DIA);
  const d = m ? dataDoNumero(Number(m[1])) : PARAMS.get("arquivo");
  if (MODO_TESTE || !d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d >= LANCAMENTO && d < hojeLocal() ? d : null;
})();
// "Jogar novamente" chega como ?novamente, mas o endereço visível fica limpo. Para um F5 no meio
// da jogada extra não virar o relatório, a aba lembra (sessionStorage) que era jogada extra.
const CHAVE_NOVAMENTE = "nicho:novamente";
const recarregou = () => {
  try { return performance.getEntriesByType("navigation")[0].type === "reload"; } catch { return false; }
};
const NOVAMENTE = ARQUIVO !== null && (PARAMS.has("novamente") || (recarregou() && lerSessao(CHAVE_NOVAMENTE) === ARQUIVO));
function lerSessao(k) {
  try { return sessionStorage.getItem(k); } catch { return null; }
}
function esquecerNovamente() {
  try { sessionStorage.removeItem(CHAVE_NOVAMENTE); } catch {}
}
if (NO_SITE) {
  // em /dia/2 os links relativos (termos.html...) precisam partir da raiz
  const base = document.createElement("base");
  base.href = "/";
  document.head.prepend(base);
  const resto = new URLSearchParams(location.search);
  resto.delete("arquivo");
  resto.delete("novamente");
  const extra = resto.toString() ? `?${resto}` : "";
  if (ARQUIVO) {
    if (NOVAMENTE) try { sessionStorage.setItem(CHAVE_NOVAMENTE, ARQUIVO); } catch {}
    const limpo = `/dia/${numeroDoDia(ARQUIVO)}`;
    history.replaceState(null, "", extra ? `${limpo}${extra}` : limpo);
  } else if (location.pathname !== "/" || PARAMS.has("arquivo")) {
    // /dia/ de hoje, do futuro ou inválido: abre o dia de hoje em "/"
    history.replaceState(null, "", `/${extra}`);
  }
}
// Link do botão "Apoie o criador" no fim do jogo. Enquanto estiver vazio, o botão
// aparece como "EM BREVE" e não clica. Para ativar, cole o link entre as aspas.
const LINK_APOIO = "";
const LINK_JOGO = "https://nichoojogo.com";

// (a busca das respostas está em jogo/busca.js)

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

// Quantos dias seguidos você completou a viagem (contando hoje, se já terminou).
function sequencia() {
  const chave = (diaStr) => `nicho:v7:${diaStr}`;
  const completo = (diaStr) => {
    try {
      const v = JSON.parse(localStorage.getItem(chave(diaStr)) || "null");
      // viagem feita pelo arquivo (fora do dia) não emenda a sequência
      return !!v && v.historico && v.historico.length >= RODADAS_POR_DIA && foiNoDia(v);
    } catch {
      return false;
    }
  };
  let diaStr = hojeBrasil();
  if (!completo(diaStr)) diaStr = somarDias(diaStr, -1);
  let n = 0;
  while (n < 3650 && completo(diaStr)) {
    n++;
    diaStr = somarDias(diaStr, -1);
  }
  return n;
}

// ---------- skins ----------
// O mascote padrão é o tardígrado. O Neil (o alienígena no óvni) é liberado quando a sequência
// chega a DIAS_SKIN_ALIEN; depois disso fica liberado para sempre neste navegador,
// mesmo que a sequência zere. A escolha também fica guardada aqui.
const DIAS_SKIN_ALIEN = 10;
const SKINS = [
  { id: "tardigrado", nome: "TARDÍGRADO", emoji: "🐻", criar: () => (typeof criarTardigrado === "function" ? criarTardigrado() : null) },
  { id: "alien", nome: "NEIL", emoji: "🛸", criar: () => (typeof criarAlienigena === "function" ? criarAlienigena() : null), dias: DIAS_SKIN_ALIEN },
  { id: "apoiador", nome: "LAIKA", emoji: "🐶", criar: () => (typeof criarApoiador === "function" ? criarApoiador() : null), apoio: true },
];
const lerChave = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravarChave = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

function skinLiberada(skin, seq) {
  if (skin.apoio) return lerChave(`nicho:skin-liberada:${skin.id}`) === "1";
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
  const seq = MODO_TESTE ? 0 : sequencia();
  const atual = skinEscolhida();
  caixa.innerHTML = "";
  for (const skin of SKINS) {
    const livre = skinLiberada(skin, seq);
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "cartao-skin" +
      (livre ? "" : " trancada") +
      (!livre && skin.apoio ? " apoio-trancada" : "") +
      (skin.id === atual ? " escolhida" : "");
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
    dias.className = "skin-dias" + (skin.apoio ? " apoio" : "");
    dias.textContent = skin.apoio
      ? (livre ? "APOIADOR ♥" : "🔒 APOIADOR")
      : (!skin.dias ? "PADRÃO" : livre ? `${skin.dias} DIAS SEGUIDOS ✓` : `🔒 ${skin.dias} DIAS SEGUIDOS`);
    b.append(tela, nome, dias);
    if (!livre) {
      const falta = document.createElement("span");
      falta.className = "skin-falta";
      falta.textContent = skin.apoio ? "toque para apoiar" : `você está com ${Math.min(seq, skin.dias)}`;
      b.append(falta);
    }
    if (!livre && !skin.apoio) {
      b.setAttribute("aria-disabled", "true");
      b.setAttribute("aria-label", `${skin.nome}: libera com ${skin.dias} dias seguidos (você está com ${seq})`);
    } else if (!livre && skin.apoio) {
      b.setAttribute("aria-label", `${skin.nome}: skin exclusiva de apoiador, toque para apoiar via Pix`);
    }
    b.addEventListener("click", () => {
      if (!livre) {
        if (skin.apoio) { $("janela-skins").close(); abrirApoio(); }
        return;
      }
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
  Som.ligar();
  Som.chave(opcoes[b.dataset.opcao]);
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
  const seq = MODO_TESTE || ARQUIVO ? 0 : sequencia();
  const texto = CATEGORIAS_TESTE.length || ALEATORIO
    ? "MODO TESTE"
    : DATA_TESTE
    ? `DIA #${numeroDoDia(estado.data)} · MODO TESTE`
    : ARQUIVO
      ? `DIA #${numeroDoDia(estado.data)} · ${dataCurta(estado.data)} · ARQUIVO${estado.replay ? " · JOGADA EXTRA" : ""}`
      : `DIA #${numeroDoDia(estado.data)} · SEQUÊNCIA ${seq}`;
  $("dia").textContent = texto;
  $("fim-dia").textContent = texto;
  return seq;
}

function numeroDoDia(data) {
  return Math.round((Date.parse(data + "T12:00:00Z") - Date.parse(LANCAMENTO + "T12:00:00Z")) / 86400000) + 1;
}

// "seg 02/11"
function dataCurta(dia) {
  const d = new Date(dia + "T12:00");
  const semana = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d.getDay()];
  return `${semana} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

// Progresso do dia fica no navegador, para não perder ao recarregar.
// Se o armazenamento estiver bloqueado, o jogo funciona igual, só não lembra.
//
// Duas chaves por dia, pensando no placar diário com conta que vem depois:
//   nicho:v7:<dia>      a 1ª viagem do dia, a ÚNICA que conta. Nunca é sobrescrita por outra.
//                       { historico, total, inicio, fim, noDia }
//                       inicio/fim: o dia (no relógio do jogador) em que começou e terminou;
//                       noDia: terminou no próprio dia? Só essas entram na sequência (e, no
//                       futuro, no placar). Registros antigos, sem noDia, são todos do próprio dia.
//   nicho:replay:<dia>  a última "jogada extra" pelos ARQUIVOS. Não conta para nada; fica só para
//                       continuar se a página recarregar no meio. Uma por dia, não acumula.
const chaveOficial = (dia) => `nicho:v7:${dia}`;
const chaveReplay = (dia) => `nicho:replay:${dia}`;
const foiNoDia = (v) => !!v && v.noDia !== false;
const completa = (v) => !!v && Array.isArray(v.historico) && v.historico.length >= RODADAS_POR_DIA;
function lerRegistro(chave) {
  try {
    return JSON.parse(localStorage.getItem(chave) || "null");
  } catch {
    return null;
  }
}

function salvarProgresso() {
  if (MODO_TESTE) return;
  const registro = { historico: estado.historico, total: estado.total };
  if (!estado.replay) {
    registro.inicio = estado.inicio || (estado.inicio = hojeLocal());
    if (estado.historico.length >= estado.categorias.length) {
      registro.fim = estado.fim || (estado.fim = hojeLocal());
      registro.noDia = registro.fim === estado.data;
    }
  }
  try {
    localStorage.setItem(estado.replay ? chaveReplay(estado.data) : chaveOficial(estado.data), JSON.stringify(registro));
  } catch {}
  // com conta (jogo/conta.js): a 1ª viagem completa também fica na conta, e a de hoje vai para o placar
  if (!estado.replay && typeof Conta !== "undefined") Conta.registroSalvo(estado.data, registro);
}
function lerProgresso() {
  if (MODO_TESTE) return null;
  return lerRegistro(estado.replay ? chaveReplay(estado.data) : chaveOficial(estado.data));
}

// ---------- estado e tela ----------

const $ = (id) => document.getElementById(id);
const cena = criarCena($("cena"), $("camada"), $("tela"));
const numero = (n) => Math.round(n).toLocaleString("pt-BR");

const ICONE_NORMAL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAmklEQVR4nGNgGAWjYBQMMGBEF3ixJO0/NoUSMbMYqSGPDpiIdSmtANxVuFxObYAeEoMnBPYWmNElBGDAecIpRgaGQRACLPTyefiMswwMDAwMKzOMUcQHPAQY6R336GDAQ4BloCweNLkAXg7U2cvQJS00HXwySEtC9BBAdymt5AdPCHy6sQPFhXwaHig+oJX8gIfAKBgFo2DAAQB7DUGE6CgeGgAAAABJRU5ErkJggg==";
const ICONE_OURO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAmklEQVR4nGNgGAWjYBQMMGBEF/j/cdl/rAr5oxipIY8OmIh1Ka0A3FW4XE51C9FCYvCEwKdDBnQJARjgs7vAyMAwCEKAhV4+90i6wMDAwMCwY54BiviAhwAjveMeHQx4CLAMlMWDJhfAy4EVBTx0SQsRE74M0pIQPQTQXUor+cETAv9/P0BxISOrAooPaCU/4CEwCkbBKBhwAAD6hUIFtihZUgAAAABJRU5ErkJggg==";

function atualizarIconeAba(dourado = false) {
  // troca todos os ícones da aba (o navegador escolhe qualquer um deles)
  let links = document.querySelectorAll("link[rel~='icon']");
  if (!links.length) {
    const link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
    links = [link];
  }
  for (const link of links) {
    link.type = "image/png";
    link.removeAttribute("sizes");
    link.href = dourado ? ICONE_OURO : ICONE_NORMAL;
  }
}

const estado = {
  data: DATA_TESTE || ARQUIVO || hojeLocal(),
  replay: false, // jogada extra de um dia do arquivo (não conta)
  oficial: null, // no arquivo: a sua 1ª viagem daquele dia, se já existir
  inicio: null,
  fim: null,
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


// O pacote com todas as perguntas de todos os dias (jogo/dados.js, ~9 MB) não vai mais dentro da
// página: ela ficava com 9,7 MB e o celular travava lendo tudo antes de mostrar o jogo. Agora a
// página só pede o dia de hoje a /api/dia (~100 KB) e só baixa o pacote se a API falhar
// (sem internet, aberto do computador, ?aleatorio ou dia que ainda não está no banco).
// No site o dados.js não abre mais (tem todas as respostas, docs/CONTA.md): lá o fallback só falha.
// No jogar-completo.html (o arquivo único para abrir sem internet) o pacote já vem dentro.
const VERSAO_DADOS = "dev"; // o montar_jogo.py troca pelo resumo do dados.js no jogar.html
let promessaDadosLocais = null;
function carregarDadosLocais() {
  if (window.NICHO_DADOS) return Promise.resolve(window.NICHO_DADOS);
  if (!promessaDadosLocais) {
    promessaDadosLocais = new Promise((pronto) => {
      const s = document.createElement("script");
      // no site o jogo abre em "/", e jogo/index.html fica dentro da pasta jogo/
      const naPastaJogo = /\/jogo\/[^/]*$/.test(location.pathname);
      // VERSAO_DADOS muda a cada montar_jogo.py: o navegador guarda /jogo/dados.js por 4 horas, e sem
      // ela uma correção na lista só aparecia para quem já tinha jogado depois que esse prazo vencesse
      s.src = location.protocol === "file:" ? (naPastaJogo ? "dados.js" : "jogo/dados.js") : `/jogo/dados.js?v=${VERSAO_DADOS}`;
      s.onload = () => pronto(window.NICHO_DADOS || null);
      s.onerror = () => { promessaDadosLocais = null; pronto(null); };
      document.head.append(s);
    });
  }
  return promessaDadosLocais;
}

async function carregarCategoriasDoDia() {
  // 1. Tenta carregar do D1 (Cloudflare Pages Function /api/dia), muito mais leve (~150 KB)
  if (!ALEATORIO && !CATEGORIAS_TESTE.length && location.protocol !== "file:") {
    try {
      const r = await fetch(`/api/dia?dia=${estado.data}`);
      const serverDate = r.headers.get("date");
      if (serverDate) {
        const sEpoch = Date.parse(serverDate);
        if (!Number.isNaN(sEpoch)) deltaServidorMs = sEpoch - Date.now();
      }
      if (r.ok) {
        const pacote = await r.json();
        if (pacote && Array.isArray(pacote.categorias) && pacote.categorias.length >= RODADAS_POR_DIA) {
          return pacote.categorias.map(prepararCategoria);
        }
      }
    } catch {}
  }
  // 2. Fallback: se estiver offline, rodando local (file://), em ?aleatorio ou o D1 falhar,
  //    baixa o pacote com todos os dias (jogo/dados.js) só agora
  const dados = await carregarDadosLocais();
  if (!dados) return null;
  if (CATEGORIAS_TESTE.length) {
    return CATEGORIAS_TESTE.filter((id) => dados.categorias[id]).map((id) => prepararCategoria(dados.categorias[id]));
  }
  const escolhidas = ALEATORIO
    ? embaralhar(dados.indice, Math.random).slice(0, RODADAS_POR_DIA)
    : categoriasDoDia(dados.indice, estado.data, dados.ordem);
  return escolhidas.map((c) => prepararCategoria(dados.categorias[c.id]));
}

// ?refazer=<código>: link que quem cuida do jogo manda para UMA pessoa refazer o dia de hoje, quando um
// erro do jogo atrapalhou a viagem dela (functions/api/refazer.js, docs/CONTA.md). O código vale uma vez.
// Deu certo: apaga a viagem daquele dia neste navegador e abre o jogo de novo. Devolve true nesse caso.
async function refazerDia() {
  const codigo = PARAMS.get("refazer");
  if (!codigo || location.protocol === "file:") return false;
  let r = null;
  try {
    const resp = await fetch("/api/refazer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigo }) });
    r = await resp.json();
  } catch {}
  if (r && r.ok) {
    try {
      localStorage.removeItem(chaveOficial(r.dia));
      localStorage.removeItem(chaveReplay(r.dia));
    } catch {}
    location.replace("/");
    return true;
  }
  history.replaceState(null, "", location.pathname);
  estado.avisoRefazer = (r && r.motivo) || "Não deu para refazer o dia agora. Tente o link de novo daqui a pouco.";
  return false;
}

async function iniciar() {
  if (await refazerDia()) return;
  reenviarPendentes();
  const cats = await carregarCategoriasDoDia();
  if (!cats || !cats.length) {
    $("regras").textContent = "Não foi possível carregar as perguntas do dia. Verifique sua conexão.";
    $("comecar").hidden = true;
    return;
  }
  estado.categorias = cats;

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
  if (estado.avisoRefazer) $("regras").textContent = `Refazer o dia: ${estado.avisoRefazer}`;
  mostrarDiaESequencia();
  $("modo-info").textContent = `${estado.categorias.length} incursões · ${SEGUNDOS} s`;
  cena.skin(skinEscolhida());
  aplicarOpcoes();
  desenharMascoteDoMenu();
  montarSkins();
  atualizarCaixaApoio();
  retomarPixPendente();
  $("som").classList.toggle("mudo", Som.estaMudo());

  if (ARQUIVO) {
    estado.oficial = lerRegistro(chaveOficial(estado.data));
    estado.replay = NOVAMENTE && completa(estado.oficial);
    // "jogar novamente" num dia que você ainda não terminou: vale como a 1ª viagem mesmo
    if (NOVAMENTE && !estado.replay) {
      esquecerNovamente();
      if (!NO_SITE) history.replaceState(null, "", urlDoArquivo(estado.data));
    }
    // jogada extra que já tinha terminado: começa outra do zero
    if (estado.replay && completa(lerProgresso())) {
      try { localStorage.removeItem(chaveReplay(estado.data)); } catch {}
    }
    mostrarInicioDoArquivo();
    mostrarDiaESequencia();
  }

  const salvo = lerProgresso();
  if (salvo) {
    estado.inicio = salvo.inicio || null;
    estado.fim = salvo.fim || null;
    estado.historico = salvo.historico;
    estado.total = estado.totalMostrado = salvo.total;
    estado.rodada = salvo.historico.length;
    cena.irPara(AL_INICIAL + profundidade());
    if (salvo.historico.some((h) => h.supernova)) { cena.dourado(false); atualizarIconeAba(true); }
    $("pontos").textContent = numero(estado.total);
  }
  montarQuadrados();
  mostrarMelhor();
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

// Tela inicial de um dia do arquivo: diz que dia é e que só a 1ª viagem conta.
function mostrarInicioDoArquivo() {
  document.documentElement.classList.add("modo-arquivo");
  $("modo-nome").textContent = estado.replay ? "JOGADA EXTRA" : "VIAGEM DO ARQUIVO";
  $("comecar").textContent = estado.replay ? "▼ JOGAR NOVAMENTE ▼" : `▼ JOGAR O DIA #${numeroDoDia(estado.data)} ▼`;
  const aviso = $("aviso-arquivo");
  aviso.hidden = false;
  aviso.querySelector("a").href = paginaDeHoje();
  aviso.querySelector(".texto").textContent = estado.replay
    ? `Você já jogou este dia (${numero(estado.oficial.total)} pontos). Só a 1ª viagem conta: esta é só por diversão.`
    : "Só a 1ª viagem de cada dia conta, e ela entra na curva dos viajantes. O placar é só de quem joga no próprio dia.";
}

// A melhor pontuação deste navegador: só a 1ª viagem de cada dia conta (as jogadas extras ficam fora).
function melhorPontuacao() {
  let melhor = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^nicho:v7:\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      const v = lerRegistro(k);
      if (!completa(v) || typeof v.total !== "number") continue;
      const dia = k.slice("nicho:v7:".length);
      if (!melhor || v.total > melhor.total) melhor = { total: v.total, dia };
    }
  } catch {}
  return melhor;
}
function mostrarMelhor() {
  const m = MODO_TESTE ? null : melhorPontuacao();
  for (const id of ["melhor-inicio", "melhor-fim"]) {
    const el = $(id);
    if (!el) continue;
    el.hidden = !m;
    if (m) el.innerHTML = `<span class="melhor-rotulo">★ SEU RECORDE</span> <b>${numero(m.total)}</b> <span class="melhor-dia">DIA #${numeroDoDia(m.dia)}</span>`;
  }
}

// Endereço de um dia do arquivo. No site: /dia/2 (o ?novamente some da barra assim que abre).
// Fora dele, na mesma página (funciona em /jogo/ e no arquivo baixado): ?arquivo=2026-10-29.
function urlDoArquivo(dia, novamente = false) {
  if (NO_SITE) return `/dia/${numeroDoDia(dia)}${novamente ? "?novamente" : ""}`;
  return `${location.pathname}?arquivo=${dia}${novamente ? "&novamente" : ""}`;
}
const paginaDeHoje = () => (NO_SITE ? "/" : location.pathname);

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
    if (h) q.style.background = h.resposta ? faixaDe(h.pontos, h.supernova, h.espertalhao).cor : "#3a3470";
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
  // a conta também: trocar de conta no meio da viagem não faz sentido (volta no fim)
  document.body.classList.add("em-viagem");
  if ($("janela-conta") && $("janela-conta").open) $("janela-conta").close();
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
  cena.novaRodada(cat);
  montarQuadrados();
  $("rotulo-pergunta").textContent = `INCURSÃO ${estado.rodada + 1} DE ${estado.categorias.length}`;
  $("pergunta").textContent = cat.pergunta || cat.titulo;
  caberPergunta();
  $("formulario").hidden = true;
  $("relogio").hidden = true;
  $("sugestao").hidden = true;
  avisar("", "");
  $("palpite").value = "";
  estado.tentadas = [];
  estado.consultas = 0;
  estado.anotadas = new Set();
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
  rodarRelogio(SEGUNDOS * 1000);
}

// Liga (ou religa, depois de consultar o juiz) o relógio com "restaMs" de tempo.
function rodarRelogio(restaMs) {
  estado.ativa = true;
  estado.fimDoTempo = performance.now() + restaMs;
  $("formulario").hidden = false;
  $("relogio").hidden = false;
  $("palpite").focus();
  let ultimoSegundo = restaMs >= SEGUNDOS * 1000 ? SEGUNDOS + 1 : Math.ceil(restaMs / 1000);
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
  if (!estado.ativa || $("formulario").classList.contains("esperando")) return;
  const cat = estado.categorias[estado.rodada];
  const texto = $("palpite").value.trim();
  if (!texto) return;
  let busca = buscar(cat, texto);
  // sem autocorreção: escrita quase certa conta como não achada
  if (busca && !busca.exato && opcoes.semCorrecao) busca = null;

  if (!busca) {
    // sem login, as raras e a singularidade não vieram: pergunta ao servidor antes de recusar
    if (cat.ocultas) conferirEscondida(cat, texto);
    else naoAchou(cat, texto);
    return;
  }
  if (!busca.exato) {
    corrigirPara(texto, busca.nome);
    return;
  }

  pousar(cat, busca.resposta);
}

// escrito quase certo: corrige no campo e espera a confirmação
function corrigirPara(texto, nome) {
  $("sugestao").dataset.nome = nome;
  usarSugestao();
  avisar(`Você digitou “${texto}”. Corrigido para “${nome}”: aperte LANÇAR para confirmar.`, "aviso");
}

// Nem a lista nem as escondidas têm: anota como recusada e chama o juiz (ou só recusa).
function naoAchou(cat, texto) {
  // a mesma recusada conta uma vez por pergunta: assim "2 ou mais" no plantão são 2 jogadores, não 2 Enter
  const chave = compactar(texto);
  estado.anotadas ||= new Set();
  if (texto.length >= 3 && !estado.anotadas.has(chave)) {
    estado.anotadas.add(chave);
    enviarResposta(cat, { recusada: texto });
  }
  if (texto.length >= 3 && vaiAnotar(cat)) consultarJuiz(cat, texto);
  else recusar(cat, texto);
}

// ---------- respostas escondidas ----------
// Quem não está logado recebe o dia de hoje sem as respostas do espaço profundo e sem a singularidade
// (functions/api/dia.js): é para não dar para copiar as que valem mais. O que não está na lista recebida
// é conferido em /api/conferir, com a mesma busca (jogo/busca.js). Enquanto espera, o relógio para,
// como no juiz. Se o servidor não responder, segue como recusa.
const ESPERA_CONFERIR = 4000;

async function conferirEscondida(cat, texto) {
  const chave = `${cat.id}:${compactar(texto)}`;
  estado.conferidas ||= {};
  const rodada = estado.rodada;
  let r = estado.conferidas[chave];
  let restaMs = null;
  if (r === undefined) {
    restaMs = Math.max(0, estado.fimDoTempo - performance.now());
    pararRelogio();
    $("palpite").disabled = true;
    $("formulario").classList.add("esperando");
    $("sugestao").hidden = true;
    avisar("");
    const parar = new AbortController();
    const prazo = setTimeout(() => parar.abort(), ESPERA_CONFERIR);
    r = null;
    try {
      const resp = await fetch("/api/conferir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dia: estado.data, categoria: cat.id, texto }),
        signal: parar.signal,
      });
      if (resp.ok) {
        r = await resp.json();
        estado.conferidas[chave] = r;
      }
    } catch {}
    clearTimeout(prazo);
    $("palpite").disabled = false;
    $("formulario").classList.remove("esperando");
    if (estado.rodada !== rodada) return;
  }
  const achada = r && r.achada;
  if (achada && (r.exato || !opcoes.semCorrecao)) {
    if (r.supernova) {
      cat.supernova = achada.resposta;
      if (r.curiosidade) cat.curiosidade = r.curiosidade;
    }
    // entra na lista desta pergunta, para aparecer no fim junto com as outras
    if (!cat.respostas.some((x) => x.resposta === achada.resposta)) cat.respostas.push(achada);
    if (!r.exato) {
      if (restaMs !== null) rodarRelogio(restaMs);
      corrigirPara(texto, r.nome);
      return;
    }
    pousar(cat, achada);
    return;
  }
  if (restaMs !== null) rodarRelogio(restaMs);
  naoAchou(cat, texto);
}

// Entrou na conta no meio do dia: baixa de novo o dia, agora com as respostas escondidas.
async function completarRespostas() {
  if (!estado.categorias || !estado.categorias.some((c) => c.ocultas)) return;
  try {
    const r = await fetch(`/api/dia?dia=${estado.data}`, { cache: "no-store" });
    if (!r.ok) return;
    const pacote = await r.json();
    if (!Array.isArray(pacote.categorias) || pacote.categorias.some((c) => c.ocultas)) return;
    estado.categorias = estado.categorias.map((c, i) =>
      pacote.categorias[i] && pacote.categorias[i].id === c.id ? prepararCategoria(pacote.categorias[i]) : c,
    );
  } catch {}
}

// A resposta valeu (da lista ou aprovada pelo juiz): o tardígrado desce e aparece o resultado.
// "frase" troca a frase da faixa no cartão do resultado.
function pousar(cat, achada, frase) {
  pararRelogio();
  // a resposta aceita só por um pedaço (achadaDoJuiz) nunca é a singularidade
  const supernova = !achada.parcial && achada.resposta === cat.supernova;
  const pontos = supernova ? achada.pontos * 2 : achada.pontos;
  const espertalhao = !supernova && !!achada.espertalhao;
  const percentil = percentilDe(cat, achada);
  enviarResposta(cat, { resposta: achada.resposta });
  mostrarPergunta(false);
  cena.descer(achada.resposta, pontos, supernova, espertalhao);
  Som.descer(Math.min(1, pontos / 100));
  registrar(cat, achada.resposta, pontos, supernova, percentil, espertalhao);
  // nas raras, a festa da chegada aparece sozinha antes do resultado; no espertalhão, o
  // tardigradozinho atravessa a caixa e cai antes do resultado
  const pausa = supernova ? 1000 : espertalhao ? 2800 : pontos >= 60 ? 900 : pontos >= 35 ? 600 : 200;
  setTimeout(() => mostrarResultado(cat, achada.resposta, pontos, supernova, espertalhao, frase), duracaoQueda(pontos, supernova) + pausa);
}

// A lista não tem: avisa, treme o campo e deixa tentar outra (a mesma recusa, com ou sem juiz).
function recusar(cat, texto) {
  // a resposta pode ser boa e só faltar na lista: diz que ela foi anotada (vai para a revisão)
  const anota = texto.length >= 3 && vaiAnotar(cat);
  if (anota && estado.tentadas && !estado.tentadas.includes(texto)) estado.tentadas.push(texto);
  avisar(anota
    ? `“${texto}” ainda não está no nosso mapa. Anotamos para revisar! Tente outra.`
    : `“${texto}” não está no mapa estelar. Tente outra.`, "erro");
  $("palpite").classList.remove("tremendo");
  void $("palpite").offsetWidth; // reinicia a animação
  $("palpite").classList.add("tremendo");
  $("palpite").select();
  Som.erro();
}

// ---------- juiz das recusadas ----------
// O que a lista não tem vai para uma IA (functions/api/juiz.js), que diz se vale. Enquanto ela pensa,
// o relógio para. Se ela aprovar, a resposta vale PONTOS_IA até a revisão diária dar a nota certa.
// Se recusar, ficar em dúvida, demorar ou estiver fora do ar, segue como antes: recusa e anota.
const API_JUIZ = "/api/juiz";
const PONTOS_IA = 40; // quando o juiz não diz os pontos: faixa "RARO"
// o juiz estima a fama e manda os pontos (de 8 até o topo do Raro, 58); fora disso, PONTOS_IA
const pontosDoJuiz = (p) => (Number.isInteger(p) && p >= 8 && p <= 58 ? p : PONTOS_IA);
const ESPERA_JUIZ = 5000;
// O jogador não fica sabendo do juiz, nem na prévia: a aceita parece uma resposta da lista, a recusada
// parece uma recusa normal. O único sinal é o botão LANÇAR escurecer enquanto espera.
const CONSULTAS_POR_RODADA = 3; // depois disso, recusa direto (ninguém fica gastando a IA no Enter)

async function consultarJuiz(cat, texto) {
  const chave = `${cat.id}:${compactar(texto)}`;
  estado.vereditos ||= {};
  const ja = estado.vereditos[chave];
  if (ja && ja.veredito !== "aceita") return recusar(cat, texto, ja.veredito);
  if (!ja && (estado.consultas || 0) >= CONSULTAS_POR_RODADA) return recusar(cat, texto);
  if (!ja) estado.consultas = (estado.consultas || 0) + 1;

  const restaMs = Math.max(0, estado.fimDoTempo - performance.now());
  pararRelogio();
  const rodada = estado.rodada;
  $("palpite").disabled = true;
  $("formulario").classList.add("esperando"); // botão LANÇAR escurece enquanto a central responde
  $("sugestao").hidden = true;
  avisar(""); // sem aviso de "consultando": só o botão LANÇAR escurece

  let resposta = ja || { veredito: "indisponivel" };
  if (!ja) {
    const parar = new AbortController();
    const prazo = setTimeout(() => parar.abort(), ESPERA_JUIZ);
    try {
      const r = await fetch(API_JUIZ, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dia: estado.data, categoria: cat.id, texto }),
        signal: parar.signal,
      });
      if (r.ok) resposta = await r.json();
    } catch {}
    clearTimeout(prazo);
    if (resposta.veredito !== "indisponivel") estado.vereditos[chave] = resposta;
    else if (resposta.motivo) console.info("juiz indisponível:", resposta.motivo);
  }
  $("palpite").disabled = false;
  $("formulario").classList.remove("esperando");
  if (estado.rodada !== rodada) return;

  if (resposta.veredito === "aceita") {
    const achada = achadaDoJuiz(cat, texto, resposta);
    if (achada) {
      pousar(cat, achada);
      return;
    }
  }
  rodarRelogio(restaMs);
  recusar(cat, texto, resposta.veredito);
}

// O que vale quando o juiz aprova. O nome no padrão pode ser uma resposta que a lista já tem:
// - o jogador escreveu de fato essa resposta (só com um erro ou palavras a mais): vale ela, com os
//   pontos dela. Assim "Pegout" aparece como Peugeot, e não com o erro de digitação;
// - escreveu só um pedaço dela ("estrela" = Estrela-do-mar): vale, mas com no máximo os pontos do
//   juiz (que nunca passam do Raro), e nunca como singularidade ou espertalhão;
// - escreveu outra coisa, que o juiz achou sinônimo: vale como ela só se ela for comum
//   (TETO_SINONIMO), também com no máximo os pontos do juiz. Se ela for rara, é recusada e anotada
//   para a revisão: "Megamente" não vira Megara, "gaúcha" não vira os 86 pontos de Chula gaúcha.
// Quando o nome do juiz é novo (a lista não tem), vale ele, se parece com o que foi digitado;
// se não parece, vale o que o jogador escreveu.
// Devolve a resposta para pousar, ou null para recusar.
function achadaDoJuiz(cat, texto, resposta) {
  const nome = resposta.nome || texto;
  const pontosIa = pontosDoJuiz(resposta.pontos);
  const naLista = buscar(cat, nome, true);
  if (naLista) {
    const r = naLista.resposta;
    const como = comoBate(texto, [r.resposta, ...(r.apelidos || [])], ENFEITES[cat.id]);
    if (como === "inteira") return r;
    if (como === "parte" || r.pontos <= TETO_SINONIMO) {
      const pontos = Math.min(r.pontos, pontosIa);
      return { resposta: r.resposta, apelidos: [], pontos, parcial: true, frase: r.frase };
    }
    return null;
  }
  const parecido = comoBate(texto, [nome]) || distancia(compactar(texto), compactar(nome)) <= Math.max(1, tolerancia(compactar(texto).length));
  const proprio = parecido ? nome : texto;
  return { resposta: proprio[0].toUpperCase() + proprio.slice(1), apelidos: [], pontos: pontosIa };
}

function tempoEsgotado() {
  pararRelogio();
  const cat = estado.categorias[estado.rodada];
  mostrarPergunta(false);
  Som.erro();
  registrar(cat, null, 0, false, 0);
  mostrarResultado(cat, null, 0, false);
}

function registrar(cat, resposta, pontos, supernova, percentil, espertalhao = false) {
  estado.total += pontos;
  estado.historico.push({ categoria: cat.titulo, resposta, pontos, supernova, percentil, ...(espertalhao ? { espertalhao } : {}) });
  salvarProgresso();
}

function mostrarResultado(cat, resposta, pontos, supernova, espertalhao, fraseExtra) {
  const faixa = resposta
    ? faixaDe(pontos, supernova, espertalhao)
    : { id: "nada", nome: "TEMPO ESGOTADO", cor: "#ff6b81", frase: "O tempo acabou." };
  const card = $("resultado");
  card.style.setProperty("--cor-faixa", faixa.cor);
  $("icone").src = cena.icones[faixa.id];
  $("nome-faixa").textContent = faixa.nome;
  $("palavra").textContent = resposta ? `“${resposta}”` : "";
  $("linha-pontos").innerHTML = resposta
    ? `<b>+${pontos} PONTOS</b> · viajou ${numero(Math.round(viagem(pontos) * AL_POR_U))} AL`
    : "+0 PONTOS";
  // a singularidade mostra a sua descrição (dados/singularidades.txt); as outras respostas podem ter
  // frase própria (dados/frases.txt) no lugar da frase da faixa
  const propria = resposta && (cat.respostas || []).find((r) => r.resposta === resposta)?.frase;
  $("frase").textContent = (supernova && cat.curiosidade) || fraseExtra || propria || faixa.frase;

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
  else if (resposta) Som.faixa(faixa === ESPERTALHAO ? 0 : FAIXAS.length - 1 - FAIXAS.indexOf(faixa));
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

function atualizarTextoCompartilhar(seq = MODO_TESTE ? 0 : sequencia()) {
  const icones = estado.historico.map((h) => (h.resposta ? faixaDe(h.pontos, h.supernova, h.espertalhao).emoji : "⚫"));
  const skinObj = SKINS.find((k) => k.id === skinEscolhida()) || SKINS[0];
  const marcaArquivo = !ARQUIVO ? "" : estado.replay ? " · 📂 arquivo, jogada extra" : " · 📂 arquivo";
  $("compartilhar").textContent =
    `NICHO · DIA #${numeroDoDia(estado.data)}${marcaArquivo}${seq > 1 ? ` · 🔥 ${seq} dias seguidos` : ""}\n${icones.join(" ")}\n${numero(estado.total)} pontos · ↓ ${numero(anosLuzDoDia())} AL ${skinObj.emoji || "🐻"}\n${LINK_JOGO}`;
}

function mostrarFim(comSom) {
  atualizarCaixaApoio();
  Som.fundo(false);
  if (comSom) Som.fim();
  else cena.irPara(0);
  cena.limpar();
  mostrarPergunta(false);
  document.body.classList.remove("em-viagem");
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
  if (typeof Conta !== "undefined") Conta.mostrarPlacar(estado.data);
  if (comSom && !estado.replay && typeof Conta !== "undefined") Conta.avisarRaras(estado.data);
  montarFaixas();
  montarRespostas();

  const seq = mostrarDiaESequencia();
  if (!MODO_TESTE && !ARQUIVO) avisarSkinNova(seq);
  atualizarTextoCompartilhar(seq);
  $("enviar").hidden = !navigator.share;
  if (ARQUIVO) mostrarFimDoArquivo();
  else contarAteAmanha();
  mostrarMelhor();
}

// No fim de um dia do arquivo: deixa claro qual viagem conta e oferece jogar de novo
// (só em dias anteriores; o dia de hoje não tem "jogar novamente").
function mostrarFimDoArquivo() {
  const oficial = estado.replay ? estado.oficial : lerRegistro(chaveOficial(estado.data));
  const nota = $("fim-arquivo");
  nota.hidden = false;
  nota.className = "fim-arquivo" + (estado.replay ? " extra" : "");
  nota.textContent = estado.replay
    ? `JOGADA EXTRA · NÃO CONTA. Sua 1ª viagem neste dia: ${numero(oficial.total)} pontos. Essa é a que vale.`
    : foiNoDia(oficial)
      ? "Sua 1ª viagem, feita no próprio dia. É a que conta."
      : "Sua 1ª viagem deste dia, feita pelo arquivo. É a que conta e entrou na curva dos viajantes. O placar é só de quem jogou no próprio dia.";
  if (estado.replay) {
    esquecerNovamente();
    if (!NO_SITE) history.replaceState(null, "", urlDoArquivo(estado.data));
  }
  const el = $("amanha");
  el.innerHTML = "";
  const novamente = document.createElement("a");
  novamente.className = "botao-rosa botao-arquivo";
  novamente.href = urlDoArquivo(estado.data, true);
  novamente.textContent = "↻ JOGAR NOVAMENTE";
  const hoje = document.createElement("a");
  hoje.className = "botao-escuro botao-arquivo";
  hoje.href = paginaDeHoje();
  hoje.textContent = "IR PARA O DIA DE HOJE";
  const dica = document.createElement("span");
  dica.className = "dica-arquivo";
  dica.textContent = "jogar de novo é só por diversão: a pontuação que conta é sempre a da 1ª viagem";
  el.append(novamente, hoje, dica);
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
    const faixa = h.resposta ? faixaDe(h.pontos, h.supernova, h.espertalhao) : { id: "nada", cor: "#ff6b81" };
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

// ---------- respostas do dia ----------
// Os pontos são fixos (dados.js, da simulação de 1000 jogadores do scripts/fama.py): ainda não há
// jogadores suficientes para a contagem real mandar sem ficar volátil. Mas as respostas vão
// anônimas para /api/respostas (functions/api/respostas.js), por dois motivos:
//   - as recusadas viram candidatas na fila (scripts/fila.py): a lista se completa sozinha;
//   - somadas ao longo das semanas, mostram onde a simulação erra (scripts/fama.py --calibrar no futuro).
const API_RESPOSTAS = "/api/respostas";

// Cada navegador conta uma resposta aceita por categoria por dia, e cada recusada uma vez por dia.
// viagens pelo arquivo não são enviadas: a contagem é de quem joga no dia
function vaiAnotar(cat) {
  return !(location.protocol === "file:" || MODO_TESTE || ARQUIVO || !cat.id);
}

function enviarResposta(cat, corpo) {
  if (!vaiAnotar(cat)) return;
  const chave = `nicho:resposta:${estado.data}:${cat.id}`;
  if (corpo.resposta) {
    if (lerChave(chave)) return;
    gravarChave(chave, "1");
  }
  // recusada: cada navegador conta cada palavra uma vez por dia (antes contava a cada tentativa)
  if (corpo.recusada) {
    const chaveRecusada = `nicho:recusada:${estado.data}:${cat.id}:${compactar(corpo.recusada)}`;
    if (lerChave(chaveRecusada)) return;
    gravarChave(chaveRecusada, "1");
  }
  fetch(API_RESPOSTAS, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dia: estado.data, categoria: cat.id, ...corpo }),
    keepalive: true,
  }).catch(() => {});
}

// "acima" vem da simulação: a parte dos jogadores que daria uma resposta mais óbvia que esta.
// Sem simulação, a conta antiga: a parte da lista que vale menos pontos.
function percentilDe(cat, achada) {
  return typeof achada.acima === "number"
    ? achada.acima
    : cat.respostas.filter((r) => r.pontos < achada.pontos).length / cat.respostas.length;
}

// ---------- curva dos viajantes ----------
// No fim, a pontuação do dia vai (anônima: só o dia e os pontos) para /api/pontuacao,
// que devolve quantos viajantes terminaram em cada faixa de 10 pontos. A curva mostra
// onde você ficou. Cada navegador manda uma vez por dia. Aberto do computador (file://)
// ou sem internet, a seção simplesmente não aparece.
const API_PONTUACAO = "/api/pontuacao";

// Se o banco estiver fora, a curva vem "guardada" (a última boa, com a sua viagem somada). Aí a
// viagem fica pendente e é mandada de novo quando o jogo abrir outra vez. Sem resposta nenhuma,
// usa a última curva daquele dia que este navegador viu.
function lerJson(chave) {
  try {
    return JSON.parse(localStorage.getItem(chave) || "null");
  } catch {
    return null;
  }
}
function gravar(chave, valor) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, typeof valor === "string" ? valor : JSON.stringify(valor));
  } catch {}
}

function mandarPontos(dia, pontos) {
  return fetch(API_PONTUACAO, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dia, pontos }),
  }).then((r) => (r.ok ? r.json() : null));
}

// viagens que não entraram na curva porque o banco estava fora
function reenviarPendentes() {
  if (location.protocol === "file:" || MODO_TESTE) return;
  let chaves = [];
  try {
    chaves = Object.keys(localStorage).filter((k) => k.startsWith("nicho:pendente:"));
    // as marcas de recusada só valem no dia
    for (const k of Object.keys(localStorage))
      if (k.startsWith("nicho:recusada:") && !k.startsWith(`nicho:recusada:${estado.data}:`)) localStorage.removeItem(k);
  } catch {}
  for (const chave of chaves) {
    const dia = chave.slice("nicho:pendente:".length);
    const pontos = Number(lerJson(chave));
    if (!Number.isInteger(pontos)) {
      gravar(chave, null);
      continue;
    }
    mandarPontos(dia, pontos)
      .then((c) => {
        if (c && Array.isArray(c.contagem) && !c.guardada) {
          gravar(chave, null);
          gravar(`nicho:enviado:${dia}`, "1");
          gravar(`nicho:curva:${dia}`, c);
        } else if (c && c.erro) gravar(chave, null); // dia fora do prazo: desiste
      })
      .catch(() => {});
  }
}

function mostrarCurva() {
  $("secao-curva").hidden = true;
  if (location.protocol === "file:") return;
  const dia = estado.data;
  const pontos = Math.round(estado.total);
  const jaEnviou = !!lerJson(`nicho:enviado:${dia}`) || lerJson(`nicho:pendente:${dia}`) !== null;
  // só a 1ª viagem de cada dia entra na curva, também quando é feita pelo arquivo;
  // a jogada extra só lê a curva
  const mandar = !MODO_TESTE && !estado.replay && !jaEnviou;
  const pedido = mandar
    ? mandarPontos(dia, pontos)
    : fetch(`${API_PONTUACAO}?dia=${dia}`).then((r) => (r.ok ? r.json() : null));
  pedido
    .catch(() => null)
    .then((c) => {
      if (c && Array.isArray(c.contagem) && !c.guardada) {
        if (mandar) gravar(`nicho:enviado:${dia}`, "1");
        gravar(`nicho:curva:${dia}`, c);
        desenharCurva(c, pontos);
        return;
      }
      // banco fora: a viagem fica pendente e vale a curva guardada mais completa (a do servidor
      // ou a última que este navegador viu, com a sua viagem somada)
      if (mandar) gravar(`nicho:pendente:${dia}`, String(pontos));
      let melhor = c && Array.isArray(c.contagem) ? c : null;
      const velha = lerJson(`nicho:curva:${dia}`);
      if (velha && Array.isArray(velha.contagem) && (!melhor || velha.total + 1 > melhor.total)) {
        if (mandar) {
          velha.contagem[Math.min(velha.contagem.length - 1, Math.floor(pontos / velha.largura))] += 1;
          velha.total += 1;
        }
        melhor = velha;
      }
      if (melhor && melhor.total >= 5) desenharCurva(melhor, pontos);
      else if (c || velha) curvaEmPausa();
    });
}

// Sem curva guardada nenhuma: não é que ninguém jogou, é a contagem que está parada.
function curvaEmPausa() {
  $("secao-curva").hidden = false;
  $("curva").hidden = true;
  $("curva-svg").innerHTML = "";
  $("curva-eixo").innerHTML = "";
  $("curva-texto").textContent =
    "A contagem dos viajantes está em pausa agora. Sua viagem ficou guardada e entra na curva quando ela voltar.";
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
    $("curva-texto").textContent = ARQUIVO
      ? "Poucos viajantes jogaram este dia, ainda não dá para desenhar a curva."
      : "Você está entre os primeiros viajantes de hoje. Volte mais tarde para ver onde ficou na curva.";
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
  $("curva-texto").textContent = MODO_TESTE
    ? `Modo teste: sua viagem não entrou na curva, mas ficaria acima de ${pct}% dos viajantes de hoje.`
    : estado.replay
      ? `Jogada extra: não entrou na curva, mas ficaria acima de ${pct}% dos viajantes daquele dia.`
      : ARQUIVO
        ? `Você foi mais fundo que ${pct}% dos viajantes daquele dia.`
        : pct >= 99
      ? "Você foi mais fundo que 99% dos viajantes de hoje. Poucos chegaram tão longe!"
      : `Você foi mais fundo que ${pct}% dos viajantes de hoje.`;
}

// Tabela das faixas, da mais rara para a mais óbvia; as que você alcançou hoje ficam acesas.
function montarFaixas() {
  const lista = $("tabela-faixas");
  lista.innerHTML = "";
  const alcancadas = new Set(estado.historico.filter((h) => h.resposta).map((h) => faixaDe(h.pontos, h.supernova, h.espertalhao).id));
  const linhas = [
    { ...SUPERNOVA, faixa: "★ 1 por pergunta", texto: "A resposta escondida. Só existe uma." },
    ...FAIXAS.map((f, i) => ({
      ...f,
      faixa: i === 0 ? `${f.min}+ pts` : `${f.min}–${FAIXAS[i - 1].min - 1} pts`,
      texto: f.frase,
    })),
    // o espertalhão é escondido: só entra na tabela se você caiu nele hoje
    ...(alcancadas.has(ESPERTALHAO.id) ? [{ ...ESPERTALHAO, faixa: "15 pts", texto: ESPERTALHAO.frase }] : []),
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
    const faixa = h.resposta ? faixaDe(h.pontos, h.supernova, h.espertalhao) : { id: "nada", cor: "#6b6a99", nome: "" };
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
      if (abrir && !li.querySelector(".banco")) li.append(montarBanco(estado.categorias[i], h.resposta, h.pontos));
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

// Todas as respostas aceitas de uma pergunta, com os pontos, filtro por faixa e busca.
const PONTOS_ESCONDIDOS_NO_RELATORIO = 60; // a faixa ESPAÇO PROFUNDO (cena.js, FAIXAS)
function montarBanco(cat, sua, suaPontos = 0) {
  const banco = document.createElement("div");
  banco.className = "banco";
  // Sem login, o relatório não mostra as respostas do espaço profundo nem a singularidade que a pessoa
  // não pegou (a que ela pegou aparece). Entrar na conta mostra todas.
  const logado = typeof Conta !== "undefined" && Conta.logado();
  let escondidas = 0;
  const itens = cat.respostas.flatMap((r) => {
    const sn = r.resposta === cat.supernova;
    const pontos = sn ? r.pontos * 2 : r.pontos;
    if (!logado && r.resposta !== sua && (sn || r.pontos >= PONTOS_ESCONDIDOS_NO_RELATORIO)) {
      escondidas++;
      return [];
    }
    return [{ nome: r.resposta, pontos, faixa: faixaDe(pontos, sn, r.espertalhao), sn, frase: r.frase }];
  });
  // resposta aprovada pelo juiz: ainda não está na lista do dia, mas aparece aqui com a sua
  if (sua && !itens.some((it) => it.nome === sua)) {
    itens.push({ nome: sua, pontos: suaPontos, faixa: faixaDe(suaPontos, false, false), sn: false });
  }
  itens
    .sort((a, b) => b.sn - a.sn || b.pontos - a.pontos || a.nome.localeCompare(b.nome, "pt"));
  const filtros = [{ id: "todas", nome: "Todas", cor: "#eef0ff" }, SUPERNOVA, ...FAIXAS, ESPERTALHAO];
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
        nota.textContent = `★ Singularidade. ${cat.curiosidade || it.frase || "A resposta escondida desta pergunta."}`;
        li.append(nota);
      } else if (it.frase) {
        // frase própria da resposta (dados/frases.txt), a mesma do cartão de resultado
        const nota = document.createElement("span");
        nota.className = "nota";
        nota.textContent = it.frase;
        li.append(nota);
      }
      lista.append(li);
    }
    rodape.textContent = `${vis.length} de ${itens.length} respostas` +
      (escondidas ? ` · mais ${numero(escondidas)} do espaço profundo e a singularidade aparecem para quem entra na conta` : "");
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
  const diaDoJogo = hojeBrasil();
  const atualizar = () => {
    const agora = agoraSincronizado();
    const s = segundosAteMeiaNoiteBrasil(agora);
    if (s <= 0 || hojeBrasil(agora) !== diaDoJogo) {
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

// ---------- arquivos: dias anteriores ----------
// A lista vem de /api/arquivo (functions/api/arquivo.js), 30 dias por vez: só a data, o número
// e os temas. As perguntas de um dia só são baixadas quando você abre aquele dia (/api/dia),
// então o jogo não fica mais pesado conforme os dias se acumulam.
// Sem internet ou aberto do computador (file://), a lista sai do pacote jogo/dados.js.
const API_ARQUIVO = "/api/arquivo";
const arquivos = { carregados: [], mais: false, carregando: false, iniciado: false };

function abrirArquivos() {
  const j = $("janela-arquivos");
  if (typeof j.showModal !== "function") return;
  j.showModal();
  j.querySelector(".fechar").focus();
  if (!arquivos.iniciado) {
    arquivos.iniciado = true;
    carregarArquivos();
  } else {
    montarListaArquivos(); // o progresso pode ter mudado
  }
}

async function carregarArquivos() {
  if (arquivos.carregando) return;
  arquivos.carregando = true;
  const status = $("arquivos-status");
  status.textContent = "carregando…";
  $("mais-arquivos").hidden = true;
  const ultimo = arquivos.carregados[arquivos.carregados.length - 1];
  let pagina = null;
  if (location.protocol !== "file:") {
    try {
      const r = await fetch(`${API_ARQUIVO}?limite=30${ultimo ? `&antes=${ultimo.dia}` : ""}`);
      if (r.ok) pagina = await r.json();
    } catch {}
  }
  if (!pagina || !Array.isArray(pagina.dias)) pagina = arquivosDoPacote(await carregarDadosLocais(), ultimo ? ultimo.dia : null);
  const hoje = hojeLocal();
  arquivos.carregados.push(...pagina.dias.filter((d) => d.dia < hoje && d.dia >= LANCAMENTO));
  arquivos.mais = !!pagina.mais;
  arquivos.carregando = false;
  montarListaArquivos();
}

// Plano B, sem a API: monta a lista com as categorias que já estão no navegador.
function arquivosDoPacote(dados, antes) {
  if (!dados) return { dias: [], mais: false };
  const dias = [];
  const d = new Date((antes || hojeLocal()) + "T12:00");
  const p = (n) => String(n).padStart(2, "0");
  for (let i = 0; i < 3650; i++) {
    d.setDate(d.getDate() - 1);
    const dia = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    if (dia < LANCAMENTO) break;
    const titulos = categoriasDoDia(dados.indice, dia, dados.ordem).map((c) => c.titulo);
    dias.push({ dia, numero: numeroDoDia(dia), titulos });
  }
  return { dias, mais: false };
}

function montarListaArquivos() {
  const lista = $("lista-arquivos");
  lista.innerHTML = "";
  for (const d of arquivos.carregados) {
    const oficial = lerRegistro(chaveOficial(d.dia));
    const li = document.createElement("li");
    li.className = "dia-arquivo";
    const topo = document.createElement("div");
    topo.className = "dia-topo";
    const nome = document.createElement("b");
    nome.textContent = `DIA #${d.numero} · ${dataCurta(d.dia)}`;
    const situacao = document.createElement("span");
    situacao.className = "dia-situacao";
    if (completa(oficial)) {
      situacao.textContent = `${numero(oficial.total)} PTS · ${foiNoDia(oficial) ? "NO DIA" : "PELO ARQUIVO"}`;
      situacao.classList.add(foiNoDia(oficial) ? "no-dia" : "fora");
      situacao.title = "A pontuação da sua 1ª viagem neste dia. É a que conta.";
    } else {
      situacao.textContent = oficial ? "PELA METADE" : "NÃO JOGADO";
    }
    topo.append(nome, situacao);
    li.append(topo);
    // os temas só aparecem depois que você termina o dia: para quem não jogou, são surpresa
    if (completa(oficial) && d.titulos && d.titulos.length) {
      const temas = document.createElement("p");
      temas.className = "dia-temas";
      temas.textContent = d.titulos.join(" · ");
      li.append(temas);
    }
    const botoes = document.createElement("div");
    botoes.className = "dia-botoes";
    const botao = (texto, href, classe) => {
      const a = document.createElement("a");
      a.className = classe;
      a.href = href;
      a.textContent = texto;
      botoes.append(a);
    };
    if (completa(oficial)) {
      botao("VER RELATÓRIO", urlDoArquivo(d.dia), "botao-escuro");
      botao("↻ JOGAR NOVAMENTE", urlDoArquivo(d.dia, true), "botao-rosa");
    } else {
      botao(oficial ? "▼ CONTINUAR" : "▼ JOGAR", urlDoArquivo(d.dia), "botao-rosa");
    }
    li.append(botoes);
    lista.append(li);
  }
  $("arquivos-status").textContent = arquivos.carregados.length
    ? ""
    : "Ainda não há dias anteriores para abrir.";
  $("mais-arquivos").hidden = !arquivos.mais;
}

// ---------- apoio via Pix ----------
// Gera uma cobrança Pix na API (/api/apoio, Mercado Pago) e consulta a confirmação.
// Quando o Pix cai, libera e equipa a skin LAIKA e entrega um código NICHO-XXXX-XXXX
// para liberar também em outros aparelhos. O pedido pendente fica no localStorage para
// não se perder se o celular recarregar a aba na volta do aplicativo do banco.
const API_APOIO = "/api/apoio";
const CHAVE_APOIO_PENDENTE = "nicho:apoio-pendente";
const CHAVE_APOIO_CODIGO = "nicho:apoio-codigo";
const SIMULAR_PIX_LOCAL =
  (location.protocol === "file:" || location.hostname === "localhost" || location.hostname === "127.0.0.1") &&
  new URLSearchParams(location.search).has("simular-pix");

const estadoApoio = {
  modoValor: "10",
  pedido: null, // { id, valor, qr_code, qr_code_base64, expira_em }
  timerConsulta: null,
  timerSprite: null,
  quadroSprite: 0,
  consultando: false,
};

function valorApoioEscolhido() {
  if (estadoApoio.modoValor !== "outro") return Number(estadoApoio.modoValor);
  const v = Number(String($("apoio-valor").value).replace(",", "."));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

function formatarReais(v) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
}

function atualizarBotaoGerarPix() {
  const v = valorApoioEscolhido();
  $("apoio-gerar").textContent = v >= 2 ? `GERAR PIX · R$ ${formatarReais(v)}` : "GERAR PIX";
}

function mostrarErroApoio(msg) {
  const el = $("apoio-erro");
  el.textContent = msg || "";
  el.hidden = !msg;
}

function mostrarEtapaApoio(qual) {
  $("apoio-etapa-valor").hidden = qual !== "valor";
  $("apoio-etapa-pix").hidden = qual !== "pix";
  $("apoio-etapa-pago").hidden = qual !== "pago";
}

function desenharLaikaApoio() {
  if (typeof criarApoiador !== "function") return;
  if (!estadoApoio.sprite) estadoApoio.sprite = criarApoiador();
  const s = estadoApoio.sprite;
  const q = opcoes.semEfeitos ? 0 : estadoApoio.quadroSprite % 4;
  for (const [id, lista] of [["apoio-mascote", s.andar], ["apoio-mascote-pago", s.feliz]]) {
    const tela = $(id);
    if (!tela) continue;
    const g = tela.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, tela.width, tela.height);
    g.drawImage(lista[q], 0, 0);
  }
}

function iniciarAnimacaoLaika() {
  desenharLaikaApoio();
  clearInterval(estadoApoio.timerSprite);
  if (opcoes.semEfeitos) return;
  estadoApoio.timerSprite = setInterval(() => {
    if (!$("janela-apoio").open) { clearInterval(estadoApoio.timerSprite); return; }
    estadoApoio.quadroSprite = (estadoApoio.quadroSprite + 1) % 4;
    desenharLaikaApoio();
  }, 220);
}

function atualizarCaixaApoio() {
  const apoio = $("apoio-link");
  const sub = $("apoio-sub");
  if (!apoio) return;
  if (LINK_APOIO) return;
  const ja = lerChave("nicho:skin-liberada:apoiador") === "1";
  apoio.textContent = ja ? "APOIADOR ♥" : "APOIAR";
  apoio.classList.toggle("botao-escuro", ja);
  apoio.classList.toggle("botao-rosa", !ja);
  if (sub) {
    sub.textContent = ja
      ? "Obrigado por apoiar o Nicho! A skin Laika está liberada."
      : "Curtiu a incursão? Ajude a manter o Nicho no ar e libere a skin Laika.";
  }
  const salvo = lerChave(CHAVE_APOIO_CODIGO);
  $("apoio-ja-liberada").hidden = !ja;
  $("apoio-salvo-bloco").hidden = !salvo;
  if (salvo) $("apoio-codigo-salvo").textContent = salvo;
}

function abrirApoio() {
  if (LINK_APOIO) {
    window.open(LINK_APOIO, "_blank", "noopener");
    return;
  }
  mostrarErroApoio("");
  atualizarCaixaApoio();
  atualizarBotaoGerarPix();
  if (estadoApoio.pedido && Date.parse(estadoApoio.pedido.expira_em) > Date.now()) {
    exibirPixGerado(estadoApoio.pedido);
  } else {
    mostrarEtapaApoio("valor");
  }
  abrirJanela("janela-apoio");
  iniciarAnimacaoLaika();
}

function copiarTextoComFallback(texto, campo, botao, rotuloOk = "COPIADO ✓", rotuloPadrao = "COPIAR") {
  const marcar = (msg) => {
    botao.textContent = msg;
    setTimeout(() => { botao.textContent = rotuloPadrao; }, 2200);
  };
  const selecionar = () => {
    if (campo && typeof campo.select === "function") {
      campo.focus();
      campo.select();
    }
    marcar("SELECIONADO");
  };
  try {
    navigator.clipboard.writeText(texto).then(() => { marcar(rotuloOk); window.Janelas?.confirmar(botao); }, selecionar);
  } catch {
    selecionar();
  }
}

function exibirPixGerado(dados) {
  estadoApoio.pedido = dados;
  $("apoio-pix-valor").textContent = `PIX · R$ ${ Number(dados.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }`;
  $("apoio-copia-cola").value = dados.qr_code || "";
  if (dados.qr_code_base64) {
    $("apoio-qr").src = dados.qr_code_base64.startsWith("data:")
      ? dados.qr_code_base64
      : `data:image/png;base64,${dados.qr_code_base64}`;
    $("apoio-qr-caixa").hidden = false;
  } else {
    $("apoio-qr-caixa").hidden = true;
  }
  mostrarEtapaApoio("pix");
  agendarConsultaPix();
}

function limparPedidoPendente() {
  estadoApoio.pedido = null;
  clearInterval(estadoApoio.timerConsulta);
  estadoApoio.timerConsulta = null;
  try { localStorage.removeItem(CHAVE_APOIO_PENDENTE); } catch {}
}

function concluirApoio(codigo) {
  limparPedidoPendente();
  const antes = SKINS.find((k) => k.id === skinEscolhida()) || SKINS[0];
  gravarChave("nicho:skin-liberada:apoiador", "1");
  if (codigo) gravarChave(CHAVE_APOIO_CODIGO, codigo);
  gravarChave("nicho:skin", "apoiador");

  cena.skin("apoiador", true);
  const nova = SKINS.find((k) => k.id === "apoiador");
  if (!opcoes.semEfeitos && typeof Transicao === "object" && antes.id !== "apoiador") {
    const de = antes.criar(), para = nova && nova.criar();
    if (de && para && !$("inicio").hidden) Transicao.animarCanvas($("modo-mascote"), de.andar[0], para.andar[0]);
    else desenharMascoteDoMenu();
  } else {
    desenharMascoteDoMenu();
  }
  montarSkins();
  atualizarCaixaApoio();
  if (!$("fim").hidden) atualizarTextoCompartilhar();

  Som.ligar();
  Som.materializar();

  $("apoio-caixa-codigo").hidden = !codigo;
  if (codigo) $("apoio-codigo-novo").textContent = codigo;
  mostrarEtapaApoio("pago");
  if (!$("janela-apoio").open) abrirJanela("janela-apoio");
  iniciarAnimacaoLaika();
}

async function consultarPixPendente() {
  const p = estadoApoio.pedido;
  if (!p || estadoApoio.consultando) return;
  if (Date.parse(p.expira_em) <= Date.now()) {
    limparPedidoPendente();
    if ($("janela-apoio").open) {
      mostrarEtapaApoio("valor");
      mostrarErroApoio("O QR Code expirou. Gere um novo Pix se ainda quiser apoiar.");
    }
    return;
  }
  if (p.simulado) {
    if (Date.now() >= p.aprovarEm) concluirApoio("NICHO-TEST-2026");
    return;
  }
  if (location.protocol === "file:") return;
  estadoApoio.consultando = true;
  try {
    const r = await fetch(`${API_APOIO}?id=${encodeURIComponent(p.id)}`);
    if (!r.ok) return;
    const d = await r.json();
    if (d.status === "approved") {
      concluirApoio(d.codigo || "");
    } else if (d.status === "cancelled" || d.status === "rejected") {
      limparPedidoPendente();
      if ($("janela-apoio").open) {
        mostrarEtapaApoio("valor");
        mostrarErroApoio("O pagamento foi cancelado. Você pode gerar outro Pix.");
      }
    }
  } catch {
    // sem conexão no momento: tenta de novo no próximo ciclo
  } finally {
    estadoApoio.consultando = false;
  }
}

function agendarConsultaPix() {
  clearInterval(estadoApoio.timerConsulta);
  estadoApoio.timerConsulta = setInterval(consultarPixPendente, 3200);
}

function qrSimuladoDataUrl() {
  const c = document.createElement("canvas");
  c.width = 21; c.height = 21;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 21, 21);
  g.fillStyle = "#12082e";
  const canto = (ox, oy) => {
    g.fillRect(ox, oy, 7, 7);
    g.fillStyle = "#ffffff"; g.fillRect(ox + 1, oy + 1, 5, 5);
    g.fillStyle = "#12082e"; g.fillRect(ox + 2, oy + 2, 3, 3);
  };
  canto(0, 0); canto(14, 0); canto(0, 14);
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
    if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) continue;
    if (((x * 7 + y * 13) % 5) < 2) g.fillRect(x, y, 1, 1);
  }
  return c.toDataURL();
}

async function gerarPixApoio() {
  mostrarErroApoio("");
  const valor = valorApoioEscolhido();
  if (!valor || valor < 2) {
    mostrarErroApoio("O valor mínimo para Pix é R$ 2.");
    if (estadoApoio.modoValor === "outro") $("apoio-valor").focus();
    return;
  }
  if (valor > 1000) {
    mostrarErroApoio("Escolha um valor de até R$ 1.000.");
    return;
  }

  if (SIMULAR_PIX_LOCAL) {
    const falso = {
      id: "simulado-local",
      valor,
      qr_code: "00020126360014BR.GOV.BCB.PIX0114NICHO-SIMULADO5204000053039865802BR",
      qr_code_base64: qrSimuladoDataUrl(),
      expira_em: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      simulado: true,
      aprovarEm: Date.now() + 2600,
    };
    exibirPixGerado(falso);
    return;
  }

  if (location.protocol === "file:") {
    mostrarErroApoio("Abra nichoojogo.com com internet para gerar o Pix.");
    return;
  }

  const botao = $("apoio-gerar");
  botao.disabled = true;
  botao.textContent = "GERANDO PIX…";
  try {
    const r = await fetch(API_APOIO, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ valor }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.qr_code) {
      mostrarErroApoio(d.erro || "Não foi possível gerar o Pix agora. Tente em instantes.");
      return;
    }
    gravarChave(CHAVE_APOIO_PENDENTE, JSON.stringify(d));
    exibirPixGerado(d);
  } catch {
    mostrarErroApoio("Sem conexão com o servidor. Confira sua internet e tente de novo.");
  } finally {
    botao.disabled = false;
    atualizarBotaoGerarPix();
  }
}

async function validarCodigoApoiador(e) {
  if (e) e.preventDefault();
  mostrarErroApoio("");
  const bruto = $("apoio-input-codigo").value.trim();
  if (!bruto) {
    $("apoio-input-codigo").focus();
    return;
  }
  if (SIMULAR_PIX_LOCAL && bruto.toUpperCase() === "NICHO-TEST-2026") {
    concluirApoio("NICHO-TEST-2026");
    return;
  }
  if (location.protocol === "file:") {
    mostrarErroApoio("Abra nichoojogo.com com internet para validar seu código.");
    return;
  }
  const botao = $("apoio-validar-codigo");
  botao.disabled = true;
  try {
    const r = await fetch(`${API_APOIO}?codigo=${encodeURIComponent(bruto)}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.status !== "approved") {
      mostrarErroApoio(d.erro || "Código não encontrado.");
      return;
    }
    $("apoio-input-codigo").value = "";
    concluirApoio(d.codigo);
  } catch {
    mostrarErroApoio("Sem conexão para validar o código agora.");
  } finally {
    botao.disabled = false;
  }
}

function retomarPixPendente() {
  try {
    const salvo = JSON.parse(lerChave(CHAVE_APOIO_PENDENTE) || "null");
    if (!salvo || !salvo.id || Date.parse(salvo.expira_em) <= Date.now()) {
      if (salvo) localStorage.removeItem(CHAVE_APOIO_PENDENTE);
      return;
    }
    estadoApoio.pedido = salvo;
    consultarPixPendente();
    agendarConsultaPix();
  } catch {}
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
$("abrir-arquivos").addEventListener("click", abrirArquivos);
$("abrir-arquivos-fim").addEventListener("click", abrirArquivos);
$("mais-arquivos").addEventListener("click", carregarArquivos);

$("apoio-link").addEventListener("click", abrirApoio);
document.querySelectorAll(".apoio-pilula").forEach((b) => b.addEventListener("click", () => {
  estadoApoio.modoValor = b.dataset.valor;
  document.querySelectorAll(".apoio-pilula").forEach((p) => {
    const ativa = p === b;
    p.classList.toggle("escolhida", ativa);
    p.setAttribute("aria-checked", String(ativa));
  });
  const outro = estadoApoio.modoValor === "outro";
  $("apoio-outro-linha").hidden = !outro;
  if (outro) $("apoio-valor").focus();
  mostrarErroApoio("");
  atualizarBotaoGerarPix();
}));
$("apoio-valor").addEventListener("input", () => { mostrarErroApoio(""); atualizarBotaoGerarPix(); });
$("apoio-valor").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); gerarPixApoio(); } });
$("apoio-gerar").addEventListener("click", gerarPixApoio);
$("apoio-voltar").addEventListener("click", () => {
  limparPedidoPendente();
  mostrarErroApoio("");
  mostrarEtapaApoio("valor");
});
$("apoio-copiar-pix").addEventListener("click", () => {
  copiarTextoComFallback($("apoio-copia-cola").value, $("apoio-copia-cola"), $("apoio-copiar-pix"), "PIX COPIADO ✓", "COPIAR PIX COPIA E COLA");
});
$("apoio-copiar-novo").addEventListener("click", () => {
  copiarTextoComFallback($("apoio-codigo-novo").textContent, null, $("apoio-copiar-novo"));
});
$("apoio-copiar-salvo").addEventListener("click", () => {
  copiarTextoComFallback($("apoio-codigo-salvo").textContent, null, $("apoio-copiar-salvo"));
});
$("apoio-fechar-pago").addEventListener("click", () => $("janela-apoio").close());
$("apoio-abrir-codigo").addEventListener("click", () => {
  const form = $("apoio-form-codigo");
  form.hidden = !form.hidden;
  $("apoio-abrir-codigo").setAttribute("aria-expanded", String(!form.hidden));
  if (!form.hidden) $("apoio-input-codigo").focus();
});
$("apoio-form-codigo").addEventListener("submit", validarCodigoApoiador);
$("apoio-validar-codigo").addEventListener("click", validarCodigoApoiador);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && estadoApoio.pedido) consultarPixPendente();
});
$("som").addEventListener("click", () => {
  Som.ligar();
  $("som").classList.toggle("mudo", Som.alternar());
});

iniciar();
