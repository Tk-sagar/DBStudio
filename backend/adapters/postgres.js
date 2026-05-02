const { Pool } = require('pg');

// Quote a PostgreSQL identifier — double the internal double-quotes (SQL standard).
function q(name) {
  return '"' + name.replace(/"/g, '""') + '"';
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

class PostgreSQLAdapter {
  constructor(pool) {
    this.pool  = pool;
    this.type  = 'postgres';
    this._cache = new MetaCache();
  }

  static async connect(config) {
    const pool = new Pool({
      host:     config.host || 'localhost',
      port:     parseInt(config.port) || 5432,
      user:     config.username,
      password: config.password,
      database: config.database,
      ssl:      config.ssl ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
    // Verify connectivity
    const client = await pool.connect();
    client.release();
    return new PostgreSQLAdapter(pool);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /** Throws if tableName is not a real table. Result cached for 15 s. */
  async _validateTable(tableName) {
    let names = this._cache.get('__tables__');
    if (!names) {
      const r = await this.pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
      );
      names = new Set(r.rows.map(row => row.table_name));
      this._cache.set('__tables__', names);
    }
    if (!names.has(tableName)) throw new Error(`Table "${tableName}" not found.`);
  }

  /** Returns column names for a validated table. Result cached for 15 s. */
  async _columnNames(tableName) {
    const key = `cols:${tableName}`;
    let cols = this._cache.get(key);
    if (!cols) {
      const r = await this.pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName]
      );
      cols = r.rows.map(row => row.column_name);
      this._cache.set(key, cols);
    }
    return cols;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  async query(sql, params = []) {
    if (/^\s*(CREATE|DROP|ALTER|RENAME)\b/i.test(sql)) this._cache.clear();
    const result = await this.pool.query(sql, params);
    return {
      rows:         result.rows   || [],
      fields:       result.fields ? result.fields.map(f => ({ name: f.name })) : [],
      rowsAffected: result.rowCount || 0,
    };
  }

  async getTables() {
    const result = await this.pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    );
    const names = result.rows.map(row => row.table_name);
    // Warm the validation cache whenever the table list is fetched
    this._cache.set('__tables__', new Set(names));
    return names;
  }

  async getTableStructure(tableName) {
    await this._validateTable(tableName);
    const result = await this.pool.query(
      `SELECT
         c.column_name  AS name,
         c.data_type    AS type,
         c.is_nullable  AS nullable,
         c.column_default AS "default",
         CASE WHEN pk.column_name IS NOT NULL THEN 'PRI' ELSE '' END AS key
       FROM information_schema.columns c
       LEFT JOIN (
         SELECT ku.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage ku
           ON tc.constraint_name = ku.constraint_name
          AND tc.table_name      = ku.table_name
          AND tc.table_schema    = ku.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_schema    = 'public'
           AND tc.table_name      = $1
       ) pk ON c.column_name = pk.column_name
       WHERE c.table_schema = 'public' AND c.table_name = $1
       ORDER BY c.ordinal_position`,
      [tableName]
    );
    return result.rows.map(row => ({
      name:     row.name,
      type:     row.type,
      nullable: row.nullable === 'YES',
      default:  row.default,
      key:      row.key,
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
    let   idx        = 1;

    if (search.trim()) {
      const scope = searchFields.length > 0
        ? searchFields.filter(f => colNames.includes(f))
        : colNames;
      if (scope.length > 0) {
        const parts = scope.map(c => {
          params.push(`%${search}%`);
          return `${q(c)}::text ILIKE $${idx++}`;
        });
        whereParts.push(`(${parts.join(' OR ')})`);
      }
    }

    for (const rule of filters) {
      if (!colNames.includes(rule.field)) continue;
      const col  = `${q(rule.field)}::text`;
      const qcol = q(rule.field);
      switch (rule.op) {
        case 'eq':          params.push(rule.value);          whereParts.push(`${qcol} = $${idx++}`);      break;
        case 'neq':         params.push(rule.value);          whereParts.push(`${qcol} != $${idx++}`);     break;
        case 'gt':          params.push(rule.value);          whereParts.push(`${qcol} > $${idx++}`);      break;
        case 'gte':         params.push(rule.value);          whereParts.push(`${qcol} >= $${idx++}`);     break;
        case 'lt':          params.push(rule.value);          whereParts.push(`${qcol} < $${idx++}`);      break;
        case 'lte':         params.push(rule.value);          whereParts.push(`${qcol} <= $${idx++}`);     break;
        case 'starts':      params.push(`${rule.value}%`);   whereParts.push(`${col} ILIKE $${idx++}`);   break;
        case 'ends':        params.push(`%${rule.value}`);   whereParts.push(`${col} ILIKE $${idx++}`);   break;
        case 'is_null':     whereParts.push(`${qcol} IS NULL`);     break;
        case 'is_not_null': whereParts.push(`${qcol} IS NOT NULL`); break;
        default:
          if (rule.value) { params.push(`%${rule.value}%`); whereParts.push(`${col} ILIKE $${idx++}`); }
      }
    }

    const whereSQL = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const orderSQL = orderBy && colNames.includes(orderBy)
      ? `ORDER BY ${q(orderBy)} ${orderDir === 'DESC' ? 'DESC' : 'ASC'}`
      : '';

    const countResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM ${q(tableName)} ${whereSQL}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    const dataResult = await this.pool.query(
      `SELECT * FROM ${q(tableName)} ${whereSQL} ${orderSQL} LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, safeLimit, safeOffset]
    );

    return { rows: dataResult.rows, total };
  }

  async getPrimaryKey(tableName) {
    await this._validateTable(tableName);
    const result = await this.pool.query(
      `SELECT ku.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage ku
         ON tc.constraint_name = ku.constraint_name
        AND tc.table_name      = ku.table_name
        AND tc.table_schema    = ku.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_schema    = 'public'
         AND tc.table_name      = $1
       LIMIT 1`,
      [tableName]
    );
    return result.rows.length > 0 ? result.rows[0].column_name : null;
  }

  async insertRow(tableName, data) {
    await this._validateTable(tableName);
    const validCols = await this._columnNames(tableName);
    const filtered  = Object.fromEntries(Object.entries(data).filter(([k]) => validCols.includes(k)));
    if (Object.keys(filtered).length === 0) throw new Error('No valid columns provided.');

    const columns      = Object.keys(filtered).map(k => q(k)).join(', ');
    const values       = Object.values(filtered);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const result = await this.pool.query(
      `INSERT INTO ${q(tableName)} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return { row: result.rows[0] };
  }

  async updateRow(tableName, id, data, pkColumn) {
    await this._validateTable(tableName);
    const validCols = await this._columnNames(tableName);
    if (!validCols.includes(pkColumn)) throw new Error('Invalid primary key column.');
    const filtered = Object.fromEntries(Object.entries(data).filter(([k]) => validCols.includes(k)));
    if (Object.keys(filtered).length === 0) throw new Error('No valid columns provided.');

    const sets   = Object.keys(filtered).map((k, i) => `${q(k)} = $${i + 1}`).join(', ');
    const values = [...Object.values(filtered), id];
    await this.pool.query(
      `UPDATE ${q(tableName)} SET ${sets} WHERE ${q(pkColumn)} = $${values.length}`,
      values
    );
  }

  async deleteRow(tableName, id, pkColumn) {
    await this._validateTable(tableName);
    const validCols = await this._columnNames(tableName);
    if (!validCols.includes(pkColumn)) throw new Error('Invalid primary key column.');
    await this.pool.query(
      `DELETE FROM ${q(tableName)} WHERE ${q(pkColumn)} = $1`,
      [id]
    );
  }

  async close() {
    this._cache.clear();
    await this.pool.end();
  }
}

module.exports = PostgreSQLAdapter;
