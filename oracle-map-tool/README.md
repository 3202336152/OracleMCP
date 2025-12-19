# Oracle MCP Server

Oracle 数据库 MCP Server - 为 AI 助手提供 Oracle 数据库访问能力。

基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 实现，可与 Kiro、Claude Desktop 等 AI 助手集成。

## 特性

- 🔌 标准 MCP 协议，兼容所有 MCP 客户端
- 📊 支持表数据查询和自定义 SQL
- 🔍 获取表结构信息（列、主键、外键）+ 数据采样
- 📋 列出所有用户表、视图、存储过程、函数
- 🔗 获取表关系图（父表/子表关联），快速构建 JOIN 查询
- 📝 获取完整 DDL 语句（含约束、索引、分区、注释）
- 📖 查看存储过程/函数的参数签名和源代码
- 🔒 安全可控（支持只读查询和受限写入）
- 🛡️ 支持表白名单和硬性行数限制（最大 1000 行）
- 📦 自动处理 LOB 大对象截断（CLOB 4000 字符，BLOB 1024 字节）
- 💪 连接池健康检查，自动恢复失效连接
- 🔎 **元数据搜索**: 通过关键词搜索表名、列名、注释，快速定位业务数据
- 📈 **列统计分析**: 获取列的基数、分布、Top N 值，理解数据特征
- ⚡ **执行计划分析**: 自动识别全表扫描、索引缺失等性能问题
- ⏰ **Flashback 查询**: 查询历史时间点数据，排查数据变更问题
- ✏️ **数据写入**: 支持 INSERT/UPDATE 操作，自动事务管理，内置安全机制

## 安装

```bash
npm install -g oracle-mcp-server
```

## 前置要求

- Node.js >= 18.0.0
- Oracle Instant Client（oracledb 驱动需要）

## MCP 配置

### Kiro 配置

在 `~/.kiro/settings/mcp.json` 或项目的 `.kiro/settings/mcp.json` 中添加：

**方式一：通过环境变量配置连接信息（推荐）**

```json
{
  "mcpServers": {
    "oracle": {
      "command": "npx",
      "args": ["-y", "oracle-mcp-server"],
      "env": {
        "ORACLE_HOST": "192.168.1.100",
        "ORACLE_PORT": "1521",
        "ORACLE_SERVICE": "ORCL",
        "ORACLE_USER": "scott",
        "ORACLE_PASSWORD": "tiger"
      }
    }
  }
}
```

启动时会自动连接数据库，无需手动调用 `oracle_connect`。

**方式二：不配置环境变量，手动连接**

```json
{
  "mcpServers": {
    "oracle": {
      "command": "npx",
      "args": ["-y", "oracle-mcp-server"]
    }
  }
}
```

需要在对话中先调用 `oracle_connect` 连接数据库。

### Claude Desktop 配置

在 Claude Desktop 配置文件中添加：

```json
{
  "mcpServers": {
    "oracle": {
      "command": "npx",
      "args": ["-y", "oracle-mcp-server"],
      "env": {
        "ORACLE_HOST": "192.168.1.100",
        "ORACLE_PORT": "1521",
        "ORACLE_SERVICE": "ORCL",
        "ORACLE_USER": "scott",
        "ORACLE_PASSWORD": "tiger"
      }
    }
  }
}
```

## 环境变量

| 变量 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| ORACLE_HOST | 是 | 数据库主机地址 | - |
| ORACLE_PORT | 否 | 端口号 | 1521 |
| ORACLE_SERVICE | 是 | Oracle 服务名 | - |
| ORACLE_USER | 是 | 用户名 | - |
| ORACLE_PASSWORD | 是 | 密码 | - |
| ORACLE_TABLE_WHITELIST | 否 | 允许访问的表白名单（逗号分隔） | - |

配置环境变量后，MCP Server 启动时会自动连接数据库。

## 安全配置

### 表白名单

