// decisions.js – Ereignisse mit Wahlmöglichkeit. Erscheinen ab 4 Techs alle 8–14 Minuten.
//
// Effekt-Bausteine pro Option (alle optional):
//   grant:  { res, minutes }         → sofort `minutes` Minuten der aktuellen Produktion von `res` (min. 50)
//   cost:   { res, fraction }        → verliert Anteil des Vorrats
//   event:  { name, minutes, effects } → temporärer Effekt (ersetzt ein laufendes Ereignis)
//   xp:     n                        → Chronicle-XP (selten)
// `defaultIndex` wird gewählt, wenn die Zeit abläuft.

export const DECISIONS = [
  {
    id: 'investor', icon: '💼', title: 'Investor klopft an',
    text: 'Ein VC bietet eine Finanzspritze – will dafür aber bei der Roadmap mitreden.',
    defaultIndex: 1,
    options: [
      { label: 'Deal annehmen', desc: 'Sofort 30 min Revenue-Produktion. Hype −25% für 10 min.', grant: { res: 'energy', minutes: 30 }, event: { name: 'Investoren-Meddling', minutes: 10, effects: { influenceMult: 0.75 } } },
      { label: 'Ablehnen', desc: 'Bootstrapped bleibt cool. Nichts passiert.' }
    ]
  },
  {
    id: 'headhunter', icon: '🎯', title: 'Headhunter wirbt dein Team ab',
    text: 'Ein Konkurrent bietet deinen besten Leuten mehr Geld.',
    defaultIndex: 1,
    options: [
      { label: 'Gegenangebot', desc: 'Kostet 8% deines Code-Vorrats. Team bleibt.', cost: { res: 'scrap', fraction: 0.08 } },
      { label: 'Ziehen lassen', desc: 'Code −15% für 6 min.', event: { name: 'Abwanderung', minutes: 6, effects: { scrapMult: 0.85 } } }
    ]
  },
  {
    id: 'hackathon', icon: '🧠', title: 'Hackathon-Einladung',
    text: 'Ein Wochenende, Pizza, kein Schlaf. Das Team will hin.',
    defaultIndex: 1,
    options: [
      { label: 'Teilnehmen', desc: 'Ideas +50% und Users +20% für 8 min, Code −10%.', event: { name: 'Hackathon-Wochenende', minutes: 8, effects: { researchMult: 1.5, dataMult: 1.2, scrapMult: 0.9 } } },
      { label: 'Absagen', desc: 'Sprint geht normal weiter.' }
    ]
  },
  {
    id: 'shitstorm', icon: '🔥', title: 'Shitstorm auf X',
    text: 'Ein Tweet über eure Cookie-Banner geht viral. Nicht positiv.',
    defaultIndex: 1,
    options: [
      { label: 'Statement posten', desc: 'Kostet 20% Hype-Vorrat. Danach Ruhe.', cost: { res: 'influence', fraction: 0.2 } },
      { label: 'Aussitzen', desc: 'Hype −40% und Revenue −10% für 10 min.', event: { name: 'Shitstorm', minutes: 10, effects: { influenceMult: 0.6, energyMult: 0.9 } } }
    ]
  },
  {
    id: 'opensource', icon: '🌍', title: 'Open-Source-Anfrage',
    text: 'Die Community möchte, dass ihr euer Kern-Framework öffnet.',
    defaultIndex: 1,
    options: [
      { label: 'Repo öffnen', desc: 'Sofort 20 min Ideas-Produktion. Revenue −15% für 8 min.', grant: { res: 'research', minutes: 20 }, event: { name: 'Open-Source-Welle', minutes: 8, effects: { energyMult: 0.85 } } },
      { label: 'Closed bleiben', desc: 'Sofort 10 min Revenue-Produktion.', grant: { res: 'energy', minutes: 10 } }
    ]
  },
  {
    id: 'coffee', icon: '☕', title: 'Kaffeemaschinen-Upgrade',
    text: 'Der Siebträger für 4.000 Euro. Das Team schwört, er verdoppelt die Produktivität.',
    defaultIndex: 1,
    options: [
      { label: 'Kaufen', desc: 'Kostet 5% Revenue-Vorrat. Gesamtproduktion +15% für 10 min.', cost: { res: 'energy', fraction: 0.05 }, event: { name: 'Espresso-Flow', minutes: 10, effects: { allMult: 1.15 } } },
      { label: 'Filterkaffee reicht', desc: 'Sparsam. Nichts passiert.' }
    ]
  },
  {
    id: 'party', icon: '🎉', title: 'Praktikanten-Party',
    text: 'Die Praktikanten wollen im Büro feiern. Freitag, 18 Uhr.',
    defaultIndex: 0,
    options: [
      { label: 'Erlauben', desc: 'Klick-Kraft ×5 für 3 min (Motivation!). Code −20% für 3 min.', event: { name: 'Büro-Party', minutes: 3, effects: { clickPowerMult: 5, scrapMult: 0.8 } } },
      { label: 'Verbieten', desc: 'Sofort 5 min Code-Produktion (Überstunden).', grant: { res: 'scrap', minutes: 5 } }
    ]
  },
  {
    id: 'bugbounty', icon: '🐞', title: 'Security-Forscher meldet Lücke',
    text: 'Jemand hat eine kritische Lücke gefunden und will eine Bounty.',
    defaultIndex: 0,
    options: [
      { label: 'Bounty zahlen', desc: 'Kostet 10% Bugs-Vorrat. Event-Resistenz +10% für 15 min.', cost: { res: 'alloy', fraction: 0.1 }, event: { name: 'Gepatcht', minutes: 15, effects: { eventResist: 0.1, allMult: 1.03 } } },
      { label: 'Ignorieren', desc: 'Was soll schon passieren? Gesamt −12% für 6 min.', event: { name: 'Data Breach', minutes: 6, effects: { allMult: 0.88 } } }
    ]
  }
];
