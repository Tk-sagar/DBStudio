const registry = require('../adapters/registry');

module.exports = (req, res, next) => {
  // Must be signed in to the app
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  // Must have an active DB connection
  const adapter = registry.get(req.session.id);
  if (!adapter) {
    return res.status(401).json({ error: 'Not connected to a database. Please connect first.' });
  }
  req.adapter      = adapter;
  req.dbPermission = req.session.dbPermission || 'full';
  next();
};
