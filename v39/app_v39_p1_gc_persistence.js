/* 2Gather v39 P1.5 - Persistencia de encontros e chamada de GC
   Carregar depois de app_v39_p1_contracts_gc_culto_evento.js (P1.4.1+). */
(function () {
  'use strict';

  var V = window.G2_V39 = window.G2_V39 || {};
  var P = V.p1 = V.p1 || {};
  var M = P.handlers = P.handlers || {};
  var GC = V.p15gc = V.p15gc || {};

  function fail(code, message) {
    var error = new Error(message);
    error.code = code;
    throw error;
  }

  function val(value) {
    return value === undefined || value === null || value === '' ? null : value;
  }

  function churchId(input) {
    var id = (input && (input.churchId || input.church_id)) ||
      (V.runtime && V.runtime.state && V.runtime.state.churchId) ||
      (window.__gc && window.__gc.cfg && window.__gc.cfg().usuario && window.__gc.cfg().usuario.igrejaId);
    if (!id) fail('CHURCH_REQUIRED', 'Igreja ativa obrigatoria.');
    return id;
  }

  async function client() {
    if (!V.client && typeof V.init === 'function') await V.init();
    if (!V.client) fail('V39_CLIENT_UNAVAILABLE', 'Cliente Supabase indisponivel.');
    return V.client;
  }

  async function rpc(name, args) {
    var c = await client();
    var result = await c.schema('app').rpc(name, args || {});
    if (result.error) throw result.error;
    return result.data;
  }

  function statusMeeting(value, deleted) {
    if (deleted === true) return 'cancelled';
    var normalized = String(value || '').trim().toLowerCase();
    var map = {
      rascunho: 'draft',
      planejado: 'planned',
      planejada: 'planned',
      aberto: 'open',
      aberta: 'open',
      realizado: 'completed',
      realizada: 'completed',
      concluido: 'completed',
      concluida: 'completed',
      cancelado: 'cancelled',
      cancelada: 'cancelled'
    };
    return map[normalized] || normalized || 'planned';
  }

  function attendanceStatus(value) {
    var normalized = String(value || '').trim().toLowerCase();
    var map = {
      p: 'present', presente: 'present', present: 'present',
      a: 'absent', ausente: 'absent', absent: 'absent',
      j: 'justified', justificado: 'justified', justificada: 'justified', justified: 'justified',
      n: 'not_recorded', nao_registrado: 'not_recorded', not_recorded: 'not_recorded'
    };
    return map[normalized] || 'not_recorded';
  }

  function participantType(value, person) {
    var normalized = String(value || '').trim().toLowerCase();
    if (['member', 'visitor', 'guest'].indexOf(normalized) >= 0) return normalized;
    var personStatus = String(person && (person.status || person.tipo || person.type) || '').trim().toLowerCase();
    if (personStatus === 'em visita' || personStatus === 'visitante' || personStatus === 'visitor') return 'visitor';
    if (personStatus === 'convidado' || personStatus === 'guest') return 'guest';
    return 'member';
  }

  function meetingPayload(data) {
    data = data || {};
    var payload = {
      meeting_date: val(data.meeting_date || data.data || data.date),
      starts_at: val(data.starts_at || data.horario || data.inicio || data.start_time),
      ends_at: val(data.ends_at || data.fim || data.end_time),
      theme: val(data.theme || data.tema),
      host_person_id: val(data.host_person_id || data.anfitriaoPessoaId || data.anfitriao_person_id),
      location_text: val(data.location_text || data.local),
      announcements: val(data.announcements || data.recados || data.avisos),
      notes: val(data.notes || data.obs || data.observacoes),
      status: statusMeeting(data.status, data.deleted)
    };
    if (!payload.meeting_date) fail('GC_MEETING_DATE_REQUIRED', 'Data do encontro obrigatoria.');
    return payload;
  }

  function meetingLegacy(meeting) {
    meeting = meeting || {};
    return {
      id: meeting.id,
      meetingId: meeting.id,
      gcId: meeting.growth_group_id,
      growth_group_id: meeting.growth_group_id,
      data: meeting.meeting_date || '',
      horario: meeting.starts_at || '',
      fim: meeting.ends_at || '',
      tema: meeting.theme || '',
      anfitriaoPessoaId: meeting.host_person_id || '',
      local: meeting.location_text || '',
      recados: meeting.announcements || '',
      obs: meeting.notes || '',
      status: meeting.status || 'planned',
      deleted: meeting.status === 'cancelled',
      roll_call: meeting.roll_call || [],
      escala: meeting.assignments || meeting.assignment || [],
      _supabase: true,
      _source: 'growth_group_meetings'
    };
  }

  function normalizeItems(input) {
    input = input || {};
    var direct = input.items || input.itens;
    if (Array.isArray(direct)) {
      return direct.map(function (item) {
        return {
          person_id: item.person_id || item.personId || item.id,
          attendance_status: attendanceStatus(item.attendance_status || item.status || item.presenca),
          participant_type: participantType(item.participant_type || item.tipoParticipante, item.person || item.pessoa),
          was_added_during_roll_call: !!(item.was_added_during_roll_call || item.adicionadoDuranteChamada || item.adicionado),
          justification: val(item.justification || item.justificativa),
          notes: val(item.notes || item.obs || item.observacoes)
        };
      }).filter(function (item) { return !!item.person_id; });
    }

    var meeting = input.encontro || input.meeting || input;
    var attendance = meeting.presencas || {};
    var people = input.pessoas || input.people || [];
    var peopleById = {};
    people.forEach(function (person) { if (person && person.id) peopleById[person.id] = person; });
    var added = (meeting.lista && meeting.lista.add) || meeting.adicionados || [];
    var addedMap = {};
    added.forEach(function (id) { addedMap[id] = true; });

    return Object.keys(attendance).map(function (personId) {
      var person = peopleById[personId] || {};
      return {
        person_id: personId,
        attendance_status: attendanceStatus(attendance[personId]),
        participant_type: participantType(null, person),
        was_added_during_roll_call: !!addedMap[personId],
        justification: null,
        notes: null
      };
    });
  }

  M.salvarEncontroGC = async function (input) {
    input = input || {};
    var data = input.encontro || input.meeting || input;
    var groupId = data.growth_group_id || data.gcId || data.gc_id || input.growth_group_id || input.gcId;
    if (!groupId) fail('GC_REQUIRED', 'GC obrigatorio para salvar o encontro.');
    var meetingId = data.id || data.meeting_id || data.meetingId || null;
    var saved = await rpc('save_gc_meeting', {
      p_growth_group_id: groupId,
      p_meeting_id: meetingId,
      p_payload: meetingPayload(data),
      p_reason: val(data.reason || data.motivo || input.reason || input.motivo)
    });
    return { ok: true, data: saved, encontro: meetingLegacy(saved), meeting: saved };
  };

  M.listarEncontrosGC = async function (input) {
    input = input || {};
    var groupId = input.growth_group_id || input.gcId || input.gc_id || (input.gc && input.gc.id);
    if (!groupId) fail('GC_REQUIRED', 'GC obrigatorio para listar encontros.');
    var rows = await rpc('list_gc_meetings', {
      p_growth_group_id: groupId,
      p_date_from: val(input.date_from || input.dataDe || input.inicio),
      p_date_to: val(input.date_to || input.dataAte || input.fim)
    });
    rows = Array.isArray(rows) ? rows : [];
    return { ok: true, data: rows, encontros: rows.map(meetingLegacy) };
  };

  M.obterEncontroGC = async function (input) {
    input = input || {};
    var meetingId = input.meeting_id || input.meetingId || input.id || (input.encontro && input.encontro.id);
    if (!meetingId) fail('GC_MEETING_ID_REQUIRED', 'Encontro obrigatorio.');
    var meeting = await rpc('get_gc_meeting', { p_meeting_id: meetingId });
    return { ok: true, data: meeting, encontro: meetingLegacy(meeting), meeting: meeting };
  };

  M.salvarPresencaGC = async function (input) {
    input = input || {};
    var meetingId = input.meeting_id || input.meetingId || input.id ||
      (input.encontro && (input.encontro.id || input.encontro.meetingId));
    if (!meetingId) fail('GC_MEETING_ID_REQUIRED', 'Encontro obrigatorio para salvar a chamada.');
    var items = normalizeItems(input);
    var result = await rpc('save_gc_attendance', {
      p_meeting_id: meetingId,
      p_items: items,
      p_reason: val(input.reason || input.motivo)
    });
    var meeting = await rpc('get_gc_meeting', { p_meeting_id: meetingId });
    return {
      ok: true,
      data: result,
      processed: result && result.processed,
      meeting: meeting,
      encontro: meetingLegacy(meeting),
      roll_call: meeting && meeting.roll_call ? meeting.roll_call : []
    };
  };

  M.salvarChamadaGC = async function (input) {
    input = input || {};
    var meetingData = input.encontro || input.meeting || input;
    var savedMeeting;
    if (meetingData.id || meetingData.meeting_id || meetingData.meetingId) {
      savedMeeting = meetingData;
    } else {
      var saved = await M.salvarEncontroGC(input);
      savedMeeting = saved.meeting;
    }
    var attendanceInput = Object.assign({}, input, {
      meeting_id: savedMeeting.id || savedMeeting.meeting_id || savedMeeting.meetingId,
      encontro: Object.assign({}, meetingData, { id: savedMeeting.id || savedMeeting.meeting_id || savedMeeting.meetingId })
    });
    return M.salvarPresencaGC(attendanceInput);
  };

  /* Aliases de compatibilidade para a camada legada. */
  M.salvarEncontro = M.salvarEncontroGC;
  M.listarEncontros = M.listarEncontrosGC;
  M.obterEncontro = M.obterEncontroGC;
  M.salvarChamada = M.salvarChamadaGC;

  P.contracts = P.contracts || {};
  P.contracts.gcMeeting = meetingPayload;
  P.contracts.gcAttendance = normalizeItems;
  GC.version = 'P1.5-GC';
  GC.meetingLegacy = meetingLegacy;
  GC.normalizeItems = normalizeItems;
})();
