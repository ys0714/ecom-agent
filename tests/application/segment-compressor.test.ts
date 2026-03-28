import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SegmentCompressor } from '../../src/application/services/context/segment-compressor.js';
import type { Message, WorkflowType } from '../../src/domain/types.js';

function msg(role: 'user' | 'assistant', content: string): Message {
  return { role, content, timestamp: new Date().toISOString() };
}

describe('SegmentCompressor', () => {
  let compressor: SegmentCompressor;

  beforeEach(() => {
    compressor = new SegmentCompressor({ segmentSize: 3 });
  });

  it('creates no segments when under segment size', async () => {
    await compressor.addOverflow(
      [msg('user', '你好'), msg('assistant', '你好！')],
      'general',
      false,
    );
    expect(compressor.getSegments()).toHaveLength(0);
    expect(compressor.hasPending()).toBe(true);
  });

  it('creates a segment when reaching segment size', async () => {
    const messages = [
      msg('user', '帮我看看商品p101'),
      msg('assistant', '这件羽绒服有S/M/L/XL四个尺码'),
      msg('user', '推荐M码吗'),
    ];

    await compressor.addOverflow(messages, 'product_consult', false);

    const segments = compressor.getSegments();
    expect(segments).toHaveLength(1);
    expect(segments[0].segmentIndex).toBe(0);
    expect(segments[0].turnRange).toEqual([0, 2]);
    expect(segments[0].intent).toBe('product_consult');
    expect(segments[0].summary).toContain('p101');
  });

  it('extracts key facts from messages', async () => {
    const messages = [
      msg('user', '帮我老公看看，他身高178cm'),
      msg('assistant', '好的，为您老公推荐'),
      msg('user', '体重155斤，选p201'),
    ];

    await compressor.addOverflow(messages, 'product_consult', true);

    const segments = compressor.getSegments();
    expect(segments).toHaveLength(1);
    expect(segments[0].keyFacts).toContain('角色切换:male');
    expect(segments[0].keyFacts).toContain('身高:178');
    expect(segments[0].keyFacts).toContain('体重:155');
    expect(segments[0].keyFacts).toContain('商品:p201');
  });

  it('forces segment boundary on role switch', async () => {
    const messages = [
      msg('user', '帮我老公买件夹克'),
      msg('assistant', '好的'),
    ];

    await compressor.addOverflow(messages, 'product_consult', true);

    expect(compressor.getSegments()).toHaveLength(1);
    expect(compressor.hasPending()).toBe(false);
  });

  it('creates multiple segments for long conversations', async () => {
    const batch1 = [
      msg('user', '看看羽绒服p101'),
      msg('assistant', '推荐M码'),
      msg('user', '好的，再看看牛仔裤'),
    ];
    const batch2 = [
      msg('user', '牛仔裤p102哪个码合适'),
      msg('assistant', '推荐M码'),
      msg('user', '有点紧，换L码'),
    ];

    await compressor.addOverflow(batch1, 'product_consult', false);
    await compressor.addOverflow(batch2, 'product_consult', false);

    const segments = compressor.getSegments();
    expect(segments).toHaveLength(2);
    expect(segments[0].turnRange).toEqual([0, 2]);
    expect(segments[1].turnRange).toEqual([3, 5]);
  });

  it('formatForPrompt returns empty string when no segments', () => {
    expect(compressor.formatForPrompt()).toBe('');
  });

  it('formatForPrompt generates readable summary', async () => {
    await compressor.addOverflow(
      [
        msg('user', '帮我老公看p201夹克'),
        msg('assistant', '好的，这款夹克有M/L/XL码'),
        msg('user', '他身高178cm体重155斤'),
      ],
      'product_consult',
      true,
    );

    const prompt = compressor.formatForPrompt();
    expect(prompt).toContain('[历史对话摘要]');
    expect(prompt).toContain('第1-3轮');
    expect(prompt).toContain('角色切换:male');
  });

  it('reset clears all state', async () => {
    await compressor.addOverflow(
      [msg('user', 'a'), msg('assistant', 'b'), msg('user', 'c')],
      'general',
      false,
    );
    expect(compressor.getSegments()).toHaveLength(1);

    compressor.reset();
    expect(compressor.getSegments()).toHaveLength(0);
    expect(compressor.hasPending()).toBe(false);
    expect(compressor.formatForPrompt()).toBe('');
  });

  describe('with LLM client', () => {
    it('uses LLM for compression when available', async () => {
      const mockLLM = {
        chat: vi.fn().mockResolvedValue({ content: '用户咨询了羽绒服p101的尺码推荐' }),
      };
      const llmCompressor = new SegmentCompressor({ segmentSize: 3, llmClient: mockLLM });

      await llmCompressor.addOverflow(
        [
          msg('user', '帮我看看商品p101'),
          msg('assistant', '这件羽绒服有多个尺码'),
          msg('user', '推荐什么码'),
        ],
        'product_consult',
        false,
      );

      expect(mockLLM.chat).toHaveBeenCalledOnce();
      const segments = llmCompressor.getSegments();
      expect(segments[0].summary).toBe('用户咨询了羽绒服p101的尺码推荐');
    });

    it('falls back to rules when LLM fails', async () => {
      const mockLLM = {
        chat: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
      };
      const llmCompressor = new SegmentCompressor({ segmentSize: 3, llmClient: mockLLM });

      await llmCompressor.addOverflow(
        [
          msg('user', '看看p101'),
          msg('assistant', '好的'),
          msg('user', '推荐M码吗'),
        ],
        'product_consult',
        false,
      );

      const segments = llmCompressor.getSegments();
      expect(segments).toHaveLength(1);
      expect(segments[0].summary).toContain('用户提到');
    });
  });
});
