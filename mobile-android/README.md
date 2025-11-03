# PontajSamaritanus (Android)

Un client Android simplu pentru pontaj, care se conectează la serverul existent (Express) și permite:
- Autentificare cu email sau nume
- Pontare sosire/plecare cu selectarea punctului de lucru
- Rezumat lunar: ore lucrate, venit brut, sume plătite (avansuri) și rest de plată

## Setări necesare
- În ecranul de login, setează URL-ul serverului (de ex. `http://192.168.1.200:5000`).
- Aplicația permite trafic HTTP (cleartext) pentru rețea locală.

## Build
Deschide folderul `mobile-android` în Android Studio și folosește Build > Build APK(s).

## Backend așteptat
- GET `/api/users` -> listă utilizatori (cu `email`, `name`, `hourlyRate`)
- GET `/api/pontaje` -> lista evenimentelor (cu `user`/`email`, `punct`, `action`, `timestamp` ISO)
- POST `/api/pontaj` -> înregistrează eveniment (body: `{ user/email, punct, action }`)
- GET `/api/avansuri?email=&name=&month=YYYY-MM` -> lista avansurilor pentru luna curentă
- GET `/assets/puncte_lucru.json` -> lista punctelor de lucru