(function(){
  function esc(v){return String(v).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}
  var c=window.V39_CONFIG||{};
  var rows=[];
  function add(k,v){rows.push('<tr><td style="padding:8px;border-bottom:1px solid #ddd"><b>'+esc(k)+'</b></td><td style="padding:8px;border-bottom:1px solid #ddd">'+esc(v)+'</td></tr>');}
  add('URL desta pagina', location.href);
  add('Supabase global existe', !!window.supabase);
  add('supabase.createClient existe', !!(window.supabase&&typeof window.supabase.createClient==='function'));
  add('Project URL preenchida', !!c.supabaseUrl && !/^COLE_AQUI_/.test(c.supabaseUrl));
  add('Publishable Key preenchida', !!c.supabaseAnonKey && !/^COLE_AQUI_/.test(c.supabaseAnonKey));
  add('churchId', c.churchId||'(vazio)');
  add('Config status', JSON.stringify(window.V39_CONFIG_STATUS||{}));
  add('Scripts carregados', Array.from(document.scripts).map(function(x){return x.src||'[inline]';}).join(' | '));
  document.getElementById('resultado').innerHTML='<table style="border-collapse:collapse;width:100%;max-width:1100px">'+rows.join('')+'</table>';
})();
