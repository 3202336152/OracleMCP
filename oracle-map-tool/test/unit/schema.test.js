import { describe, it, expect } from 'vitest';
import { mapOracleType, isValidJsType, TYPE_MAPPING, VALID_JS_TYPES } from '../../src/mapper/schema.js';

describe('TYPE_MAPPING', () => {
  it('应该包含字符串类型映射', () => {
    expect(TYPE_MAPPING['VARCHAR2']).toBe('string');
    expect(TYPE_MAPPING['CHAR']).toBe('string');
    expect(TYPE_MAPPING['CLOB']).toBe('string');
  });

  it('应该包含数字类型映射', () => {
    expect(TYPE_MAPPING['NUMBER']).toBe('number');
    expect(TYPE_MAPPING['INTEGER']).toBe('number');
    expect(TYPE_MAPPING['FLOAT']).toBe('number');
  });

  it('应该包含日期类型映射', () => {
    expect(TYPE_MAPPING['DATE']).toBe('Date');
    expect(TYPE_MAPPING['TIMESTAMP']).toBe('Date');
  });

  it('应该包含二进制类型映射', () => {
    expect(TYPE_MAPPING['BLOB']).toBe('Buffer');
    expect(TYPE_MAPPING['RAW']).toBe('Buffer');
  });
});

describe('mapOracleType', () => {
  it('应该正确映射基础类型', () => {
    expect(mapOracleType('VARCHAR2')).toBe('string');
    expect(mapOracleType('NUMBER')).toBe('number');
    expect(mapOracleType('DATE')).toBe('Date');
    expect(mapOracleType('BLOB')).toBe('Buffer');
  });

  it('应该处理带长度的类型', () => {
    expect(mapOracleType('VARCHAR2(100)')).toBe('string');
    expect(mapOracleType('NUMBER(10,2)')).toBe('number');
  });

  it('应该处理 TIMESTAMP 变体', () => {
    expect(mapOracleType('TIMESTAMP')).toBe('Date');
    expect(mapOracleType('TIMESTAMP WITH TIME ZONE')).toBe('Date');
    expect(mapOracleType('TIMESTAMP(6)')).toBe('Date');
  });

  it('应该处理大小写', () => {
    expect(mapOracleType('varchar2')).toBe('string');
    expect(mapOracleType('Number')).toBe('number');
  });

  it('未知类型应该返回 object', () => {
    expect(mapOracleType('UNKNOWN_TYPE')).toBe('object');
    expect(mapOracleType('')).toBe('object');
    expect(mapOracleType(null)).toBe('object');
  });
});

describe('isValidJsType', () => {
  it('应该验证有效的 JS 类型', () => {
    expect(isValidJsType('string')).toBe(true);
    expect(isValidJsType('number')).toBe(true);
    expect(isValidJsType('Date')).toBe(true);
    expect(isValidJsType('Buffer')).toBe(true);
    expect(isValidJsType('object')).toBe(true);
  });

  it('应该拒绝无效的类型', () => {
    expect(isValidJsType('invalid')).toBe(false);
    expect(isValidJsType('array')).toBe(false);
  });
});

describe('VALID_JS_TYPES', () => {
  it('所有映射结果应该在有效类型集合中', () => {
    for (const jsType of Object.values(TYPE_MAPPING)) {
      expect(VALID_JS_TYPES.has(jsType)).toBe(true);
    }
  });
});
