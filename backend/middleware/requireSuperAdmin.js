module.exports = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Authentication required.' });
  if (req.session.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required.' });
  }
  next();
};
