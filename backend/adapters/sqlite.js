const Database = require('better-sqlite3');
const path     = require('path');

// ── Simple TTL cache ──────────────────────────────────────────────────────────
const CACHE_TTL = 15_000; // 15 seconds

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

const ALLOWED_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3', '.db3', '.s3db']);

// Quote a SQLite identifier — double the internal double-quotes (SQL standard).
function q(name) {
  return '"' + name.replace(/"/g, '""') + '"';
}

class SQLiteAdapter {
  constructor(db) {
    this.db   = db;
    this.type = 'sqlite';
  }

  static connect(config) {
    const filePath = config.database;
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(
        `Unsupported SQLite file extension "${ext}". ` +
        `Allowed: ${[...ALLOWED_EXTENSIONS].join(' ')}`
      );
    }
    const db = new Database(filePath);
    return new SQLiteAdapter(db);
  }

  // ── Cache init ───────────────────────────────────────────────────────────────
  _cache = new MetaCache();

  // ── Private helpers ──────────────────────────────────────────────────────────

  /** Throws if tableName is not a real table. Result is cached for 15 s. */
  _validateTable(tableName) {
    let names = this._cache.get('__tables__');
    if (!names) {
      names = new Set(
        this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
      );
      this._cache.set('__tables__', names);
    }
    if (!names.has(tableName)) throw new Error(`Table "${tableName}" not found.`);
  }

  /** Returns column names for a validated table. Result is cached for 15 s. */
  _columnNames(tableName) {
    const key = `cols:${tableName}`;
    let cols = this._cache.get(key);
    if (!cols) {
      cols = this.db.prepare(`PRAGMA table_info(${q(tableName)})`).all().map(c => c.name);
      this._cache.set(key, cols);
    }
    return cols;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  async query(sql, params = []) {
    // Invalidate schema cache after DDL so table list stays fresh
    if (/^\s*(CREATE|DROP|ALTER|RENAME)\b/i.test(sql)) this._cache.clear();
    const stmt = this.db.prepare(sql);
    // stmt.reader is true for SELECT/PRAGMA/EXPLAIN — covers CTEs correctly.
    if (stmt.reader) {
      const rows   = stmt.all(...params);
      const fields = rows.length > 0 ? Object.keys(rows[0]).map(n => ({ name: n })) : [];
      return { rows, fields, rowsAffected: 0 };
    }
    const result = stmt.run(...params);
    return { rows: [], fields: [], rowsAffected: result.changes };
  }

  async getTables() {
    const names = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map(r => r.name);
    // Warm the validation cache whenever the table list is fetched
    this._cache.set('__tables__', new Set(names));
    return names;
  }

  async getTableStructure(tableName) {
    this._validateTable(tableName);
    return this.db
      .prepare(`PRAGMA table_info(${q(tableName)})`)
      .all()
      .map(row => ({
        name:     row.name,
        type:     row.type,
        nullable: !row.notnull,
        default:  row.dflt_value,
        key:      row.pk ? 'PRI' : '',
      }));
  }

  async getRows(tableName, page = 1, limit = 50, opts = {}) {
    this._validateTable(tableName);
    const { orderBy, orderDir = 'ASC', search = '', searchFields = [], filters = [] } = opts;
    const safeLimit  = parseInt(limit);
    const safeOffset = (parseInt(page) - 1) * safeLimit;

    const colNames   = this._columnNames(tableName);
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
        case 'eq':          whereParts.push(`${col} = ?`);        params.push(rule.value); break;
        case 'neq':         whereParts.push(`${col} != ?`);       params.push(rule.value); break;
        case 'gt':          whereParts.push(`${col} > ?`);        params.push(rule.value); break;
        case 'gte':         whereParts.push(`${col} >= ?`);       params.push(rule.value); break;
        case 'lt':          whereParts.push(`${col} < ?`);        params.push(rule.value); break;
        case 'lte':         whereParts.push(`${col} <= ?`);       params.push(rule.value); break;
        case 'starts':      whereParts.push(`${col} LIKE ?`);     params.push(`${rule.value}%`);  break;
        case 'ends':        whereParts.push(`${col} LIKE ?`);     params.push(`%${rule.value}`);  break;
        case 'is_null':     whereParts.push(`${col} IS NULL`);     break;
        case 'is_not_null': whereParts.push(`${col} IS NOT NULL`); break;
        default:
          if (rule.value) { whereParts.push(`${col} LIKE ?`); params.push(`%${rule.value}%`); }
      }
    }

    const whereSQL = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const orderSQL = orderBy && colNames.includes(orderBy)
      ? `ORDER BY ${q(orderBy)} ${orderDir === 'DESC' ? 'DESC' : 'ASC'}`
      : '';

    const { total } = this.db
      .prepare(`SELECT COUNT(*) as total FROM ${q(tableName)} ${whereSQL}`)
      .get(...params);

    const rows = this.db
      .prepare(`SELECT * FROM ${q(tableName)} ${whereSQL} ${orderSQL} LIMIT ? OFFSET ?`)
      .all(...params, safeLimit, safeOffset);

    return { rows, total: Number(total) };
  }

  async getPrimaryKey(tableName) {
    this._validateTable(tableName);
    const pk = this.db
      .prepare(`PRAGMA table_info(${q(tableName)})`)
      .all()
      .find(r => r.pk === 1);
    return pk ? pk.name : null;
  }

  async insertRow(tableName, data) {
    this._validateTable(tableName);
    const validCols = this._columnNames(tableName);
    // Strip any keys that are not real columns (prevents column-name injection)
    const filtered  = Object.fromEntries(Object.entries(data).filter(([k]) => validCols.includes(k)));
    if (Object.keys(filtered).length === 0) throw new Error('No valid columns provided.');

    const columns      = Object.keys(filtered).map(k => q(k)).join(', ');
    const values       = Object.values(filtered);
    const placeholders = values.map(() => '?').join(', ');
    const result = this.db
      .prepare(`INSERT INTO ${q(tableName)} (${columns}) VALUES (${placeholders})`)
      .run(...values);
    return { id: result.lastInsertRowid };
  }

  async updateRow(tableName, id, data, pkColumn) {
    this._validateTable(tableName);
    const validCols = this._columnNames(tableName);
    if (!validCols.includes(pkColumn)) throw new Error('Invalid primary key column.');
    const filtered = Object.fromEntries(Object.entries(data).filter(([k]) => validCols.includes(k)));
    if (Object.keys(filtered).length === 0) throw new Error('No valid columns provided.');

    const sets   = Object.keys(filtered).map(k => `${q(k)} = ?`).join(', ');
    const values = [...Object.values(filtered), id];
    this.db
      .prepare(`UPDATE ${q(tableName)} SET ${sets} WHERE ${q(pkColumn)} = ?`)
      .run(...values);
  }

  async deleteRow(tableName, id, pkColumn) {
    this._validateTable(tableName);
    const validCols = this._columnNames(tableName);
    if (!validCols.includes(pkColumn)) throw new Error('Invalid primary key column.');
    this.db
      .prepare(`DELETE FROM ${q(tableName)} WHERE ${q(pkColumn)} = ?`)
      .run(id);
  }

  async close() {
    this.db.close();
  }
}

module.exports = SQLiteAdapter;
