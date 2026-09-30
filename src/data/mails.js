// mails.js – Story-Postfach: kurze Mails von festen Figuren bei wichtigen Momenten. Logik in engine/mail.js.
// trigger(s): reine Funktion des Spielstands; jede Mail kommt genau einmal. choices (optional): Antworten mit kleinen
// Effekten – grant { res, minutes } (Minuten der aktuellen Produktion), boost { name, minutes, effects } (reiht sich
// in die Boost-Warteschlange ein), lab (laufende Laborprojekte h schneller), coffee (Bohnen) – plus reply (Flavor).
import { TECHS } from './techs.js';

export const MAIL_SENDERS = {
  lena: { name: 'Lena Brandt', role: 'CTO', avatar: '👩‍💻' },
  marco: { name: 'Marco Keller', role: 'Business Angel', avatar: '🦄' },
  kim: { name: 'Kim Nguyen', role: 'Head of People', avatar: '🌱' },
  board: { name: 'Der Aufsichtsrat', role: 'Gremium', avatar: '🏛️' }
};

const teamSize = (s) => Object.values(s.buildings || {}).reduce((a, n) => a + (n || 0), 0);
const releasedEver = (s, id) => (s.stats?.releasedEver || []).includes(id) || (s.projects || []).includes(id);
const chapter = (s) => s.roadmap?.chapter || 0;
const mandateLevels = (s) => Object.values(s.mandates?.levels || {});

