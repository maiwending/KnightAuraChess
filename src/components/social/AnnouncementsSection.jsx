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
import { db, firebaseEnabled } from '../../utils/firebase.js';
import { getBotPersona, requestTextAiReply } from '../../utils/textAi.js';

const BOT_LAUNCHER_BOTS = [
  { uid: 'bot_alex_kim', name: 'Alex Kim' },
  { uid: 'bot_jordan_park', name: 'Jordan Park' },
  { uid: 'bot_morgan_chen', name: 'Morgan Chen' },
  { uid: 'bot_casey_lee', name: 'Casey Lee' },
  { uid: 'bot_riley_wang', name: 'Riley Wang' },
  { uid: 'bot_taylor_singh', name: 'Taylor Singh' },
];

const BOT_LOBBY_LAST_KEY = 'cr_bot_lobby_last';

export default function AnnouncementsSection({ currentUser, currentUserName, currentUserPhotoURL }) {
  const [announcements, setAnnouncements] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (!firebaseEnabled || !db) return undefined;
    const announcementsQuery = query(
      collection(db, 'announcements'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return onSnapshot(
      announcementsQuery,
      (snap) => {
        setAnnouncements(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      },
      (error) => {
        console.warn('Announcements snapshot failed:', error?.message || error);
        setAnnouncements([]);
      }
    );
  }, []);

  useEffect(() => {
    if (!firebaseEnabled || !db || !currentUser) return undefined;

    const scheduleBotLobbyTalk = () => {
      const last = Number.parseInt(window.localStorage.getItem(BOT_LOBBY_LAST_KEY) || '0', 10) || 0;
      const now = Date.now();
      if (now - last < 5 * 60 * 1000) return;

      const timerId = window.setTimeout(async () => {
        try {
          const speaker = BOT_LAUNCHER_BOTS[Math.floor(Math.random() * BOT_LAUNCHER_BOTS.length)];
          const persona = getBotPersona(speaker.uid, speaker.name);
          const prompt = [
            { role: 'user', content: 'Say one short lobby message about chess or greetings.' },
          ];
          const botText = await requestTextAiReply({
            history: prompt,
            personaName: persona.name,
            personaAge: persona.age,
            personaStyle: persona.style,
          });
          await addDoc(collection(db, 'announcements'), {
            text: botText,
            authorId: speaker.uid,
            authorName: speaker.name,
            authorPhotoURL: null,
            createdAt: serverTimestamp(),
            isBot: true,
          });
          window.localStorage.setItem(BOT_LOBBY_LAST_KEY, String(Date.now()));
        } catch {
          // Ignore background announcement failures.
        }
      }, 25_000 + Math.floor(Math.random() * 45_000));

      return timerId;
    };

    const timerId = scheduleBotLobbyTalk();
    return () => {
      if (timerId) window.clearTimeout(timerId);
    };
  }, [currentUser]);

  const handleSend = async () => {
    if (!currentUser || !text.trim()) return;
    setSending(true);
    setError('');
    try {
      await addDoc(collection(db, 'announcements'), {
        text: text.trim(),
        authorId: currentUser.uid,
        authorName: currentUserName,
        authorPhotoURL: currentUserPhotoURL || null,
        createdAt: serverTimestamp(),
      });
      setText('');
    } catch (sendError) {
      setError(sendError?.message || 'Failed to post');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="social-section">
      <h4 className="social-section-title">Lobby Chat</h4>
      <div className="announcements-list" ref={listRef}>
        {announcements.length === 0 && <p className="muted">No announcements yet.</p>}
        {[...announcements].reverse().map((announcement) => (
          <div
            key={announcement.id}
            className={`ann-item${announcement.authorId === currentUser?.uid ? ' ann-item--own' : ''}`}
          >
            <div className="ann-row">
              <span className="ann-author">
                {announcement.authorName || 'Player'}
              </span>
              {announcement.createdAt?.toDate && (
                <span className="ann-time">
                  {announcement.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <p className="ann-text">{announcement.text}</p>
          </div>
        ))}
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '0.4rem 0' }}>{error}</p>}
      {currentUser ? (
        <div className="ann-input-row">
          <input
            className="select ann-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder="Post to lobby..."
            maxLength={200}
          />
          <button
            className="btn btn-primary ann-send-btn"
            onClick={handleSend}
            disabled={sending || !text.trim()}
          >
            Post
          </button>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: '0.85rem' }}>Sign in to post announcements.</p>
      )}
    </div>
  );
}
