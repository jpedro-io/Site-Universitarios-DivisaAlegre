/*
 * ARQUIVO: public/sw.js  -  Service Worker para notificações push
 * Site da Comissão de Transporte dos Universitários de Divisa Alegre - MG
 *
 * Recebe push notifications do servidor (Vercel Cron) e exibe no navegador
 * do usuário mesmo com o site fechado.
 */

const CACHE_NAME = "site-universitarios-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let dados = {
    titulo: "Transporte Universitário · Divisa Alegre",
    corpo: "Você tem um novo aviso do transporte universitário.",
    icone: "/img/favicon.png",
    tag: "transporte-universitario",
    url: "/",
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      dados = { ...dados, ...payload };
    } catch (e) {
      dados.corpo = event.data.text() || dados.corpo;
    }
  }

  const options = {
    body: dados.corpo,
    icon: dados.icone,
    tag: dados.tag,
    badge: dados.icone,
    data: { url: dados.url },
    actions: [
      { action: "abrir", title: "Abrir site" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(dados.titulo, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientes) => {
      for (const cliente of clientes) {
        if (cliente.url.includes(new URL(url, self.location.origin).pathname) && "focus" in cliente) {
          return cliente.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