通过 `ORACLE_TABLE_WHITELIST` 环境变量可以限制只允许访问特定的表：

```json
{
  "mcpServers": {
    "oracle": {
      "command": "npx",
      "args": ["-y", "oracle-mcp-server"],
      "env": {
        "ORACLE_HOST": "192.168.1.100",
        "ORACLE_PORT": "1521",
        "ORACLE_SERVICE": "ORCL",
        "ORACLE_USER": "scott",
        "ORACLE_PASSWORD": "tiger",
        "ORACLE_TABLE_WHITELIST": "EMPLOYEES,DEPARTMENTS,JOBS"
      }
    }
  }
}
```

不配置此变量则允许访问所有表。

### 内置安全限制

| 限制项 | 值 | 说明 |
|--------|-----|------|
| 最大返回行数 | 1000 | 硬性限制，防止意外请求过多数据 |
| CLOB 截断长度 | 4000 字符 | 超出部分显示 `... [已截断]` |
| BLOB 截断长度 | 1024 字节 | 超出部分显示 `... [已截断]` |
| DML 操作限制 | INSERT/UPDATE | 禁止 DELETE/TRUNCATE/DROP |
| UPDATE 安全 | 必须带 WHERE | 防止全表更新 |

### 安全建议

⚠️ **重要**: 代码层的 SQL 验证（正则过滤）可能被绕过。强烈建议：

1. **数据库层面限制权限**: 根据需求授予适当权限
   ```sql
   -- 只读场景：仅授权查询权限
   GRANT SELECT ANY TABLE TO mcp_user;
   
   -- 读写场景：授权查询和写入权限
   GRANT SELECT, INSERT, UPDATE ON schema.table_name TO mcp_user;
   
   -- 注意：不建议授予 DELETE 权限，MCP 代码层也禁止 DELETE 操作
   ```

2. **使用表白名单**: 通过 `ORACLE_TABLE_WHITELIST` 限制可访问的表

3. **网络隔离**: 建议 MCP Server 部署在与数据库同一内网

## 可用工具

### 连接管理

#### oracle_connect
连接到 Oracle 数据库。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| host | string | 是 | 数据库主机地址 |
| port | number | 否 | 端口号（默认 1521） |
| serviceName | string | 是 | Oracle 服务名 |
| user | string | 是 | 用户名 |
| password | string | 是 | 密码 |

#### oracle_disconnect
断开 Oracle 数据库连接。

---

### 表结构探索

#### oracle_list_tables
列出当前用户的所有表。

**返回示例：**
```json
[
  { "name": "EMPLOYEES", "rowCount": 107, "lastAnalyzed": "2024-01-15T10:30:00Z" }
]
```

#### oracle_describe_table
获取表结构信息，可选返回采样数据帮助理解字段含义。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| table | string | 是 | 表名 |
| includeSample | boolean | 否 | 是否包含采样数据（默认 false） |
| sampleSize | number | 否 | 采样行数 1-10（默认 3） |

**返回示例：**
```json
{
  "tableName": "EMPLOYEES",
  "columns": [
    { "name": "EMPLOYEE_ID", "oracleType": "NUMBER", "jsType": "number", "nullable": false }
  ],
  "primaryKey": ["EMPLOYEE_ID"],
  "foreignKeys": [
    { "column": "DEPARTMENT_ID", "refTable": "DEPARTMENTS", "refColumn": "DEPARTMENT_ID" }
  ],
  "sampleData": [
    { "EMPLOYEE_ID": 100, "FIRST_NAME": "Steven", "LAST_NAME": "King" }
  ]
}
```

#### oracle_get_ddl
获取数据库对象的完整 DDL 语句，包含约束、索引、分区和注释信息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| objectName | string | 是 | 对象名称 |
| objectType | string | 否 | TABLE/VIEW/INDEX/SEQUENCE/TRIGGER（默认 TABLE） |

