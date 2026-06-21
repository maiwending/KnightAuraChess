import React, { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, firebaseEnabled } from '../../utils/firebase.js';
import {
  DEFAULT_TEXT_AI_BASE_URL,
  getBotPersona,
  isBotUid,
  loadBotChatMessages,
  requestTextAiReply,
  saveBotChatMessages,
} from '../../utils/textAi.js';

export default function DmConversation({
  chatId,
  partnerUid,
  partnerName,
  currentUser,
  currentUserName,
  onBack,
}) {
  const BOT_RETRY_BASE_MS = 2000;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const retryTimersRef = useRef(new Set());
  const unmountedRef = useRef(false);
  const isBotConversation = isBotUid(partnerUid);
  const botPersona = isBotConversation ? getBotPersona(partnerUid, partnerName) : null;

  const isRetryableBotError = (sendError) => {
    const status = Number(sendError?.status);
    const message = String(sendError?.message || '').toLowerCase();
    return (
      status === 405 ||
      status === 404 ||
      status === 429 ||
      status === 503 ||
      message.includes('405') ||
      message.includes('not configured') ||
      message.includes('service unavailable')
    );
  };

  const clearRetryTimer = (timerId) => {
    clearTimeout(timerId);
    retryTimersRef.current.delete(timerId);
  };

  const appendBotReply = (reply, fallbackMessages = null) => {
    const botMessage = {
      id: `${Date.now()}-bot`,
      text: reply,
      senderId: partnerUid,
      senderName: partnerName,
      createdAt: Date.now(),
    };
    setMessages((previous) => {
      const base = Array.isArray(fallbackMessages) && fallbackMessages.length > previous.length
        ? fallbackMessages
        : previous;
      const updated = [...base, botMessage];
      saveBotChatMessages(chatId, updated);
      return updated;
    });
  };

  const scheduleBotReplyRetry = (history, attempt = 1) => {
    if (unmountedRef.current) return;
    const delay = Math.min(15000, BOT_RETRY_BASE_MS + ((attempt - 1) * 1000));
    const timerId = setTimeout(async () => {
      clearRetryTimer(timerId);
      if (unmountedRef.current) return;
      try {
        const reply = await requestTextAiReply({
          history,
          personaName: botPersona?.name || partnerName,
          personaAge: botPersona?.age ?? null,
          personaStyle: botPersona?.style ?? null,
        });
        if (unmountedRef.current) return;
        appendBotReply(reply);
        setError('');
      } catch (retryError) {
        if (isRetryableBotError(retryError)) {
          scheduleBotReplyRetry(history, attempt + 1);
          return;
        }
        if (!unmountedRef.current) {
          setError(retryError?.message || `Text AI is unavailable at ${DEFAULT_TEXT_AI_BASE_URL}`);
        }
      }
    }, delay);
    retryTimersRef.current.add(timerId);
  };

  useEffect(() => {
    if (isBotConversation) {
      setMessages(loadBotChatMessages(chatId));
      return undefined;
    }
    if (!firebaseEnabled || !db || !chatId) return undefined;
    const messagesQuery = query(
      collection(db, 'dms', chatId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    return onSnapshot(
      messagesQuery,
      (snap) => {
        setMessages(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        if (currentUser && db) {
          setDoc(doc(db, 'dms', chatId), {
            [`lastReadAt_${currentUser.uid}`]: serverTimestamp(),
          }, { merge: true }).catch(() => {});
        }
      },
      (error) => {
        console.warn('DM conversation snapshot failed:', error?.message || error);
        setError(error?.message || 'Direct messages are temporarily unavailable.');
      }
    );
  }, [chatId, currentUser, isBotConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => {
    unmountedRef.current = true;
    retryTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    retryTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (isBotConversation) return;
    if (!firebaseEnabled || !db || !chatId || !currentUser) return;
    setDoc(doc(db, 'dms', chatId), {
      participants: chatId.split('_'),
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
  }, [chatId, currentUser, isBotConversation]);

  const handleSend = async () => {
    if (!currentUser || !text.trim()) return;
    setSending(true);
    setError('');
    const messageText = text.trim();
    setText('');

    if (isBotConversation) {
      const nextMessages = [
        ...messages,
        {
          id: `${Date.now()}-user`,
          text: messageText,
          senderId: currentUser.uid,
          senderName: currentUserName,
          createdAt: Date.now(),
        },
      ];
      setMessages(nextMessages);
      saveBotChatMessages(chatId, nextMessages);
      try {
        const history = nextMessages.map((message) => ({
          role: message.senderId === currentUser.uid ? 'user' : 'assistant',
          content: message.text,
        }));
        const reply = await requestTextAiReply({
          history,
          personaName: botPersona?.name || partnerName,
          personaAge: botPersona?.age ?? null,
          personaStyle: botPersona?.style ?? null,
        });
        appendBotReply(reply, nextMessages);
      } catch (sendError) {
        if (isRetryableBotError(sendError)) {
          setError('');
          const history = nextMessages.map((message) => ({
            role: message.senderId === currentUser.uid ? 'user' : 'assistant',
            content: message.text,
          }));
          scheduleBotReplyRetry(history, 1);
        } else {
          setError(sendError?.message || `Text AI is unavailable at ${DEFAULT_TEXT_AI_BASE_URL}`);
        }
      } finally {
        setSending(false);
      }
      return;
    }

    if (!db) {
      setSending(false);
      setError('Direct messages are unavailable until Firebase is configured.');
      return;
    }

    try {
      await addDoc(collection(db, 'dms', chatId, 'messages'), {
        text: messageText,
        senderId: currentUser.uid,
        senderName: currentUserName,
        createdAt: serverTimestamp(),
      });
      setDoc(doc(db, 'dms', chatId), {
        lastMessageAt: serverTimestamp(),
        [`lastReadAt_${currentUser.uid}`]: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="dm-conversation">
      <div className="dm-header">
        <button className="btn btn-ghost dm-back-btn" onClick={onBack}>← Back</button>
        <span className="dm-partner-name">{partnerName}</span>
      </div>
      <div className="dm-messages">
        {messages.length === 0 && (
          <p className="muted dm-empty">Say hello!</p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`dm-message${message.senderId === currentUser?.uid ? ' dm-message--own' : ''}`}
          >
            {message.senderId !== currentUser?.uid && (
              <span className="dm-sender">{message.senderName}</span>
            )}
            <span className="dm-bubble">{message.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {error && <p className="error-text" style={{ margin: '0 12px 8px' }}>{error}</p>}
      <div className="dm-input-row">
        <input
          className="select dm-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type a message..."
          maxLength={500}
          disabled={sending}
        />
        <button
          className="btn btn-primary dm-send-btn"
          onClick={handleSend}
          disabled={sending || !text.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
