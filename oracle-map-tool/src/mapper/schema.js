import { OracleMapError, ErrorCode } from '../utils/errors.js';
import { checkTableAccess } from '../config/security.js';

/**
 * Oracle 到 JavaScript 类型映射表
 */
export const TYPE_MAPPING = {
  // 字符串类型
  'VARCHAR2': 'string',
  'VARCHAR': 'string',
  'CHAR': 'string',
  'NVARCHAR2': 'string',
  'NCHAR': 'string',
  'LONG': 'string',
  'CLOB': 'string',
  'NCLOB': 'string',
  
  // 数字类型
  'NUMBER': 'number',
  'INTEGER': 'number',
  'INT': 'number',
  'SMALLINT': 'number',
  'FLOAT': 'number',
  'REAL': 'number',
  'DOUBLE PRECISION': 'number',
  'BINARY_FLOAT': 'number',
  'BINARY_DOUBLE': 'number',
  
  // 日期时间类型
  'DATE': 'Date',
  'TIMESTAMP': 'Date',
  'TIMESTAMP WITH TIME ZONE': 'Date',
  'TIMESTAMP WITH LOCAL TIME ZONE': 'Date',
  
  // 二进制类型
  'BLOB': 'Buffer',
  'RAW': 'Buffer',
  'LONG RAW': 'Buffer',
  'BFILE': 'Buffer',
  
  // 其他类型
  'ROWID': 'string',
  'UROWID': 'string',
  'XMLTYPE': 'string',
  'JSON': 'object'
};

/**
 * 有效的 JavaScript 类型集合
 */
export const VALID_JS_TYPES = new Set(['string', 'number', 'Date', 'Buffer', 'boolean', 'object']);

/**
 * 将 Oracle 数据类型映射为 JavaScript 类型
 * @param {string} oracleType - Oracle 数据类型
 * @returns {string} JavaScript 类型
 */
export function mapOracleType(oracleType) {
  if (!oracleType) {
    return 'object';
  }
  
  // 提取基础类型（去除长度、精度等信息）
  const baseType = oracleType.toUpperCase().split('(')[0].trim();
  
  // 处理 TIMESTAMP 变体
  if (baseType.startsWith('TIMESTAMP')) {
    return 'Date';
  }
  
  // 查找映射
  const jsType = TYPE_MAPPING[baseType];
  
  // 返回映射结果或默认值
  return jsType || 'object';
}

/**
 * 验证映射结果是否在有效类型集合中
 * @param {string} jsType - JavaScript 类型
 * @returns {boolean}
 */
export function isValidJsType(jsType) {
  return VALID_JS_TYPES.has(jsType);
}

/**
 * 查询表结构的 SQL
 */
const TABLE_COLUMNS_SQL = `
  SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    NULLABLE,
    DATA_LENGTH,
    DATA_PRECISION,
    DATA_SCALE,
    COLUMN_ID
  FROM USER_TAB_COLUMNS
  WHERE TABLE_NAME = :tableName
  ORDER BY COLUMN_ID
`;

/**
 * 查询主键的 SQL
 */
const PRIMARY_KEY_SQL = `
  SELECT cols.COLUMN_NAME
  FROM USER_CONSTRAINTS cons
  JOIN USER_CONS_COLUMNS cols ON cons.CONSTRAINT_NAME = cols.CONSTRAINT_NAME
  WHERE cons.TABLE_NAME = :tableName
    AND cons.CONSTRAINT_TYPE = 'P'
  ORDER BY cols.POSITION
`;

/**
 * 查询外键的 SQL
 */
const FOREIGN_KEY_SQL = `
  SELECT 
    cols.COLUMN_NAME,
    r_cons.TABLE_NAME AS REF_TABLE,
    r_cols.COLUMN_NAME AS REF_COLUMN
  FROM USER_CONSTRAINTS cons
  JOIN USER_CONS_COLUMNS cols ON cons.CONSTRAINT_NAME = cols.CONSTRAINT_NAME
  JOIN USER_CONSTRAINTS r_cons ON cons.R_CONSTRAINT_NAME = r_cons.CONSTRAINT_NAME
  JOIN USER_CONS_COLUMNS r_cols ON r_cons.CONSTRAINT_NAME = r_cols.CONSTRAINT_NAME
  WHERE cons.TABLE_NAME = :tableName
    AND cons.CONSTRAINT_TYPE = 'R'
`;

