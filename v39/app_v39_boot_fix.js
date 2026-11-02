/* 2Gather v39 Build 69D.1 - automatic Supabase boot fix */
(function () {
  'use strict';

  var started = false;

  function report(error) {
    console.error('[2Gather v39] Falha no boot automatico do Supabase.', error);
    window.dispatchEvent(new CustomEvent('2gather:v39-boot-error', {
      detail: { message: error && error.message ? error.message : String(error) }
    }));
  }

  async function start() {
    if (started) return;
    started = true;

    try {
      var V = window.G2_V39;
      if (!V || typeof V.init !== 'function') {
        throw new Error('G2_V39.init indisponivel.');
      }

      if (!V.ready || !V.client) {
        var initialized = await V.init();
        if (initialized && initialized.error) throw initialized.error;
      }

      var sessionResult = await V.client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;

      var session = sessionResult.data && sessionResult.data.session;
      if (session && typeof V.boot === 'function') {
        await V.boot();
      }

      window.dispatchEvent(new CustomEvent('2gather:v39-autoboot-ready', {
        detail: { authenticated: !!session }
      }));
    } catch (error) {
      started = false;
      report(error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
