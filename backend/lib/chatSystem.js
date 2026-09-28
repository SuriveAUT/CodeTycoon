// Systemmeldungen im Chat (Absender „System“, reservierter Name). Genutzt von routes/chat.js und lib/community.js.
const db = require('../db');

function postSystem(message) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO chat_messages (username, message) VALUES (?, ?)', ['System', message], function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

module.exports = { postSystem };