/**
 * 检查表是否存在的 SQL
 */
const TABLE_EXISTS_SQL = `
  SELECT COUNT(*) AS CNT FROM USER_TABLES WHERE TABLE_NAME = :tableName
`;

/**
 * 获取表结构信息
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} tableName - 表名
 * @returns {Promise<Object>} 表结构对象
 */
export async function getTableSchema(conn, tableName) {
  const upperTableName = tableName.toUpperCase();
  
  // 检查表是否存在
  const existsResult = await conn.execute(TABLE_EXISTS_SQL, { tableName: upperTableName });
  if (existsResult.rows[0][0] === 0) {
    throw new OracleMapError(
      ErrorCode.TABLE_NOT_FOUND,
      `表 ${tableName} 不存在`,
      { suggestion: '请检查表名是否正确，注意 Oracle 表名默认为大写' }
    );
  }
  
  // 查询列信息
  const columnsResult = await conn.execute(TABLE_COLUMNS_SQL, { tableName: upperTableName });
  const columns = columnsResult.rows.map(row => ({
    name: row[0],
    oracleType: row[1],
    jsType: mapOracleType(row[1]),
    nullable: row[2] === 'Y',
    length: row[3],
    precision: row[4],
    scale: row[5]
  }));
  
  // 查询主键
  const pkResult = await conn.execute(PRIMARY_KEY_SQL, { tableName: upperTableName });
  const primaryKey = pkResult.rows.map(row => row[0]);
  
  // 查询外键
  const fkResult = await conn.execute(FOREIGN_KEY_SQL, { tableName: upperTableName });
  const foreignKeys = fkResult.rows.map(row => ({
    column: row[0],
    refTable: row[1],
    refColumn: row[2]
  }));
  
  return {
    tableName: upperTableName,
    columns,
    primaryKey,
    foreignKeys
  };
}

/**
 * 获取相似表名建议
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} tableName - 表名
 * @returns {Promise<string[]>}
 */
export async function getSimilarTables(conn, tableName) {
  const sql = `
    SELECT TABLE_NAME 
    FROM USER_TABLES 
    WHERE TABLE_NAME LIKE :pattern
    ORDER BY TABLE_NAME
    FETCH FIRST 5 ROWS ONLY
  `;
  
  const pattern = `%${tableName.toUpperCase()}%`;
  const result = await conn.execute(sql, { pattern });
  return result.rows.map(row => row[0]);
}

/**
 * 读取 LOB 数据为字符串
 * @param {*} lob - LOB 对象或字符串
 * @returns {Promise<string>}
 */
async function lobToString(lob) {
  if (typeof lob === 'string') {
    return lob;
  }
  if (lob === null || lob === undefined) {
    return '';
  }
  // 如果是 LOB 对象，读取内容
  if (typeof lob.getData === 'function') {
    return await lob.getData();
  }
  if (typeof lob.toString === 'function') {
    return lob.toString();
  }
  return String(lob);
}

/**
 * 获取表的 DDL 语句
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} tableName - 表名
 * @param {string} objectType - 对象类型 (TABLE, VIEW, INDEX 等)
 * @returns {Promise<string>}
 */
export async function getObjectDDL(conn, tableName, objectType = 'TABLE') {
  const upperTableName = tableName.toUpperCase();
  const upperType = objectType.toUpperCase();
  
  // 检查白名单
  if (upperType === 'TABLE' || upperType === 'VIEW') {
    const access = checkTableAccess(upperTableName);
    if (!access.allowed) {
      throw new OracleMapError(ErrorCode.ACCESS_DENIED, access.message);
    }
  }
  
  try {
    // 使用 TO_CHAR 截取 DDL 的前 4000 字符，避免 CLOB 处理问题
    // 对于大多数表，4000 字符足够显示完整 DDL
    const result = await conn.execute(
      `SELECT DBMS_METADATA.GET_DDL(:objectType, :objectName) AS DDL_TEXT FROM DUAL`,
      { objectType: upperType, objectName: upperTableName }
    );
    
    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0];
      const lobValue = Array.isArray(row) ? row[0] : row;
      const ddl = await lobToString(lobValue);
      return ddl;
    }
    throw new OracleMapError(
      ErrorCode.TABLE_NOT_FOUND,
      `无法获取 ${objectType} ${tableName} 的 DDL`
    );
  } catch (error) {
    if (error instanceof OracleMapError) throw error;
    throw new OracleMapError(
      ErrorCode.QUERY_EXECUTION_ERROR,
      `获取 DDL 失败: ${error.message}`
    );
  }
}

