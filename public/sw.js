/*
 * ARQUIVO: public/sw.js  -  Service Worker para Web Push
 * Site da Comissão de Transporte dos Universitários de Divisa Alegre - MG
 * ---------------------------------------------------------------------------
 * Recebe notificações push mesmo com o site fechado.
 * Registrado pelo main.js quando o usuário ativa os alertas.
 */

const NOME_CACHE = "site-universitarios-v1";
const ARQUIVOS_CACHE = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/main.js",
  "/img/logo-contorno.png",
  "/img/favicon.png",
];

// Instalação: precache dos arquivos essenciais
self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(NOME_CACHE).then((cache) => cache.addAll(ARQUIVOS_CACHE))
  );
  self.skipWaiting();
});

// Ativação: limpa caches antigos
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(
        chaves
          .filter((chave) => chave !== NOME_CACHE)
          .map((chave) => caches.delete(chave))
      )
    )
  );
  self.clients.claim();
});

// Fetch: serve do cache, cai na rede se não tiver
self.addEventListener("fetch", (evento) => {
  const { request } = evento;
  // Só cacheia GET
  if (request.method !== "GET") return;

  evento.respondWith(
    caches.match(request).then((respostaCache) => {
      if (respostaCache) return respostaCache;
      return fetch(request).then((respostaRede) => {
        // Não cacheia respostas de API ou opacas
        if (!respostaRede.ok || respostaRede.type === "opaque") return respostaRede;
        const respostaClonada = respostaRede.clone();
        caches.open(NOME_CACHE).then((cache) => cache.put(request, respostaClonada));
        return respostaRede;
      });
    })
  );
});

// Push: recebe notificação do servidor
self.addEventListener("push", (evento) => {
  if (!evento.data) return;

  let dados;
  try {
    dados = evento.data.json();
  } catch (e) {
    dados = { titulo: "Alerta de Trânsito", corpo: evento.data.text() };
  }

  const { titulo = "Alerta de Trânsito", corpo = "", ...resto } = dados;

  const opcoesNotificacao = {
    body: corpo,
    icon: "/img/logo-contorno.png",
    badge: "/img/favicon.png",
    vibrate: [200, 100, 200],
    tag: "transito-alerta",
    renotify: true,
    requireInteraction: true,
    data: {
      url: "/",
      ...resto,
    },
    actions: [
      { action: "abrir", title: "Abrir site" },
      { action: "dispensar", title: "Dispensar" },
    ],
  };

  evento.waitUntil(
    self.registration.showNotification(titulo, opcoesNotificacao)
  );
});

// Click na notificação: abre/foca o site
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();

  if (evento.action === "dispensar") return;

  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Se já tem aba aberta, foca nela
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      // Senão abre nova aba
      return self.clients.openWindow("/");
    })
  );
});

// Push subscription change (raro, mas bom tratar)
self.addEventListener("pushsubscriptionchange", (evento) => {
  console.log("[SW] Subscription changed, re-inscrevendo...");
  evento.waitUntil(
    // O ideal seria notificar o servidor para remover a inscrição antiga
    // e o frontend se reinscrever na próxima visita
    Promise.resolve()
  );
});