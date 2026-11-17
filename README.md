# Mijn Energie AI – webapp v0.3.1

Privé energie-dashboard in de browser, gebaseerd op de LOWI3 P1-meter van 2-Wire. De woningillustratie is schematisch: zonnepanelen, jacuzzi en batterij zijn **niet aanwezig** en hun waarden worden niet verzonnen.

## Architectuur
- `server.js`: Node.js-host met permanente MQTT-over-TLS-abonnement op `4c75252ccdd3/PUB/CH0`; live updates via WebSocket.
- `public/`: responsief donker dashboard met huisillustratie, live meterwaarden en praktische adviezen.
- Er is nog **geen echte AI-modelkoppeling** of apparaatsturing: de adviezen zijn regelgebaseerd.
- `data/history.jsonl`: lokale historie. Op hosting zonder persistente schijf gaat historie bij herstart verloren.

## Lokaal starten
1. Installeer Node.js 20+ op de computer die de server draait (niet nodig bij je pa).
2. Kopieer `.env.example` naar `.env`, vul `APP_PASSWORD` (minimaal 12 tekens) en `MQTT_TOKEN` in.
3. Voer `npm install`, vervolgens `npm start` uit.
4. Ga naar `http://localhost:3000`.

## Online via GitHub + Render
1. Maak de repository **Private** via GitHub > Settings > General > Danger Zone > Change repository visibility. Ze staat momenteel Public.
2. Open Render en maak een nieuwe **Web Service** vanuit deze GitHub-repository. Neem `render.yaml` als richtlijn: Node, build `npm install`, start `npm start`.
3. Voeg bij de hostingdienst de **geheime** omgevingsvariabelen `APP_PASSWORD` en `MQTT_TOKEN` toe; plaats deze **nooit** in GitHub of chat.
4. Stel `NODE_ENV=production`, `LOWI_MAC=4c75252ccdd3`, `MQTT_HOST=mqtt.flespi.io`, `MQTT_PORT=8883` in. Render beheert HTTPS.
5. Open de hosting-URL en log in. Test live metingen met een identificeerbare belasting, bv. waterkoker.

**Belangrijk:** de server moet voortdurend MQTT-berichten ontvangen. GitHub Pages of pure serverless hosting is daarvoor niet genoeg. Geen daadwerkelijke hosting of live LOWI3-test uitgevoerd.

## Veiligheid
- Upload nooit `.env`, tokens, persoonlijke meterhistoriek of wachtwoorden. `.gitignore` sluit die uit.
- Het wachtwoord beschermt het dashboard; voor productiegebruik met meerdere gebruikers is verdere hardening nodig (o.a. rate limiting, persistente sessies en 2FA).
- Alleen PI/PE/CG en totalen zijn gemeten; huisonderdelen zijn illustratief. Live vervalt na 30 seconden.