/**
 * 获取表的关系图（父表和子表）
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} tableName - 中心表名
 * @returns {Promise<Object>}
 */
export async function getSchemaGraph(conn, tableName) {
  const upperTableName = tableName.toUpperCase();
  
  // 检查白名单
  const access = checkTableAccess(upperTableName);
  if (!access.allowed) {
    throw new OracleMapError(ErrorCode.ACCESS_DENIED, access.message);
  }
  
  // 查询引用的父表（当前表的外键指向的表）
  const parentsSql = `
    SELECT DISTINCT
      r_cons.TABLE_NAME AS PARENT_TABLE,
      cols.COLUMN_NAME AS FK_COLUMN,
      r_cols.COLUMN_NAME AS PK_COLUMN,
      cons.CONSTRAINT_NAME
    FROM USER_CONSTRAINTS cons
    JOIN USER_CONS_COLUMNS cols ON cons.CONSTRAINT_NAME = cols.CONSTRAINT_NAME
    JOIN USER_CONSTRAINTS r_cons ON cons.R_CONSTRAINT_NAME = r_cons.CONSTRAINT_NAME
    JOIN USER_CONS_COLUMNS r_cols ON r_cons.CONSTRAINT_NAME = r_cols.CONSTRAINT_NAME
    WHERE cons.TABLE_NAME = :tableName
      AND cons.CONSTRAINT_TYPE = 'R'
  `;
  
  // 查询引用当前表的子表（其他表的外键指向当前表）
  const childrenSql = `
    SELECT DISTINCT
      cons.TABLE_NAME AS CHILD_TABLE,
      cols.COLUMN_NAME AS FK_COLUMN,
      r_cols.COLUMN_NAME AS PK_COLUMN,
      cons.CONSTRAINT_NAME
    FROM USER_CONSTRAINTS cons
    JOIN USER_CONS_COLUMNS cols ON cons.CONSTRAINT_NAME = cols.CONSTRAINT_NAME
    JOIN USER_CONSTRAINTS r_cons ON cons.R_CONSTRAINT_NAME = r_cons.CONSTRAINT_NAME
    JOIN USER_CONS_COLUMNS r_cols ON r_cons.CONSTRAINT_NAME = r_cols.CONSTRAINT_NAME
    WHERE r_cons.TABLE_NAME = :tableName
      AND cons.CONSTRAINT_TYPE = 'R'
  `;
  
  const [parentsResult, childrenResult] = await Promise.all([
    conn.execute(parentsSql, { tableName: upperTableName }),
    conn.execute(childrenSql, { tableName: upperTableName })
  ]);
  
  const parents = parentsResult.rows.map(row => ({
    table: row[0],
    fkColumn: row[1],
    pkColumn: row[2],
    constraint: row[3]
  }));
  
  const children = childrenResult.rows.map(row => ({
    table: row[0],
    fkColumn: row[1],
    pkColumn: row[2],
    constraint: row[3]
  }));
  
  return {
    centerTable: upperTableName,
    parents,
    children,
    totalRelations: parents.length + children.length
  };
}

/**
 * 列出数据库对象（表、视图、存储过程等）
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} objectType - 对象类型: TABLE, VIEW, PROCEDURE, FUNCTION, PACKAGE, ALL
 * @returns {Promise<Array>}
 */
export async function listObjects(conn, objectType = 'ALL') {
  const upperType = objectType.toUpperCase();
  
  let sql;
  if (upperType === 'ALL') {
    sql = `
      SELECT OBJECT_NAME, OBJECT_TYPE, STATUS, CREATED, LAST_DDL_TIME
      FROM USER_OBJECTS
      WHERE OBJECT_TYPE IN ('TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'PACKAGE')
      ORDER BY OBJECT_TYPE, OBJECT_NAME
    `;
  } else if (upperType === 'TABLE') {
    sql = `
      SELECT TABLE_NAME AS OBJECT_NAME, 'TABLE' AS OBJECT_TYPE, 'VALID' AS STATUS, 
             NULL AS CREATED, NULL AS LAST_DDL_TIME, NUM_ROWS, LAST_ANALYZED
      FROM USER_TABLES
      ORDER BY TABLE_NAME
    `;
  } else if (upperType === 'VIEW') {
    sql = `
      SELECT VIEW_NAME AS OBJECT_NAME, 'VIEW' AS OBJECT_TYPE, 
             CASE WHEN TEXT IS NOT NULL THEN 'VALID' ELSE 'INVALID' END AS STATUS,
             NULL AS CREATED, NULL AS LAST_DDL_TIME
      FROM USER_VIEWS
      ORDER BY VIEW_NAME
    `;
  } else {
    sql = `
      SELECT OBJECT_NAME, OBJECT_TYPE, STATUS, CREATED, LAST_DDL_TIME
      FROM USER_OBJECTS
      WHERE OBJECT_TYPE = :objectType
      ORDER BY OBJECT_NAME
    `;
  }
  
  const binds = upperType !== 'ALL' && upperType !== 'TABLE' && upperType !== 'VIEW' 
    ? { objectType: upperType } 
    : {};
  
  const result = await conn.execute(sql, binds, { outFormat: 4002 });
  return result.rows;
}

