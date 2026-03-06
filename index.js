const express = require("express");
const app = express();
const PORT = process.env.PORT || 10000;

const RIOT_API_KEY  = process.env.RIOT_API_KEY  || "RGAPI-xxxxxxxx";
const SUMMONER_NAME = process.env.SUMMONER_NAME || "midauri";
const SUMMONER_TAG  = process.env.SUMMONER_TAG  || "EUW";
const REGION        = process.env.REGION        || "euw1";
const MASS_REGION   = process.env.MASS_REGION   || "europe";

const headers = { "X-Riot-Token": RIOT_API_KEY };

async function fetchJSON(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} → ${url}`);
  return res.json();
}

// Récupère le PUUID via Riot ID
async function getPUUID() {
  const url = `https://${MASS_REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(SUMMONER_NAME)}/${encodeURIComponent(SUMMONER_TAG)}`;
  const data = await fetchJSON(url);
  return data.puuid;
}

// Récupère le summonerId via PUUID
async function getSummonerId(puuid) {
  const url = `https://${REGION}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const data = await fetchJSON(url);
  return data.id;
}

// Récupère les stats totales ranked (kills cumulés toutes saisons)
async function getRankedKills(summonerId) {
  const url = `https://${REGION}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`;
  const data = await fetchJSON(url);
  return data; // retourne les infos ranked
}

// Récupère les kills via les dernières parties (limité mais rapide)
async function getKillsFromMatches(puuid, count = 20) {
  const startOfYear = Math.floor(new Date('2026-01-01').getTime() / 1000);
  const url = `https://${MASS_REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?count=${count}&startTime=${startOfYear}`;
  const matchIds = await fetchJSON(url);

  let totalKills = 0;
  for (const id of matchIds) {
    try {
      const match = await fetchJSON(`https://${MASS_REGION}.api.riotgames.com/lol/match/v5/matches/${id}`);
      const participant = match.info.participants.find(p => p.puuid === puuid);
      if (participant) totalKills += participant.kills;
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      continue;
    }
  }
  return { totalKills, matchesScanned: matchIds.length };
}

// Cache 5 minutes
let cache = { kills: null, lastFetch: 0 };
const CACHE_DURATION = 5 * 60 * 1000;

app.get("/kills", async (req, res) => {
  try {
    const now = Date.now();
    if (cache.kills !== null && now - cache.lastFetch < CACHE_DURATION) {
      const k = cache.kills;
      return res.send(`midauri a découpé ${k} personne${k > 1 ? "s" : ""} depuis le début de l'année 2026 🔪`);
    }

    const puuid = await getPUUID();
    const { totalKills, matchesScanned } = await getKillsFromMatches(puuid, 100);
    cache = { kills: totalKills, lastFetch: now };

    res.send(`midauri a découpé ${totalKills} personne${totalKills > 1 ? "s" : ""} depuis le début de l'année 2026 🔪`);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur lors de la récupération des kills 😵");
  }
});

app.listen(PORT, () => console.log(`🔪 Kills API lancée sur le port ${PORT}`));
