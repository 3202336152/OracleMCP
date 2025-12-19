import { OracleMapError, ErrorCode } from '../utils/errors.js';
import { mapQueryResult } from '../mapper/data.js';
import { checkTableAccess, enforceRowLimit, MAX_ROWS_LIMIT, validateDmlSql } from '../config/security.js';

/**
 * 构建分页 SQL
 * 使用 Oracle 12c+ 的 OFFSET/FETCH 语法
 * @param {string} baseSql - 基础 SQL
 * @param {number} [limit] - 限制行数
 * @param {number} [offset] - 跳过行数
 * @returns {string}
 */
export function buildPaginatedSql(baseSql, limit, offset) {
  let sql = baseSql.trim();
  
  // 移除末尾的分号
  if (sql.endsWith(';')) {
    sql = sql.slice(0, -1);
  }
  
  const parts = [];
  
  // 添加 OFFSET 子句
  if (offset !== undefined && offset !== null && offset > 0) {
    parts.push(`OFFSET ${offset} ROWS`);
  }
  
  // 添加 FETCH 子句
  if (limit !== undefined && limit !== null && limit > 0) {
    if (parts.length === 0) {
      parts.push('OFFSET 0 ROWS');
    }
    parts.push(`FETCH NEXT ${limit} ROWS ONLY`);
  }
  
  if (parts.length > 0) {
    sql = `${sql} ${parts.join(' ')}`;
  }
  
  return sql;
}

/**
 * 构建表查询 SQL
 * @param {string} tableName - 表名
 * @param {Object} [options] - 查询选项
 * @returns {string}
 */
export function buildTableQuerySql(tableName, options = {}) {
  const { limit, offset } = options;
  const baseSql = `SELECT * FROM ${tableName.toUpperCase()}`;
  return buildPaginatedSql(baseSql, limit, offset);
}

/**
 * 验证 SQL 语句（基础验证）
 * @param {string} sql - SQL 语句
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateSql(sql) {
  if (!sql || typeof sql !== 'string') {
    return { valid: false, error: 'SQL 语句不能为空' };
  }
  
  const trimmedSql = sql.trim().toUpperCase();
  
  // 只允许 SELECT 语句
  if (!trimmedSql.startsWith('SELECT')) {
    return { valid: false, error: '只支持 SELECT 查询语句' };
  }
  
  // 检查危险关键字
  const dangerousKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE', 'ALTER', 'CREATE'];
  for (const keyword of dangerousKeywords) {
    // 检查是否作为独立关键字出现（前后有空格或在开头/结尾）
    const regex = new RegExp(`(^|\\s)${keyword}(\\s|$)`, 'i');
    if (regex.test(sql)) {
      return { valid: false, error: `不允许使用 ${keyword} 关键字` };
    }
  }
  
  return { valid: true, error: null };
}

/**
 * 执行查询并映射结果
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} sql - SQL 语句
 * @param {Object} [options] - 查询选项
 * @returns {Promise<Object>}
 */
export async function executeQuery(conn, sql, options = {}) {
  const { binds = {}, limit, offset } = options;
  
  // 验证 SQL
  const validation = validateSql(sql);
  if (!validation.valid) {
    throw new OracleMapError(
      ErrorCode.SQL_SYNTAX_ERROR,
      validation.error
    );
  }
  
  // 强制限制行数在安全范围内
  const safeLimit = enforceRowLimit(limit);
  
  // 构建分页 SQL
  const paginatedSql = buildPaginatedSql(sql, safeLimit, offset);
  
  const startTime = Date.now();
  
  try {
    // oracledb 6.x: OUT_FORMAT_ARRAY = 4001, OUT_FORMAT_OBJECT = 4002
    // 使用 OUT_FORMAT_OBJECT 让 oracledb 直接返回对象格式，避免手动映射
    const result = await conn.execute(paginatedSql, binds, {
      outFormat: 4002, // oracledb.OUT_FORMAT_OBJECT
      // LOB 处理：自动将 CLOB 转为字符串，设置截断长度
      fetchInfo: {
        // 通配符处理所有 CLOB 列
      },
      // 设置 LOB 自动获取为字符串
      fetchAsString: [2017], // 2017 = oracledb.CLOB
      fetchAsBuffer: [2019], // 2019 = oracledb.BLOB
      maxRows: safeLimit
    });
    
    const executionTime = Date.now() - startTime;
    const mappedResult = mapQueryResult(result);
    
    // 添加限制信息
    const limitInfo = limit > MAX_ROWS_LIMIT 
      ? { warning: `请求的行数 ${limit} 超过最大限制 ${MAX_ROWS_LIMIT}，已自动限制` }
      : {};
    
    return {
      ...mappedResult,
      ...limitInfo,
      executionTime,
      sql: paginatedSql
    };
  } catch (error) {
    throw handleQueryError(error, paginatedSql);
  }
}