/**
 * 获取存储过程/函数的参数签名
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} procedureName - 过程/函数名
 * @returns {Promise<Object>}
 */
export async function describeProcedure(conn, procedureName) {
  const upperName = procedureName.toUpperCase();
  
  // 获取对象类型
  const typeSql = `
    SELECT OBJECT_TYPE FROM USER_OBJECTS 
    WHERE OBJECT_NAME = :name AND OBJECT_TYPE IN ('PROCEDURE', 'FUNCTION')
  `;
  const typeResult = await conn.execute(typeSql, { name: upperName });
  
  if (!typeResult.rows || typeResult.rows.length === 0) {
    throw new OracleMapError(
      ErrorCode.TABLE_NOT_FOUND,
      `存储过程/函数 ${procedureName} 不存在`
    );
  }
  
  const objectType = typeResult.rows[0][0];
  
  // 获取参数信息
  const paramsSql = `
    SELECT 
      ARGUMENT_NAME,
      POSITION,
      DATA_TYPE,
      IN_OUT,
      DATA_LENGTH,
      DATA_PRECISION,
      DATA_SCALE,
      DEFAULT_VALUE
    FROM USER_ARGUMENTS
    WHERE OBJECT_NAME = :name
    ORDER BY POSITION
  `;
  
  const paramsResult = await conn.execute(paramsSql, { name: upperName });
  
  const parameters = paramsResult.rows.map(row => ({
    name: row[0],
    position: row[1],
    dataType: row[2],
    direction: row[3], // IN, OUT, IN/OUT
    length: row[4],
    precision: row[5],
    scale: row[6],
    defaultValue: row[7]
  }));
  
  // 获取源代码（可选）
  let sourceCode = null;
  try {
    const sourceSql = `
      SELECT TEXT FROM USER_SOURCE 
      WHERE NAME = :name AND TYPE = :type
      ORDER BY LINE
    `;
    const sourceResult = await conn.execute(sourceSql, { name: upperName, type: objectType });
    if (sourceResult.rows && sourceResult.rows.length > 0) {
      sourceCode = sourceResult.rows.map(row => row[0]).join('');
    }
  } catch {
    // 忽略源代码获取失败
  }
  
  return {
    name: upperName,
    type: objectType,
    parameters,
    sourceCode
  };
}

/**
 * 获取表的采样数据
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} tableName - 表名
 * @param {number} sampleSize - 采样行数
 * @returns {Promise<Array>}
 */
export async function getSampleData(conn, tableName, sampleSize = 3) {
  const upperTableName = tableName.toUpperCase();
  
  // 检查白名单
  const access = checkTableAccess(upperTableName);
  if (!access.allowed) {
    throw new OracleMapError(ErrorCode.ACCESS_DENIED, access.message);
  }
  
  const sql = `SELECT * FROM ${upperTableName} FETCH FIRST :sampleSize ROWS ONLY`;
  const result = await conn.execute(sql, { sampleSize }, { outFormat: 4002 });
  
  return result.rows || [];
}

/**
 * 获取表结构信息（增强版，支持采样数据）
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} tableName - 表名
 * @param {Object} options - 选项
 * @returns {Promise<Object>}
 */
export async function getTableSchemaEnhanced(conn, tableName, options = {}) {
  const { includeSample = false, sampleSize = 3 } = options;
  
  // 获取基础结构
  const schema = await getTableSchema(conn, tableName);
  
  // 如果需要采样数据
  if (includeSample) {
    schema.sampleData = await getSampleData(conn, tableName, sampleSize);
  }
  
  return schema;
}

