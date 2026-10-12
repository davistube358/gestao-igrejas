/* 2Gather — configuração do app instalado (PWA).
   apiUrl: endereço do App da Web do Apps Script (termina em /exec).
   appUrl: endereço oficial deste app (Cloudflare Pages ou domínio próprio).
   origens: endereços autorizados a abrir o app. */
window.APP_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbxKyZ1pzhXbWCK-6vtO2av2ip08yxSY8QbyYWfrTyvpRzoU52Rqj1z9jZ1o3o4xKaJYPA/exec',
  appUrl: 'https://2gather.pages.dev',
  origens: ['https://2gather.pages.dev']
};