**返回示例：**
```sql
CREATE TABLE "SCOTT"."EMPLOYEES" (
  "EMPLOYEE_ID" NUMBER(6,0) NOT NULL,
  "FIRST_NAME" VARCHAR2(20),
  CONSTRAINT "EMP_EMP_ID_PK" PRIMARY KEY ("EMPLOYEE_ID")
)
```

#### oracle_schema_graph
获取表的关系图，返回父表（外键引用的表）和子表（引用该表的表），帮助快速构建 JOIN 查询。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| table | string | 是 | 中心表名 |

**返回示例：**
```json
{
  "centerTable": "EMPLOYEES",
  "parents": [
    { "table": "DEPARTMENTS", "fkColumn": "DEPARTMENT_ID", "pkColumn": "DEPARTMENT_ID" }
  ],
  "children": [
    { "table": "JOB_HISTORY", "fkColumn": "EMPLOYEE_ID", "pkColumn": "EMPLOYEE_ID" }
  ],
  "totalRelations": 2
}
```

---

### 数据库对象

#### oracle_list_objects
列出数据库对象（表、视图、存储过程、函数等）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| objectType | string | 否 | ALL/TABLE/VIEW/PROCEDURE/FUNCTION/PACKAGE（默认 ALL） |

**返回示例：**
```json
[
  { "OBJECT_NAME": "GET_EMPLOYEE", "OBJECT_TYPE": "FUNCTION", "STATUS": "VALID" }
]
```

#### oracle_describe_procedure
获取存储过程或函数的参数签名和源代码。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 存储过程或函数名称 |

**返回示例：**
```json
{
  "name": "GET_EMPLOYEE",
  "type": "FUNCTION",
  "parameters": [
    { "name": "P_EMP_ID", "position": 1, "dataType": "NUMBER", "direction": "IN" }
  ],
  "sourceCode": "FUNCTION GET_EMPLOYEE(P_EMP_ID NUMBER) RETURN VARCHAR2 IS..."
}
```

---

### 数据查询

#### oracle_query
执行只读 SQL 查询（仅支持 SELECT）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sql | string | 是 | SQL 查询语句 |
| limit | number | 否 | 限制返回行数（默认 100，最大 1000） |

#### oracle_table_data
查询表数据。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| table | string | 是 | 表名 |
| limit | number | 否 | 限制返回行数（默认 100，最大 1000） |
| offset | number | 否 | 跳过行数（默认 0） |

#### oracle_table_count
获取表的行数。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| table | string | 是 | 表名 |

---

### 智能分析（新增）

#### oracle_search_metadata
通过关键词搜索表名、列名、注释和视图定义，帮助定位业务数据所在位置。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 是 | 搜索关键词（支持中英文） |
| searchTables | boolean | 否 | 是否搜索表（默认 true） |
| searchColumns | boolean | 否 | 是否搜索列（默认 true） |
| searchViews | boolean | 否 | 是否搜索视图（默认 true） |
| limit | number | 否 | 每类结果最大返回数（默认 50） |

**返回示例：**
```json
{
  "keyword": "客户",
  "totalMatches": 5,
  "tables": [
    { "tableName": "T_CUSTOMER", "comment": "客户主表", "rowCount": 10000 }
  ],
  "columns": [
    { "tableName": "T_ORDER", "columnName": "CUSTOMER_ID", "comment": "客户ID", "dataType": "NUMBER" }
  ],
  "views": [
    { "viewName": "V_CUSTOMER_ORDER", "comment": "客户订单视图", "textPreview": "SELECT..." }
  ]
}
```

#### oracle_column_stats
获取列的统计信息（基数、分布、Top N 值等），帮助理解数据特征。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| table | string | 是 | 表名 |
| column | string | 否 | 列名（不传则统计所有列） |
| topN | number | 否 | Top N 频繁值数量（默认 10） |
| includeHistogram | boolean | 否 | 是否包含值分布（默认 true） |

