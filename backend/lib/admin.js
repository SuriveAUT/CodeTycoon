// Admin account comes only from ADMIN_USERNAME. Without it nobody is admin (fail closed).
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || '').trim();

function isAdminUser(username) {
  return Boolean(ADMIN_USERNAME) && username === ADMIN_USERNAME;
}

module.exports = { isAdminUser };
