# Oracle MCP Server 开发指南

本文档介绍如何进行本地测试和发布到 npm。

## 目录

- [前置要求](#前置要求)
- [本地测试](#本地测试)
- [发布到 npm](#发布到-npm)
- [常见问题](#常见问题)

---

## 前置要求

### 1. Node.js 环境

```bash
# 检查 Node.js 版本（需要 >= 18）
node --version
```

### 2. Oracle Instant Client

oracledb 驱动需要 Oracle Instant Client。

**macOS 安装：**

```bash
# 使用 Homebrew
brew tap instantclienttap/instantclient
brew install instantclient-basic
```

**或手动安装：**

1. 从 [Oracle 官网](https://www.oracle.com/database/technologies/instant-client/downloads.html) 下载
2. 解压到 `/opt/oracle/instantclient_21_x`
3. 设置环境变量：

```bash
export DYLD_LIBRARY_PATH=/opt/oracle/instantclient_21_x:$DYLD_LIBRARY_PATH
```

### 3. 安装项目依赖

```bash
cd oracle-map-tool
npm install
```

---

## 本地测试

### 方式一：在 Kiro 中测试（推荐）

#### 步骤 1：配置 MCP

编辑 `~/.kiro/settings/mcp.json`：

```json
{
  "mcpServers": {
    "oracle": {
      "command": "node",
      "args": ["/完整路径/oracle-map-tool/bin/oracle-mcp-server.js"],
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

> 注意：`args` 中的路径需要替换为你本地的完整路径

#### 步骤 2：重启 Kiro

配置修改后需要重启 Kiro，或：
- 打开命令面板：`Cmd+Shift+P`（macOS）/ `Ctrl+Shift+P`（Windows）
- 搜索 "MCP" 相关命令重新连接

#### 步骤 3：验证功能

在 Kiro 对话中测试：

```
列出所有 Oracle 表
```

```
查看 EMPLOYEES 表的结构
```

```
执行 SQL: SELECT * FROM DUAL
```

```
查询 EMPLOYEES 表前 10 条数据
```

---

### 方式二：命令行直接测试

#### 测试 MCP Server 启动

```bash
cd oracle-map-tool

# 设置环境变量并启动
ORACLE_HOST=192.168.1.100 \
ORACLE_PORT=1521 \
ORACLE_SERVICE=ORCL \
ORACLE_USER=scott \
ORACLE_PASSWORD=tiger \
node bin/oracle-mcp-server.js
```

**预期输出：**

```
[oracle-mcp-server] 已通过环境变量自动连接到 192.168.1.100:1521/ORCL
```

按 `Ctrl+C` 退出。

#### 测试无环境变量启动

```bash
node bin/oracle-mcp-server.js
```

Server 会正常启动，等待 MCP 客户端连接（无自动连接日志）。

---

### 方式三：使用 MCP Inspector

MCP Inspector 提供 Web 界面测试工具调用。

```bash
# 安装 Inspector
npm install -g @modelcontextprotocol/inspector

# 启动测试
cd oracle-map-tool
npx @modelcontextprotocol/inspector node bin/oracle-mcp-server.js
```

浏览器会自动打开测试界面，可以：
- 查看所有可用工具列表
- 手动填写参数调用工具
- 查看返回结果

---

### 方式四：运行单元测试

```bash
cd oracle-map-tool

# 运行所有测试
npm test

# 运行测试并查看覆盖率
npm run test:coverage
```

---

## 发布到 npm

### 步骤 1：注册/登录 npm

```bash
# 如果没有 npm 账号，先注册
npm adduser

# 如果已有账号，登录
npm login

# 验证登录状态
npm whoami
```

### 步骤 2：检查包名可用性

```bash
# 搜索包名是否已被占用
npm search oracle-mcp-server

# 或直接查看
npm view oracle-mcp-server
```

如果包名已被占用，需要修改 `package.json` 中的 `name` 字段。

### 步骤 3：完善 package.json

确保以下字段已配置：

```json
{
  "name": "oracle-mcp-server",
  "version": "1.0.0",
  "description": "Oracle 数据库 MCP Server - 为 AI 助手提供 Oracle 数据库访问能力",
  "author": "你的名字 <email@example.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/你的用户名/oracle-mcp-server.git"
  },
  "homepage": "https://github.com/你的用户名/oracle-mcp-server#readme",
  "bugs": {
    "url": "https://github.com/你的用户名/oracle-mcp-server/issues"
  },
  "files": [
    "bin/",
    "src/",
    "README.md"
  ]
}
```

### 步骤 4：预览发布内容

```bash
# 查看将要发布的文件列表
npm pack --dry-run
```

确认只包含必要文件，不包含 `node_modules`、测试文件等。

### 步骤 5：发布

```bash
# 正式发布
npm publish

# 如果是 scoped 包（如 @yourname/oracle-mcp-server），需要：
npm publish --access public
```

### 步骤 6：验证发布

```bash
# 查看已发布的包
npm view oracle-mcp-server

# 使用 npx 测试
npx oracle-mcp-server
```

---

## 发布后使用

发布成功后，用户可以这样配置 MCP：

```json
{
  "mcpServers": {
    "oracle": {
      "command": "npx",
      "args": ["-y", "oracle-mcp-server"],
      "env": {
        "ORACLE_HOST": "数据库IP",
        "ORACLE_PORT": "1521",
        "ORACLE_SERVICE": "服务名",
        "ORACLE_USER": "用户名",
        "ORACLE_PASSWORD": "密码"
      }
    }
  }
}
```

---

## 版本更新

### 更新版本号

```bash
# 补丁版本 1.0.0 -> 1.0.1（bug 修复）
npm version patch

# 次版本 1.0.0 -> 1.1.0（新功能，向后兼容）
npm version minor

# 主版本 1.0.0 -> 2.0.0（破坏性变更）
npm version major
```

### 发布新版本

```bash
npm publish
```

---

## 常见问题

### 连接问题

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `DPI-1047: Cannot locate a 64-bit Oracle Client library` | 未安装 Oracle Instant Client | 参考前置要求安装 |
| `ORA-12541: TNS:no listener` | 数据库地址或端口错误 | 检查 ORACLE_HOST 和 ORACLE_PORT |
| `ORA-12514: TNS:listener does not currently know of service` | 服务名错误 | 检查 ORACLE_SERVICE |
| `ORA-01017: invalid username/password` | 用户名或密码错误 | 检查 ORACLE_USER 和 ORACLE_PASSWORD |
| `ORA-28000: the account is locked` | 账户被锁定 | 联系 DBA 解锁账户 |

### Kiro 集成问题

| 问题 | 解决方案 |
|------|----------|
| Kiro 中看不到 oracle 工具 | 检查 mcp.json 路径是否正确，重启 Kiro |
| 工具调用超时 | 检查数据库网络连通性 |
| 环境变量未生效 | 确保 env 配置在 mcp.json 中正确设置 |

### npm 发布问题

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `403 Forbidden` | 包名已被占用 | 更换包名 |
| `401 Unauthorized` | 未登录或 token 过期 | 重新 `npm login` |
| `402 Payment Required` | scoped 包需要付费 | 使用 `--access public` |
| `E409 Conflict` | 版本号已存在 | 更新版本号后重试 |

---

## 项目结构

```
oracle-map-tool/
├── bin/
│   └── oracle-mcp-server.js    # MCP Server 入口
├── src/
│   ├── index.js                # 模块导出
│   ├── mcp/
│   │   └── server.js           # MCP Server 实现
│   ├── db/
│   │   └── connection.js       # 数据库连接管理
│   ├── mapper/
│   │   ├── schema.js           # 表结构映射
│   │   └── data.js             # 数据类型映射
│   ├── query/
│   │   └── executor.js         # SQL 执行
│   └── utils/
│       └── errors.js           # 错误处理
├── test/
│   └── unit/                   # 单元测试
├── package.json
├── README.md                   # 用户文档
└── DEVELOPMENT.md              # 开发文档（本文件）
```
