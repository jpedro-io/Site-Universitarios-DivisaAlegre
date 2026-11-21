/* =====================================================================
   ARQUIVO: public/js/main.js
   Site da Comissão de Transporte dos Universitários de Divisa Alegre - MG
   ===================================================================== */
(function () {
  "use strict";

  /* ==================================================================
     PARTE 1 - MENU (abre e fecha ao clicar nas 3 barrinhas)
     ================================================================== */
  const botaoMenu = document.querySelector(".menu-botao");
  const fundoMenu = document.querySelector(".fundo-menu");

  function fecharMenu() { document.body.classList.remove("menu-aberto"); }
  function alternarMenu() { document.body.classList.toggle("menu-aberto"); }

  if (botaoMenu) {
    botaoMenu.addEventListener("click", alternarMenu);
    botaoMenu.setAttribute("aria-expanded", "false");
  }
  if (fundoMenu) fundoMenu.addEventListener("click", fecharMenu);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") fecharMenu(); });

  /* ==================================================================
     PARTE 2 - TRANSIÇÃO ENTRE PÁGINAS
     ================================================================== */
  document.addEventListener("click", function (e) {
    const a = e.target.closest("a");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    const externo = a.target === "_blank" || /^(https?:|mailto:|tel:|#)/i.test(href);
    if (externo || !/\.html$/i.test(href)) return;
    e.preventDefault();
    fecharMenu();
    document.body.classList.add("saindo");
    setTimeout(function () { window.location.href = href; }, 260);
  });

  window.addEventListener("pageshow", function () {
    document.body.classList.remove("saindo");
  });

  setTimeout(function () { document.body.classList.add("pronto"); }, 40);

  /* ==================================================================
     PARTE 3 - APARECER AO ROLAR ("revelar")
     ================================================================== */
  const alvos = document.querySelectorAll(".revelar");
  if ("IntersectionObserver" in window) {
    const observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada, i) {
        if (entrada.isIntersecting) {
          const el = entrada.target;
          const atraso = Number(el.dataset.atraso || (i % 4) * 90);
          setTimeout(function () { el.classList.add("visivel"); }, atraso);
          observador.unobserve(el);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -60px 0px" });
    alvos.forEach(function (el) { observador.observe(el); });
  } else {
    alvos.forEach(function (el) { el.classList.add("visivel"); });
  }

  window.addEventListener("load", function () {
    alvos.forEach(function (el) {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9) el.classList.add("visivel");
    });
  });

  /* ==================================================================
     PARTE 4 - ÍCONES DO CLIMA
     ================================================================== */
  var ICONES = {
    sol: '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"><circle cx="32" cy="32" r="12" fill="none" stroke="#fff"/><path d="M32 6v8M32 50v8M6 32h8M50 32h8M13.6 13.6l5.7 5.7M44.7 44.7l5.7 5.7M50.4 13.6l-5.7 5.7M19.3 44.7l-5.7 5.7"/></svg>',
    solNuvem: '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"><circle cx="24" cy="24" r="9" fill="none" stroke="#fff"/><path d="M24 6v6M24 36v6M6 24h6M36 24h6M11.3 11.3l4.2 4.2M32.5 32.5l4.2 4.2M36.7 11.3l-4.2 4.2M15.5 32.5l-4.2 4.2"/><path d="M22 50h22a10 10 0 0 0 .6-19.9A14 14 0 0 0 18 34" fill="#fff" stroke="none"/></svg>',
    nuvem: '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3.4" stroke-linejoin="round"><path d="M18 48h26a11 11 0 0 0 .7-21.9A15 15 0 0 0 16.5 30A9.5 9.5 0 0 0 18 48Z" fill="#fff" stroke="none"/></svg>',
    nevoa: '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"><path d="M18 40h26a11 11 0 0 0 .7-21.9A15 15 0 0 0 16.5 22A9.5 9.5 0 0 0 18 40Z" fill="#fff" stroke="none"/><path d="M12 48h40M18 56h32"/></svg>',
    chuva: '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 38h26a11 11 0 0 0 .7-21.9A15 15 0 0 0 16.5 20A9.5 9.5 0 0 0 18 38Z" fill="#fff" stroke="none"/><path d="M22 46l-3 10M32 46l-3 10M42 46l-3 10"/></svg>',
    trovoada: '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 38h26a11 11 0 0 0 .7-21.9A15 15 0 0 0 16.5 20A9.5 9.5 0 0 0 18 38Z" fill="#fff" stroke="none"/><path d="M32 42l-6 12h8l-4 10" stroke="#fff"/></svg>',
    neve: '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 38h26a11 11 0 0 0 .7-21.9A15 15 0 0 0 16.5 20A9.5 9.5 0 0 0 18 38Z" fill="#fff" stroke="none"/><path d="M24 48v10M20 53l8-4M28 53l-8-4M40 48v10M36 53l8-4M44 53l-8-4"/></svg>',
  };

  function iconePorCodigo(codigo) {
    if (codigo === 0) return ICONES.sol;
    if (codigo === 1 || codigo === 2) return ICONES.solNuvem;
    if (codigo === 3) return ICONES.nuvem;
    if (codigo === 45 || codigo === 48) return ICONES.nevoa;
    if (codigo >= 51 && codigo <= 67) return ICONES.chuva;
    if (codigo >= 71 && codigo <= 77) return ICONES.neve;
    if (codigo >= 80 && codigo <= 82) return ICONES.chuva;
    if (codigo >= 85 && codigo <= 86) return ICONES.neve;
    if (codigo >= 95) return ICONES.trovoada;
    return ICONES.nuvem;
  }

  /* ==================================================================
     PARTE 5 - CLIMA
     ================================================================== */
  const cxClima = document.getElementById("clima-conteudo");

  function numero(v, casas) {
    if (v === null || v === undefined) return "--";
    return Number(v).toFixed(casas === undefined ? 0 : casas).replace(".", ",");
  }

  function horaLocal(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function carregarClima() {
    if (!cxClima) return;

    cxClima.parentElement.style.background = "rgba(20, 30, 60, 0.65)";
    cxClima.parentElement.style.backdropFilter = "blur(12px)";
    cxClima.parentElement.style.webkitBackdropFilter = "blur(12px)";
    cxClima.parentElement.style.border = "1px solid rgba(255, 255, 255, 0.15)";
    cxClima.parentElement.style.color = "#ffffff";
    cxClima.parentElement.style.maxWidth = "400px";

    fetch("/api/clima", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.erro || "Falha ao consultar o clima");

        cxClima.innerHTML = `
          <div style="text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px; margin-bottom: 16px;">
            <p style="margin: 0; font-size: 1.1rem; font-weight: 700; color: #fff;">${d.cidade} - BA</p>
            <p style="margin: 0; font-size: 0.85rem; color: rgba(255,255,255,0.7);">Destino dos universitários</p>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
            <div style="display: flex; align-items: baseline; gap: 8px;">
              <span style="font-size: 3.5rem; font-weight: 800; line-height: 1; color: #fff;">${numero(d.temperatura)}&deg;</span>
              <span style="font-size: 1.1rem; font-weight: 500; color: rgba(255,255,255,0.9);">${d.descricao}</span>
            </div>
            <div style="width: 54px; height: 54px;">
              ${iconePorCodigo(d.codigo)}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px;">
            <div>
              <p style="margin: 0; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.6);">UMIDADE</p>
              <p style="margin: 0; font-size: 1rem; font-weight: 700; color: #fff;">${numero(d.umidade)}%</p>
            </div>
            <div>
              <p style="margin: 0; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.6);">VENTO</p>
              <p style="margin: 0; font-size: 1rem; font-weight: 700; color: #fff;">${numero(d.vento)} km/h</p>
            </div>
          </div>

          <p style="margin: 16px 0 0; font-size: 0.75rem; color: rgba(255,255,255,0.5);">Atualizado em ${horaLocal(d.atualizadoEm)}</p>
        `;
      })
      .catch(function (e) {
        cxClima.innerHTML = '<p style="color:#fff; text-align:center;">Não foi possível carregar o clima.<br><small>' + (e.message || "") + '</small></p>';
      });
  }

  carregarClima();
  if (cxClima) setInterval(carregarClima, 10 * 60 * 1000);

  /* ==================================================================
     PARTE 6 - TEMPO DE VIAGEM E TRÂNSITO (ao lado do clima)
     ================================================================== */
  const cxTempoViagem = document.getElementById("tempo-viagem-conteudo");

  /**
   * Classifica o tempo de viagem T (em minutos) em: bom, lento ou ruim
   * T <= 90 min  → bom
   * T >= 100 min → lento
   * T > 120 min  → ruim
   */
  function classificarTempoViagem(minutos) {
    if (minutos <= 90) return { tipo: "bom", texto: "Trânsito bom", cor: "#22c55e", icon: "check" };
    if (minutos > 120) return { tipo: "ruim", texto: "Trânsito ruim/parado", cor: "#ff6b6b", icon: "alert" };
    if (minutos >= 100) return { tipo: "lento", texto: "Trânsito lento", cor: "#f0b429", icon: "alert" };
    // entre 91 e 99 min: considera bom (limite inferior)
    return { tipo: "bom", texto: "Trânsito bom", cor: "#22c55e", icon: "check" };
  }

  function carregarTempoViagem() {
    if (!cxTempoViagem) return;

    cxTempoViagem.parentElement.style.background = "rgba(20, 30, 60, 0.65)";
    cxTempoViagem.parentElement.style.backdropFilter = "blur(12px)";
    cxTempoViagem.parentElement.style.webkitBackdropFilter = "blur(12px)";
    cxTempoViagem.parentElement.style.border = "1px solid rgba(255, 255, 255, 0.15)";
    cxTempoViagem.parentElement.style.color = "#ffffff";
    cxTempoViagem.parentElement.style.maxWidth = "400px";
    cxTempoViagem.style.padding = "20px";

    fetch("/api/transito", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.erro || "Falha ao consultar o trânsito");

        const tempoLivre = d.tempoLivreMin || 0;
        const tempoAtual = d.tempoAtualMin || 0;
        const classificacao = classificarTempoViagem(tempoAtual);
        const chegada = new Date(Date.now() + tempoAtual * 60 * 1000);

        // Ícone da classificação
        var iconeClassificacao = "";
        if (classificacao.icon === "check") {
          iconeClassificacao = '<svg viewBox="0 0 24 24" fill="none" stroke="' + classificacao.cor + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 28px; height: 28px;"><polyline points="20 6 9 17 4 12"/></svg>';
        } else {
          iconeClassificacao = '<svg viewBox="0 0 24 24" fill="none" stroke="' + classificacao.cor + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 28px; height: 28px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        }

        cxTempoViagem.innerHTML = `
          <div style="text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px; margin-bottom: 16px;">
            <p style="margin: 0; font-size: 1.1rem; font-weight: 700; color: #fff;">Tempo de viagem</p>
            <p style="margin: 0; font-size: 0.85rem; color: rgba(255,255,255,0.7);">Divisa Alegre → Vitória da Conquista</p>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <div style="display: flex; align-items: baseline; gap: 6px;">
              <span style="font-size: 2rem; font-weight: 800; line-height: 1; color: ${classificacao.cor};">${tempoAtual} min</span>
              <span style="font-size: 0.85rem; font-weight: 500; color: rgba(255,255,255,0.8);">agora</span>
            </div>
            <div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              ${iconeClassificacao}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px;">
            <div>
              <p style="margin: 0; font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.6);">Tempo livre</p>
              <p style="margin: 0; font-size: 1.1rem; font-weight: 700; color: #fff;">${tempoLivre} min</p>
            </div>
            <div>
              <p style="margin: 0; font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.6);">Distância da rota</p>
              <p style="margin: 0; font-size: 1.1rem; font-weight: 700; color: #fff;">${d.distanciaKm || 0} km</p>
            </div>
            <div>
              <p style="margin: 0; font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.6);">Chegada prevista</p>
              <p style="margin: 0; font-size: 1.1rem; font-weight: 700; color: #fff;">${chegada.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>

          <p style="margin: 12px 0 0; font-size: 0.8rem; font-weight: 700; color: ${classificacao.cor}; text-transform: uppercase;">${classificacao.texto}</p>

          <p style="margin: 10px 0 0; font-size: 0.65rem; color: rgba(255,255,255,0.4);">Atualizado: ${horaLocal(d.verificadoEm)} · Fonte: ${d.fonte || "TomTom"}</p>

          <!-- Incidentes na rota (obras e acidentes) -->
          ${renderIncidentes(d.incidentes || [])}
        `;

        // Armazena o tempo atual para uso nas notificações
        window.ultimoTempoViagem = { minutos: tempoAtual, classificacao: classificacao.tipo, atualizadoEm: d.verificadoEm };
      })
      .catch(function (e) {
        cxTempoViagem.innerHTML = '<p style="color:#fff; text-align:center;">Não foi possível carregar o tempo de viagem.<br><small>' + (e.message || "") + '</small></p>';
      });
  }

  /**
   * Renderiza a lista de incidentes (obras e acidentes) na rota
   */
  function renderIncidentes(incidentes) {
    if (!incidentes || incidentes.length === 0) {
      return '<p style="font-size: 0.75rem; color: rgba(255,255,255,0.6); margin-top: 12px;">Sem obras ou acidentes reportados na rota.</p>';
    }

    const tipoEmoji = { acidente: "🚨", obra: "🚧", fechamento: "🛑", outros: "⚠️" };

    const itens = incidentes.map(function (inc) {
      const emoji = tipoEmoji[inc.tipo] || "⚠️";
      const atraso = inc.atrasoMin > 0 ? ` (+${inc.atrasoMin} min)` : "";
      return `
        <div style="margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.08); border-radius: 6px; border-left: 4px solid ${inc.gravidade === "critica" || inc.gravidade === "grave" ? "#ff6b6b" : "#f0b429"};">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.2rem;">${emoji}</span>
            <span style="font-weight: 700; color: #fff; font-size: 0.85rem;">${inc.descricao}</span>
          </div>
          <p style="margin: 4px 0 0; font-size: 0.7rem; color: rgba(255,255,255,0.7);">${inc.tipo} · ${inc.gravidade}${atraso}</p>
        </div>
      `;
    }).join("");

    return '<p style="font-size: 0.75rem; font-weight: 700; color: #fff; margin-top: 12px;">Obras e acidentes na rota:</p>' + itens;
  }

  carregarTempoViagem();
  if (cxTempoViagem) setInterval(carregarTempoViagem, 5 * 60 * 1000); // atualiza a cada 5 min

  /* ==================================================================
     PARTE 7 - NOTIFICAÇÕES PERSONALIZÁVEIS (Web Push / VAPID)
     ================================================================== */
  let swRegistration = null;
  let pushInscrito = false;
  let preferencias = {
    categorias: { bom: false, lento: false, ruim: false },
    horaIda: "06:30",    // Divisa Alegre → Vitória da Conquista
    horaVolta: "17:30",  // Vitória da Conquista → Divisa Alegre
  };

  // Carrega preferências do localStorage se existirem
  function carregarPreferencias() {
    try {
      const salvo = localStorage.getItem("preferencias-notificacoes-transito");
      if (salvo) {
        preferencias = JSON.parse(salvo);
      }
    } catch (e) {
      console.warn("[notificacoes] Erro ao ler preferências:", e);
    }
  }

  function salvarPreferencias() {
    localStorage.setItem("preferencias-notificacoes-transito", JSON.stringify(preferencias));
  }

  // Aplica preferências nos elementos do DOM
  function aplicarPreferenciasNaUI() {
    const chkBom = document.getElementById("chk-bom");
    const chkLento = document.getElementById("chk-lento");
    const chkRuim = document.getElementById("chk-ruim");
    const horaIda = document.getElementById("hora-ida");
    const horaVolta = document.getElementById("hora-volta");

    if (chkBom) chkBom.checked = preferencias.categorias.bom;
    if (chkLento) chkLento.checked = preferencias.categorias.lento;
    if (chkRuim) chkRuim.checked = preferencias.categorias.ruim;
    if (horaIda) horaIda.value = preferencias.horaIda;
    if (horaVolta) horaVolta.value = preferencias.horaVolta;
  }

  // Salva preferências do formulário
  function salvarPreferenciasDoFormulario() {
    const chkBom = document.getElementById("chk-bom");
    const chkLento = document.getElementById("chk-lento");
    const chkRuim = document.getElementById("chk-ruim");
    const horaIda = document.getElementById("hora-ida");
    const horaVolta = document.getElementById("hora-volta");

    preferencias.categorias.bom = chkBom ? chkBom.checked : false;
    preferencias.categorias.lento = chkLento ? chkLento.checked : false;
    preferencias.categorias.ruim = chkRuim ? chkRuim.checked : false;
    preferencias.horaIda = horaIda ? horaIda.value : "06:30";
    preferencias.horaVolta = horaVolta ? horaVolta.value : "17:30";

    salvarPreferencias();

    const msg = document.getElementById("msg-salvo");
    if (msg) {
      msg.style.display = "block";
      setTimeout(function () { msg.style.display = "none"; }, 3000);
    }

    console.log("[notificacoes] Preferências salvas:", preferencias);
  }

  // Verifica suporte a Service Worker e Push
  function suportaPush() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  // Registra Service Worker
  async function registrarServiceWorker() {
    if (!suportaPush()) {
      console.log("[push] Web Push não suportado neste navegador");
      return false;
    }
    try {
      swRegistration = await navigator.serviceWorker.register("/sw.js");
      console.log("[push] Service Worker registrado:", swRegistration.scope);
      return true;
    } catch (e) {
      console.error("[push] Falha ao registrar SW:", e);
      return false;
    }
  }

  // Obtém chave pública VAPID do servidor
  async function obterVapidPublicKey() {
    const r = await fetch("/api/push/vapid-public-key", { headers: { Accept: "application/json" } });
    const d = await r.json();
    if (!d.ok) throw new Error(d.erro || "VAPID não configurado no servidor");
    return d.chavePublica;
  }

  // Converte base64url para Uint8Array
  function urlBase64ParaUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  // Inscreve o usuário para push (só chama quando usuário salvar com pelo menos uma categoria)
  async function inscreverPush() {
    if (!swRegistration) return { ok: false, erro: "Service Worker não registrado" };

    try {
      const chavePublica = await obterVapidPublicKey();
      const applicationServerKey = urlBase64ParaUint8Array(chavePublica);

      const inscricao = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // Envia inscrição + preferências para o servidor
      const r = await fetch("/api/push/inscrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: inscricao.endpoint,
          keys: inscricao.toJSON().keys,
          preferencias: preferencias,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro || "Falha ao salvar inscrição no servidor");

      pushInscrito = true;
      return { ok: true };
    } catch (e) {
      console.error("[push] Erro ao inscrever:", e);
      return { ok: false, erro: e.message };
    }
  }

  // Desinscreve o usuário
  async function desinscreverPush() {
    if (!swRegistration) return { ok: false, erro: "Service Worker não registrado" };

    try {
      const inscricao = await swRegistration.pushManager.getSubscription();
      if (!inscricao) return { ok: true, jaDesinscrito: true };

      await inscricao.unsubscribe();

      await fetch("/api/push/desinscrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: inscricao.endpoint }),
      });

      pushInscrito = false;
      return { ok: true };
    } catch (e) {
      console.error("[push] Erro ao desinscrever:", e);
      return { ok: false, erro: e.message };
    }
  }

  // Verifica se já tem inscrição ativa
  async function verificarInscricaoExistente() {
    if (!swRegistration) return false;
    const inscricao = await swRegistration.pushManager.getSubscription();
    pushInscrito = !!inscricao;
    return pushInscrito;
  }

  // Salvar preferências (chamado pelo botão no formulário)
  async function salvarPreferenciasENotificar() {
    // Primeiro salva as preferências locais
    salvarPreferenciasDoFormulario();

    // Verifica se pelo menos uma categoria está selecionada
    const algumaSelecionada = preferencias.categorias.bom || preferencias.categorias.lento || preferencias.categorias.ruim;

    if (!algumaSelecionada) {
      alert("Selecione pelo menos uma categoria de notificação (bom, lento ou ruim).");
      return;
    }

    // Se ainda não está inscrito no push, pede permissão e inscreve
    if (!pushInscrito) {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        alert("Permissão de notificação negada. Ative nas configurações do navegador.");
        return;
      }

      const swOk = await registrarServiceWorker();
      if (!swOk) {
        alert("Não foi possível ativar as notificações neste navegador.");
        return;
      }

      const resultado = await inscreverPush();
      if (!resultado.ok) {
        alert("Erro ao ativar notificações: " + (resultado.erro || "tente novamente"));
        return;
      }
    }

    // Atualiza preferências no servidor se já estiver inscrito
    if (pushInscrito) {
      try {
        const inscricao = await swRegistration.pushManager.getSubscription();
        if (inscricao) {
          await fetch("/api/push/inscrever", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endpoint: inscricao.endpoint,
              keys: inscricao.toJSON().keys,
              preferencias: preferencias,
            }),
          });
        }
      } catch (e) {
        console.warn("[notificacoes] Erro ao atualizar preferências no servidor:", e);
      }
    }

    alert("Preferências salvas! Você receberá notificações de trânsito de segunda a sexta nos horários escolhidos.");
  }

  // Inicializa o formulário de notificações
  function inicializarFormularioNotificacoes() {
    carregarPreferencias();
    aplicarPreferenciasNaUI();

    const btnSalvar = document.getElementById("salvar-preferencias");
    if (btnSalvar) {
      btnSalvar.addEventListener("click", salvarPreferenciasENotificar);
    }
  }

  // Inicia tudo
  carregarTempoViagem();
  inicializarFormularioNotificacoes();

  /* ==================================================================
     PARTE 8 - DETALHES (ano no rodapé)
     ================================================================== */
  document.querySelectorAll("[data-ano]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();