#!/usr/bin/env node

import { OracleMcpServer } from '../src/mcp/server.js';

const server = new OracleMcpServer();
server.start().catch(console.error);