export const MAILS = [
  { id: 'welcome', from: 'lena', subject: 'Willkommen in der Garage',
    trigger: (s) => (s.stats?.lifetime || 0) >= 20,
    body: 'Drei Laptops, ein Router, eine Kaffeemaschine mit Charakter – das ist ab heute unsere Firma. Ich kümmere mich um die Technik, du um alles andere. Fang einfach an zu tippen, Code schreibt sich leider noch nicht von selbst.' },
  { id: 'first_tech', from: 'lena', subject: 'Unsere erste Technologie',
    trigger: (s) => (s.techs || []).length >= 1,
    body: 'Glückwunsch, wir können jetzt offiziell etwas, das andere auch können. So fängt jede Innovation an. Ideas bringen uns weiter – je mehr, desto schneller lernen wir.' },
  { id: 'team_10', from: 'kim', subject: 'Zehn Leute im Keller',
    trigger: (s) => teamSize(s) >= 10,
    body: 'Wir sind jetzt zehn. Das heißt: zehn Geburtstage, zehn Kaffeevorlieben und genau eine Toilette. Ich kümmere mich ums Wohlbefinden. Du kümmerst dich bitte darum, dass wir bald mehr Platz haben.' },
  { id: 'first_release', from: 'marco', subject: 'Euer erstes Produkt!!!',
    trigger: (s) => (s.stats?.releasedEver || []).length >= 1 || (s.projects || []).length >= 1,
    body: 'WOW. Ich hab es meiner Mutter gezeigt, sie hat es sofort installiert. 🚀 Wenn ihr mich fragt: Product-Market-Fit. Macht weiter so – ich glaube an euch (und an meine Rendite).' },
  { id: 'daily_loop', from: 'kim', subject: 'Unser Daily Standup',
    trigger: (s) => (s.daily?.claimsTotal || 0) >= 1,
    body: 'Ab jetzt treffen wir uns jeden Tag kurz. Keine Sorge: fünf Minuten, und es gibt Kaffee. Wer regelmäßig kommt, baut eine Streak auf – das Team merkt, wenn du da bist.' },
  { id: 'first_refactor', from: 'lena', subject: 'Wir haben alles neu geschrieben',
    trigger: (s) => (s.stats?.prestigeCount || 0) >= 1,
    body: 'Der Code ist weg, die Erfahrung bleibt. So fühlt sich ein Hard Refactor an: schmerzhaft, befreiend, und am Ende sind wir schneller als vorher. Im Keller steht übrigens jetzt ein Labor. Frag nicht, woher die Geräte kommen.' },
  { id: 'first_lab', from: 'lena', subject: 'Erste Ergebnisse aus dem Labor',
    trigger: (s) => (s.lab?.done || []).length >= 1 || Object.values(s.lab?.levels || {}).some(l => l >= 1),
    body: 'Das erste Laborprojekt ist durch. Forschung dauert – läuft aber auch, wenn wir schlafen. Tipp aus Erfahrung: Starte ein Projekt, bevor du gehst. Morgens ist es fertig, wie Brötchen.' },
  { id: 'round_seed', from: 'marco', subject: 'Seed-Runde durch – und jetzt?',
    trigger: (s) => chapter(s) >= 1,
    body: 'Das Geld ist da! 💸 Jetzt die Frage aller Fragen: Wofür geben wir es aus? Ich hätte Ideen. Viele Ideen. Du entscheidest.',
    choices: [
      { label: 'Mehr Entwickler einstellen', grant: { res: 'scrap', minutes: 30 }, reply: 'Marco: Klassiker. Code ist King.' },
      { label: 'Marketing-Kampagne', grant: { res: 'influence', minutes: 30 }, reply: 'Marco: Hype ist die Währung der Zukunft, sag ich immer.' }
    ] },
  { id: 'first_sprint', from: 'lena', subject: 'Sprint geschafft',
    trigger: (s) => (s.challengesDone || []).length >= 1,
    body: 'Ein Run mit Handicap, und wir haben trotzdem geliefert. Das nennt man Resilienz. Oder Sturheit. Der Bonus bleibt jedenfalls für immer.' },
  { id: 'streak_3', from: 'kim', subject: 'Drei Tage in Folge',
    trigger: (s) => (s.daily?.bestStreak || 0) >= 3,
    body: 'Drei Tage hintereinander beim Standup. Jemand hat „Chef ist da“ aufs Whiteboard geschrieben – mit Permanentmarker. Pausen sind übrigens auch okay. Wir laufen nicht weg.' },
  { id: 'round_series_a', from: 'marco', subject: 'Series A! Richtiges Wagniskapital',
    trigger: (s) => chapter(s) >= 2,
    body: 'Die Großen spielen jetzt mit, und sie wollen Wachstum sehen. Ich habe versprochen, dass wir liefern. Also … wir liefern, oder?',
    choices: [
      { label: 'Tech-Konferenz sponsern', boost: { name: 'Konferenz-Hype', minutes: 30, effects: { allMult: 1.5 } }, reply: 'Marco: Standparty! Ich bring die Hoodies mit.' },
      { label: 'Rücklagen bilden', grant: { res: 'energy', minutes: 45 }, reply: 'Marco: Vernünftig. Langweilig, aber vernünftig.' }
    ] },
  { id: 'tier4', from: 'lena', subject: 'Wir machen jetzt KI',
    trigger: (s) => (s.techs || []).some(id => (TECHS.find(t => t.id === id)?.tier || 0) >= 4),
    body: 'Ab heute steht „KI“ auf unserer Website, und technisch stimmt es sogar. Die Konzern-Technologien sind teuer, aber sie verschieben alles. Und nein, die KI darf noch keine Pull-Requests mergen.' },
  { id: 'streak_7', from: 'kim', subject: 'Eine ganze Woche!',
    trigger: (s) => (s.daily?.bestStreak || 0) >= 7,
    body: 'Sieben Tage Standup am Stück – ich habe Kuchen bestellt. 🎂 Die Retro am siebten Tag hat dem Team richtig Schwung gegeben. Denk dran: Abschalten gehört auch dazu.' },
  { id: 'lab_3', from: 'lena', subject: 'Das Labor will länger arbeiten',
    trigger: (s) => (s.lab?.done || []).length >= 3,
    body: 'Die Forscher fragen, ob sie heute Nacht durchmachen dürfen. Ich habe gesagt, ich frage die Chefetage. Das bist du.',
    choices: [
      { label: 'Ja, Nachtschicht', lab: 2, reply: 'Lena: Ich sag’s weiter. Und bestell Pizza.' },
      { label: 'Nein, alle nach Hause', coffee: 1, reply: 'Lena: Gute Entscheidung, ausgeschlafene Leute bauen weniger Bugs. Die Kaffeemaschine bedankt sich mit einer Bohne.' }
    ] },
  { id: 'xp_1m', from: 'marco', subject: 'Eine Million XP',
    trigger: (s) => (s.stats?.xpEarned || 0) >= 1e6,
    body: 'Ich habe keine Ahnung, was XP genau sind, aber eine Million klingt nach Einhorn. 🦄 Mein Steuerberater fragt, ob man die versteuern muss. Weiter so!' },
  { id: 'round_series_b', from: 'marco', subject: 'Series B: Jetzt wird’s eine Plattform',
    trigger: (s) => chapter(s) >= 3,
    body: 'Die Investoren wollen ein Ökosystem. Ich habe genickt, als wüsste ich, was das bedeutet. Du weißt es hoffentlich.',
    choices: [
      { label: 'Entwickler-Programm starten', grant: { res: 'research', minutes: 45 }, reply: 'Marco: API-Keys für alle! Ich hab mir auch einen gemacht.' },
      { label: 'Presse-Tour', grant: { res: 'influence', minutes: 60 }, reply: 'Marco: Ich hab schon ein Foto für die Titelseite ausgesucht. Meins.' }
    ] },
  { id: 'welcome_back', from: 'kim', subject: 'Schön, dass du wieder da bist',
    trigger: (s) => (s.stats?.longAbsences || 0) >= 1,
    body: 'Du warst eine Weile weg – völlig in Ordnung. Das Team hat durchgehalten, die Server laufen, niemand hat die Kaffeemaschine kaputt gemacht. Ich habe dir eine frische Bohne zur Seite gelegt.',
    choices: [
      { label: 'Danke, Kim!', coffee: 1, reply: 'Kim: Gern. Schön, dass du da bist.' }
    ] },
  { id: 'sprints_3', from: 'lena', subject: 'Drei Sprints',
    trigger: (s) => (s.challengesDone || []).length >= 3,
    body: 'Drei Sprints mit Handicap, dreimal geliefert. Ich fange an zu glauben, dass wir das können. Sag’s aber nicht weiter.' },
  { id: 'round_series_c', from: 'marco', subject: 'Series C – die letzte vor der Börse',
    trigger: (s) => chapter(s) >= 4,
    body: 'Die Banker rufen an. Die richtigen Banker, mit Manschettenknöpfen. Wir müssen jetzt groß denken. Noch größer.',
    choices: [
      { label: 'Rechenzentren ausbauen', boost: { name: 'Skalierung', minutes: 45, effects: { allMult: 1.4 } }, reply: 'Marco: Mehr Server, mehr Erfolg. So funktioniert das doch?' },
      { label: 'Top-Talente abwerben', grant: { res: 'relics', minutes: 60 }, reply: 'Marco: Die Konkurrenz ist sauer. Ich liebe es.' }
    ] },
  { id: 'release_os', from: 'lena', subject: 'Unser eigenes Betriebssystem',
    trigger: (s) => releasedEver(s, 'operating_system'),
    body: 'Wir haben ein Betriebssystem gebaut. Freiwillig. Wenn das nächste Mal jemand sagt „das kann doch nicht so schwer sein“, zeige ich auf dieses Release.' },
  { id: 'release_super_app', from: 'marco', subject: 'Die Super-App',
    trigger: (s) => releasedEver(s, 'super_app'),
    body: 'Chat, Bezahlen, Taxi, Essen – alles in einer App. Meine Oma nutzt sie jetzt für alles. Gestern hat sie mir ein Taxi zu sich bestellt. 🚕' },
  { id: 'round_ipo', from: 'board', subject: 'Vorbereitung des Börsengangs',
    trigger: (s) => chapter(s) >= 5,
    body: 'Sehr geehrte Geschäftsführung, der Aufsichtsrat begrüßt die Vorbereitung des Börsengangs und bittet um einen Vorschlag zur Roadshow.',
    choices: [
      { label: 'Große Roadshow', boost: { name: 'Roadshow', minutes: 60, effects: { allMult: 1.3 } }, reply: 'Aufsichtsrat: Zur Kenntnis genommen. Die Reisekosten sind genehmigt.' },
      { label: 'Leise vorbereiten', grant: { res: 'relics', minutes: 90 }, reply: 'Aufsichtsrat: Zur Kenntnis genommen. Diskretion wird geschätzt.' }
    ] },
  { id: 'ipo', from: 'marco', subject: 'WIR SIND AN DER BÖRSE',
    trigger: (s) => chapter(s) >= 6,
    body: 'Ich habe die Glocke geläutet! Also, du hast sie geläutet, ich stand daneben und habe geweint. 🔔 Danke für alles. Ich sitze jetzt übrigens im Aufsichtsrat. Das wird lustig.' },
  { id: 'board_intro', from: 'board', subject: 'Mitteilung des Aufsichtsrats',
    trigger: (s) => chapter(s) >= 6,
    body: 'Sehr geehrte Geschäftsführung, als börsennotiertes Unternehmen erwarten wir langfristige Ziele. Wir haben drei Vorstandsmandate formuliert (Roadmap-Tab); die Reihenfolge überlassen wir Ihnen. Mit freundlichen Grüßen, der Aufsichtsrat (i. A. Marco Keller)' },
  { id: 'mandate_first', from: 'board', subject: 'Erstes Mandat erfüllt',
    trigger: (s) => mandateLevels(s).some(l => l >= 1),
    body: 'Der Aufsichtsrat stellt die Erfüllung des ersten Vorstandsmandats fest und spricht seine Anerkennung aus. Herr Keller bittet darum, festzuhalten, dass er „mega stolz“ ist.' },
  { id: 'mandate_all', from: 'board', subject: 'Alle Mandate erfüllt',
    trigger: (s) => mandateLevels(s).filter(l => l >= 1).length >= 3,
    body: 'Sämtliche Vorstandsmandate sind erfüllt. Der Aufsichtsrat sieht keinen Anlass zur Kritik, was in seiner Geschichte ein Novum darstellt. Die Mandate werden in der nächsten Stufe erneut aufgelegt.' },
  { id: 'mandate_level2', from: 'board', subject: 'Die nächste Stufe',
    trigger: (s) => mandateLevels(s).some(l => l >= 2),
    body: 'Der Aufsichtsrat hat die Ziele angehoben. Wachstum ist kein Zustand, sondern eine Verpflichtung. (Randnotiz von Herrn Keller: „Ihr schafft das!!“)' },
  { id: 'hackathon_5', from: 'kim', subject: 'Hackathon-Tradition',
    trigger: (s) => (s.lab?.levels?.hackathon || 0) >= 5,
    body: 'Der Hackathon ist inzwischen Tradition. Die Frage fürs nächste Mal: Pizza oder Preisgeld?',
    choices: [
      { label: 'Pizza für alle', boost: { name: 'Pizza-Power', minutes: 20, effects: { allMult: 2 } }, reply: 'Kim: Ich bestelle Salami und eine vegane. Eine. Für alle Veganer.' },
      { label: 'Preisgeld', grant: { res: 'research', minutes: 30 }, reply: 'Kim: Die Teams sind hochmotiviert. Und leicht hungrig.' }
    ] },
  { id: 'refactor_10', from: 'lena', subject: 'Zehn Refactors',
    trigger: (s) => (s.stats?.prestigeCount || 0) >= 10,
    body: 'Wir haben die Firma zehnmal neu geschrieben, jedes Mal ein bisschen besser. Soll ich die Lehren aufschreiben, oder machen wir einfach weiter?',
    choices: [
      { label: 'Aufschreiben', grant: { res: 'research', minutes: 60 }, reply: 'Lena: Ich fang an. Kapitel 1: „Warum wir alles neu schreiben“.' },
      { label: 'Einfach weitermachen', boost: { name: 'Flow', minutes: 30, effects: { allMult: 1.5 } }, reply: 'Lena: Mein Lieblingsplan.' }
    ] },
  { id: 'first_colony', from: 'marco', subject: 'Ein zweites Büro!',
    trigger: (s) => (s.colonies || []).length >= 1,
    body: 'Wir expandieren! Neues Büro, neue Stadt, neue Kaffeemaschine. Ich habe mir schon einen Schreibtisch mit Aussicht reserviert. Ich komme natürlich nie hin, aber es geht ums Prinzip.' },
  { id: 'first_trade', from: 'marco', subject: 'Börsen-Tipps',
    trigger: (s) => (s.stats?.stockTrades || 0) >= 1,
    body: 'Ich sehe, du handelst an der Börse. Ich darf dir keine Anlageberatung geben. Ich sag’s mal so: Ich habe alles in unsere eigene Aktie gesteckt. 📈 (Das ist keine Anlageberatung.)' },
  // Tech-Baum der Runde komplett (engine/roadmap.js checkTreeComplete)
  { id: 'tree_done', from: 'lena', subject: 'Wir haben alles gelernt – und jetzt?',
    trigger: (s) => (s.stats?.treeDone || 0) >= 1,
    body: 'Der Tech-Baum dieser Runde ist durch. Neue Techs gibt es erst mit der nächsten Finanzierungsrunde, und die bekommen wir nur mit XP. XP gibt es beim Hard Refactor im Tab Prestige: je größer der Run, desto mehr. Also refactoren, XP in Upgrades stecken, wieder hochfahren – jeder Durchgang geht schneller. Wie viel noch fehlt, steht im Roadmap-Tab.' },
  // Zwischenziel einer Runde (engine/roadmap.js checkPreview)
  { id: 'round_preview', from: 'lena', subject: 'Vorab-Zugang',
    trigger: (s) => (s.roadmap?.previews || []).length >= 1,
    body: 'Kleiner Vorgeschmack: Die Investoren lassen uns schon an der nächsten Tech-Stufe arbeiten, bevor die Runde durch ist. Im Tech-Tab wartet etwas Neues – und sobald wir es können, kommen neue Leute ins Team.' },
  // Community (engine/community.js, Stand vom Server)
  { id: 'community_first', from: 'lena', subject: 'Du verschenkst Code',
    trigger: (s) => (s.community?.packagesTotal || 0) >= 1,
    body: 'Du hast gerade Arbeit verschenkt. Freiwillig. An Leute im Internet. Ich war noch nie so stolz auf dich. Wenn das Projekt fertig ist, läuft es bei allen Mitwirkenden ein bisschen besser – bei uns auch.' },
  { id: 'community_project', from: 'marco', subject: 'Wir stehen in den Credits!!!',
    trigger: (s) => s.community?.contributor === true && (s.community?.projectsDone || 0) >= 1,
    body: 'Das Open-Source-Projekt ist fertig und unser Name steht in den Credits!!! Open Source ist das neue Blockchain, glaub mir. Und das Beste: +3 % Produktion für jedes fertige Projekt, für immer. Ich hab’s ja immer gesagt.' },
  { id: 'weekly_badge', from: 'kim', subject: 'Ein Abzeichen!',
    trigger: (s) => (s.community?.badges || 0) >= 1,
    body: 'Du hast eine Wochenwertung gewonnen – herzlichen Glückwunsch! Nur zur Sicherheit: Abzeichen sind zum Freuen da, nicht zum Stressen. Nächsten Montag geht alles von vorn los.' }
];

export function getMail(id) {
  return MAILS.find(m => m.id === id) || null;
}