/**
 * 查询表数据
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} tableName - 表名
 * @param {Object} [options] - 分页选项
 * @returns {Promise<Object>}
 */
export async function queryTable(conn, tableName, options = {}) {
  // 检查表白名单
  const access = checkTableAccess(tableName);
  if (!access.allowed) {
    throw new OracleMapError(ErrorCode.ACCESS_DENIED, access.message);
  }
  
  // 强制限制行数
  const safeOptions = {
    ...options,
    limit: enforceRowLimit(options.limit)
  };
  
  const sql = buildTableQuerySql(tableName, safeOptions);
  
  try {
    return await executeQuery(conn, sql, {});
  } catch (error) {
    // 检查是否为表不存在错误
    if (error.message && error.message.includes('ORA-00942')) {
      throw new OracleMapError(
        ErrorCode.TABLE_NOT_FOUND,
        `表 ${tableName} 不存在或无权访问`,
        { suggestion: '请检查表名是否正确，注意 Oracle 表名默认为大写' }
      );
    }
    throw error;
  }
}

/**
 * 处理查询错误
 * @param {Error} error - 原始错误
 * @param {string} sql - 执行的 SQL
 * @returns {OracleMapError}
 */
function handleQueryError(error, sql) {
  const oraError = error.message || '';
  
  // ORA-00942: 表或视图不存在
  if (oraError.includes('ORA-00942')) {
    return new OracleMapError(
      ErrorCode.TABLE_NOT_FOUND,
      '表或视图不存在',
      { oracleError: oraError, sql }
    );
  }
  
  // ORA-00904: 无效的标识符
  if (oraError.includes('ORA-00904')) {
    return new OracleMapError(
      ErrorCode.SQL_SYNTAX_ERROR,
      '无效的列名或标识符',
      { oracleError: oraError, sql }
    );
  }
  
  // ORA-00933: SQL 命令未正确结束
  if (oraError.includes('ORA-00933')) {
    return new OracleMapError(
      ErrorCode.SQL_SYNTAX_ERROR,
      'SQL 语法错误',
      { oracleError: oraError, sql }
    );
  }
  
  // 其他查询错误
  return new OracleMapError(
    ErrorCode.QUERY_EXECUTION_ERROR,
    `查询执行失败: ${oraError}`,
    { oracleError: oraError, sql }
  );
}

/**
 * 获取表的行数
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} tableName - 表名
 * @returns {Promise<number>}
 */
export async function getTableRowCount(conn, tableName) {
  const sql = `SELECT COUNT(*) AS CNT FROM ${tableName.toUpperCase()}`;
  const result = await conn.execute(sql);
  return result.rows[0][0];
}

/**
 * 构建 Flashback Query SQL（AS OF TIMESTAMP）
 * @param {string} baseSql - 基础 SQL
 * @param {string} asOfTimestamp - ISO 8601 时间戳
 * @returns {string}
 */
