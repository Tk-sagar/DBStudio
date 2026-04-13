const LEVELS = { read: 0, write: 1, full: 2 };

/**
 * Returns middleware that rejects requests whose dbPermission is below minPerm.
 * Admin direct-connects default to 'full'; shared-connection users inherit grant level.
 */
module.exports = (minPerm) => (req, res, next) => {
  const perm = req.dbPermission || 'full';
  if ((LEVELS[perm] ?? 0) < (LEVELS[minPerm] ?? 0)) {
    return res.status(403).json({
      error: `This action requires "${minPerm}" permission on this database.`,
    });
  }
  next();
};
