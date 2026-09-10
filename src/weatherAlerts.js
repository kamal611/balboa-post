@'
const ALERTS_URL = "https://api.weather.gov/alerts/active?area=CA";

function userAgent() {
  return (
    process.env.WEATHER_USER_AGENT ||
    "(auto-article-bot, set WEATHER_USER_AGENT in .env to your contact info)"
  );
}

export async function fetchSanDiegoWeatherAlerts() {
  const res = await fetch(ALERTS_URL, {
    headers: {
      "User-Agent": userAgent(),
      Accept: "application/geo+json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching NWS alerts`);
  }

  const data = await res.json();
  const features = data.features || [];

  const sanDiegoAlerts = features.filter((f) =>
    (f.properties?.areaDesc || "").toLowerCase().includes("san diego")
  );

  return sanDiegoAlerts.map((f) => {
    const p = f.properties;
    const guid = p.id || f.id;
    return {
      title: `${p.event}: ${p.areaDesc}`,
      link: p.id || f.id,
      guid,
      contentSnippet: [p.headline, p.description, p.instruction]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 6000),
    };
  });
}
'@ | Set-Content -Path .\src\weatherAlerts.js -Encoding UTF8