**返回示例：**
```json
{
  "tableName": "EMPLOYEES",
  "columnCount": 1,
  "columns": [{
    "columnName": "DEPARTMENT_ID",
    "dataType": "NUMBER",
    "nullable": true,
    "totalCount": 107,
    "nonNullCount": 106,
    "nullCount": 1,
    "nullRatio": "0.93%",
    "distinctCount": 11,
    "cardinality": "10.28%",
    "numericStats": {
      "min": 10, "max": 110, "avg": 51.5, "median": 50, "stddev": 28.5,
      "zeroCount": 0, "zeroRatio": "0%"
    },
    "topValues": [
      { "value": 50, "count": 45, "ratio": "42.06%" },
      { "value": 80, "count": 34, "ratio": "31.78%" }
    ]
  }]
}
```

#### oracle_explain_plan
获取 SQL 执行计划，分析性能瓶颈（全表扫描、索引缺失等）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sql | string | 是 | SQL 查询语句（仅 SELECT） |
| format | string | 否 | BASIC/TYPICAL/ALL（默认 TYPICAL） |

**返回示例：**
```json
{
  "sql": "SELECT * FROM EMPLOYEES WHERE SALARY > 10000",
  "planText": "Plan hash value: 1445457117\n...",
  "analysis": {
    "warnings": [
      {
        "type": "FULL_TABLE_SCAN",
        "message": "全表扫描: EMPLOYEES",
        "severity": "HIGH",
        "suggestion": "考虑在 WHERE 条件列上创建索引"
      }
    ],
    "estimatedCost": 3,
    "estimatedRows": 107,
    "summary": "发现 1 个潜在问题"
  },
  "format": "TYPICAL"
}
```

#### oracle_flashback_query
查询历史时间点的数据（Flashback Query），用于排查"数据什么时候变的"。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sql | string | 是 | SQL 查询语句（仅 SELECT） |
| asOfTimestamp | string | 是 | 历史时间点（ISO 8601 格式） |
| limit | number | 否 | 限制返回行数（默认 100） |

**返回示例：**
```json
{
  "asOfTimestamp": "2024-01-15T14:30:00Z",
  "rowCount": 1,
  "columns": ["EMPLOYEE_ID", "SALARY"],
  "data": [{ "EMPLOYEE_ID": 100, "SALARY": 20000 }],
  "executionTime": 45,
  "sql": "SELECT * FROM EMPLOYEES AS OF TIMESTAMP TO_TIMESTAMP('2024-01-15 14:30:00', 'YYYY-MM-DD HH24:MI:SS') WHERE EMPLOYEE_ID = 100"
}
```

**注意**: Flashback Query 依赖 Oracle UNDO 表空间，历史数据保留时间取决于 `UNDO_RETENTION` 参数。

---

### 数据写入

#### oracle_execute_dml
执行 DML 语句（INSERT/UPDATE），自动事务管理。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sql | string | 是 | DML 语句（仅 INSERT 或 UPDATE） |

**安全机制：**
- 只允许 INSERT 和 UPDATE 语句
- 禁止 DELETE、TRUNCATE、DROP 等危险操作
- UPDATE 必须包含 WHERE 子句，防止全表更新

**返回示例：**
```json
{
  "success": true,
  "verb": "UPDATE",
  "rowsAffected": 1,
  "executionTime": 45,
  "sql": "UPDATE EMPLOYEES SET SALARY = 25000 WHERE EMPLOYEE_ID = 100"
}
```

#### oracle_insert_record
将 JSON 对象插入表中，无需手写 SQL。使用绑定变量，天然防止 SQL 注入。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| table | string | 是 | 表名 |
| data | object | 是 | JSON 数据对象 |

**返回示例：**
```json
{
  "success": true,
  "table": "EMPLOYEES",
  "rowsAffected": 1,
  "columns": ["EMPLOYEE_ID", "FIRST_NAME", "LAST_NAME", "SALARY"],
  "executionTime": 32
}
```

