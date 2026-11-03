/* 2Gather v39 Build 69D17 - ponte unica de mutations para G2_V39 */
(function () {
  'use strict';
  var V = window.G2_V39 = window.G2_V39 || {};
  V.uiActions = V.uiActions || {};

  function fail(action, message, code) {
    var e = new Error(message || ('Operacao ' + action + ' ainda nao liberada no backend v39. Nenhuma alteracao foi realizada.'));
    e.code = code || 'V39_CONTRACT_UNAVAILABLE';
    e.action = action;
    return e;
  }
  function first(obj, names) {
    for (var i = 0; i < names.length; i++) if (obj[names[i]] !== undefined) return obj[names[i]];
  }
  function txt(v) { return v === undefined ? undefined : (v === null || v === '' ? null : String(v)); }
  function num(v) { if (v === undefined) return undefined; if (v === null || v === '') return null; var n = Number(v); if (!Number.isFinite(n)) throw new Error('Valor numerico invalido.'); return n; }

  V.uiActions.salvarGC = async function (input) {
    var d = (input && input.gc) || input || {};
    if (!d.id) throw fail('salvarGC', 'Criacao de GC ainda nao esta liberada neste corte. Nenhuma alteracao foi realizada.');
    if (!V.client && typeof V.init === 'function') await V.init();
    if (!V.client) throw fail('salvarGC', 'Cliente Supabase indisponivel. Nenhuma alteracao foi realizada.', 'V39_CLIENT_UNAVAILABLE');

    var p = {};
    function set(dst, names, conv) { var v = first(d, names); if (v !== undefined) p[dst] = (conv || txt)(v); }
    set('name', ['nome', 'name']);
    set('group_type', ['tipoGC', 'groupType', 'group_type']);
    set('audience', ['publico', 'audience', 'sexoGC']);
    set('age_range_min', ['idadeMin', 'ageMin', 'age_range_min'], num);
    set('age_range_max', ['idadeMax', 'ageMax', 'age_range_max'], num);
    set('phone', ['fone', 'phone']);
    set('photo_file_id', ['fotoFileId', 'photo_file_id']);
    set('postal_code', ['cep', 'postalCode', 'postal_code']);
    set('street', ['logradouro', 'endereco', 'street']);
    set('street_number', ['numero', 'streetNumber', 'street_number']);
    set('complement', ['complemento', 'complement']);
    set('district', ['bairro', 'district']);
    set('city', ['cidade', 'city']);
    set('state_code', ['uf', 'stateCode', 'state_code']);
    set('reference_point', ['referencia', 'referencePoint', 'reference_point']);
    set('latitude', ['latitude'], num);
    set('longitude', ['longitude'], num);
    set('started_at', ['inicio', 'startedAt', 'started_at']);
    set('notes', ['obs', 'notes']);

    if (!Object.keys(p).length) throw new Error('Nenhum campo editavel foi informado.');
    var r = await V.client.schema('app').from('growth_groups').update(p).eq('id', d.id).select('*').maybeSingle();
    if (r.error) throw r.error;
    if (!r.data) throw fail('salvarGC', 'GC nao localizado ou sem permissao para alteracao.', 'V39_NOT_FOUND_OR_FORBIDDEN');
    var g = r.data;
    return { ok: true, gc: Object.assign({}, d, {
      id: g.id, nome: g.name, status: g.status, tipoGC: g.group_type || '', publico: g.audience || '',
      idadeMin: g.age_range_min, idadeMax: g.age_range_max, fone: g.phone || '', fotoFileId: g.photo_file_id || '',
      cep: g.postal_code || '', logradouro: g.street || '', endereco: g.street || '', numero: g.street_number || '',
      complemento: g.complement || '', bairro: g.district || '', cidade: g.city || '', uf: g.state_code || '',
      referencia: g.reference_point || '', latitude: g.latitude, longitude: g.longitude,
      inicio: g.started_at || '', obs: g.notes || '', updatedAt: g.updated_at || new Date().toISOString()
    }) };
  };

  ['salvarPessoa','salvarEvento','salvarCulto','salvarEncontro','salvarLar'].forEach(function (a) {
    if (!V.uiActions[a]) V.uiActions[a] = function () { return Promise.reject(fail(a)); };
  });

  var bridge = {
    execute: function (action, payload, progress) {
      if (V.mutationGateway && V.mutationGateway.isMutation && V.mutationGateway.isMutation(action)) {
        return V.mutationGateway.execute(action, payload || {}, progress);
      }
      var fn = V.uiActions && V.uiActions[action];
      return typeof fn === 'function' ? Promise.resolve(fn(payload || {}, progress)) : Promise.reject(fail(action));
    }
  };
  window.MutationGateway = bridge;
  window.TwoGatherV39MutationGateway = bridge;
  window.twoGatherV39MutationGateway = bridge;
  window.TwoGatherV39UIActions = bridge;
  window.twoGatherV39UIActions = bridge;
})();
