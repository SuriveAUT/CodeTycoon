// Projektkette des gemeinsamen Open-Source-Projekts (lib/community.js). Nach dem letzten Projekt geht es von vorn
// weiter, dann mit Versionsnummer („OpenNimbus 2.0“).
const COMMUNITY_PROJECTS = [
  { key: 'opennimbus', name: 'OpenNimbus', desc: 'Eine freie Cloud – wie die großen, nur ohne Überraschung auf der Monatsrechnung.' },
  { key: 'llamarama', name: 'Llamarama', desc: 'Ein offenes Sprachmodell, trainiert auf Doku, die tatsächlich jemand geschrieben hat.' },
  { key: 'tycoonos', name: 'TycoonOS', desc: 'Eine Linux-Distro für Gründerteams. Bootet schneller als das nächste Pitch-Meeting.' },
  { key: 'freefox', name: 'Freefox', desc: 'Ein Browser ohne Tracker. Die Werbebranche hat schon eine Beschwerde-Mail getippt.' },
  { key: 'packrat', name: 'PackRat', desc: 'Ein Paketmanager, der für Hello World keine 800 MB node_modules braucht.' },
  { key: 'pipedream', name: 'PipeDream', desc: 'Ein CI-System, dessen Pipelines öfter grün als rot sind. Ehrlich.' },
  { key: 'quillpad', name: 'Quillpad', desc: 'Ein Editor, den man ohne Anleitung wieder verlassen kann.' },
  { key: 'chirpchat', name: 'ChirpChat', desc: 'Ein Messenger mit Ende-zu-Ende-Verschlüsselung und ganz ohne Stories.' }
];

// n = Anzahl bisher angelegter Projekte
function projectDef(n) {
  const index = n % COMMUNITY_PROJECTS.length;
  const round = Math.floor(n / COMMUNITY_PROJECTS.length);
  const base = COMMUNITY_PROJECTS[index];
  return { index, name: round > 0 ? `${base.name} ${round + 1}.0` : base.name, desc: base.desc };
}

module.exports = { COMMUNITY_PROJECTS, projectDef };