/**
 * 搜索元数据（表注释、列注释、视图定义）
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} keyword - 搜索关键词
 * @param {Object} options - 搜索选项
 * @returns {Promise<Object>}
 */
export async function searchMetadata(conn, keyword, options = {}) {
  const { searchTables = true, searchColumns = true, searchViews = true, limit = 50 } = options;
  const pattern = `%${keyword.toUpperCase()}%`;
  const results = { tables: [], columns: [], views: [] };

  // 搜索表注释
  if (searchTables) {
    const tablesSql = `
      SELECT t.TABLE_NAME, c.COMMENTS, t.NUM_ROWS
      FROM USER_TABLES t
      LEFT JOIN USER_TAB_COMMENTS c ON t.TABLE_NAME = c.TABLE_NAME
      WHERE UPPER(t.TABLE_NAME) LIKE :pattern
         OR UPPER(c.COMMENTS) LIKE :pattern
      ORDER BY t.TABLE_NAME
      FETCH FIRST :limit ROWS ONLY
    `;
    const tablesResult = await conn.execute(tablesSql, { pattern, limit });
    results.tables = tablesResult.rows.map(row => ({
      tableName: row[0],
      comment: row[1],
      rowCount: row[2]
    }));
  }

  // 搜索列注释
  if (searchColumns) {
    const columnsSql = `
      SELECT c.TABLE_NAME, c.COLUMN_NAME, cc.COMMENTS, c.DATA_TYPE
      FROM USER_TAB_COLUMNS c
      LEFT JOIN USER_COL_COMMENTS cc ON c.TABLE_NAME = cc.TABLE_NAME AND c.COLUMN_NAME = cc.COLUMN_NAME
      WHERE UPPER(c.COLUMN_NAME) LIKE :pattern
         OR UPPER(cc.COMMENTS) LIKE :pattern
      ORDER BY c.TABLE_NAME, c.COLUMN_ID
      FETCH FIRST :limit ROWS ONLY
    `;
    const columnsResult = await conn.execute(columnsSql, { pattern, limit });
    results.columns = columnsResult.rows.map(row => ({
      tableName: row[0],
      columnName: row[1],
      comment: row[2],
      dataType: row[3]
    }));
  }

  // 搜索视图定义
  if (searchViews) {
    const viewsSql = `
      SELECT v.VIEW_NAME, c.COMMENTS, DBMS_LOB.SUBSTR(v.TEXT, 500, 1) AS TEXT_PREVIEW
      FROM USER_VIEWS v
      LEFT JOIN USER_TAB_COMMENTS c ON v.VIEW_NAME = c.TABLE_NAME
      WHERE UPPER(v.VIEW_NAME) LIKE :pattern
         OR UPPER(c.COMMENTS) LIKE :pattern
         OR UPPER(v.TEXT) LIKE :pattern
      ORDER BY v.VIEW_NAME
      FETCH FIRST :limit ROWS ONLY
    `;
    try {
      const viewsResult = await conn.execute(viewsSql, { pattern, limit });
      results.views = viewsResult.rows.map(row => ({
        viewName: row[0],
        comment: row[1],
        textPreview: row[2]
      }));
    } catch {
      // 视图搜索失败时忽略（可能是 DBMS_LOB 权限问题）
    }
  }

  return {
    keyword,
    totalMatches: results.tables.length + results.columns.length + results.views.length,
    ...results
  };
}

/**
 * 获取列统计信息
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} tableName - 表名
 * @param {string} columnName - 列名（可选，不传则统计所有列）
 * @param {Object} options - 统计选项
 * @returns {Promise<Object>}
 */
