# 设计文档

## 概述

Oracle Map Tool 是一个基于 Node.js 的 CLI 工具，采用 ESM 模块系统，使用 oracledb 官方驱动连接 Oracle 数据库，将表结构和数据映射为 JSON、JavaScript 对象或文件输出。

### 技术选型理由

**选择 ESM 而非 CommonJS 的原因：**
1. Node.js 18+ 对 ESM 有完整支持
2. ESM 是 JavaScript 的官方标准模块系统
3. 更好的 tree-shaking 支持
4. 顶层 await 支持，简化异步代码
5. 更清晰的导入/导出语法

**核心依赖：**
- `oracledb` - Oracle 官方 Node.js 驱动
- `commander` - CLI 参数解析
- `chalk` - 终端彩色输出
- `ora` - 加载动画

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Parser    │  │   Config    │  │      Validator      │  │
│  │ (commander) │  │   Loader    │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Service Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Connection │  │   Schema    │  │       Query         │  │
│  │   Manager   │  │   Mapper    │  │      Executor       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Output Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │    JSON     │  │   Object    │  │        File         │  │
│  │  Formatter  │  │  Formatter  │  │       Writer        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 组件与接口

### 1. CLI 入口 (bin/oracle-map.js)

```javascript
#!/usr/bin/env node
// CLI 入口点，负责参数解析和命令分发
```

### 2. 配置加载器 (src/config/loader.js)

```javascript
/**
 * 配置加载器接口
 * @typedef {Object} ConnectionConfig
 * @property {string} host - 数据库主机
 * @property {number} port - 端口号
 * @property {string} serviceName - 服务名
 * @property {string} user - 用户名
 * @property {string} password - 密码
 */

/**
 * 加载配置
 * @param {string} [configPath] - 自定义配置文件路径
 * @returns {Promise<ConnectionConfig>}
 */
export async function loadConfig(configPath) {}

/**
 * 合并 CLI 参数与配置文件
 * @param {Object} cliOptions - CLI 参数
 * @param {ConnectionConfig} fileConfig - 文件配置
 * @returns {ConnectionConfig}
 */
export function mergeConfig(cliOptions, fileConfig) {}
```

### 3. 连接管理器 (src/db/connection.js)

```javascript
/**
 * 数据库连接管理器
 */
export class ConnectionManager {
  /**
   * 创建连接池
   * @param {ConnectionConfig} config
   * @returns {Promise<void>}
   */
  async createPool(config) {}

  /**
   * 获取连接
   * @returns {Promise<Connection>}
   */
  async getConnection() {}

  /**
   * 关闭所有连接
   * @returns {Promise<void>}
   */
  async close() {}
}
```

### 4. Schema 映射器 (src/mapper/schema.js)

```javascript
/**
 * Oracle 到 JavaScript 类型映射
 */
export const TYPE_MAPPING = {
  'VARCHAR2': 'string',
  'CHAR': 'string',
  'NVARCHAR2': 'string',
  'NUMBER': 'number',
  'INTEGER': 'number',
  'FLOAT': 'number',
  'DATE': 'Date',
  'TIMESTAMP': 'Date',
  'CLOB': 'string',
  'BLOB': 'Buffer',
  'RAW': 'Buffer'
};

/**
 * 获取表结构
 * @param {Connection} conn - 数据库连接
 * @param {string} tableName - 表名
 * @returns {Promise<TableSchema>}
 */
export async function getTableSchema(conn, tableName) {}
```

### 5. 查询执行器 (src/query/executor.js)

```javascript
/**
 * 执行查询并映射结果
 * @param {Connection} conn - 数据库连接
 * @param {string} sql - SQL 语句
 * @param {Object} options - 查询选项
 * @returns {Promise<Array<Object>>}
 */
export async function executeQuery(conn, sql, options) {}

/**
 * 查询表数据
 * @param {Connection} conn - 数据库连接
 * @param {string} tableName - 表名
 * @param {Object} options - 分页选项
 * @returns {Promise<Array<Object>>}
 */
export async function queryTable(conn, tableName, options) {}
```

### 6. 输出格式化器 (src/output/formatter.js)

