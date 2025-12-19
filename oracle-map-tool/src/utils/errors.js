/**
 * 错误代码枚举
 * 按类别分组：连接错误(1xx)、配置错误(2xx)、查询错误(3xx)、输出错误(4xx)
 */
export const ErrorCode = {
  // 连接错误 (1xx)
  CONNECTION_FAILED: 101,
  AUTH_FAILED: 102,
  TIMEOUT: 103,
  
  // 配置错误 (2xx)
  CONFIG_NOT_FOUND: 201,
  CONFIG_PARSE_ERROR: 202,
  MISSING_REQUIRED_PARAM: 203,
  
  // 查询错误 (3xx)
  TABLE_NOT_FOUND: 301,
  SQL_SYNTAX_ERROR: 302,
  QUERY_EXECUTION_ERROR: 303,
  ACCESS_DENIED: 304, // 表不在白名单中
  
  // 输出错误 (4xx)
  FILE_EXISTS: 401,
  WRITE_PERMISSION_DENIED: 402,
  
  // 未知错误
  UNKNOWN: 999
};

/**
 * 错误代码到退出代码的映射
 * 确保不同类型的错误返回不同的退出代码
 */
export const ExitCode = {
  SUCCESS: 0,
  CONNECTION_ERROR: 1,
  CONFIG_ERROR: 2,
  QUERY_ERROR: 3,
  OUTPUT_ERROR: 4,
  UNKNOWN_ERROR: 99
};

/**
 * 根据错误代码获取对应的退出代码
 * @param {number} errorCode - 错误代码
 * @returns {number} 退出代码
 */
export function getExitCode(errorCode) {
  if (errorCode >= 100 && errorCode < 200) {
    return ExitCode.CONNECTION_ERROR;
  }
  if (errorCode >= 200 && errorCode < 300) {
    return ExitCode.CONFIG_ERROR;
  }
  if (errorCode >= 300 && errorCode < 400) {
    return ExitCode.QUERY_ERROR;
  }
  if (errorCode >= 400 && errorCode < 500) {
    return ExitCode.OUTPUT_ERROR;
  }
  return ExitCode.UNKNOWN_ERROR;
}

/**
 * 错误消息模板
 */
const ErrorMessages = {
  [ErrorCode.CONNECTION_FAILED]: '无法连接到数据库',
  [ErrorCode.AUTH_FAILED]: '数据库认证失败，请检查用户名和密码',
  [ErrorCode.TIMEOUT]: '连接超时，请检查网络或数据库服务状态',
  [ErrorCode.CONFIG_NOT_FOUND]: '配置文件未找到',
  [ErrorCode.CONFIG_PARSE_ERROR]: '配置文件解析错误',
  [ErrorCode.MISSING_REQUIRED_PARAM]: '缺少必填参数',
  [ErrorCode.TABLE_NOT_FOUND]: '表不存在',
  [ErrorCode.SQL_SYNTAX_ERROR]: 'SQL 语法错误',
  [ErrorCode.QUERY_EXECUTION_ERROR]: '查询执行失败',
  [ErrorCode.ACCESS_DENIED]: '访问被拒绝，表不在允许的白名单中',
  [ErrorCode.FILE_EXISTS]: '文件已存在，使用 --force 覆盖',
  [ErrorCode.WRITE_PERMISSION_DENIED]: '没有写入权限',
  [ErrorCode.UNKNOWN]: '未知错误'
};

/**
 * 自定义错误类
 * 包含错误代码、用户友好消息和原始错误信息
 */
export class OracleMapError extends Error {
  /**
   * @param {number} code - 错误代码
   * @param {string} [message] - 自定义错误消息
   * @param {Object} [details] - 额外的错误详情
   */
  constructor(code, message, details = {}) {
    const defaultMessage = ErrorMessages[code] || ErrorMessages[ErrorCode.UNKNOWN];
    super(message || defaultMessage);
    
    this.name = 'OracleMapError';
    this.code = code;
    this.details = details;
    this.exitCode = getExitCode(code);
    
    // 保持正确的堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OracleMapError);
    }
  }

  /**
   * 获取格式化的错误信息（用于用户显示）
   * @returns {string}
   */
  toUserMessage() {
    let msg = `[错误 ${this.code}] ${this.message}`;
    
    if (this.details.field) {
      msg += `\n  缺少字段: ${this.details.field}`;
    }
    if (this.details.file) {
      msg += `\n  文件: ${this.details.file}`;
    }
    if (this.details.line) {
      msg += `\n  行号: ${this.details.line}`;
    }
    if (this.details.oracleError) {
      msg += `\n  Oracle 错误: ${this.details.oracleError}`;
    }
    if (this.details.suggestion) {
      msg += `\n  建议: ${this.details.suggestion}`;
    }
    
    return msg;
  }

  /**
   * 转换为 JSON 格式（用于日志或调试）
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      exitCode: this.exitCode
    };
  }
}

/**
 * 判断是否为 OracleMapError
 * @param {Error} error
 * @returns {boolean}
 */
export function isOracleMapError(error) {
  return error instanceof OracleMapError;
}

/**
 * 将普通错误包装为 OracleMapError
 * @param {Error} error - 原始错误
 * @param {number} [defaultCode] - 默认错误代码
 * @returns {OracleMapError}
 */
export function wrapError(error, defaultCode = ErrorCode.UNKNOWN) {
  if (isOracleMapError(error)) {
    return error;
  }
  
  return new OracleMapError(defaultCode, error.message, {
    originalError: error.name,
    stack: error.stack
  });
}
