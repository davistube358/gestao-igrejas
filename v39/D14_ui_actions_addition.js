/* Build 69D.14 - adicionar ao app_v39_ui_actions.js, depois de V.uiActions existir */
V.uiActions.salvarGC = async function (input) {
  var d = (input && input.gc) || input || {};
  if (!d.id) throw new Error('Criacao de GC permanece bloqueada neste corte v39.');
  if (!V.ready || !V.client) {
    var ir = await V.init();
    if (ir && ir.error) throw ir.error;
  }

  var patch = {};
  function text(src, dst) {
    if (d[src] !== undefined) patch[dst] = d[src] === '' ? null : String(d[src]);
  }
  function integer(src, dst) {
    if (d[src] !== undefined) patch[dst] = d[src] === '' || d[src] === null ? null : Number(d[src]);
  }
  function numeric(src, dst) {
    if (d[src] !== undefined) patch[dst] = d[src] === '' || d[src] === null ? null : Number(d[src]);
  }

  text('nome', 'name');
  text('tipoGC', 'group_type');
  text('publico', 'audience');
  integer('idadeMin', 'age_range_min');
  integer('idadeMax', 'age_range_max');
  text('fone', 'phone');
  if (d.fotoFileId !== undefined) patch.photo_file_id = d.fotoFileId || null;
  text('cep', 'postal_code');
  text('logradouro', 'street');
  text('numero', 'street_number');
  text('complemento', 'complement');
  text('bairro', 'district');
  text('cidade', 'city');
  text('uf', 'state_code');
  text('referencia', 'reference_point');
  numeric('latitude', 'latitude');
  numeric('longitude', 'longitude');
  text('inicio', 'started_at');
  text('obs', 'notes');

  if (!Object.keys(patch).length) throw new Error('Nenhum campo editavel do GC foi alterado.');

  var r = await V.client
    .schema('app')
    .from('growth_groups')
    .update(patch)
    .eq('id', d.id)
    .select('*')
    .maybeSingle();

  if (r.error) throw r.error;
  if (!r.data) throw new Error('GC nao localizado ou sem permissao para alteracao.');

  var g = r.data;
  return { gc: {
    id: g.id,
    nome: g.name,
    status: g.status,
    tipoGC: g.group_type || '',
    publico: g.audience || '',
    idadeMin: g.age_range_min,
    idadeMax: g.age_range_max,
    fone: g.phone || '',
    fotoFileId: g.photo_file_id || '',
    cep: g.postal_code || '',
    logradouro: g.street || '',
    numero: g.street_number || '',
    complemento: g.complement || '',
    bairro: g.district || '',
    cidade: g.city || '',
    uf: g.state_code || '',
    referencia: g.reference_point || '',
    latitude: g.latitude,
    longitude: g.longitude,
    inicio: g.started_at || '',
    obs: g.notes || '',
    liderId: d.liderId || '',
    liderNome: d.liderNome || '',
    supervisorId: d.supervisorId || '',
    supervisorNome: d.supervisorNome || '',
    coLider: d.coLider || '',
    anfitriao: d.anfitriao || '',
    diaSemana: d.diaSemana || '',
    horario: d.horario || '',
    frequencia: d.frequencia || '',
    discipulos: d.discipulos || '',
    deleted: false,
    updatedAt: g.updated_at || new Date().toISOString()
  }};
};
