module.exports = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Authentication required.' });
  const { role } = req.session.user;
  if (role !== 'org_admin' && role !== 'super_admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
};
