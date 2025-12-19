import oracledb from 'oracledb';
import { OracleMapError, ErrorCode } from '../utils/errors.js';

/**
 * 连接池配置默认值
 */
const DEFAULT_POOL_CONFIG = {
  poolMin: 1,
  poolMax: 4,
  poolIncrement: 1,
  poolTimeout: 60,
  // 启用连接池 ping，在获取连接前检查连接有效性
  poolPingInterval: 60, // 每 60 秒 ping 一次空闲连接
  // 连接获取超时
  queueTimeout: 60000 // 60 秒
};

/**
 * 数据库连接管理器
 * 负责创建连接池、获取连接和关闭连接
 */
export class ConnectionManager {
  constructor() {
    this.pool = null;
    this.config = null;
  }

  /**
   * 构建 Oracle 连接字符串
   * @param {Object} config - 连接配置
   * @returns {string}
   */
  buildConnectionString(config) {
    const { host, port = 1521, serviceName } = config;
    return `${host}:${port}/${serviceName}`;
  }

  /**
   * 创建连接池
   * @param {Object} config - 连接配置
   * @returns {Promise<void>}
   */
  async createPool(config) {
    this.config = config;
    
    try {
      const poolConfig = {
        user: config.user,
        password: config.password,
        connectString: this.buildConnectionString(config),
        ...DEFAULT_POOL_CONFIG
      };

      this.pool = await oracledb.createPool(poolConfig);
    } catch (error) {
      throw this.handleConnectionError(error);
    }
  }

  /**
   * 获取连接（带健康检查）
   * @returns {Promise<oracledb.Connection>}
   */
  async getConnection() {
    if (!this.pool) {
      throw new OracleMapError(
        ErrorCode.CONNECTION_FAILED,
        '连接池未初始化，请先调用 createPool()'
      );
    }

    try {
      const conn = await this.pool.getConnection();
      
      // 执行简单查询验证连接有效性
      try {
        await conn.execute('SELECT 1 FROM DUAL');
      } catch (pingError) {
        // 连接无效，关闭并重新获取
        console.error('[oracle-mcp-server] 连接 ping 失败，重新获取连接:', pingError.message);
        try { await conn.close(); } catch { /* 忽略关闭错误 */ }
        return await this.pool.getConnection();
      }
      
      return conn;
    } catch (error) {
      throw this.handleConnectionError(error);
    }
  }

  /**
   * 释放连接回连接池
   * @param {oracledb.Connection} connection - 数据库连接
   * @returns {Promise<void>}
   */
  async releaseConnection(connection) {
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        // 释放连接失败不抛出错误，只记录
        console.error('释放连接失败:', error.message);
      }
    }
  }

  /**
   * 关闭连接池
   * @returns {Promise<void>}
   */
  async close() {
    if (this.pool) {
      try {
        await this.pool.close(0);
        this.pool = null;
      } catch (error) {
        console.error('关闭连接池失败:', error.message);
      }
    }
  }

  /**
   * 处理连接错误，转换为 OracleMapError
   * @param {Error} error - 原始错误
   * @returns {OracleMapError}
   */
  handleConnectionError(error) {
    const oraError = error.message || '';
    
    // ORA-01017: 用户名/密码无效
    if (oraError.includes('ORA-01017') || oraError.includes('invalid username/password')) {
      return new OracleMapError(
        ErrorCode.AUTH_FAILED,
        '数据库认证失败，请检查用户名和密码',
        { oracleError: oraError }
      );
    }
    
    // ORA-12170: 连接超时
    if (oraError.includes('ORA-12170') || oraError.includes('TNS:Connect timeout')) {
      return new OracleMapError(
        ErrorCode.TIMEOUT,
        '连接超时，请检查网络或数据库服务状态',
        { 
          oracleError: oraError,
          suggestion: '请确认数据库主机和端口是否正确，网络是否可达'
        }
      );
    }
    
    // ORA-12541: 无监听器
    if (oraError.includes('ORA-12541') || oraError.includes('TNS:no listener')) {
      return new OracleMapError(
        ErrorCode.CONNECTION_FAILED,
        '无法连接到数据库监听器',
        { 
          oracleError: oraError,
          suggestion: '请确认 Oracle 监听器是否启动'
        }
      );
    }
    
    // ORA-12514: 服务名不存在
    if (oraError.includes('ORA-12514') || oraError.includes('TNS:listener does not currently know of service')) {
      return new OracleMapError(
        ErrorCode.CONNECTION_FAILED,
        '服务名不存在',
        { 
          oracleError: oraError,
          suggestion: '请检查服务名是否正确'
        }
      );
    }
    
    // 其他连接错误
    return new OracleMapError(
      ErrorCode.CONNECTION_FAILED,
      `数据库连接失败: ${oraError}`,
      { oracleError: oraError }
    );
  }

  /**
   * 测试连接是否可用
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    let connection = null;
    try {
      connection = await this.getConnection();
      const result = await connection.execute('SELECT 1 FROM DUAL');
      return result.rows.length > 0;
    } catch {
      return false;
    } finally {
      await this.releaseConnection(connection);
    }
  }
}

/**
 * 创建单例连接管理器
 */
let instance = null;

/**
 * 获取连接管理器实例
 * @returns {ConnectionManager}
 */
export function getConnectionManager() {
  if (!instance) {
    instance = new ConnectionManager();
  }
  return instance;
}

/**
 * 重置连接管理器（用于测试）
 */
export function resetConnectionManager() {
  if (instance) {
    instance.close();
    instance = null;
  }
}