export function buildFlashbackSql(baseSql, asOfTimestamp) {
  if (!asOfTimestamp) {
    return baseSql;
  }
  
  // 解析 ISO 时间戳并转换为 Oracle TIMESTAMP 格式
  // 支持格式: 2024-01-15T14:30:00Z 或 2024-01-15T14:30:00.000Z
  const timestamp = asOfTimestamp.replace('T', ' ').replace('Z', '').split('.')[0];
  
  // 在 FROM 子句后注入 AS OF TIMESTAMP
  // 简单实现：在第一个 FROM 后的表名后添加
  const fromRegex = /\bFROM\s+(\w+)/i;
  const match = baseSql.match(fromRegex);
  
  if (match) {
    const tableName = match[1];
    const flashbackClause = `${tableName} AS OF TIMESTAMP TO_TIMESTAMP('${timestamp}', 'YYYY-MM-DD HH24:MI:SS')`;
    return baseSql.replace(fromRegex, `FROM ${flashbackClause}`);
  }
  
  return baseSql;
}

/**
 * 执行 Flashback Query（历史数据查询）
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} sql - SQL 语句
 * @param {Object} options - 查询选项
 * @returns {Promise<Object>}
 */
export async function executeFlashbackQuery(conn, sql, options = {}) {
  const { asOfTimestamp, limit, offset, binds = {} } = options;
  
  // 验证 SQL
  const validation = validateSql(sql);
  if (!validation.valid) {
    throw new OracleMapError(ErrorCode.SQL_SYNTAX_ERROR, validation.error);
  }
  
  // 构建 Flashback SQL
  let flashbackSql = buildFlashbackSql(sql, asOfTimestamp);
  
  // 添加分页
  const safeLimit = enforceRowLimit(limit);
  flashbackSql = buildPaginatedSql(flashbackSql, safeLimit, offset);
  
  const startTime = Date.now();
  
  try {
    const result = await conn.execute(flashbackSql, binds, {
      outFormat: 4002,
      fetchAsString: [2017],
      fetchAsBuffer: [2019],
      maxRows: safeLimit
    });
    
    const executionTime = Date.now() - startTime;
    const mappedResult = mapQueryResult(result);
    
    return {
      ...mappedResult,
      executionTime,
      sql: flashbackSql,
      asOfTimestamp
    };
  } catch (error) {
    // 处理 Flashback 特有错误
    const oraError = error.message || '';
    
    if (oraError.includes('ORA-01555')) {
      throw new OracleMapError(
        ErrorCode.QUERY_EXECUTION_ERROR,
        'Flashback 数据已过期（UNDO 数据不足）',
        { oracleError: oraError, suggestion: '请尝试更近的时间点，或联系 DBA 增加 UNDO_RETENTION' }
      );
    }
    
    if (oraError.includes('ORA-08180')) {
      throw new OracleMapError(
        ErrorCode.QUERY_EXECUTION_ERROR,
        '没有 Flashback 权限',
        { oracleError: oraError, suggestion: '需要 FLASHBACK 权限才能查询历史数据' }
      );
    }
    
    throw handleQueryError(error, flashbackSql);
  }
}

/**
 * 获取 SQL 执行计划
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} sql - 要分析的 SQL 语句
 * @param {Object} options - 选项
 * @returns {Promise<Object>}
 */
export async function getExplainPlan(conn, sql, options = {}) {
  const { format = 'TYPICAL' } = options; // BASIC, TYPICAL, ALL
  
  // 验证 SQL
  const validation = validateSql(sql);
  if (!validation.valid) {
    throw new OracleMapError(ErrorCode.SQL_SYNTAX_ERROR, validation.error);
  }
  
  // 生成唯一的 statement_id
  const statementId = `MCP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // 执行 EXPLAIN PLAN
    await conn.execute(`EXPLAIN PLAN SET STATEMENT_ID = '${statementId}' FOR ${sql}`);
    
    // 获取执行计划
    const planSql = `SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', '${statementId}', '${format}'))`;
    const planResult = await conn.execute(planSql);
    
    // 解析执行计划文本
    const planLines = planResult.rows.map(row => row[0]);
    const planText = planLines.join('\n');
    
    // 分析执行计划，提取关键信息
    const analysis = analyzePlan(planLines);
    
    // 清理 PLAN_TABLE
    try {
      await conn.execute(`DELETE FROM PLAN_TABLE WHERE STATEMENT_ID = '${statementId}'`);
      await conn.execute('COMMIT');
    } catch {
      // 忽略清理错误
    }
    
    return {
      sql,
      planText,
      analysis,
      format
    };
  } catch (error) {
    const oraError = error.message || '';
    
    if (oraError.includes('ORA-00942') && oraError.includes('PLAN_TABLE')) {
      throw new OracleMapError(
        ErrorCode.QUERY_EXECUTION_ERROR,
        'PLAN_TABLE 不存在',
        { suggestion: '请联系 DBA 创建 PLAN_TABLE 或执行 @?/rdbms/admin/utlxplan.sql' }
      );
    }
    
    throw new OracleMapError(
      ErrorCode.QUERY_EXECUTION_ERROR,
      `获取执行计划失败: ${oraError}`,
      { sql }
    );
  }
}

