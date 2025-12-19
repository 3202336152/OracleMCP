/**
 * 安全配置模块
 * 处理表白名单、行数限制等安全相关配置
 */

/**
 * 硬性最大行数限制，防止意外请求过多数据
 */
export const MAX_ROWS_LIMIT = 1000;

/**
 * CLOB 字段最大截断长度（字符数）
 */
export const CLOB_MAX_LENGTH = 4000;

/**
 * BLOB 字段最大截断长度（字节数）
 */
export const BLOB_MAX_LENGTH = 1024;

/**
 * 从环境变量获取表白名单
 * 环境变量格式: ORACLE_TABLE_WHITELIST=TABLE1,TABLE2,TABLE3
 * @returns {Set<string>|null} 白名单集合，null 表示不启用白名单
 */
export function getTableWhitelist() {
  const whitelist = process.env.ORACLE_TABLE_WHITELIST;
  if (!whitelist || whitelist.trim() === '') {
    return null; // 不启用白名单
  }
  
  const tables = whitelist
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(t => t.length > 0);
  
  return new Set(tables);
}

/**
 * 检查表是否在白名单中
 * @param {string} tableName - 表名
 * @returns {{ allowed: boolean, message: string|null }}
 */
export function checkTableAccess(tableName) {
  const whitelist = getTableWhitelist();
  
  // 白名单未启用，允许所有表
  if (whitelist === null) {
    return { allowed: true, message: null };
  }
  
  const upperTableName = tableName.toUpperCase();
  
  if (whitelist.has(upperTableName)) {
    return { allowed: true, message: null };
  }
  
  return {
    allowed: false,
    message: `表 ${tableName} 不在允许访问的白名单中。允许的表: ${Array.from(whitelist).join(', ')}`
  };
}

/**
 * 强制限制行数在安全范围内
 * @param {number|undefined} requestedLimit - 请求的行数限制
 * @param {number} defaultLimit - 默认限制
 * @returns {number}
 */
export function enforceRowLimit(requestedLimit, defaultLimit = 100) {
  if (requestedLimit === undefined || requestedLimit === null) {
    return Math.min(defaultLimit, MAX_ROWS_LIMIT);
  }
  
  return Math.min(Math.max(1, requestedLimit), MAX_ROWS_LIMIT);
}

/**
 * 获取安全配置摘要
 * @returns {Object}
 */
export function getSecurityConfig() {
  const whitelist = getTableWhitelist();
  
  return {
    maxRowsLimit: MAX_ROWS_LIMIT,
    clobMaxLength: CLOB_MAX_LENGTH,
    blobMaxLength: BLOB_MAX_LENGTH,
    tableWhitelistEnabled: whitelist !== null,
    tableWhitelist: whitelist ? Array.from(whitelist) : null
  };
}

/**
 * DML 允许的动词白名单
 */
export const DML_ALLOWED_VERBS = ['INSERT', 'UPDATE'];

/**
 * DML 黑名单关键字（禁止出现）
 */
export const DML_BLACKLIST_KEYWORDS = ['DELETE', 'TRUNCATE', 'DROP', 'ALTER', 'CREATE', 'GRANT', 'REVOKE'];

/**
 * 验证 DML SQL 语句的安全性
 * @param {string} sql - SQL 语句
 * @returns {{ valid: boolean, error: string|null, verb: string|null }}
 */
export function validateDmlSql(sql) {
  if (!sql || typeof sql !== 'string') {
    return { valid: false, error: 'SQL 语句不能为空', verb: null };
  }
  
  const trimmedSql = sql.trim();
  const upperSql = trimmedSql.toUpperCase();
  
  // 1. 检查是否以允许的动词开头
  let matchedVerb = null;
  for (const verb of DML_ALLOWED_VERBS) {
    if (upperSql.startsWith(verb)) {
      matchedVerb = verb;
      break;
    }
  }
  
  if (!matchedVerb) {
    return { 
      valid: false, 
      error: `只允许执行 ${DML_ALLOWED_VERBS.join('/')} 语句`, 
      verb: null 
    };
  }
  
  // 2. 检查黑名单关键字（独立单词匹配，避免误杀列名如 DELETED_FLAG）
  for (const keyword of DML_BLACKLIST_KEYWORDS) {
    const regex = new RegExp(`(^|\\s|\\()${keyword}(\\s|\\(|$)`, 'i');
    if (regex.test(trimmedSql)) {
      return { 
        valid: false, 
        error: `SQL 中包含禁止的关键字: ${keyword}`, 
        verb: matchedVerb 
      };
    }
  }
  
  // 3. UPDATE 语句必须包含 WHERE 子句
  if (matchedVerb === 'UPDATE') {
    // 检查是否包含 WHERE（作为独立关键字）
    const whereRegex = /\bWHERE\b/i;
    if (!whereRegex.test(trimmedSql)) {
      return { 
        valid: false, 
        error: 'UPDATE 语句必须包含 WHERE 子句，防止全表更新', 
        verb: matchedVerb 
      };
    }
  }
  
  return { valid: true, error: null, verb: matchedVerb };
}
