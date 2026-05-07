const mysql = require('mysql2/promise');

// Quote a MySQL identifier — double the internal backticks.
function q(name) {
  return '`' + name.replace(/`/g, '``') + '`';
}

// ── Simple TTL cache ──────────────────────────────────────────────────────────
const CACHE_TTL = 15_000;

class MetaCache {
  constructor() { this._m = new Map(); }
  get(k) {
    const e = this._m.get(k);
    if (!e || Date.now() > e.x) { this._m.delete(k); return undefined; }
    return e.v;
  }
  set(k, v) { this._m.set(k, { v, x: Date.now() + CACHE_TTL }); }
  clear()    { this._m.clear(); }
}

function parseColType(typeStr) {
  const m = typeStr.match(/^(\w+)(?:\((.+)\))?/);
  return m ? { type: m[1].toLowerCase(), length: m[2] || '' } : { type: typeStr.toLowerCase(), length: '' };
}

function buildColDef(col) {
  const t = (col.type || 'varchar').toLowerCase();
  let def = t.toUpperCase();
  if (col.length && String(col.length).trim()) def += `(${String(col.length).trim()})`;
  def += col.nullable ? ' NULL' : ' NOT NULL';
  if (col.default !== null && col.default !== undefined) {
    const d = String(col.default);
    const noQuote = /^(NULL|CURRENT_TIMESTAMP(\(\))?|NOW\(\)|UUID\(\)|TRUE|FALSE)$/i.test(d.trim())
                    || /^-?[0-9]+(\.[0-9]+)?$/.test(d.trim());
    def += noQuote ? ` DEFAULT ${d}` : ` DEFAULT '${d.replace(/'/g, "\\'")}'`;
  } else if (col.nullable) {
    def += ' DEFAULT NULL';
  }
  if (col.autoIncrement) def += ' AUTO_INCREMENT';
  if (col.comment) def += ` COMMENT '${col.comment.replace(/'/g, "\\'")}'`;
  return def;
}

class MySQLAdapter {
  constructor(connection) {
    this.connection = connection;
    this.type       = 'mysql';
    this._cache     = new MetaCache();
  }

  static async connect(config) {
    const connection = await mysql.createConnection({
      host:        config.host || 'localhost',
      port:        parseInt(config.port) || 3306,
      user:        config.username,
      password:    config.password,
      database:    config.database,
      dateStrings: true,
      ssl:         config.ssl ? { rejectUnauthorized: false } : false,
    });
    return new MySQLAdapter(connection);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Throws if tableName is not a real table in the current database.
   * Fully parameterised — tableName is never interpolated.
   */
  /** Throws if tableName is not a real table. Result cached for 15 s. */
  async _validateTable(tableName) {
    let names = this._cache.get('__tables__');
    if (!names) {
      const [rows] = await this.connection.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()`
      );
      names = new Set(rows.map(r => r.table_name || r.TABLE_NAME));
      this._cache.set('__tables__', names);
    }
    if (!names.has(tableName)) throw new Error(`Table "${tableName}" not found.`);
  }

  /** Returns column names for a validated table. Result cached for 15 s. */
  async _columnNames(tableName) {
    const key = `cols:${tableName}`;
    let cols = this._cache.get(key);
    if (!cols) {
      const [rows] = await this.connection.query(`SHOW COLUMNS FROM ${q(tableName)}`);
      cols = rows.map(r => r.Field);
      this._cache.set(key, cols);
    }
    return cols;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Use query() (text protocol) for user-submitted SQL — avoids binary protocol issues.
  async query(sql, params = []) {
    if (/^\s*(CREATE|DROP|ALTER|RENAME)\b/i.test(sql)) this._cache.clear();
    const [rows, fields] = await this.connection.query(sql, params);
    const isResultSet    = Array.isArray(rows);
    return {
      rows:         isResultSet ? rows : [],
      fields:       fields ? fields.map(f => ({ name: f.name })) : [],
      rowsAffected: isResultSet ? 0 : (rows.affectedRows || 0),
    };
  }

  // SHOW TABLES must use query() — not supported by binary prepared-statement protocol.
  async getTables() {
    const [rows] = await this.connection.query('SHOW TABLES');
    const names = rows.map(row => Object.values(row)[0]);
    // Warm the validation cache whenever the table list is fetched
    this._cache.set('__tables__', new Set(names));
    return names;
  }

  async getTableStructure(tableName) {
    await this._validateTable(tableName);
    // DESCRIBE must use query() for the same reason as SHOW TABLES.
    const [rows] = await this.connection.query(`DESCRIBE ${q(tableName)}`);
    return rows.map(row => ({
      name:     row.Field,
      type:     row.Type,
      nullable: row.Null === 'YES',
      default:  row.Default,
      key:      row.Key,
    }));
  }

  async getRows(tableName, page = 1, limit = 50, opts = {}) {
    await this._validateTable(tableName);
    const { orderBy, orderDir = 'ASC', search = '', searchFields = [], filters = [] } = opts;
    const safeLimit  = parseInt(limit);
    const safeOffset = (parseInt(page) - 1) * safeLimit;

    const colNames   = await this._columnNames(tableName);
    const whereParts = [];
    const params     = [];

    if (search.trim()) {
      const scope = searchFields.length > 0
        ? searchFields.filter(f => colNames.includes(f))
        : colNames;
      if (scope.length > 0) {
        whereParts.push(`(${scope.map(c => `${q(c)} LIKE ?`).join(' OR ')})`);
        scope.forEach(() => params.push(`%${search}%`));
      }
    }

    for (const rule of filters) {
      if (!colNames.includes(rule.field)) continue;
      const col = q(rule.field);
      switch (rule.op) {
        case 'eq':          whereParts.push(`${col} = ?`);    params.push(rule.value); break;
        case 'neq':         whereParts.push(`${col} != ?`);   params.push(rule.value); break;
        case 'gt':          whereParts.push(`${col} > ?`);    params.push(rule.value); break;
        case 'gte':         whereParts.push(`${col} >= ?`);   params.push(rule.value); break;
        case 'lt':          whereParts.push(`${col} < ?`);    params.push(rule.value); break;
        case 'lte':         whereParts.push(`${col} <= ?`);   params.push(rule.value); break;
        case 'starts':      whereParts.push(`${col} LIKE ?`); params.push(`${rule.value}%`);  break;
        case 'ends':        whereParts.push(`${col} LIKE ?`); params.push(`%${rule.value}`);  break;
        case 'is_null':     whereParts.push(`${col} IS NULL`);     break;
        case 'is_not_null': whereParts.push(`${col} IS NOT NULL`); break;
        default:
          if (rule.value) { whereParts.push(`${col} LIKE ?`); params.push(`%${rule.value}%`); }
      }
    }

    const whereSQL = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    // Embed LIMIT/OFFSET as integer literals — avoids mysql2 prepared-statement binding issues.
    const orderSQL = orderBy && colNames.includes(orderBy)
      ? `ORDER BY ${q(orderBy)} ${orderDir === 'DESC' ? 'DESC' : 'ASC'}`
      : '';

    const [[{ total }]] = await this.connection.query(
      `SELECT COUNT(*) as total FROM ${q(tableName)} ${whereSQL}`,
      params
    );
    const [rows] = await this.connection.query(
      `SELECT * FROM ${q(tableName)} ${whereSQL} ${orderSQL} LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );

    return { rows, total: Number(total) };
  }

  // SHOW KEYS must use query().
  async getPrimaryKey(tableName) {
    await this._validateTable(tableName);
    const [rows] = await this.connection.query(
      `SHOW KEYS FROM ${q(tableName)} WHERE Key_name = 'PRIMARY'`
    );
    return rows.length > 0 ? rows[0].Column_name : null;
  }

  async insertRow(tableName, data) {
    await this._validateTable(tableName);
    const validCols = await this._columnNames(tableName);
    const filtered  = Object.fromEntries(Object.entries(data).filter(([k]) => validCols.includes(k)));
    if (Object.keys(filtered).length === 0) throw new Error('No valid columns provided.');

    const columns      = Object.keys(filtered).map(k => q(k)).join(', ');
    const values       = Object.values(filtered);
    const placeholders = values.map(() => '?').join(', ');
    const [result] = await this.connection.execute(
      `INSERT INTO ${q(tableName)} (${columns}) VALUES (${placeholders})`,
      values
    );
    return { id: result.insertId };
  }

  async updateRow(tableName, id, data, pkColumn) {
    await this._validateTable(tableName);
    const validCols = await this._columnNames(tableName);
    if (!validCols.includes(pkColumn)) throw new Error('Invalid primary key column.');
    const filtered = Object.fromEntries(Object.entries(data).filter(([k]) => validCols.includes(k)));
    if (Object.keys(filtered).length === 0) throw new Error('No valid columns provided.');

    const sets   = Object.keys(filtered).map(k => `${q(k)} = ?`).join(', ');
    const values = [...Object.values(filtered), id];
    await this.connection.execute(
      `UPDATE ${q(tableName)} SET ${sets} WHERE ${q(pkColumn)} = ?`,
      values
    );
  }

  async getRowById(tableName, id, pkColumn) {
    await this._validateTable(tableName);
    const validCols = await this._columnNames(tableName);
    if (!validCols.includes(pkColumn)) return null;
    const [rows] = await this.connection.execute(
      `SELECT * FROM ${q(tableName)} WHERE ${q(pkColumn)} = ? LIMIT 1`, [id]
    );
    return rows[0] || null;
  }

  async deleteRow(tableName, id, pkColumn) {
    await this._validateTable(tableName);
    const validCols = await this._columnNames(tableName);
    if (!validCols.includes(pkColumn)) throw new Error('Invalid primary key column.');
    await this.connection.execute(
      `DELETE FROM ${q(tableName)} WHERE ${q(pkColumn)} = ?`,
      [id]
    );
  }

  async getAlterInfo(tableName) {
    await this._validateTable(tableName);
    const [cols] = await this.connection.query(`SHOW FULL COLUMNS FROM ${q(tableName)}`);
    const [status] = await this.connection.query(
      `SELECT ENGINE, TABLE_COLLATION FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
      [tableName]
    );
    return {
      tableName,
      engine:    status[0]?.ENGINE      || 'InnoDB',
      collation: status[0]?.TABLE_COLLATION || '',
      columns: cols.map(col => {
        const { type, length } = parseColType(col.Type);
        return {
          originalName:  col.Field,
          name:          col.Field,
          type,
          length,
          nullable:      col.Null === 'YES',
          autoIncrement: (col.Extra || '').includes('auto_increment'),
          default:       col.Default,
          comment:       col.Comment || '',
          key:           col.Key,
        };
      }),
    };
  }

  async alterTable(tableName, { columns, newTableName, engine }) {
    await this._validateTable(tableName);
    const [currentCols] = await this.connection.query(`SHOW COLUMNS FROM ${q(tableName)}`);
    const currentNames  = new Set(currentCols.map(c => c.Field));
    const keptOriginals = new Set(columns.filter(c => c.originalName).map(c => c.originalName));

    // Step 1: DROP removed columns
    const toDrop = [...currentNames].filter(n => !keptOriginals.has(n));
    if (toDrop.length > 0) {
      await this.connection.query(
        `ALTER TABLE ${q(tableName)} ${toDrop.map(n => `DROP COLUMN ${q(n)}`).join(', ')}`
      );
    }

    // Step 2: ADD / CHANGE / MODIFY all columns (enforces ordering via FIRST/AFTER)
    const parts = [];
    let prev = null;
    for (const col of columns) {
      const def = buildColDef(col);
      const pos = prev ? `AFTER ${q(prev)}` : 'FIRST';
      if (!col.originalName) {
        parts.push(`ADD COLUMN ${q(col.name)} ${def} ${pos}`);
      } else if (col.originalName !== col.name) {
        parts.push(`CHANGE ${q(col.originalName)} ${q(col.name)} ${def} ${pos}`);
      } else {
        parts.push(`MODIFY COLUMN ${q(col.name)} ${def} ${pos}`);
      }
      prev = col.name;
    }
    if (parts.length > 0) {
      await this.connection.query(`ALTER TABLE ${q(tableName)} ${parts.join(', ')}`);
    }

    // Step 3: Rename table
    let targetName = tableName;
    if (newTableName && newTableName !== tableName) {
      await this.connection.query(`RENAME TABLE ${q(tableName)} TO ${q(newTableName)}`);
      targetName = newTableName;
    }

    // Step 4: Change engine
    if (engine) {
      await this.connection.query(`ALTER TABLE ${q(targetName)} ENGINE = ${engine}`);
    }

    this._cache.clear();
    return { tableName: targetName };
  }

  async dropTable(tableName) {
    await this._validateTable(tableName);
    await this.connection.query(`DROP TABLE ${q(tableName)}`);
    this._cache.clear();
  }

  async close() {
    await this.connection.end();
  }
}

module.exports = MySQLAdapter;
