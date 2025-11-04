const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// State persisted in localStorage
const state = {
  baseUrl: localStorage.getItem('baseUrl') || 'http://192.168.1.200:5000',
  user: JSON.parse(localStorage.getItem('user')||'null'),
  punct: localStorage.getItem('punct') || null,
};

// Routing
$$('button[data-nav]').forEach(btn => btn.addEventListener('click', () => show(btn.dataset.nav)));
function show(view){
  $$('.view').forEach(v => v.classList.remove('show'));
  $('#view-' + view).classList.add('show');
  $$('.topbar .link').forEach(b => b.classList.remove('active'));
  const act = document.querySelector(`.topbar .link[data-nav="${view}"]`);
  if(act) act.classList.add('active');
  if(view==='login') loadLogin();
  if(view==='main') initMain();
}

// Home: save base URL
$('#server-url').value = state.baseUrl;
$('#save-url').addEventListener('click', async () => {
  const url = $('#server-url').value.trim();
  state.baseUrl = url || state.baseUrl;
  localStorage.setItem('baseUrl', state.baseUrl);
  $('#url-status').textContent = 'Salvat: ' + state.baseUrl;
  // quick ping
  try{
    const r = await fetch(state.baseUrl + '/health');
    $('#url-status').textContent += r.ok ? ' (server OK)' : ' (server indisponibil)';
  }catch{ $('#url-status').textContent += ' (nu pot contacta serverul)'; }
});

// API helpers
async function api(path, opts){
  const url = state.baseUrl.replace(/\/$/, '') + path;
  const res = await fetch(url, opts);
  if(!res.ok) throw new Error('HTTP '+res.status);
  return res.json();
}

async function loadLogin(){
  $('#login-status').textContent = 'Încărc...' ;
  try{
    const [users, puncte] = await Promise.all([
      api('/api/users'),
      api('/api/puncte_lucru')
    ]);
    const su = $('#sel-user');
    su.innerHTML = users.map(u => `<option>${u.name||u.user||u}</option>`).join('');
    const sp = $('#sel-punct');
    sp.innerHTML = puncte.map(p => `<option>${p}</option>`).join('');
    $('#login-status').textContent = '';
  }catch(e){
    $('#login-status').textContent = 'Nu pot încărca listele ('+e.message+')';
  }
}

$('#btn-login').addEventListener('click', () => {
  const user = { name: $('#sel-user').value };
  const punct = $('#sel-punct').value;
  state.user = user; state.punct = punct;
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('punct', punct);
  show('main');
});

function whoText(){
  const u = state.user?.name || '-';
  const p = state.punct || '-';
  return `Utilizator: ${u} | Punct: ${p}`;
}

async function initMain(){
  $('#who').textContent = whoText();
  await refreshSummary();
  await lastEvent();
}

async function lastEvent(){
  try{
    const data = await api('/api/pontaje');
    const u = state.user?.name;
    const mine = data.filter(e => (e.user||e.username) === u).sort((a,b)=>new Date(b.time||b.timestamp)-new Date(a.time||a.timestamp));
    const last = mine[0];
    if(last){
      $('#last').textContent = `Ultimul eveniment: ${last.action} la ${new Date(last.time||last.timestamp).toLocaleString()}`;
    } else {
      $('#last').textContent = 'Nu există evenimente';
    }
  }catch{
    $('#last').textContent = 'Nu pot încărca ultimul eveniment';
  }
}

async function refreshSummary(){
  const out = $('#summary');
  out.textContent = 'Calculez...';
  try{
    const [pontaje, avansuri] = await Promise.all([
      api('/api/pontaje'),
      api('/api/avansuri')
    ]);
    const u = state.user?.name;
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const mine = pontaje.filter(e => (e.user||e.username)===u && new Date(e.time||e.timestamp).getMonth()===month && new Date(e.time||e.timestamp).getFullYear()===year)
      .sort((a,b)=>new Date(a.time||a.timestamp)-new Date(b.time||b.timestamp));

    let totalMs = 0; let open=null;
    for(const ev of mine){
      const ts = new Date(ev.time||ev.timestamp);
      if(ev.action==='sosire') open = ts;
      else if(ev.action==='plecare' && open){ totalMs += (ts - open); open=null; }
    }
    const hours = totalMs/3_600_000;
    // simplistic: 40 RON/h default (can be parameterized later)
    const tarif = 40;
    const venit = hours*tarif;
    const paid = avansuri.filter(a=> (a.user||a.username)===u).reduce((s,a)=> s + (+a.suma||+a.amount||0), 0);
    const rest = venit - paid;
    out.textContent = `Ore lucrate: ${hours.toFixed(2)} h\nVenit brut: ${venit.toFixed(2)} RON\nPlătit: ${paid.toFixed(2)} RON\nRest: ${rest.toFixed(2)} RON`;
  }catch(e){ out.textContent = 'Nu pot calcula ('+e.message+')'; }
}

$('#btn-refresh').addEventListener('click', refreshSummary);

async function getGeo(){
  if(!$('#chk-geo').checked) return null;
  return new Promise((resolve) => {
    if(!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos)=> resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }),
      ()=> resolve(null),
      { enableHighAccuracy:true, timeout: 5000 }
    );
  });
}

async function postAction(action){
  if(!state.user || !state.punct){ alert('Selectează utilizator și punct în Login.'); return; }
  const geo = await getGeo();
  const body = { user: state.user.name, punct: state.punct, action };
  if(geo) body.geo = geo;
  try{
    await fetch(state.baseUrl.replace(/\/$/, '') + '/api/pontaj', {
      method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body)
    });
    await lastEvent();
    await refreshSummary();
  }catch(e){ alert('Nu pot trimite pontajul: '+e.message); }
}

$('#btn-sosire').addEventListener('click', ()=> postAction('sosire'));
$('#btn-plecare').addEventListener('click', ()=> postAction('plecare'));

// PWA basics
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