**优势：**
- 无需手写 INSERT 语句
- 自动处理字符串转义
- 绑定变量防止 SQL 注入
- 自动事务提交

---

### 安全配置

#### oracle_security_config
获取当前安全配置信息。

**返回示例：**
```json
{
  "maxRowsLimit": 1000,
  "clobMaxLength": 4000,
  "blobMaxLength": 1024,
  "tableWhitelistEnabled": true,
  "tableWhitelist": ["EMPLOYEES", "DEPARTMENTS"],
  "note": "安全提示: 建议在数据库层面限制用户只有 SELECT 权限"
}
```

## 使用示例

配置完成后，在 AI 助手中可以这样使用：

### 基础查询

**列出所有表**
```
帮我列出数据库中所有的表
```

**查看表结构**
```
查看 EMPLOYEES 表的结构
查看 EMPLOYEES 表结构，包含 5 行采样数据
```

**查询数据**
```
查询 EMPLOYEES 表前 10 条数据
执行 SQL: SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = 10
```

---

### 结构探索

**获取 DDL**
```
获取 EMPLOYEES 表的完整 DDL
获取 V_EMP_DEPT 视图的 DDL
```

**查看表关系**
```
查看 EMPLOYEES 表的关联关系，找出它的父表和子表
帮我分析 ORDER 表和哪些表有外键关联
```

---

### 对象管理

**列出数据库对象**
```
列出所有视图
列出所有存储过程和函数
```

**查看存储过程/函数**
```
查看 GET_EMPLOYEE 函数的参数和源代码
```

---

### 元数据搜索 (oracle_search_metadata)

当你不知道数据存在哪张表时，可以通过关键词搜索表名、列名和注释：

**搜索业务数据位置**
```
搜索包含"客户"关键词的表和字段
帮我找一下哪些表或字段和"订单"相关
数据库里有没有存储"手机号"的字段？
```

**搜索特定表**
```
搜索表名包含 TEMP 的临时表
找一下所有和 EMAIL 相关的表和列
```

**示例返回**
```json
{
  "keyword": "客户",
  "totalMatches": 5,
  "tables": [
    { "tableName": "T_CUSTOMER", "comment": "客户主表", "rowCount": 10000 }
  ],
  "columns": [
    { "tableName": "T_ORDER", "columnName": "CUSTOMER_ID", "comment": "客户ID" }
  ]
}
```

---

### 列统计分析 (oracle_column_stats)

了解数据分布特征，帮助决策查询策略：

**分析单列**
```
分析 EMPLOYEES 表的 SALARY 列统计信息
看一下 T_ORDER 表的 STATUS 字段有哪些值，分布如何
```

**分析整表**
```
分析 T_USER 表所有列的统计信息
```

**典型场景**
- 判断某列是否适合建索引（看基数/cardinality）
- 了解数据分布决定 GROUP BY 策略
- 发现数据质量问题（NULL 比例过高）

**示例返回**
```json
{
  "columnName": "STATUS",
  "totalCount": 10000,
  "distinctCount": 5,
  "cardinality": "0.05%",
  "nullRatio": "0%",
  "topValues": [
    { "value": "ACTIVE", "count": 8000, "ratio": "80%" },
    { "value": "INACTIVE", "count": 1500, "ratio": "15%" }
  ]
}
```

---

### 执行计划分析 (oracle_explain_plan)

分析 SQL 性能问题，识别优化点：

**分析慢查询**
```
分析这个 SQL 的执行计划: SELECT * FROM EMPLOYEES WHERE SALARY > 10000
这个查询为什么很慢？帮我分析一下: SELECT * FROM T_ORDER WHERE CREATE_DATE > SYSDATE - 30
```

**检查索引使用**
```
看一下这个 SQL 有没有走索引: SELECT * FROM T_USER WHERE PHONE = '13800138000'
```

