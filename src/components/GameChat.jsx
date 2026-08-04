import React, { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../utils/firebase.js';
import { getBotPersona, requestTextAiReply } from '../utils/textAi.js';

export default function GameChat({
  gameId,
  currentUser,
  currentUserName,
  chatParticipant = null,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [replyPending, setReplyPending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    const q = query(
      collection(db, 'games', gameId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    return onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (error) => {
        console.warn('Game chat snapshot failed:', error?.message || error);
      }
    );
  }, [gameId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !currentUser || replyPending) return;
    setInput('');
    await addDoc(collection(db, 'games', gameId, 'messages'), {
      uid: currentUser.uid,
      displayName: currentUserName || 'Anonymous',
      text,
      createdAt: serverTimestamp(),
    });

    if (!chatParticipant?.uid) return;

    setReplyPending(true);
    try {
      const persona = getBotPersona(chatParticipant.uid, chatParticipant.name);
      const history = [
        ...messages,
        { uid: currentUser.uid, text },
      ].slice(-20).map((message) => ({
        role: (message.speakerUid || message.uid) === chatParticipant.uid ? 'assistant' : 'user',
        content: message.text,
      }));
      const reply = await requestTextAiReply({
        history,
        personaName: persona.name,
        personaAge: persona.age,
        personaStyle: persona.style,
        conversationContext: 'You are chatting with your opponent during a chess game. Keep replies natural, relevant, and under 160 characters. Do not give engine analysis unless asked.',
        maxTokens: 100,
      });

      await addDoc(collection(db, 'games', gameId, 'messages'), {
        // The signed-in participant authors the hosted reply; speakerUid controls its presentation.
        uid: currentUser.uid,
        speakerUid: chatParticipant.uid,
        displayName: chatParticipant.name,
        text: reply.slice(0, 200),
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.warn('Game chat reply failed:', error?.message || error);
    } finally {
      setReplyPending(false);
    }
  };

  return (
    <div className="game-chat">
      <div className="game-chat__header">
        <span>Game Chat</span>
        {replyPending && <span className="game-chat__mode">Opponent is typing</span>}
      </div>
      <div className="game-chat__messages">
        {messages.length === 0 && (
          <span className="game-chat__empty">No messages yet. Say hello!</span>
        )}
        {messages.map((msg) => {
          const speakerUid = msg.speakerUid || msg.uid;
          return (
            <div
              key={msg.id}
              className={`game-chat__message${speakerUid === currentUser?.uid ? ' game-chat__message--own' : ''}`}
            >
              <span className="game-chat__message-name">{msg.displayName}:</span>
              <span className="game-chat__message-text">{msg.text}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="game-chat__input-row">
        <input
          className="select"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type a message..."
          maxLength={200}
        />
        <button className="btn btn-primary" onClick={handleSend} disabled={!input.trim() || replyPending}>
          Send
        </button>
      </div>
    </div>
  );
}
