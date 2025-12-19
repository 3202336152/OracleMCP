import { describe, it, expect } from 'vitest';
import { 
  ErrorCode, 
  ExitCode, 
  OracleMapError, 
  getExitCode, 
  isOracleMapError,
  wrapError 
} from '../../src/utils/errors.js';

describe('ErrorCode', () => {
  it('应该定义连接错误代码 (1xx)', () => {
    expect(ErrorCode.CONNECTION_FAILED).toBe(101);
    expect(ErrorCode.AUTH_FAILED).toBe(102);
    expect(ErrorCode.TIMEOUT).toBe(103);
  });

  it('应该定义配置错误代码 (2xx)', () => {
    expect(ErrorCode.CONFIG_NOT_FOUND).toBe(201);
    expect(ErrorCode.CONFIG_PARSE_ERROR).toBe(202);
    expect(ErrorCode.MISSING_REQUIRED_PARAM).toBe(203);
  });

  it('应该定义查询错误代码 (3xx)', () => {
    expect(ErrorCode.TABLE_NOT_FOUND).toBe(301);
    expect(ErrorCode.SQL_SYNTAX_ERROR).toBe(302);
  });
});

describe('getExitCode', () => {
  it('应该将连接错误映射到退出代码 1', () => {
    expect(getExitCode(ErrorCode.CONNECTION_FAILED)).toBe(ExitCode.CONNECTION_ERROR);
    expect(getExitCode(ErrorCode.AUTH_FAILED)).toBe(ExitCode.CONNECTION_ERROR);
  });

  it('应该将配置错误映射到退出代码 2', () => {
    expect(getExitCode(ErrorCode.CONFIG_NOT_FOUND)).toBe(ExitCode.CONFIG_ERROR);
    expect(getExitCode(ErrorCode.MISSING_REQUIRED_PARAM)).toBe(ExitCode.CONFIG_ERROR);
  });

  it('应该将未知错误映射到退出代码 99', () => {
    expect(getExitCode(ErrorCode.UNKNOWN)).toBe(ExitCode.UNKNOWN_ERROR);
  });
});

describe('OracleMapError', () => {
  it('应该创建带有错误代码的错误', () => {
    const error = new OracleMapError(ErrorCode.AUTH_FAILED);
    expect(error.code).toBe(ErrorCode.AUTH_FAILED);
    expect(error.name).toBe('OracleMapError');
    expect(error.exitCode).toBe(ExitCode.CONNECTION_ERROR);
  });

  it('应该支持自定义消息', () => {
    const error = new OracleMapError(ErrorCode.AUTH_FAILED, '自定义错误消息');
    expect(error.message).toBe('自定义错误消息');
  });

  it('应该支持详情对象', () => {
    const error = new OracleMapError(ErrorCode.MISSING_REQUIRED_PARAM, null, { field: 'host' });
    expect(error.details.field).toBe('host');
  });

  it('toUserMessage 应该格式化错误信息', () => {
    const error = new OracleMapError(ErrorCode.MISSING_REQUIRED_PARAM, '缺少参数', { field: 'host' });
    const msg = error.toUserMessage();
    expect(msg).toContain('[错误 203]');
    expect(msg).toContain('缺少字段: host');
  });
});

describe('isOracleMapError', () => {
  it('应该识别 OracleMapError', () => {
    const error = new OracleMapError(ErrorCode.UNKNOWN);
    expect(isOracleMapError(error)).toBe(true);
  });

  it('应该拒绝普通 Error', () => {
    const error = new Error('普通错误');
    expect(isOracleMapError(error)).toBe(false);
  });
});

describe('wrapError', () => {
  it('应该将普通错误包装为 OracleMapError', () => {
    const original = new Error('原始错误');
    const wrapped = wrapError(original, ErrorCode.QUERY_EXECUTION_ERROR);
    expect(isOracleMapError(wrapped)).toBe(true);
    expect(wrapped.code).toBe(ErrorCode.QUERY_EXECUTION_ERROR);
  });

  it('应该保持 OracleMapError 不变', () => {
    const original = new OracleMapError(ErrorCode.AUTH_FAILED);
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });
});
