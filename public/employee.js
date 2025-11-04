(() => {
  const $ = (id) => document.getElementById(id);
  const monthStr = (d) => d.toISOString().slice(0,7);

  let users = [];
  let currentUser = null; // { name, email, hourlyRate, tariff }

  function normName(s){
    return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
  }

  async function loadUsers(){
    try{
      const res = await fetch('/api/users', { cache:'no-store' });
      users = res.ok ? await res.json() : [];
      const sel = $('sel-user');
      sel.innerHTML = users.map(u => `<option value="${u.email||u.name}">${u.name || u.email}</option>`).join('');
      if (users.length) {
        sel.value = users[0].email || users[0].name;
        currentUser = users[0];
      }
    }catch(e){ console.warn('users load', e); }
  }

  async function loadPuncte(){
    const sel = $('sel-punct');
    try{
      const res = await fetch('/assets/puncte_lucru.json', { cache:'no-store' });
      const list = res.ok ? await res.json() : [];
      const names = Array.from(new Set([
        'DISPECERAT SAMARITANUS', 'CABINET AEROPORT', 'WEEKEND', 'PATINOAR',
        ...((Array.isArray(list)?list:[]).map(x=> String(x.nume||'').trim()).filter(Boolean))
      ])).map(n=> n.toUpperCase());
      sel.innerHTML = names.map(n=> `<option value="${n}">${n}</option>`).join('');
      const def = names.find(n=> n.includes('DISPECERAT')) || names[0];
      if (def) sel.value = def;
    }catch(e){ sel.innerHTML = '<option>DISPECERAT SAMARITANUS</option>'; }
  }

  async function postAction(action){
    const status = $('post-status');
    status.textContent = 'Trimit...';
    const punct = $('sel-punct').value;
    const body = currentUser?.email ? { email: currentUser.email, punct, action } : { user: currentUser?.name, punct, action };
    try{
      // opțional geolocație
      let coords = null;
      if (navigator.geolocation){
        try{
          coords = await new Promise((resolve) => navigator.geolocation.getCurrentPosition(p=> resolve({ lat:p.coords.latitude, lon:p.coords.longitude }), ()=> resolve(null), { enableHighAccuracy:false, timeout:1500 }));
        }catch(_){ /* ignore */ }
      }
      if (coords){ body.latitude = coords.lat; body.longitude = coords.lon; }
      const res = await fetch('/api/pontaj', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const payload = await res.json();
      if (!res.ok){ status.textContent = payload?.error || 'Eroare'; }
      else { status.textContent = 'Salvat. Actualizez rezumatul...'; await refreshSummary(); }
    }catch(e){ status.textContent = 'Eroare rețea: ' + e.message; }
  }

  function pairSessions(events){
    // events: sorted asc
    const stack = [];
    const sessions = [];
    for (const ev of events){
      if (ev.action === 'sosire') stack.push(ev);
      else if (ev.action === 'plecare'){
        const start = stack.shift();
        if (start){ sessions.push({ start: new Date(start.timestamp), end: new Date(ev.timestamp) }); }
      }
    }
    return sessions;
  }

  function sumHours(sessions){
    let totalMs = 0;
    for (const s of sessions){
      const ms = Math.max(0, s.end - s.start);
      totalMs += ms;
    }
    return totalMs / 3600000; // h
  }

  async function refreshSummary(){
    const sel = $('sel-user');
    const ident = sel.value;
    currentUser = users.find(u => u.email === ident || normName(u.name) === normName(ident)) || users[0] || null;
    const ym = monthStr(new Date());
    $('sm-month').textContent = ym;
    try{
      const res = await fetch('/api/pontaje', { cache:'no-store' });
      const data = res.ok ? await res.json() : [];
      const my = (data||[]).filter(ev => {
        const isMe = currentUser?.email ? (ev.email && ev.email.toLowerCase() === currentUser.email.toLowerCase()) : (normName(ev.user) === normName(currentUser?.name));
        return isMe && String(ev.timestamp||'').startsWith(ym);
      }).sort((a,b)=> new Date(a.timestamp) - new Date(b.timestamp));
      const sessions = pairSessions(my);
      const hours = sumHours(sessions);
      const rate = Number(currentUser?.hourlyRate || currentUser?.tariff || 0);
      const income = hours * rate;
      $('sm-hours').textContent = hours.toFixed(2) + ' h';
      $('sm-income').textContent = income.toFixed(2) + ' RON';
      // avansuri
      let paid = 0;
      try{
        const q = new URLSearchParams({ month: ym });
        if (currentUser?.email) q.set('email', currentUser.email);
        else if (currentUser?.name) q.set('name', currentUser.name);
        const r2 = await fetch('/api/avansuri?' + q.toString(), { cache:'no-store' });
        const list = r2.ok ? await r2.json() : [];
        paid = (list||[]).reduce((s,a)=> s + Number(a.suma||0), 0);
      }catch(_){ }
      $('sm-paid').textContent = paid.toFixed(2) + ' RON';
      $('sm-due').textContent = (income - paid).toFixed(2) + ' RON';
    }catch(e){
      console.warn('summary', e);
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await loadUsers();
    await loadPuncte();
    await refreshSummary();
    $('sel-user').addEventListener('change', refreshSummary);
    $('btn-sosire').addEventListener('click', ()=> postAction('sosire'));
    $('btn-plecare').addEventListener('click', ()=> postAction('plecare'));
  });
})();
