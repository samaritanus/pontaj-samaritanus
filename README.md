# Pontaj Samaritanus – aplicație web

Acum proiectul este 100% web (fără aplicație Android). Avem:

- Backend Node/Express (stocare JSON) – rutele: `/api/users`, `/api/pontaj`, `/api/pontaje`, `/api/avans`, `/api/avansuri`, `/api/puncte_lucru`, `/health`.
- Interfață web:
  - `web/` – PWA modernă (cronometru, login, rezumat). Publicată automat pe GitHub Pages.
  - `public/employee.html` – interfață simplificată, mobil-friendly, pentru scenarii minimale.

## Cum rulezi local backend-ul

1. Instalează dependențele (o singură dată):
   - Node.js 18+ recomandat
2. Pornește serverul:
   - `npm start` (ascultă pe `http://localhost:5000`)

Serverul expune și directoarele statice `public/` (la rădăcină) și `/assets`.

## Interfața web (PWA)

- Codul sursă: în folderul `web/` (HTML/CSS/JS vanilla + service worker + manifest).
- Deploy automat: workflow-ul GitHub Pages publică conținutul din `web/` la fiecare push.
- Preview rapid local: deschide `web/index.html` în browser sau servește-l cu un server static.

Funcționalități principale:
- „Cronometru”: marchezi Sosire/Plecare și vezi timpul curent lucrat.
- „Autentificare”: selectare utilizator și punct (varianta simplă) sau login email/parolă (dacă se activează pe backend).
- „Rezumat lunar”: ore, venit estimat, sume plătite (avansuri) și rest.

## Variante simplificate în `public/`

- `public/employee.html` – UI rapid pentru mobil (select utilizator și punct, butoane Sosire/Plecare, rezumat).
- `public/index.html` – exemplu minim de integrare.

## Note

- Toate referințele la aplicația Android și la APK au fost eliminate; proiectul rămâne web-first.
- Iconuri și date: în `assets/` (de ex. `assets/users.json`, `assets/puncte_lucru.json`).
