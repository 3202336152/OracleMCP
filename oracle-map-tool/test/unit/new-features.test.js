import { describe, it, expect } from 'vitest';
import { buildFlashbackSql } from '../../src/query/executor.js';

describe('buildFlashbackSql', () => {
  it('应该在简单 SELECT 语句中注入 AS OF TIMESTAMP', () => {
    const sql = 'SELECT * FROM USERS';
    const timestamp = '2024-01-15T14:30:00Z';
    const result = buildFlashbackSql(sql, timestamp);
    
    expect(result).toContain('AS OF TIMESTAMP');
    expect(result).toContain("TO_TIMESTAMP('2024-01-15 14:30:00'");
    expect(result).toContain('USERS AS OF TIMESTAMP');
  });

  it('应该处理带毫秒的时间戳', () => {
    const sql = 'SELECT * FROM ORDERS';
    const timestamp = '2024-01-15T14:30:00.123Z';
    const result = buildFlashbackSql(sql, timestamp);
    
    expect(result).toContain("TO_TIMESTAMP('2024-01-15 14:30:00'");
  });

  it('应该在没有时间戳时返回原始 SQL', () => {
    const sql = 'SELECT * FROM USERS';
    const result = buildFlashbackSql(sql, null);
    
    expect(result).toBe(sql);
  });

  it('应该处理带 WHERE 子句的 SQL', () => {
    const sql = 'SELECT * FROM USERS WHERE ID = 1';
    const timestamp = '2024-01-15T14:30:00Z';
    const result = buildFlashbackSql(sql, timestamp);
    
    expect(result).toContain('USERS AS OF TIMESTAMP');
    expect(result).toContain('WHERE ID = 1');
  });

  it('应该处理小写的 FROM', () => {
    const sql = 'select * from users';
    const timestamp = '2024-01-15T14:30:00Z';
    const result = buildFlashbackSql(sql, timestamp);
    
    expect(result).toContain('AS OF TIMESTAMP');
  });
});

describe('Flashback Query 时间戳格式', () => {
  it('应该正确解析 ISO 8601 格式', () => {
    const sql = 'SELECT * FROM TEST';
    
    // 标准格式
    let result = buildFlashbackSql(sql, '2024-12-19T10:00:00Z');
    expect(result).toContain("'2024-12-19 10:00:00'");
    
    // 带毫秒
    result = buildFlashbackSql(sql, '2024-12-19T10:00:00.000Z');
    expect(result).toContain("'2024-12-19 10:00:00'");
  });
});
