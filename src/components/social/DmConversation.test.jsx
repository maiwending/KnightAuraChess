import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import DmConversation from './DmConversation.jsx';

const addDoc = vi.fn();
const collection = vi.fn(() => ({}));
const doc = vi.fn(() => ({}));
const limit = vi.fn();
const onSnapshot = vi.fn();
const orderBy = vi.fn();
const query = vi.fn();
const serverTimestamp = vi.fn(() => 'server-time');
const setDoc = vi.fn(() => Promise.resolve());

vi.mock('firebase/firestore', () => ({
  addDoc: (...args) => addDoc(...args),
  collection: (...args) => collection(...args),
  doc: (...args) => doc(...args),
  limit: (...args) => limit(...args),
  onSnapshot: (...args) => onSnapshot(...args),
  orderBy: (...args) => orderBy(...args),
  query: (...args) => query(...args),
  serverTimestamp: (...args) => serverTimestamp(...args),
  setDoc: (...args) => setDoc(...args),
}));

vi.mock('../../utils/firebase.js', () => ({
  db: {},
  firebaseEnabled: true,
}));

const loadBotChatMessages = vi.fn(() => []);
const requestTextAiReply = vi.fn();
const saveBotChatMessages = vi.fn();

vi.mock('../../utils/textAi.js', () => ({
  DEFAULT_TEXT_AI_BASE_URL: '/api/text-ai',
  getBotPersona: (uid, displayName) => ({
    name: displayName,
    age: 24,
    birthYear: new Date().getFullYear() - 24,
    style: 'flirty/casual',
  }),
  isBotUid: (uid) => typeof uid === 'string' && uid.startsWith('bot_'),
  loadBotChatMessages: (...args) => loadBotChatMessages(...args),
  requestTextAiReply: (...args) => requestTextAiReply(...args),
  saveBotChatMessages: (...args) => saveBotChatMessages(...args),
}));

describe('DmConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onSnapshot.mockReturnValue(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders and replies in a bot conversation without firestore writes', async () => {
    const user = userEvent.setup();
    requestTextAiReply.mockResolvedValue('Bonjour.');

    render(
      <DmConversation
        chatId="bot-user"
        partnerUid="bot_alex_kim"
        partnerName="Alex Kim"
        currentUser={{ uid: 'user-1' }}
        currentUserName="Mai"
        onBack={() => {}}
      />
    );

    await user.type(screen.getByPlaceholderText(/type a message/i), 'hello');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(requestTextAiReply).toHaveBeenCalledWith({
      history: [{ role: 'user', content: 'hello' }],
      personaName: 'Alex Kim',
      personaAge: expect.any(Number),
      personaStyle: expect.any(String),
    });
    expect(addDoc).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Bonjour.')).toBeInTheDocument());
  });

  it('silently retries on 405 and posts reply when AI becomes available', async () => {
    vi.useFakeTimers();
    const err405 = new Error('Text AI request failed with 405');
    err405.status = 405;
    requestTextAiReply
      .mockRejectedValueOnce(err405)
      .mockResolvedValueOnce('AI is back');

    render(
      <DmConversation
        chatId="bot-user"
        partnerUid="bot_alex_kim"
        partnerName="Alex Kim"
        currentUser={{ uid: 'user-1' }}
        currentUserName="Mai"
        onBack={() => {}}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/type a message/i), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(screen.queryByText(/405/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/text ai request failed/i)).not.toBeInTheDocument();

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2100);
    await Promise.resolve();
    expect(screen.getByText('AI is back')).toBeInTheDocument();
  });
});