```javascript
/**
 * 格式化为 JSON
 * @param {Array<Object>} data - 数据
 * @param {boolean} pretty - 是否美化
 * @returns {string}
 */
export function formatJson(data, pretty) {}

/**
 * 格式化为 JavaScript 对象字面量
 * @param {Array<Object>} data - 数据
 * @param {boolean} pretty - 是否美化
 * @returns {string}
 */
export function formatObject(data, pretty) {}

/**
 * 写入文件
 * @param {string} content - 内容
 * @param {string} filePath - 文件路径
 * @param {boolean} force - 是否强制覆盖
 * @returns {Promise<void>}
 */
export async function writeToFile(content, filePath, force) {}
```

## 数据模型

### ConnectionConfig

```javascript
{
  host: string,        // 数据库主机地址
  port: number,        // 端口号，默认 1521
  serviceName: string, // Oracle 服务名
  user: string,        // 用户名
  password: string     // 密码
}
```

### TableSchema

```javascript
{
  tableName: string,
  columns: [
    {
      name: string,           // 列名
      oracleType: string,     // Oracle 数据类型
      jsType: string,         // 映射的 JS 类型
      nullable: boolean,      // 是否可空
      length: number,         // 长度
      precision: number,      // 精度
      scale: number           // 小数位数
    }
  ],
  primaryKey: string[],       // 主键列
  foreignKeys: [
    {
      column: string,
      refTable: string,
      refColumn: string
    }
  ]
}
```

### QueryResult

```javascript
{
  data: Array<Object>,    // 查询结果数据
  rowCount: number,       // 返回行数
  columns: string[],      // 列名列表
  executionTime: number   // 执行时间（毫秒）
}
```



## 正确性属性

*属性是一种特征或行为，应该在系统的所有有效执行中保持为真——本质上是关于系统应该做什么的形式化陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

### 属性 1: 连接参数验证一致性

*对于任意* 连接参数组合，如果所有必填字段（host、port、serviceName、user、password）都存在且非空，则验证应通过并返回有效的 ConnectionConfig 对象；如果任何必填字段缺失或为空，则验证应失败并返回包含缺失字段名称的错误信息。

**验证: 需求 1.2, 1.3**

### 属性 2: 配置合并优先级

*对于任意* CLI 参数对象和配置文件对象，合并后的结果中，CLI 参数中存在的非空值应覆盖配置文件中的对应值，而 CLI 参数中不存在或为空的字段应使用配置文件中的值。

**验证: 需求 6.2**

### 属性 3: Oracle 类型映射完整性

*对于任意* Oracle 数据类型字符串，类型映射函数应返回对应的 JavaScript 类型字符串，且映射结果应属于预定义的 JS 类型集合 {string, number, Date, Buffer, boolean, object}。

**验证: 需求 3.3**

### 属性 4: 日期转换往返一致性

*对于任意* 有效的 JavaScript Date 对象，将其转换为 ISO 8601 字符串后再解析回 Date 对象，应得到与原始值等价的时间戳（毫秒级精度）。

**验证: 需求 4.4**

### 属性 5: NULL 值处理一致性

*对于任意* 包含 NULL 值的数据行，映射后的 JavaScript 对象中对应字段应为 null（而非 undefined 或空字符串）。

**验证: 需求 4.5**

### 属性 6: JSON 格式化往返一致性

*对于任意* 有效的 JavaScript 对象数组，使用 formatJson 函数格式化后的字符串应能被 JSON.parse 正确解析，且解析结果应与原始数据深度相等。

**验证: 需求 5.1**

### 属性 7: 分页 SQL 构建正确性

*对于任意* 表名、limit 值和 offset 值，构建的分页 SQL 应包含正确的 OFFSET 和 FETCH NEXT 子句，且 limit 和 offset 值应正确嵌入 SQL 中。

**验证: 需求 4.3**

### 属性 8: 退出代码一致性

*对于任意* 错误类型，工具退出时应返回非零退出代码；对于成功执行，应返回退出代码 0。

**验证: 需求 7.4**

## 错误处理

### 错误类型定义

```javascript
// 错误代码枚举
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
  
  // 输出错误 (4xx)
  FILE_EXISTS: 401,
  WRITE_PERMISSION_DENIED: 402,
  
  // 未知错误
  UNKNOWN: 999
};
```

### 错误处理策略