**自动识别的问题**
- `FULL_TABLE_SCAN` - 全表扫描（建议加索引）
- `INDEX_FULL_SCAN` - 索引全扫描（检查是否可优化）
- `CARTESIAN_JOIN` - 笛卡尔积（检查 JOIN 条件）
- `SORT_OPERATION` - 排序操作（大数据量时注意）
- `HIGH_COST` - 执行成本过高

**示例返回**
```json
{
  "planText": "| TABLE ACCESS FULL | EMPLOYEES |",
  "analysis": {
    "warnings": [{
      "type": "FULL_TABLE_SCAN",
      "message": "全表扫描: EMPLOYEES",
      "severity": "HIGH",
      "suggestion": "考虑在 WHERE 条件列上创建索引"
    }],
    "estimatedCost": 156,
    "summary": "发现 1 个潜在问题"
  }
}
```

---

### Flashback 历史查询 (oracle_flashback_query)

查询历史时间点的数据，排查"数据什么时候变的"：

**查询历史数据**
```
查询昨天下午 2 点时 EMPLOYEES 表中 ID=100 的数据
看一下 T_ORDER 表在 2024-01-15 10:00:00 时订单 ORD001 的状态
```

**对比数据变化**
```
对比一下 T_CONFIG 表现在和 1 小时前的数据有什么变化
```

**排查数据问题**
```
用户说他的余额昨天还是 1000，帮我查一下昨天这个时候 T_ACCOUNT 表里 USER_ID=123 的余额是多少
```

**时间格式**
- ISO 8601 格式: `2024-01-15T14:30:00Z`
- 支持精确到秒

**示例返回**
```json
{
  "asOfTimestamp": "2024-01-15T14:30:00Z",
  "data": [{ "EMPLOYEE_ID": 100, "SALARY": 20000 }],
  "sql": "SELECT * FROM EMPLOYEES AS OF TIMESTAMP TO_TIMESTAMP('2024-01-15 14:30:00', ...) WHERE EMPLOYEE_ID = 100"
}
```

**注意事项**
- 依赖 Oracle UNDO 表空间，历史数据保留时间取决于 `UNDO_RETENTION` 参数
- 如果提示 `ORA-01555`，说明历史数据已过期，尝试更近的时间点

---

### 数据写入 (oracle_execute_dml / oracle_insert_record)

执行数据插入和更新操作：

**使用 SQL 语句**
```
插入一条员工记录: INSERT INTO EMPLOYEES (EMPLOYEE_ID, FIRST_NAME, SALARY) VALUES (999, 'Test', 5000)
更新员工薪资: UPDATE EMPLOYEES SET SALARY = 25000 WHERE EMPLOYEE_ID = 100
```

**使用 JSON 对象插入**
```
往 EMPLOYEES 表插入数据: {"EMPLOYEE_ID": 999, "FIRST_NAME": "张三", "SALARY": 8000}
帮我插入一条订单记录到 T_ORDER 表: {"ORDER_NO": "ORD001", "CUSTOMER_ID": 123, "AMOUNT": 999.99}
```

**安全限制**
- 只允许 INSERT 和 UPDATE
- 禁止 DELETE、TRUNCATE、DROP
- UPDATE 必须带 WHERE 子句

---

### 安全检查

**查看安全配置**
```
查看当前安全配置
当前允许访问哪些表？
```

## 技术细节

### 连接池配置
- 最小连接数: 1
- 最大连接数: 4
- 连接超时: 60 秒
- 自动 Ping 间隔: 60 秒（检测失效连接）

### LOB 处理
- CLOB/NCLOB/LONG: 自动转为字符串，超过 4000 字符截断
- BLOB/RAW: 自动转为 Base64，超过 1024 字节截断
- 截断内容末尾显示 `... [已截断]`

### 分页策略
- 使用 Oracle 12c+ 的 `OFFSET ... FETCH NEXT` 语法
- 硬性限制最大 1000 行，防止内存溢出

## 许可证

MIT
