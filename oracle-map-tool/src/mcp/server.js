import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { ConnectionManager } from '../db/connection.js';
import { 
  getTableSchema, 
  getTableSchemaEnhanced,
  getObjectDDL, 
  getSchemaGraph, 
  listObjects, 
  describeProcedure,
  searchMetadata,
  getColumnStats
} from '../mapper/schema.js';
import { executeQuery, queryTable, getTableRowCount, executeFlashbackQuery, getExplainPlan, executeDml, insertRecord } from '../query/executor.js';
import { getSecurityConfig, checkTableAccess, MAX_ROWS_LIMIT } from '../config/security.js';

/**
 * Oracle MCP Server
 * 提供 Oracle 数据库访问能力给 AI 助手
 * 
 * 支持环境变量配置：
 * - ORACLE_HOST: 数据库主机地址
 * - ORACLE_PORT: 端口号（默认 1521）
 * - ORACLE_SERVICE: Oracle 服务名
 * - ORACLE_USER: 用户名
 * - ORACLE_PASSWORD: 密码
 */
export class OracleMcpServer {
  constructor() {
    this.connectionManager = new ConnectionManager();
    this.isConnected = false;
    
    this.server = new Server(
      { name: 'oracle-mcp-server', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    
    this.setupHandlers();
  }

  /**
   * 从环境变量获取连接配置
   */
  getEnvConfig() {
    const host = process.env.ORACLE_HOST;
    const port = parseInt(process.env.ORACLE_PORT || '1521', 10);
    const serviceName = process.env.ORACLE_SERVICE;
    const user = process.env.ORACLE_USER;
    const password = process.env.ORACLE_PASSWORD;

    if (host && serviceName && user && password) {
      return { host, port, serviceName, user, password };
    }
    return null;
  }

  /**
   * 尝试使用环境变量自动连接
   */
  async autoConnect() {
    const config = this.getEnvConfig();
    if (config) {
      try {
        await this.handleConnect(config);
        console.error(`[oracle-mcp-server] 已通过环境变量自动连接到 ${config.host}:${config.port}/${config.serviceName}`);
      } catch (error) {
        console.error(`[oracle-mcp-server] 自动连接失败: ${error.message}`);
      }
    }
  }

  /**
   * 设置请求处理器
   */
  setupHandlers() {
    // 列出可用工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'oracle_connect',
            description: '连接到 Oracle 数据库',
            inputSchema: {
              type: 'object',
              properties: {
                host: { type: 'string', description: '数据库主机地址' },
                port: { type: 'number', description: '端口号', default: 1521 },
                serviceName: { type: 'string', description: 'Oracle 服务名' },
                user: { type: 'string', description: '用户名' },
                password: { type: 'string', description: '密码' }
              },
              required: ['host', 'serviceName', 'user', 'password']
            }
          },
          {
            name: 'oracle_disconnect',
            description: '断开 Oracle 数据库连接',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'oracle_list_tables',
            description: '列出当前用户的所有表',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'oracle_describe_table',
            description: '获取表结构信息（列、主键、外键），可选返回采样数据帮助理解字段含义',
            inputSchema: {
              type: 'object',
              properties: {
                table: { type: 'string', description: '表名' },
                includeSample: { type: 'boolean', description: '是否包含采样数据（默认 3 行）', default: false },
                sampleSize: { type: 'number', description: '采样行数（1-10）', default: 3 }
              },
              required: ['table']
            }
          },
          {
            name: 'oracle_query',
            description: '执行只读 SQL 查询（仅支持 SELECT）',
            inputSchema: {
              type: 'object',
              properties: {
                sql: { type: 'string', description: 'SQL 查询语句（仅 SELECT）' },
                limit: { type: 'number', description: '限制返回行数', default: 100 }
              },
              required: ['sql']
            }
          },
          {
            name: 'oracle_table_data',
            description: '查询表数据',
            inputSchema: {
              type: 'object',
              properties: {
                table: { type: 'string', description: '表名' },
                limit: { type: 'number', description: '限制返回行数', default: 100 },
                offset: { type: 'number', description: '跳过行数', default: 0 }
              },
              required: ['table']
            }
          },
          {
            name: 'oracle_table_count',
            description: '获取表的行数',
            inputSchema: {
              type: 'object',
              properties: {
                table: { type: 'string', description: '表名' }
              },
              required: ['table']
            }
          },
          {
            name: 'oracle_get_ddl',
            description: '获取数据库对象的 DDL 语句（CREATE TABLE/VIEW 等），包含完整的约束、索引、分区和注释信息',
            inputSchema: {
              type: 'object',
              properties: {
                objectName: { type: 'string', description: '对象名称（表名、视图名等）' },
                objectType: { 
                  type: 'string', 
                  description: '对象类型',
                  enum: ['TABLE', 'VIEW', 'INDEX', 'SEQUENCE', 'TRIGGER'],
                  default: 'TABLE'
                }
              },
              required: ['objectName']
            }
          },
          {
            name: 'oracle_schema_graph',
            description: '获取表的关系图，返回该表的父表（外键引用的表）和子表（引用该表的表），帮助理解表之间的关联关系',
            inputSchema: {
              type: 'object',
              properties: {
                table: { type: 'string', description: '中心表名' }
              },
              required: ['table']
            }
          },
          {
            name: 'oracle_list_objects',
            description: '列出数据库对象（表、视图、存储过程、函数等）',
            inputSchema: {
              type: 'object',
              properties: {
                objectType: { 
                  type: 'string', 
                  description: '对象类型',
                  enum: ['ALL', 'TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'PACKAGE'],
                  default: 'ALL'
                }
              }
            }
          },
          {
            name: 'oracle_describe_procedure',
            description: '获取存储过程或函数的参数签名和源代码',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '存储过程或函数名称' }
              },
              required: ['name']
            }
          },
          {
            name: 'oracle_security_config',
            description: '获取当前安全配置信息（最大行数限制、表白名单等）',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'oracle_search_metadata',
            description: '通过关键词搜索表名、列名、注释和视图定义，帮助定位业务数据所在位置',
            inputSchema: {
              type: 'object',
              properties: {
                keyword: { type: 'string', description: '搜索关键词（支持中英文）' },
                searchTables: { type: 'boolean', description: '是否搜索表', default: true },
                searchColumns: { type: 'boolean', description: '是否搜索列', default: true },
                searchViews: { type: 'boolean', description: '是否搜索视图', default: true },
                limit: { type: 'number', description: '每类结果最大返回数', default: 50 }
              },
              required: ['keyword']
            }
          },
          {
            name: 'oracle_column_stats',
            description: '获取列的统计信息（基数、分布、Top N 值等），帮助理解数据特征',
            inputSchema: {
              type: 'object',
              properties: {
                table: { type: 'string', description: '表名' },
                column: { type: 'string', description: '列名（可选，不传则统计所有列）' },
                topN: { type: 'number', description: 'Top N 频繁值数量', default: 10 },
                includeHistogram: { type: 'boolean', description: '是否包含值分布', default: true }
              },
              required: ['table']
            }
          },
          {
            name: 'oracle_explain_plan',
            description: '获取 SQL 执行计划，分析性能瓶颈（全表扫描、索引缺失等）',
            inputSchema: {
              type: 'object',
              properties: {
                sql: { type: 'string', description: 'SQL 查询语句（仅 SELECT）' },
                format: { 
                  type: 'string', 
                  description: '输出格式',
                  enum: ['BASIC', 'TYPICAL', 'ALL'],
                  default: 'TYPICAL'
                }
              },
              required: ['sql']
            }
          },
          {
            name: 'oracle_flashback_query',
            description: '查询历史时间点的数据（Flashback Query），用于排查"数据什么时候变的"',
            inputSchema: {
              type: 'object',
              properties: {
                sql: { type: 'string', description: 'SQL 查询语句（仅 SELECT）' },
                asOfTimestamp: { type: 'string', description: '历史时间点（ISO 8601 格式，如 2024-01-15T14:30:00Z）' },
                limit: { type: 'number', description: '限制返回行数', default: 100 }
              },
              required: ['sql', 'asOfTimestamp']
            }
          },
          {
            name: 'oracle_execute_dml',
            description: '执行 DML 语句（INSERT/UPDATE），自动事务管理。安全机制：只允许 INSERT/UPDATE，禁止 DELETE/TRUNCATE/DROP，UPDATE 必须包含 WHERE 子句',
            inputSchema: {
              type: 'object',
              properties: {
                sql: { type: 'string', description: 'DML 语句（仅 INSERT 或 UPDATE）' }
              },
              required: ['sql']
            }
          },
          {
            name: 'oracle_insert_record',
            description: '将 JSON 对象插入表中，无需手写 SQL。使用绑定变量，天然防止 SQL 注入，避免字符串转义问题',
            inputSchema: {
              type: 'object',
              properties: {
                table: { type: 'string', description: '表名' },
                data: { type: 'object', description: 'JSON 数据对象，如 {"NAME": "张三", "AGE": 30}' }
              },
              required: ['table', 'data']
            }
          }
        ]
      };
    });

    // 处理工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case 'oracle_connect':
            return await this.handleConnect(args);
          case 'oracle_disconnect':
            return await this.handleDisconnect();
          case 'oracle_list_tables':
            return await this.handleListTables();
          case 'oracle_describe_table':
            return await this.handleDescribeTable(args);
          case 'oracle_query':
            return await this.handleQuery(args);
          case 'oracle_table_data':
            return await this.handleTableData(args);
          case 'oracle_table_count':
            return await this.handleTableCount(args);
          case 'oracle_get_ddl':
            return await this.handleGetDDL(args);
          case 'oracle_schema_graph':
            return await this.handleSchemaGraph(args);
          case 'oracle_list_objects':
            return await this.handleListObjects(args);
          case 'oracle_describe_procedure':
            return await this.handleDescribeProcedure(args);
          case 'oracle_security_config':
            return await this.handleSecurityConfig();
          case 'oracle_search_metadata':
            return await this.handleSearchMetadata(args);
          case 'oracle_column_stats':
            return await this.handleColumnStats(args);
          case 'oracle_explain_plan':
            return await this.handleExplainPlan(args);
          case 'oracle_flashback_query':
            return await this.handleFlashbackQuery(args);
          case 'oracle_execute_dml':
            return await this.handleExecuteDml(args);
          case 'oracle_insert_record':
            return await this.handleInsertRecord(args);
          default:
            throw new Error(`未知工具: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `错误: ${error.message}`
          }],
          isError: true
        };
      }
    });
  }

  /**
   * 连接数据库
   */
  async handleConnect(args) {
    const { host, port = 1521, serviceName, user, password } = args;
    
    await this.connectionManager.createPool({
      host,
      port,
      serviceName,
      user,
      password
    });
    
    this.isConnected = true;
    
    return {
      content: [{
        type: 'text',
        text: `已成功连接到 Oracle 数据库 ${host}:${port}/${serviceName}`
      }]
    };
  }

  /**
   * 断开连接
   */
  async handleDisconnect() {
    await this.connectionManager.close();
    this.isConnected = false;
    
    return {
      content: [{
        type: 'text',
        text: '已断开数据库连接'
      }]
    };
  }

  /**
   * 检查连接状态
   */
  checkConnection() {
    if (!this.isConnected) {
      throw new Error('未连接到数据库，请先使用 oracle_connect 连接');
    }
  }

  /**
   * 列出所有表
   */
  async handleListTables() {
    this.checkConnection();
    
    const conn = await this.connectionManager.getConnection();
    try {
      const result = await conn.execute(
        `SELECT TABLE_NAME, NUM_ROWS, LAST_ANALYZED 
         FROM USER_TABLES 
         ORDER BY TABLE_NAME`
      );
      
      const tables = result.rows.map(row => ({
        name: row[0],
        rowCount: row[1],
        lastAnalyzed: row[2]
      }));
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(tables, null, 2)
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * 获取表结构（支持采样数据）
   */
  async handleDescribeTable(args) {
    this.checkConnection();
    
    // 检查白名单
    const access = checkTableAccess(args.table);
    if (!access.allowed) {
      return {
        content: [{
          type: 'text',
          text: `错误: ${access.message}`
        }],
        isError: true
      };
    }
    
    const conn = await this.connectionManager.getConnection();
    try {
      const options = {
        includeSample: args.includeSample || false,
        sampleSize: Math.min(Math.max(1, args.sampleSize || 3), 10) // 限制 1-10 行
      };
      
      const schema = await getTableSchemaEnhanced(conn, args.table, options);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(schema, null, 2)
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * 执行查询
   */
  async handleQuery(args) {
    this.checkConnection();
    
    const conn = await this.connectionManager.getConnection();
    try {
      const result = await executeQuery(conn, args.sql, {
        limit: args.limit || 100
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            rowCount: result.rowCount,
            columns: result.columns,
            data: result.data,
            executionTime: result.executionTime
          }, null, 2)
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * 查询表数据
   */
  async handleTableData(args) {
    this.checkConnection();
    
    const conn = await this.connectionManager.getConnection();
    try {
      const result = await queryTable(conn, args.table, {
        limit: args.limit || 100,
        offset: args.offset || 0
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            table: args.table,
            rowCount: result.rowCount,
            columns: result.columns,
            data: result.data
          }, null, 2)
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * 获取表行数
   */
  async handleTableCount(args) {
    this.checkConnection();
    
    const conn = await this.connectionManager.getConnection();
    try {
      const count = await getTableRowCount(conn, args.table);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            table: args.table,
            count
          }, null, 2)
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * 获取 DDL
   */
  async handleGetDDL(args) {
    this.checkConnection();
    
    const conn = await this.connectionManager.getConnection();
    try {
      const ddl = await getObjectDDL(conn, args.objectName, args.objectType || 'TABLE');
      
      return {
        content: [{
          type: 'text',
          text: ddl
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * 获取表关系图
   */
  async handleSchemaGraph(args) {
    this.checkConnection();
    
    const conn = await this.connectionManager.getConnection();
    try {
      const graph = await getSchemaGraph(conn, args.table);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(graph, null, 2)
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * 列出数据库对象
   */
  async handleListObjects(args) {
    this.checkConnection();
    
    const conn = await this.connectionManager.getConnection();
    try {
      const objects = await listObjects(conn, args.objectType || 'ALL');
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(objects, null, 2)
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * 获取存储过程/函数签名
   */
  async handleDescribeProcedure(args) {
    this.checkConnection();
    
    const conn = await this.connectionManager.getConnection();
    try {
      const procInfo = await describeProcedure(conn, args.name);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(procInfo, null, 2)
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * 获取安全配置
   */
  async handleSecurityConfig() {
    const config = getSecurityConfig();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ...config,
          note: '安全提示: 建议在数据库层面限制用户只有 SELECT 权限，而不是仅依赖代码层的正则过滤'
        }, null, 2)
      }]
    };
  }

  /**
   * 搜索元数据
   */
  async handleSearchMetadata(args) {
    this.checkConnection();
    
    const conn = await this.connectionManager.getConnection();
    try {
      const result = await searchMetadata(conn, args.keyword, {
        searchTables: args.searchTables !== false,
        searchColumns: args.searchColumns !== false,
        searchViews: args.searchViews !== false,
        limit: args.limit || 50
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * 获取列统计信息
   */
  async handleColumnStats(args) {
    this.checkConnection();
    
    const conn = await this.connectionManager.getConnection();
    try {
      const result = await getColumnStats(conn, args.table, args.column || null, {
        topN: args.topN || 10,
        includeHistogram: args.includeHistogram !== false
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * 获取执行计划
   */
  async handleExplainPlan(args) {
    this.checkConnection();
    
    const conn = await this.connectionManager.getConnection();
    try {
      const result = await getExplainPlan(conn, args.sql, {
        format: args.format || 'TYPICAL'
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * Flashback 查询
   */
  async handleFlashbackQuery(args) {
    this.checkConnection();
    
    const conn = await this.connectionManager.getConnection();
    try {
      const result = await executeFlashbackQuery(conn, args.sql, {
        asOfTimestamp: args.asOfTimestamp,
        limit: args.limit || 100
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            asOfTimestamp: result.asOfTimestamp,
            rowCount: result.rowCount,
            columns: result.columns,
            data: result.data,
            executionTime: result.executionTime,
            sql: result.sql
          }, null, 2)
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * 执行 DML 语句
   */
  async handleExecuteDml(args) {
    this.checkConnection();
    
    const conn = await this.connectionManager.getConnection();
    try {
      const result = await executeDml(conn, args.sql);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: result.success,
            verb: result.verb,
            rowsAffected: result.rowsAffected,
            executionTime: result.executionTime,
            sql: result.sql
          }, null, 2)
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * 插入单条记录
   */
  async handleInsertRecord(args) {
    this.checkConnection();
    
    const conn = await this.connectionManager.getConnection();
    try {
      const result = await insertRecord(conn, args.table, args.data);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: result.success,
            table: result.table,
            rowsAffected: result.rowsAffected,
            columns: result.columns,
            executionTime: result.executionTime
          }, null, 2)
        }]
      };
    } finally {
      await this.connectionManager.releaseConnection(conn);
    }
  }

  /**
   * 启动服务器
   */
  async start() {
    // 尝试自动连接
    await this.autoConnect();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
