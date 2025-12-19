/**
 * Oracle MCP Server - 主模块导出
 * 提供 MCP Server 和编程式 API
 */

// 版本信息
export const VERSION = '1.0.0';

// MCP Server
export { OracleMcpServer } from './mcp/server.js';

// 连接管理
export { ConnectionManager, getConnectionManager, resetConnectionManager } from './db/connection.js';

// 类型映射
export { 
  TYPE_MAPPING, 
  mapOracleType, 
  isValidJsType, 
  getTableSchema,
  searchMetadata,
  getColumnStats
} from './mapper/schema.js';

// 数据映射
export { 
  dateToIso, 
  isoToDate, 
  handleNull, 
  mapValue, 
  mapRow, 
  mapRows, 
  mapQueryResult 
} from './mapper/data.js';

// 查询执行
export { 
  buildPaginatedSql, 
  buildTableQuerySql, 
  validateSql, 
  executeQuery, 
  queryTable, 
  getTableRowCount,
  buildFlashbackSql,
  executeFlashbackQuery,
  getExplainPlan
} from './query/executor.js';

// 错误处理
export { 
  ErrorCode, 
  ExitCode, 
  OracleMapError, 
  getExitCode, 
  isOracleMapError, 
  wrapError 
} from './utils/errors.js';
