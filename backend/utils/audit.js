const { AuditLog } = require('../db/app');

function connInfoFromReq(req) {
  const connId   = req.session?.activeConnId || null;
  const connData = req.session?.connections?.[connId];
  return {
    connectionId:   connId,
    connectionName: connData?.dbInfo?.name || connId || '',
  };
}

async function logAction(req, { action, tableName, rowId = null, oldData = null, newData = null, detail = '' }) {
  try {
    const { connectionId, connectionName } = connInfoFromReq(req);
    const user = req.session?.user;
    await AuditLog.create({
      action,
      tableName,
      connectionId,
      connectionName,
      userId:   user?._id || user?.id || null,
      username: user?.username || 'unknown',
      rowId,
      oldData,
      newData,
      detail,
    });
  } catch (_) {
    // Audit failures must never break the main operation
  }
}

module.exports = { logAction };
