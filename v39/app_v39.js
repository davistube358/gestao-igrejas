/* 2Gather v39 Build 69D.10 - bootstrap Supabase com cliente unico */
(function () {
  'use strict';

  var C = window.APP_CONFIG || {};
  var V39 = window.G2_V39 = window.G2_V39 || {};

  V39.version = 39;
  V39.backend = 'supabase';
  V39.compatibility = 'v38';
  V39.ready = !!(V39.ready && V39.client);
  V39._initPromise = V39._initPromise || null;
  V39._authEventsBound = !!V39._authEventsBound;

  function assertConfig() {
    if (!C.supabaseUrl || !C.supabaseAnonKey) {
      throw new Error('Supabase v39 nao configurado em config.js.');
    }
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Biblioteca Supabase nao carregada.');
    }
  }

  V39.init = function () {
    if (V39.ready && V39.client) {
      return V39.client.auth.getSession();
    }

    if (V39._initPromise) {
      return V39._initPromise;
    }

    assertConfig();

    if (!V39.client) {
      V39.client = window.supabase.createClient(
        C.supabaseUrl,
        C.supabaseAnonKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );
    }

    V39.ready = true;

    if (typeof V39.bindAuthEvents === 'function' && !V39._authEventsBound) {
      V39.bindAuthEvents();
      V39._authEventsBound = true;
    }

    V39._initPromise = V39.client.auth.getSession()
      .finally(function () {
        V39._initPromise = null;
      });

    return V39._initPromise;
  };

  V39.sessionContext = async function () {
    if (!V39.ready || !V39.client) await V39.init();

    var sr = await V39.client.auth.getSession();
    if (sr.error) throw sr.error;

    var authUser = sr.data && sr.data.session && sr.data.session.user;
    if (!authUser) return null;

    var ua = await V39.client
      .schema('app')
      .from('user_accounts')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();

    if (ua.error) throw ua.error;
    if (!ua.data) {
      return {
        authUser: authUser,
        userAccount: null,
        person: null,
        churches: [],
        assignments: []
      };
    }

    var person = null;
    if (ua.data.person_id) {
      var pr = await V39.client
        .schema('app')
        .from('people')
        .select('*')
        .eq('id', ua.data.person_id)
        .maybeSingle();
      if (pr.error) throw pr.error;
      person = pr.data;
    }

    var ca = await V39.client
      .schema('app')
      .from('church_user_access')
      .select('*,churches(*)')
      .eq('user_account_id', ua.data.id);

    if (ca.error) throw ca.error;

    var accesses = ca.data || [];
    var assignments = [];

    for (var i = 0; i < accesses.length; i++) {
      var pa = await V39.client
        .schema('app')
        .from('user_profile_assignments')
        .select('*,access_profiles(*)')
        .eq('church_user_access_id', accesses[i].id);
      if (pa.error) throw pa.error;
      assignments = assignments.concat(pa.data || []);
    }

    return {
      authUser: authUser,
      userAccount: ua.data,
      person: person,
      churches: accesses,
      assignments: assignments
    };
  };

  V39.people = V39.people || {};
  V39.people.list = async function (churchId) {
    if (!V39.ready || !V39.client) await V39.init();
    if (!churchId) {
      var own = await V39.client.schema('app').from('people').select('*');
      if (own.error) throw own.error;
      return own.data || [];
    }
    var links = await V39.client
      .schema('app')
      .from('church_people')
      .select('person_id,people!church_people_person_id_fkey(*)')
      .eq('church_id', churchId)
      .is('ended_at', null);
    if (links.error) throw links.error;
    return (links.data || []).map(function (row) { return row.people; }).filter(Boolean);
  };
  V39.people.save = async function (row) {
    if (!V39.ready || !V39.client) await V39.init();
    var r = await V39.client.schema('app').from('people').upsert(row).select().single();
    if (r.error) throw r.error;
    return r.data;
  };

  V39.gcs = V39.gcs || {};
  V39.gcs.list = async function (churchId) {
    if (!V39.ready || !V39.client) await V39.init();
    var q = V39.client.schema('app').from('growth_groups').select('*');
    if (churchId) q = q.eq('church_id', churchId);
    var r = await q;
    if (r.error) throw r.error;
    return r.data || [];
  };
  V39.gcs.save = async function (row) {
    if (!V39.ready || !V39.client) await V39.init();
    var r = await V39.client.schema('app').from('growth_groups').upsert(row).select().single();
    if (r.error) throw r.error;
    return r.data;
  };

  V39.table = function (name) {
    if (!V39.ready || !V39.client) {
      throw new Error('G2_V39 ainda nao inicializado.');
    }
    return V39.client.schema('app').from(name);
  };
})();