export async function getColumnStats(conn, tableName, columnName = null, options = {}) {
  const { topN = 10, includeHistogram = true } = options;
  const upperTableName = tableName.toUpperCase();
  
  // 检查白名单
  const access = checkTableAccess(upperTableName);
  if (!access.allowed) {
    throw new OracleMapError(ErrorCode.ACCESS_DENIED, access.message);
  }

  // 获取列信息
  let columnsSql = `
    SELECT COLUMN_NAME, DATA_TYPE, NULLABLE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE
    FROM USER_TAB_COLUMNS
    WHERE TABLE_NAME = :tableName
  `;
  const binds = { tableName: upperTableName };
  
  if (columnName) {
    columnsSql += ` AND COLUMN_NAME = :columnName`;
    binds.columnName = columnName.toUpperCase();
  }
  columnsSql += ` ORDER BY COLUMN_ID`;

  const columnsResult = await conn.execute(columnsSql, binds);
  
  if (columnsResult.rows.length === 0) {
    throw new OracleMapError(
      ErrorCode.TABLE_NOT_FOUND,
      columnName ? `列 ${columnName} 不存在于表 ${tableName}` : `表 ${tableName} 不存在`
    );
  }

  const stats = [];

  for (const row of columnsResult.rows) {
    const colName = row[0];
    const dataType = row[1];
    const nullable = row[2] === 'Y';
    
    const colStats = {
      columnName: colName,
      dataType,
      nullable
    };

    // 基础统计：总行数、NULL 数、非空数、唯一值数
    const basicStatsSql = `
      SELECT 
        COUNT(*) AS total_count,
        COUNT("${colName}") AS non_null_count,
        COUNT(*) - COUNT("${colName}") AS null_count,
        COUNT(DISTINCT "${colName}") AS distinct_count
      FROM ${upperTableName}
    `;
    
    try {
      const basicResult = await conn.execute(basicStatsSql);
      const [totalCount, nonNullCount, nullCount, distinctCount] = basicResult.rows[0];
      colStats.totalCount = totalCount;
      colStats.nonNullCount = nonNullCount;
      colStats.nullCount = nullCount;
      colStats.nullRatio = totalCount > 0 ? (nullCount / totalCount * 100).toFixed(2) + '%' : '0%';
      colStats.distinctCount = distinctCount;
      colStats.cardinality = totalCount > 0 ? (distinctCount / totalCount * 100).toFixed(2) + '%' : '0%';

      // 数值类型：计算 Min/Max/Avg/Median/StdDev
      if (['NUMBER', 'INTEGER', 'INT', 'FLOAT', 'BINARY_FLOAT', 'BINARY_DOUBLE'].includes(dataType)) {
        const numStatsSql = `
          SELECT 
            MIN("${colName}") AS min_val,
            MAX("${colName}") AS max_val,
            AVG("${colName}") AS avg_val,
            MEDIAN("${colName}") AS median_val,
            STDDEV("${colName}") AS stddev_val,
            SUM(CASE WHEN "${colName}" = 0 THEN 1 ELSE 0 END) AS zero_count
          FROM ${upperTableName}
        `;
        const numResult = await conn.execute(numStatsSql);
        const [minVal, maxVal, avgVal, medianVal, stddevVal, zeroCount] = numResult.rows[0];
        colStats.numericStats = {
          min: minVal,
          max: maxVal,
          avg: avgVal !== null ? Number(avgVal.toFixed(4)) : null,
          median: medianVal,
          stddev: stddevVal !== null ? Number(stddevVal.toFixed(4)) : null,
          zeroCount,
          zeroRatio: totalCount > 0 ? (zeroCount / totalCount * 100).toFixed(2) + '%' : '0%'
        };
      }

      // 字符串/类别类型：Top N 频繁值
      if (includeHistogram && distinctCount <= 1000) {
        const topNSql = `
          SELECT "${colName}" AS val, COUNT(*) AS cnt
          FROM ${upperTableName}
          WHERE "${colName}" IS NOT NULL
          GROUP BY "${colName}"
          ORDER BY cnt DESC
          FETCH FIRST :topN ROWS ONLY
        `;
        const topNResult = await conn.execute(topNSql, { topN });
        colStats.topValues = topNResult.rows.map(r => ({
          value: r[0],
          count: r[1],
          ratio: totalCount > 0 ? (r[1] / totalCount * 100).toFixed(2) + '%' : '0%'
        }));
      }

      // 日期类型：Min/Max
      if (['DATE', 'TIMESTAMP'].some(t => dataType.startsWith(t))) {
        const dateStatsSql = `
          SELECT MIN("${colName}") AS min_date, MAX("${colName}") AS max_date
          FROM ${upperTableName}
        `;
        const dateResult = await conn.execute(dateStatsSql);
        colStats.dateStats = {
          minDate: dateResult.rows[0][0],
          maxDate: dateResult.rows[0][1]
        };
      }

    } catch (error) {
      colStats.error = `统计失败: ${error.message}`;
    }

    stats.push(colStats);
  }

  return {
    tableName: upperTableName,
    columnCount: stats.length,
    columns: stats
  };
}