1. **连接错误**: 显示详细的连接信息（隐藏密码），提供重试建议
2. **配置错误**: 显示配置文件路径和具体解析错误位置
3. **查询错误**: 显示 Oracle 原始错误代码和消息
4. **输出错误**: 提供解决方案建议（如使用 --force 覆盖）

## 测试策略

### 单元测试

使用 Vitest 作为测试框架，测试以下核心模块：

1. **配置加载器测试**
   - 测试配置文件解析
   - 测试 CLI 参数与配置文件合并
   - 测试无效配置处理

2. **类型映射器测试**
   - 测试所有 Oracle 类型到 JS 类型的映射
   - 测试未知类型的默认处理

3. **格式化器测试**
   - 测试 JSON 格式化输出
   - 测试 Object 格式化输出
   - 测试 pretty 模式

4. **数据转换测试**
   - 测试日期转换
   - 测试 NULL 值处理
   - 测试各种数据类型转换

### 属性测试

使用 fast-check 库进行属性测试，验证以下正确性属性：

1. **属性 1**: 连接参数验证一致性
2. **属性 2**: 配置合并优先级
3. **属性 3**: Oracle 类型映射完整性
4. **属性 4**: 日期转换往返一致性
5. **属性 5**: NULL 值处理一致性
6. **属性 6**: JSON 格式化往返一致性
7. **属性 7**: 分页 SQL 构建正确性
8. **属性 8**: 退出代码一致性

### 测试配置

```javascript
// vitest.config.js
export default {
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
};
```

## 目录结构

```
oracle-map-tool/
├── bin/
│   └── oracle-map.js          # CLI 入口
├── src/
│   ├── index.js               # 主模块导出
│   ├── cli/
│   │   ├── parser.js          # 参数解析
│   │   └── validator.js       # 参数验证
│   ├── config/
│   │   └── loader.js          # 配置加载
│   ├── db/
│   │   └── connection.js      # 连接管理
│   ├── mapper/
│   │   ├── schema.js          # 结构映射
│   │   └── data.js            # 数据映射
│   ├── query/
│   │   └── executor.js        # 查询执行
│   ├── output/
│   │   └── formatter.js       # 输出格式化
│   └── utils/
│       ├── logger.js          # 日志工具
│       └── errors.js          # 错误定义
├── test/
│   ├── unit/                  # 单元测试
│   └── property/              # 属性测试
├── package.json
├── vitest.config.js
└── README.md
```

## package.json 配置

```json
{
  "name": "oracle-map-tool",
  "version": "1.0.0",
  "description": "Oracle 数据库表结构与数据映射工具",
  "type": "module",
  "bin": {
    "oracle-map": "./bin/oracle-map.js"
  },
  "main": "./src/index.js",
  "exports": {
    ".": "./src/index.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "oracledb": "^6.0.0",
    "commander": "^11.0.0",
    "chalk": "^5.0.0",
    "ora": "^7.0.0"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "fast-check": "^3.0.0",
    "@vitest/coverage-v8": "^1.0.0"
  },
  "keywords": [
    "oracle",
    "database",
    "mapping",
    "cli",
    "json"
  ],
  "license": "MIT"
}
```

## npx 使用示例

```bash
# 基本用法 - 查询表数据
npx oracle-map-tool \
  --host localhost \
  --port 1521 \
  --service ORCL \
  --user scott \
  --password tiger \
  --table EMPLOYEES

# 使用自定义 SQL
npx oracle-map-tool \
  --host localhost \
  --port 1521 \
  --service ORCL \
  --user scott \
  --password tiger \
  --query "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = 10"

# 获取表结构
npx oracle-map-tool \
  --host localhost \
  --port 1521 \
  --service ORCL \
  --user scott \
  --password tiger \
  --table EMPLOYEES \
  --schema

# 输出到文件
npx oracle-map-tool \
  --host localhost \
  --port 1521 \
  --service ORCL \
  --user scott \
  --password tiger \
  --table EMPLOYEES \
  --output ./employees.json \
  --pretty

# 使用配置文件
npx oracle-map-tool \
  --config ./my-oracle-config.json \
  --table EMPLOYEES

# 分页查询
npx oracle-map-tool \
  --host localhost \
  --port 1521 \
  --service ORCL \
  --user scott \
  --password tiger \
  --table EMPLOYEES \
  --limit 100 \
  --offset 0
```
