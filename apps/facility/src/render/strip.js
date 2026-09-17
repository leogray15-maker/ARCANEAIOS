/**
 * The status strip along the bottom of the floor: the time here, the
 * three sessions with the open one lit, the weather where the operator
 * is, sunrise and sunset, gold, and the OS's own numbers. Everything
 * refreshes on its own clock; nothing here needs a key.
 *
 * Weather and daylight come from Open-Meteo, gold from a public price feed;
 * both fail quietly to "—". Location is the browser's if it is given,
 * else Essex.
 */
const ESSEX = { lat: 51.7356, lon: 0.4685, name: 'Essex' };
const WMO = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'fog', 51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'snow', 73: 'snow', 75: 'snow', 80: 'showers', 81: 'showers', 82: 'heavy showers', 95: 'thunder', 96: 'thunder', 99: 'thunder' };
const SESSIONS = [
  { id: 'LDN', tz: 'Europe/London', open: 8, close: 16.5 },
  { id: 'NY', tz: 'America/New_York', open: 9.5, close: 16 },
  { id: 'TKO', tz: 'Asia/Tokyo', open: 9, close: 15 },
];

export class Strip {
  constructor(el, ctx) {
    this.el = el; this.ctx = ctx;
    this.weather = null; this.gold = null; this.place = ESSEX.name;
    this.locate().then(() => this.refreshWeather());
    this.refreshGold();
    setInterval(() => this.refreshWeather(), 10 * 60_000);
    setInterval(() => this.refreshGold(), 60_000);
    setInterval(() => this.render(), 1000);
    this.render();
  }

  locate() {
    this.loc = ESSEX;
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve();
      navigator.geolocation.getCurrentPosition((p) => { this.loc = { lat: p.coords.latitude, lon: p.coords.longitude }; this.place = 'here'; resolve(); }, () => resolve(), { timeout: 4000, maximumAge: 3600_000 });
    });
  }

  async refreshWeather() {
    try {
      const { lat, lon } = this.loc;
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=sunrise,sunset&timezone=auto&forecast_days=1`);
      if (!r.ok) return;
      const j = await r.json();
      this.weather = { t: Math.round(j.current.temperature_2m), code: j.current.weather_code, wind: Math.round(j.current.wind_speed_10m), sunrise: j.daily.sunrise[0].slice(11, 16), sunset: j.daily.sunset[0].slice(11, 16) };
    } catch {}
  }

  async refreshGold() {
    const tries = [
      async () => { const r = await fetch('https://api.gold-api.com/price/XAU'); const j = await r.json(); return { price: j.price, at: j.updatedAt }; },
      async () => { const r = await fetch('https://data-asg.goldprice.org/dbXRates/USD'); const j = await r.json(); const i = j.items[0]; return { price: i.xauPrice, chg: i.pcXau }; },
    ];
    for (const t of tries) { try { const g = await t(); if (g?.price) { this.gold = g; return; } } catch {} }
  }

  render() {
    const { store, sim } = this.ctx;
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/London' });
    const date = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
    const sessions = SESSIONS.map((s) => {
      const parts = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short', timeZone: s.tz }).formatToParts(now);
      const get = (t) => parts.find((p) => p.type === t)?.value;
      const h = Number(get('hour')) % 24 + Number(get('minute')) / 60, wd = get('weekday');
      const open = !['Sat', 'Sun'].includes(wd) && h >= s.open && h < s.close;
      return `<span class="sess ${open ? 'open' : ''}">${s.id} ${String(Math.floor(h)).padStart(2, '0')}:${get('minute')}</span>`;
    }).join('');
    const w = this.weather;
    const weather = w ? `${w.t}°C ${WMO[w.code] || ''} · wind ${w.wind} km/h · ☼ ${w.sunrise} ☾ ${w.sunset}` : 'weather —';
    const gold = this.gold ? `XAUUSD <b>${Number(this.gold.price).toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>${this.gold.chg !== undefined ? ` <span class="${this.gold.chg >= 0 ? 'vital' : 'breach'}">${this.gold.chg >= 0 ? '+' : ''}${Number(this.gold.chg).toFixed(2)}%</span>` : ''}` : 'XAUUSD —';
    const posted = store.draftsBy('posted').length, waiting = store.draftsBy('draft').length;
    const today = new Date().toISOString().slice(0, 10); const done = Object.values(store.protocolDay(today)).filter(Boolean).length;
    const tradesToday = store.trades().filter((t) => (t.opened || '').startsWith(today)).length;
    this.el.innerHTML = `
      <span class="w"><b>${time}</b> <span class="ash">${date}</span></span>
      <span class="w">${sessions}</span>
      <span class="w">${gold}</span>
      <span class="w ash">${this.place} · ${weather}</span>
      <span class="w ash"><b>${store.totalOpen()}</b> orders · <b>${waiting}</b> drafts waiting · <b>${posted}</b> posted · <b>${tradesToday}</b> trade${tradesToday === 1 ? '' : 's'} today · protocol <b>${done}/5</b> · <b>${sim.agents.filter((a) => a.state === 'walk').length}</b> walking</span>`;
  }
}