/**
 * 执行 DML 语句（INSERT/UPDATE）
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} sql - DML 语句
 * @param {Object} [options] - 执行选项
 * @returns {Promise<Object>}
 */
export async function executeDml(conn, sql, options = {}) {
  const { binds = {} } = options;
  
  // 验证 SQL 安全性
  const validation = validateDmlSql(sql);
  if (!validation.valid) {
    throw new OracleMapError(
      ErrorCode.SQL_SYNTAX_ERROR,
      validation.error
    );
  }
  
  const startTime = Date.now();
  
  try {
    // 执行 DML，不自动提交
    const result = await conn.execute(sql, binds, { autoCommit: false });
    
    // 提交事务
    await conn.execute('COMMIT');
    
    const executionTime = Date.now() - startTime;
    
    return {
      success: true,
      verb: validation.verb,
      rowsAffected: result.rowsAffected || 0,
      executionTime,
      sql
    };
  } catch (error) {
    // 回滚事务
    try {
      await conn.execute('ROLLBACK');
    } catch {
      // 忽略回滚错误
    }
    
    throw handleDmlError(error, sql);
  }
}

/**
 * 特殊值标记（用于 SQL 表达式如 SYSDATE）
 */
const SQL_EXPRESSION_MARKERS = ['SYSDATE', 'SYSTIMESTAMP', 'NULL', 'CURRENT_DATE', 'CURRENT_TIMESTAMP'];

/**
 * 处理插入数据的值，支持多种类型
 * @param {any} value - 原始值
 * @param {string} columnName - 列名（用于错误提示）
 * @returns {{ value: any, isExpression: boolean, expression: string|null }}
 */
function processInsertValue(value, columnName) {
  // null 值直接返回
  if (value === null || value === undefined) {
    return { value: null, isExpression: false, expression: null };
  }
  
  // 字符串类型：检查是否为 SQL 表达式
  if (typeof value === 'string') {
    const upperValue = value.trim().toUpperCase();
    if (SQL_EXPRESSION_MARKERS.includes(upperValue)) {
      return { value: null, isExpression: true, expression: upperValue };
    }
    return { value: value, isExpression: false, expression: null };
  }
  
  // 对象类型：处理特殊格式
  if (typeof value === 'object') {
    // 格式1: { "$date": "2025-12-19" } 或 { "$date": "2025-12-19T10:30:00" }
    if (value.$date) {
      const dateStr = value.$date;
      // 返回 Date 对象，oracledb 会自动处理
      return { value: new Date(dateStr), isExpression: false, expression: null };
    }
    
    // 格式2: { "$expr": "SYSDATE" } - 直接使用 SQL 表达式
    if (value.$expr) {
      const expr = value.$expr.trim().toUpperCase();
      // 安全检查：只允许特定表达式
      if (SQL_EXPRESSION_MARKERS.includes(expr)) {
        return { value: null, isExpression: true, expression: expr };
      }
      throw new OracleMapError(
        ErrorCode.SQL_SYNTAX_ERROR,
        `不支持的 SQL 表达式: ${value.$expr}，允许的表达式: ${SQL_EXPRESSION_MARKERS.join(', ')}`
      );
    }
    
    // 格式3: { "$timestamp": "2025-12-19 10:30:00" }
    if (value.$timestamp) {
      return { value: new Date(value.$timestamp), isExpression: false, expression: null };
    }
    
    // 其他对象：尝试 JSON 序列化
    return { value: JSON.stringify(value), isExpression: false, expression: null };
  }
  
  // 数字、布尔等基本类型直接返回
  return { value: value, isExpression: false, expression: null };
}

