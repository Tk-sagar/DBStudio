const MySQLAdapter = require('./mysql');
const PostgreSQLAdapter = require('./postgres');
const SQLiteAdapter = require('./sqlite');

async function createAdapter(config) {
  switch (config.type) {
    case 'mysql':
    case 'mariadb':
      return await MySQLAdapter.connect(config);
    case 'postgres':
    case 'postgresql':
      return await PostgreSQLAdapter.connect(config);
    case 'sqlite':
      return SQLiteAdapter.connect(config);
    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}

module.exports = { createAdapter };
