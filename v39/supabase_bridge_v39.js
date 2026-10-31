import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
window.supabase = { createClient };
window.dispatchEvent(new CustomEvent('v39:supabase-ready'));

const s = document.createElement('script');
s.src = 'app_v39.js?v=39-test-7';
s.defer = true;
s.onerror = function () {
  const el = document.getElementById('erro');
  if (el) { el.style.display='block'; el.textContent='Falha ao carregar app_v39.js.'; }
};
document.head.appendChild(s);
