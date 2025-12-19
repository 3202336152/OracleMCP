import { describe, it, expect } from 'vitest';
import { 
  buildPaginatedSql, 
  buildTableQuerySql, 
  validateSql 
} from '../../src/query/executor.js';

describe('buildPaginatedSql', () => {
  it('无分页参数应该返回原 SQL', () => {
    const sql = 'SELECT * FROM EMPLOYEES';
    expect(buildPaginatedSql(sql)).toBe(sql);
  });

  it('应该添加 OFFSET 子句', () => {
    const sql = 'SELECT * FROM EMPLOYEES';
    const result = buildPaginatedSql(sql, undefined, 10);
    expect(result).toBe('SELECT * FROM EMPLOYEES OFFSET 10 ROWS');
  });

  it('应该添加 FETCH NEXT 子句', () => {
    const sql = 'SELECT * FROM EMPLOYEES';
    const result = buildPaginatedSql(sql, 100);
    expect(result).toBe('SELECT * FROM EMPLOYEES OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
  });

  it('应该同时添加 OFFSET 和 FETCH', () => {
    const sql = 'SELECT * FROM EMPLOYEES';
    const result = buildPaginatedSql(sql, 100, 50);
    expect(result).toBe('SELECT * FROM EMPLOYEES OFFSET 50 ROWS FETCH NEXT 100 ROWS ONLY');
  });

  it('应该移除末尾分号', () => {
    const sql = 'SELECT * FROM EMPLOYEES;';
    const result = buildPaginatedSql(sql, 10);
    expect(result).not.toContain(';;');
    expect(result).toContain('FETCH NEXT 10 ROWS ONLY');
  });

  it('offset 为 0 不应该添加 OFFSET', () => {
    const sql = 'SELECT * FROM EMPLOYEES';
    const result = buildPaginatedSql(sql, undefined, 0);
    expect(result).toBe(sql);
  });
});

describe('buildTableQuerySql', () => {
  it('应该构建基础表查询', () => {
    const result = buildTableQuerySql('employees');
    expect(result).toBe('SELECT * FROM EMPLOYEES');
  });

  it('应该支持分页选项', () => {
    const result = buildTableQuerySql('employees', { limit: 10, offset: 5 });
    expect(result).toContain('OFFSET 5 ROWS');
    expect(result).toContain('FETCH NEXT 10 ROWS ONLY');
  });
});

describe('validateSql', () => {
  it('有效的 SELECT 应该通过', () => {
    expect(validateSql('SELECT * FROM EMPLOYEES').valid).toBe(true);
    expect(validateSql('select id, name from users').valid).toBe(true);
  });

  it('空 SQL 应该失败', () => {
    expect(validateSql('').valid).toBe(false);
    expect(validateSql(null).valid).toBe(false);
  });

  it('非 SELECT 语句应该失败', () => {
    expect(validateSql('UPDATE EMPLOYEES SET NAME = "test"').valid).toBe(false);
    expect(validateSql('DELETE FROM EMPLOYEES').valid).toBe(false);
  });

  it('包含危险关键字应该失败', () => {
    const result = validateSql('SELECT * FROM EMPLOYEES; DROP TABLE EMPLOYEES');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('DROP');
  });

  it('带分号的危险语句应该被检测', () => {
    const result = validateSql('SELECT 1; DELETE FROM EMPLOYEES');
    expect(result.valid).toBe(false);
  });
});
