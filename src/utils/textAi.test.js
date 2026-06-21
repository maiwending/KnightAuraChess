import { describe, expect, it, vi, afterEach } from 'vitest';
import { requestTextAiReply } from './textAi.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestTextAiReply', () => {
  it('does not generate a local reply when the AI endpoint is unavailable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestTextAiReply({
      history: [{ role: 'user', content: 'Tell me about this position.' }],
      personaName: 'Alex Kim',
      personaStyle: 'witty/playful',
    })).rejects.toThrow('network down');

    expect(fetchMock).toHaveBeenCalled();
  });
});
