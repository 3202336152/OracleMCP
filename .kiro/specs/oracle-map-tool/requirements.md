# 需求文档

## 简介

Oracle Map Tool 是一个 Node.js CLI 工具，用于将 Oracle 数据库中的表结构与数据映射为可配置的目标格式。该工具以 npm 包形式发布，支持通过 npx 命令直接运行，无需全局安装。

## 术语表

- **Oracle_Map_Tool**: 本工具的系统名称，负责连接 Oracle 数据库并执行数据映射操作
- **Connection_Config**: 数据库连接配置，包含 host、port、serviceName、user、password 等参数
- **Output_Format**: 输出格式类型，支持 JSON、JS Object、文件输出
- **Table_Schema**: 表结构信息，包含列名、数据类型、约束等元数据
- **Data_Mapping**: 将数据库查询结果转换为目标格式的过程

## 需求列表

### 需求 1: CLI 入口与参数解析

**用户故事:** 作为开发者，我希望通过 npx 命令运行工具并传入 CLI 参数，以便快速映射 Oracle 数据库数据而无需编写代码。

#### 验收标准

1. WHEN 用户执行 `npx oracle-map-tool` 且不带参数 THEN Oracle_Map_Tool SHALL 显示帮助信息及所有可用选项
2. WHEN 用户提供连接参数 (--host, --port, --service, --user, --password) THEN Oracle_Map_Tool SHALL 验证并存储 Connection_Config
3. WHEN 用户提供不完整的连接参数 THEN Oracle_Map_Tool SHALL 显示错误信息并指出缺少的必填字段
4. WHEN 用户指定 --table 参数 THEN Oracle_Map_Tool SHALL 查询指定的表
5. WHEN 用户指定 --query 参数并提供自定义 SQL THEN Oracle_Map_Tool SHALL 执行提供的 SQL 语句
6. WHEN 用户指定 --format 参数 (json/object/file) THEN Oracle_Map_Tool SHALL 以指定的 Output_Format 输出数据

### 需求 2: Oracle 数据库连接

**用户故事:** 作为开发者，我希望安全地连接到 Oracle 数据库，以便访问表数据和结构信息。

#### 验收标准

1. WHEN Oracle_Map_Tool 接收到有效的 Connection_Config THEN Oracle_Map_Tool SHALL 使用 oracledb 驱动建立连接
2. WHEN 连接因凭证无效而失败 THEN Oracle_Map_Tool SHALL 显示清晰的认证错误信息
3. WHEN 连接因网络问题而失败 THEN Oracle_Map_Tool SHALL 显示连接超时错误并提供重试建议
4. WHEN 连接成功建立 THEN Oracle_Map_Tool SHALL 维护连接池以供后续查询使用
5. WHEN 工具完成执行 THEN Oracle_Map_Tool SHALL 正确关闭所有数据库连接

### 需求 3: 表结构映射

**用户故事:** 作为开发者，我希望提取表结构信息，以便在映射前了解数据结构。

#### 验收标准

1. WHEN 用户使用 --schema 标志请求表结构 THEN Oracle_Map_Tool SHALL 从 Oracle 数据字典中检索列名、数据类型和约束
2. WHEN 指定的表不存在 THEN Oracle_Map_Tool SHALL 显示错误信息并提供表名建议
3. WHEN 检索结构时 THEN Oracle_Map_Tool SHALL 将 Oracle 数据类型映射为对应的 JavaScript 类型
4. WHEN 表具有主键或外键 THEN Oracle_Map_Tool SHALL 在结构输出中包含约束信息

### 需求 4: 数据查询与映射

**用户故事:** 作为开发者，我希望查询并将表数据映射为各种格式，以便在应用程序中使用这些数据。

#### 验收标准

1. WHEN 执行表查询 THEN Oracle_Map_Tool SHALL 检索所有行并将其映射为 JavaScript 对象
2. WHEN 执行自定义 SQL 查询 THEN Oracle_Map_Tool SHALL 在执行前验证 SQL 语法
3. WHEN 查询返回大数据集 THEN Oracle_Map_Tool SHALL 支持使用 --limit 和 --offset 参数进行分页
4. WHEN 映射数据时 THEN Oracle_Map_Tool SHALL 将 Oracle DATE/TIMESTAMP 转换为 ISO 8601 字符串格式
5. WHEN 映射数据时 THEN Oracle_Map_Tool SHALL 在输出中适当处理 NULL 值

### 需求 5: 输出格式处理

**用户故事:** 作为开发者，我希望以不同格式输出映射后的数据，以便与各种下游系统集成。

#### 验收标准

1. WHEN --format 为 "json" THEN Oracle_Map_Tool SHALL 将数据作为格式化的 JSON 字符串输出到 stdout
2. WHEN --format 为 "object" THEN Oracle_Map_Tool SHALL 将数据作为 JavaScript 对象字面量字符串输出
3. WHEN --output 参数指定文件路径 THEN Oracle_Map_Tool SHALL 将输出写入指定文件
4. WHEN 写入已存在的文件 THEN Oracle_Map_Tool SHALL 提示确认或使用 --force 标志覆盖
5. WHEN 提供 --pretty 标志 THEN Oracle_Map_Tool SHALL 使用缩进格式化输出以提高可读性

### 需求 6: 配置文件支持

**用户故事:** 作为开发者，我希望使用配置文件存储连接设置，以避免重复输入凭证。

#### 验收标准

1. WHEN 当前目录存在 .oraclemaprc 或 oracle-map.config.json 文件 THEN Oracle_Map_Tool SHALL 从文件加载连接设置
2. WHEN CLI 参数和配置文件同时存在 THEN Oracle_Map_Tool SHALL 优先使用 CLI 参数而非配置文件值
3. WHEN --config 参数指定自定义配置路径 THEN Oracle_Map_Tool SHALL 从指定文件加载设置
4. WHEN 配置文件包含无效 JSON THEN Oracle_Map_Tool SHALL 显示解析错误并指出行号

### 需求 7: 错误处理与日志

**用户故事:** 作为开发者，我希望获得清晰的错误信息和日志，以便有效地排查问题。

#### 验收标准

1. WHEN 发生任何错误 THEN Oracle_Map_Tool SHALL 显示用户友好的错误信息及错误代码
2. WHEN 提供 --verbose 标志 THEN Oracle_Map_Tool SHALL 输出详细的调试信息
3. WHEN SQL 执行失败 THEN Oracle_Map_Tool SHALL 显示 Oracle 错误代码和错误信息
4. WHEN 工具因错误退出 THEN Oracle_Map_Tool SHALL 返回适当的退出代码（非零）
