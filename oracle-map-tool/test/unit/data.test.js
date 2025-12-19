import { describe, it, expect } from 'vitest';
import { 
  dateToIso, 
  isoToDate, 
  handleNull, 
  mapValue, 
  mapRow,
  mapRows 
} from '../../src/mapper/data.js';

describe('dateToIso', () => {
  it('应该将 Date 转换为 ISO 字符串', () => {
    const date = new Date('2024-01-15T10:30:00.000Z');
    expect(dateToIso(date)).toBe('2024-01-15T10:30:00.000Z');
  });

  it('应该处理 null 值', () => {
    expect(dateToIso(null)).toBe(null);
    expect(dateToIso(undefined)).toBe(null);
  });

  it('应该处理无效日期', () => {
    expect(dateToIso(new Date('invalid'))).toBe(null);
  });

  it('非 Date 类型应该原样返回', () => {
    expect(dateToIso('2024-01-15')).toBe('2024-01-15');
  });
});

describe('isoToDate', () => {
  it('应该将 ISO 字符串解析为 Date', () => {
    const result = isoToDate('2024-01-15T10:30:00.000Z');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  it('应该处理 null 值', () => {
    expect(isoToDate(null)).toBe(null);
    expect(isoToDate(undefined)).toBe(null);
  });

  it('应该处理无效字符串', () => {
    expect(isoToDate('invalid')).toBe(null);
  });
});

describe('日期往返一致性', () => {
  it('Date -> ISO -> Date 应该保持一致', () => {
    const original = new Date('2024-06-15T14:30:45.123Z');
    const iso = dateToIso(original);
    const parsed = isoToDate(iso);
    
    expect(parsed.getTime()).toBe(original.getTime());
  });
});

describe('handleNull', () => {
  it('undefined 应该转换为 null', () => {
    expect(handleNull(undefined)).toBe(null);
  });

  it('null 应该保持为 null', () => {
    expect(handleNull(null)).toBe(null);
  });

  it('其他值应该原样返回', () => {
    expect(handleNull(0)).toBe(0);
    expect(handleNull('')).toBe('');
    expect(handleNull('value')).toBe('value');
  });
});

describe('mapValue', () => {
  it('应该将 Date 转换为 ISO 字符串', () => {
    const date = new Date('2024-01-15T10:30:00.000Z');
    expect(mapValue(date, 'DATE')).toBe('2024-01-15T10:30:00.000Z');
    expect(mapValue(date, 'TIMESTAMP')).toBe('2024-01-15T10:30:00.000Z');
  });

  it('应该处理 NULL 值', () => {
    expect(mapValue(null, 'VARCHAR2')).toBe(null);
    expect(mapValue(undefined, 'NUMBER')).toBe(null);
  });

  it('应该将 Buffer 转换为 Base64', () => {
    const buffer = Buffer.from('hello');
    expect(mapValue(buffer, 'BLOB')).toBe('aGVsbG8=');
  });

  it('普通值应该原样返回', () => {
    expect(mapValue('test', 'VARCHAR2')).toBe('test');
    expect(mapValue(123, 'NUMBER')).toBe(123);
  });
});

describe('mapRow', () => {
  it('应该将数组行映射为对象', () => {
    const row = ['John', 30, null];
    const columns = [
      { name: 'NAME', oracleType: 'VARCHAR2' },
      { name: 'AGE', oracleType: 'NUMBER' },
      { name: 'EMAIL', oracleType: 'VARCHAR2' }
    ];
    
    const result = mapRow(row, columns);
    
    expect(result).toEqual({
      NAME: 'John',
      AGE: 30,
      EMAIL: null
    });
  });

  it('应该正确处理日期列', () => {
    const date = new Date('2024-01-15T10:30:00.000Z');
    const row = [date];
    const columns = [{ name: 'CREATED_AT', oracleType: 'DATE' }];
    
    const result = mapRow(row, columns);
    
    expect(result.CREATED_AT).toBe('2024-01-15T10:30:00.000Z');
  });
});

describe('mapRows', () => {
  it('应该映射多行数据', () => {
    const rows = [
      ['John', 30],
      ['Jane', 25]
    ];
    const columns = [
      { name: 'NAME', oracleType: 'VARCHAR2' },
      { name: 'AGE', oracleType: 'NUMBER' }
    ];
    
    const result = mapRows(rows, columns);
    
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ NAME: 'John', AGE: 30 });
    expect(result[1]).toEqual({ NAME: 'Jane', AGE: 25 });
  });
});
