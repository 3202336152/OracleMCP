# MCP-Tools

MCP (Model Context Protocol) 工具管理仓库，用于开发和维护各类 MCP Server。

## 项目简介

本仓库是一个 MCP 工具集合的管理项目，旨在为 AI 助手（如 Kiro、Claude Desktop 等）提供各种数据库和服务的访问能力。

## 当前包含的 MCP Server

### Oracle MCP Server

位置: `oracle-map-tool/`

为 AI 助手提供 Oracle 数据库访问能力的 MCP Server，主要功能包括：

- 📊 表数据查询和自定义 SQL 执行
- 🔍 表结构信息获取（列、主键、外键）+ 数据采样
- 📋 数据库对象管理（表、视图、存储过程、函数）
- 🔗 表关系图分析，快速构建 JOIN 查询
- 📝 完整 DDL 语句获取
- 🔎 元数据搜索（表名、列名、注释）
- 📈 列统计分析
- ⚡ SQL 执行计划分析
- ⏰ Flashback 历史数据查询
- 🛡️ 安全控制（只读查询、表白名单、行数限制）

详细文档请查看 [oracle-map-tool/README.md](oracle-map-tool/README.md)

## 仓库结构

```
MCP-Tools/
├── README.md                 # 本文件
└── oracle-map-tool/          # Oracle MCP Server
    ├── README.md             # Oracle MCP 详细文档
    ├── DEVELOPMENT.md        # 开发指南
    ├── package.json
    ├── src/                  # 源代码
    └── test/                 # 测试代码
```

## 开发计划

本仓库将持续扩展，计划支持更多数据库和服务的 MCP Server：

- [x] Oracle Database
- [ ] MySQL / MariaDB
- [ ] PostgreSQL
- [ ] MongoDB
- [ ] Redis
- [ ] 其他服务...

## 贡献指南

欢迎提交 Issue 和 Pull Request 来帮助改进本项目。

## 许可证

MIT
