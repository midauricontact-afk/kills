const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

const RIOT_API_KEY    = process.env.RIOT_API_KEY    || "RGAPI-xxxxxxxx";
const SUMMONER_NAME   = process.env.SUMMONER_NAME   || "midauri";
const SUMMONER_TAG    = process.env.SUMMONER_TAG    || "EUW";     // tag sans le #
const REGION          = process.env.REGION          || "euw1";    // euw1, na1, eun1...
const MASS_REGION     = process.env.MASS_REGION     || "europe";  // europe, americas, asia
const MATCHES_TO_SCAN = parseInt(process.env.MATCHES_TO_SCAN) || 200;

const headers = { "X-Riot-Token": RIOT_API_KEY };

async function fetchJSON(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} → ${url}`);
  return res.json();
}

async function getPUUID() {
  const url = `https://${MASS_REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(SUMMONER_NAME)}/${encodeURIComponent(SUMMONER_TAG)}`;
  const data = await fetchJSON(url);
  return data.puuid;
}

async function getTotalKills(puuid) {
  let totalKills = 0;
  let start = 0;
  const batchSize = 100;
  let fetched = 0;

  while (fetched < MATCHES_TO_SCAN) {
    const count = Math.min(batchSize, MATCHES_TO_SCAN - fetched);
    const url = `https://${MASS_REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}`;
    const matchIds = await fetchJSON(url);

    if (matchIds.length === 0) break;

    for (let i = 0; i < matchIds.length; i += 10) {
      const batch = matchIds.slice(i, i + 10);
      const results = await Promise.all(
        batch.map(id =>
          fetchJSON(`https://${MASS_REGION}.api.riotgames.com/lol/match/v5/matches/${id}`)
            .catch(() => null)
        )
      );
      for (const match of results) {
        if (!match) continue;
        const participant = match.info.participants.find(p => p.puuid === puuid);
        if (participant) totalKills += participant.kills;
      }
    }

    fetched += matchIds.length;
    start += matchIds.length;
    if (matchIds.length < batchSize) break;
  }

  return totalKills;
}

// Cache 5 minutes pour ne pas spam l'API Riot
let cache = { kills: null, lastFetch: 0 };
const CACHE_DURATION = 5 * 60 * 1000;

// GET /kills → texte pour Wizebot
app.get("/kills", async (req, res) => {
  try {
    const now = Date.now();
    if (cache.kills !== null && now - cache.lastFetch < CACHE_DURATION) {
      const k = cache.kills;
      return res.send(`${SUMMONER_NAME} a découpé ${k} personne${k > 1 ? "s" : ""} sur ses ${MATCHES_TO_SCAN} dernières parties 🔪`);
    }
    const puuid = await getPUUID();
    const kills = await getTotalKills(puuid);
    cache = { kills, lastFetch: now };
    res.send(`${SUMMONER_NAME} a découpé ${kills} personne${kills > 1 ? "s" : ""} sur ses ${MATCHES_TO_SCAN} dernières parties 🔪`);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur lors de la récupération des kills 😵");
  }
});

// GET /kills/raw → JSON brut
app.get("/kills/raw", async (req, res) => {
  try {
    const puuid = await getPUUID();
    const kills = await getTotalKills(puuid);
    res.json({ summoner: SUMMONER_NAME, kills, matchesScanned: MATCHES_TO_SCAN });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🔪 Kills API lancée sur le port ${PORT}`));
