const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// State persisted in localStorage
const state = {
  baseUrl: localStorage.getItem('baseUrl') || 'http://192.168.1.200:5000',
  user: JSON.parse(localStorage.getItem('user')||'null'),
  token: localStorage.getItem('token') || null,
  punct: localStorage.getItem('punct') || null,
};

// Routing (sidebar & internal links)
$$('button[data-nav]').forEach(btn => btn.addEventListener('click', () => show(btn.dataset.nav)));
function show(view){
  $$('.view').forEach(v => v.classList.remove('show'));
  const sec = $('#view-' + view) || $('#view-crono');
  if(sec) sec.classList.add('show');
  $$('.side-item').forEach(b => b.classList.remove('active'));
  const act = document.querySelector(`.side-item[data-nav="${view}"]`);
  if(act) act.classList.add('active');
  if(view==='login') {/* nothing to preload */}
  if(view==='crono') initCrono();
  if(view==='logout') doLogout();
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
  const headers = Object.assign({}, (opts && opts.headers) || {});
  if(state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(url, Object.assign({}, opts, { headers }));
  if(!res.ok) throw new Error('HTTP '+res.status);
  return res.json();
}

// Auth: login/register/logout
$('#login-btn')?.addEventListener('click', async () => {
  const email = $('#login-email').value.trim();
  const password = $('#login-pass').value;
  $('#login-status').textContent = 'Autentific...';
  try{
    const resp = await api('/api/auth/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email, password }) });
    state.token = resp.token; localStorage.setItem('token', state.token);
    state.user = resp.user; localStorage.setItem('user', JSON.stringify(state.user));
    $('#login-status').textContent = '';
    show('crono');
  }catch(e){ $('#login-status').textContent = 'Eroare autentificare: '+e.message; }
});

$('#link-to-register')?.addEventListener('click', (e)=>{ e.preventDefault();
  document.querySelector('#view-login .auth-card').style.display='none';
  $('#register-card').style.display='block';
});
$('#link-to-login')?.addEventListener('click', (e)=>{ e.preventDefault();
  document.querySelector('#view-login .auth-card').style.display='block';
  $('#register-card').style.display='none';
});
$('#link-forgot')?.addEventListener('click', (e)=>{ e.preventDefault(); alert('Contactați un administrator pentru resetarea parolei.'); });

$('#register-btn')?.addEventListener('click', async () => {
  const name = $('#reg-name').value.trim();
  const email = $('#reg-email').value.trim();
  const password = $('#reg-pass').value;
  $('#register-status').textContent = 'Înregistrez...';
  try{
    const resp = await api('/api/auth/register', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ name, email, password }) });
    state.token = resp.token; localStorage.setItem('token', state.token);
    state.user = resp.user; localStorage.setItem('user', JSON.stringify(state.user));
    $('#register-status').textContent = '';
    show('crono');
  }catch(e){ $('#register-status').textContent = 'Eroare creare cont: '+e.message; }
});

function doLogout(){
  state.token = null; localStorage.removeItem('token');
  state.user = null; localStorage.removeItem('user');
  // păstrăm punctul selectat separat
  show('login');
}

function whoText(){
  const u = state.user?.name || '-';
  const p = state.punct || '-';
  return `Utilizator: ${u} | Punct: ${p}`;
}

let timerHandle = null; let startTs = null; let isWorking = false;
async function initCrono(){
  // welcome name
  $('#welcome-name').textContent = state.user?.name || '–';
  // Update buttons based on last event and boot timer
  await initPuncte();
  await updateWorkState();
  await refreshSummary();
}

async function initPuncte(){
  try{
    const puncte = await api('/api/puncte_lucru');
    const el = $('#sel-punct-crono');
    el.innerHTML = puncte.map(p=>`<option>${p}</option>`).join('');
    if(state.punct){ el.value = state.punct; }
    el.addEventListener('change', ()=>{ state.punct = el.value; localStorage.setItem('punct', state.punct); });
    if(!state.punct && puncte.length){ state.punct = puncte[0]; localStorage.setItem('punct', state.punct); }
  }catch{}
}

async function updateWorkState(){
  clearInterval(timerHandle); timerHandle = null; startTs = null; isWorking = false;
  try{
    const data = await api('/api/pontaje');
    const u = state.user?.name;
    const mine = data.filter(e => (e.user||e.username) === u)
      .sort((a,b)=> new Date(a.time||a.timestamp) - new Date(b.time||b.timestamp));
    for(let i=mine.length-1;i>=0;i--){
      const ev = mine[i];
      if(ev.action==='sosire'){ startTs = new Date(ev.time||ev.timestamp); isWorking = true; break; }
      if(ev.action==='plecare'){ isWorking = false; break; }
    }
  }catch{}
  setButtons();
  renderTimer();
  if(isWorking){ timerHandle = setInterval(renderTimer, 1000); }
  await lastEvent();
}

function setButtons(){
  const bIn = $('#btn-sosire');
  const bOut = $('#btn-plecare');
  if(isWorking){
    bIn.setAttribute('disabled',''); bIn.classList.add('muted'); bIn.classList.remove('success');
    bOut.removeAttribute('disabled'); bOut.classList.remove('muted'); bOut.classList.add('danger');
  }else{
    bOut.setAttribute('disabled',''); bOut.classList.add('muted'); bOut.classList.remove('danger');
    bIn.removeAttribute('disabled'); bIn.classList.remove('muted'); bIn.classList.add('success');
  }
}

function renderTimer(){
  const el = $('#timer-big');
  if(!isWorking || !startTs){ el.textContent = '0 Ore 0 Min 0 Sec'; return; }
  const diff = Date.now() - startTs.getTime();
  const s = Math.floor(diff/1000)%60;
  const m = Math.floor(diff/60000)%60;
  const h = Math.floor(diff/3600000);
  el.textContent = `${h} Ore ${m} Min ${s} Sec`;
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
    const headers = { 'Content-Type':'application/json' };
    if(state.token) headers['Authorization'] = 'Bearer ' + state.token;
    await fetch(state.baseUrl.replace(/\/$/, '') + '/api/pontaj', {
      method:'POST', headers, body: JSON.stringify(body)
    });
    await updateWorkState();
    await refreshSummary();
  }catch(e){ alert('Nu pot trimite pontajul: '+e.message); }
}

$('#btn-sosire').addEventListener('click', ()=> postAction('sosire'));
$('#btn-plecare').addEventListener('click', ()=> postAction('plecare'));

// PWA basics
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}

// Initialize
show('crono');