/**
 * 插入单条记录（结构化数据）
 * @param {oracledb.Connection} conn - 数据库连接
 * @param {string} tableName - 表名
 * @param {Object} data - JSON 数据对象
 * @returns {Promise<Object>}
 * 
 * 支持的值格式：
 * - 普通值: "张三", 30, true
 * - SQL 表达式字符串: "SYSDATE", "SYSTIMESTAMP", "NULL"
 * - 日期对象: { "$date": "2025-12-19" }
 * - 时间戳对象: { "$timestamp": "2025-12-19 10:30:00" }
 * - 表达式对象: { "$expr": "SYSDATE" }
 */
export async function insertRecord(conn, tableName, data) {
  // 检查表白名单
  const access = checkTableAccess(tableName);
  if (!access.allowed) {
    throw new OracleMapError(ErrorCode.ACCESS_DENIED, access.message);
  }
  
  // 验证数据
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new OracleMapError(
      ErrorCode.SQL_SYNTAX_ERROR,
      'data 参数必须是非空的 JSON 对象'
    );
  }
  
  const columns = Object.keys(data);
  if (columns.length === 0) {
    throw new OracleMapError(
      ErrorCode.SQL_SYNTAX_ERROR,
      'data 对象不能为空'
    );
  }
  
  // 处理每个值，分离绑定变量和 SQL 表达式
  const bindValues = {};
  const placeholders = [];
  
  for (const col of columns) {
    const processed = processInsertValue(data[col], col);
    
    if (processed.isExpression) {
      // SQL 表达式直接放入 SQL
      placeholders.push(processed.expression);
    } else {
      // 普通值使用绑定变量
      placeholders.push(`:${col}`);
      bindValues[col] = processed.value;
    }
  }
  
  // 构建 SQL
  const sql = `INSERT INTO ${tableName.toUpperCase()} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  
  const startTime = Date.now();
  
  try {
    // 执行插入，使用绑定变量（天然防 SQL 注入）
    const result = await conn.execute(sql, bindValues, { autoCommit: true });
    
    const executionTime = Date.now() - startTime;
    
    return {
      success: true,
      table: tableName.toUpperCase(),
      rowsAffected: result.rowsAffected || 0,
      executionTime,
      columns: columns,
      sql
    };
  } catch (error) {
    throw handleDmlError(error, sql);
  }
}

/**
 * 处理 DML 错误
 * @param {Error} error - 原始错误
 * @param {string} sql - 执行的 SQL
 * @returns {OracleMapError}
 */
function handleDmlError(error, sql) {
  const oraError = error.message || '';
  
  // ORA-00942: 表或视图不存在
  if (oraError.includes('ORA-00942')) {
    return new OracleMapError(
      ErrorCode.TABLE_NOT_FOUND,
      '表或视图不存在',
      { oracleError: oraError, sql }
    );
  }
  
  // ORA-00904: 无效的标识符（列名错误）
  if (oraError.includes('ORA-00904')) {
    return new OracleMapError(
      ErrorCode.SQL_SYNTAX_ERROR,
      '无效的列名或标识符',
      { oracleError: oraError, sql }
    );
  }
  
  // ORA-01400: 无法插入 NULL
  if (oraError.includes('ORA-01400')) {
    return new OracleMapError(
      ErrorCode.SQL_SYNTAX_ERROR,
      '必填字段不能为空',
      { oracleError: oraError, sql }
    );
  }
  
  // ORA-00001: 唯一约束冲突
  if (oraError.includes('ORA-00001')) {
    return new OracleMapError(
      ErrorCode.SQL_SYNTAX_ERROR,
      '违反唯一约束，数据已存在',
      { oracleError: oraError, sql }
    );
  }
  
  // ORA-02291: 外键约束冲突
  if (oraError.includes('ORA-02291')) {
    return new OracleMapError(
      ErrorCode.SQL_SYNTAX_ERROR,
      '违反外键约束，引用的数据不存在',
      { oracleError: oraError, sql }
    );
  }
  
  // 其他错误
  return new OracleMapError(
    ErrorCode.QUERY_EXECUTION_ERROR,
    `DML 执行失败: ${oraError}`,
    { oracleError: oraError, sql }
  );
}

/**
 * 分析执行计划，提取关键性能指标
 * @param {string[]} planLines - 执行计划行
 * @returns {Object}
 */
function analyzePlan(planLines) {
  const analysis = {
    warnings: [],
    operations: [],
    estimatedCost: null,
    estimatedRows: null
  };
  
  for (const line of planLines) {
    const upperLine = line.toUpperCase();
    
    // 检测全表扫描
    if (upperLine.includes('TABLE ACCESS FULL')) {
      const tableMatch = line.match(/TABLE ACCESS FULL\s*\|\s*(\w+)/i);
      const tableName = tableMatch ? tableMatch[1] : 'unknown';
      analysis.warnings.push({
        type: 'FULL_TABLE_SCAN',
        message: `全表扫描: ${tableName}`,
        severity: 'HIGH',
        suggestion: '考虑在 WHERE 条件列上创建索引'
      });
    }
    
    // 检测索引全扫描
    if (upperLine.includes('INDEX FULL SCAN')) {
      analysis.warnings.push({
        type: 'INDEX_FULL_SCAN',
        message: '索引全扫描',
        severity: 'MEDIUM',
        suggestion: '检查是否可以使用更精确的索引范围扫描'
      });
    }
    
    // 检测笛卡尔积
    if (upperLine.includes('CARTESIAN') || upperLine.includes('MERGE JOIN CARTESIAN')) {
      analysis.warnings.push({
        type: 'CARTESIAN_JOIN',
        message: '笛卡尔积连接',
        severity: 'CRITICAL',
        suggestion: '检查 JOIN 条件是否缺失'
      });
    }
    
    // 检测排序操作
    if (upperLine.includes('SORT ORDER BY') || upperLine.includes('SORT GROUP BY')) {
      analysis.warnings.push({
        type: 'SORT_OPERATION',
        message: '排序操作（可能消耗大量内存）',
        severity: 'LOW',
        suggestion: '大数据量时考虑使用索引避免排序'
      });
    }
    
    // 提取 Cost 信息
    const costMatch = line.match(/Cost\s*[=:]\s*(\d+)/i);
    if (costMatch) {
      const cost = parseInt(costMatch[1], 10);
      if (analysis.estimatedCost === null || cost > analysis.estimatedCost) {
        analysis.estimatedCost = cost;
      }
    }
    
    // 提取 Rows 信息
    const rowsMatch = line.match(/Rows\s*[=:]\s*(\d+)/i);
    if (rowsMatch) {
      const rows = parseInt(rowsMatch[1], 10);
      if (analysis.estimatedRows === null || rows > analysis.estimatedRows) {
        analysis.estimatedRows = rows;
      }
    }
  }
  
  // 根据 Cost 添加总体评估
  if (analysis.estimatedCost !== null) {
    if (analysis.estimatedCost > 10000) {
      analysis.warnings.push({
        type: 'HIGH_COST',
        message: `执行成本较高: ${analysis.estimatedCost}`,
        severity: 'HIGH',
        suggestion: '建议优化查询或添加索引'
      });
    } else if (analysis.estimatedCost > 1000) {
      analysis.warnings.push({
        type: 'MEDIUM_COST',
        message: `执行成本中等: ${analysis.estimatedCost}`,
        severity: 'MEDIUM',
        suggestion: '大数据量时可能需要优化'
      });
    }
  }
  
  // 总结
  analysis.summary = analysis.warnings.length === 0 
    ? '执行计划看起来正常' 
    : `发现 ${analysis.warnings.length} 个潜在问题`;
  
  return analysis;
}
