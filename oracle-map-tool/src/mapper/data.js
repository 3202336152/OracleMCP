/**
 * 将 Date 对象转换为 ISO 8601 字符串
 * @param {Date} date - 日期对象
 * @returns {string|null}
 */
export function dateToIso(date) {
  if (date === null || date === undefined) {
    return null;
  }
  
  if (!(date instanceof Date)) {
    return date;
  }
  
  // 检查是否为有效日期
  if (isNaN(date.getTime())) {
    return null;
  }
  
  return date.toISOString();
}

/**
 * 将 ISO 8601 字符串解析为 Date 对象
 * @param {string} isoString - ISO 8601 字符串
 * @returns {Date|null}
 */
export function isoToDate(isoString) {
  if (isoString === null || isoString === undefined) {
    return null;
  }
  
  const date = new Date(isoString);
  
  if (isNaN(date.getTime())) {
    return null;
  }
  
  return date;
}

/**
 * 处理 NULL 值
 * 确保数据库 NULL 值映射为 JavaScript null
 * @param {*} value - 原始值
 * @returns {*}
 */
export function handleNull(value) {
  if (value === undefined) {
    return null;
  }
  return value;
}

/**
 * LOB 数据截断配置
 */
const LOB_CONFIG = {
  CLOB_MAX_LENGTH: 4000,  // CLOB 最大字符数
  BLOB_MAX_LENGTH: 1024,  // BLOB 最大字节数
  TRUNCATE_SUFFIX: '... [已截断]'
};

/**
 * 截断大字符串
 * @param {string} str - 原始字符串
 * @param {number} maxLength - 最大长度
 * @returns {string}
 */
function truncateString(str, maxLength) {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength) + LOB_CONFIG.TRUNCATE_SUFFIX;
}

/**
 * 映射单个值
 * @param {*} value - 原始值
 * @param {string} oracleType - Oracle 数据类型
 * @returns {*}
 */
export function mapValue(value, oracleType) {
  // 处理 NULL
  if (value === null || value === undefined) {
    return null;
  }
  
  const upperType = (oracleType || '').toUpperCase();
  
  // 日期类型转换为 ISO 8601
  if (upperType.startsWith('DATE') || upperType.startsWith('TIMESTAMP')) {
    if (value instanceof Date) {
      return dateToIso(value);
    }
  }
  
  // CLOB 类型：截断过长的字符串
  if (upperType === 'CLOB' || upperType === 'NCLOB' || upperType === 'LONG') {
    if (typeof value === 'string') {
      return truncateString(value, LOB_CONFIG.CLOB_MAX_LENGTH);
    }
  }
  
  // Buffer 类型转换为 Base64 字符串（便于 JSON 序列化），并截断
  if (Buffer.isBuffer(value)) {
    const truncatedBuffer = value.length > LOB_CONFIG.BLOB_MAX_LENGTH 
      ? value.subarray(0, LOB_CONFIG.BLOB_MAX_LENGTH)
      : value;
    const base64 = truncatedBuffer.toString('base64');
    if (value.length > LOB_CONFIG.BLOB_MAX_LENGTH) {
      return base64 + LOB_CONFIG.TRUNCATE_SUFFIX;
    }
    return base64;
  }
  
  // BLOB 类型：如果已经是字符串（被 fetchAsBuffer 处理过），截断
  if (upperType === 'BLOB' || upperType === 'RAW' || upperType === 'LONG RAW') {
    if (typeof value === 'string' && value.length > LOB_CONFIG.BLOB_MAX_LENGTH * 2) {
      return value.substring(0, LOB_CONFIG.BLOB_MAX_LENGTH * 2) + LOB_CONFIG.TRUNCATE_SUFFIX;
    }
  }
  
  // 普通字符串：如果过长也截断（防止意外的大数据）
  if (typeof value === 'string' && value.length > LOB_CONFIG.CLOB_MAX_LENGTH) {
    return truncateString(value, LOB_CONFIG.CLOB_MAX_LENGTH);
  }
  
  return value;
}

/**
 * 映射单行数据
 * @param {Array|Object} row - 数据行（数组或对象形式）
 * @param {Array<Object>} columns - 列元数据
 * @returns {Object}
 */
export function mapRow(row, columns) {
  const result = {};
  
  // 如果 row 是对象格式（OUT_FORMAT_OBJECT），直接处理
  if (row && typeof row === 'object' && !Array.isArray(row)) {
    for (const column of columns) {
      const columnName = column.name || column;
      const oracleType = column.oracleType || column.dbType || '';
      const value = row[columnName];
      result[columnName] = mapValue(value, oracleType);
    }
    return result;
  }
  
  // 数组格式（OUT_FORMAT_ARRAY）
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i];
    const value = row[i];
    const columnName = column.name || column;
    const oracleType = column.oracleType || column.dbType || '';
    
    result[columnName] = mapValue(value, oracleType);
  }
  
  return result;
}

/**
 * 映射多行数据
 * @param {Array<Array>} rows - 数据行数组
 * @param {Array<Object>} columns - 列元数据
 * @returns {Array<Object>}
 */
export function mapRows(rows, columns) {
  return rows.map(row => mapRow(row, columns));
}

/**
 * 从 oracledb 结果元数据提取列信息
 * @param {Array<Object>} metaData - oracledb 元数据
 * @returns {Array<Object>}
 */
export function extractColumnInfo(metaData) {
  return metaData.map(col => ({
    name: col.name,
    oracleType: col.dbTypeName || '',
    dbType: col.dbType
  }));
}

/**
 * 映射查询结果
 * @param {Object} result - oracledb 查询结果
 * @returns {Object}
 */
export function mapQueryResult(result) {
  const columns = extractColumnInfo(result.metaData || []);
  const data = mapRows(result.rows || [], columns);
  
  return {
    data,
    rowCount: data.length,
    columns: columns.map(c => c.name)
  };
}

/**
 * 创建包含 NULL 值的测试数据行
 * @param {Object} template - 模板对象
 * @param {Array<string>} nullFields - 要设为 null 的字段
 * @returns {Object}
 */
export function createRowWithNulls(template, nullFields) {
  const result = { ...template };
  
  for (const field of nullFields) {
    result[field] = null;
  }
  
  return result;
}
