import React, { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, firebaseEnabled } from '../../utils/firebase.js';
import { isBotUid } from '../../utils/textAi.js';

export default function FriendsSection({ currentUser, onOpenDm, onPlayerClick, onChallengeFriend }) {
  const [outgoing, setOutgoing] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [presence, setPresence] = useState({});

  useEffect(() => {
    if (!firebaseEnabled || !db || !currentUser) return undefined;
    const outgoingQuery = query(collection(db, 'friend_requests'), where('from', '==', currentUser.uid));
    const incomingQuery = query(collection(db, 'friend_requests'), where('to', '==', currentUser.uid));
    const unsubOutgoing = onSnapshot(
      outgoingQuery,
      (snap) => setOutgoing(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))),
      (error) => {
        console.warn('Outgoing friend requests snapshot failed:', error?.message || error);
        setOutgoing([]);
      }
    );
    const unsubIncoming = onSnapshot(
      incomingQuery,
      (snap) => setIncoming(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))),
      (error) => {
        console.warn('Incoming friend requests snapshot failed:', error?.message || error);
        setIncoming([]);
      }
    );
    return () => {
      unsubOutgoing();
      unsubIncoming();
    };
  }, [currentUser]);

  const friends = [
    ...outgoing
      .filter((request) => request.status === 'accepted' || (isBotUid(request.to) && request.status === 'pending'))
      .map((request) => ({ uid: request.to, name: request.toName, reqId: request.id })),
    ...incoming
      .filter((request) => request.status === 'accepted')
      .map((request) => ({ uid: request.from, name: request.fromName, reqId: request.id })),
  ];
  const pendingIncoming = incoming.filter((request) => request.status === 'pending');

  const friendUidKey = friends.map((friend) => friend.uid).sort().join(',');
  useEffect(() => {
    if (!firebaseEnabled || !db || friends.length === 0) return undefined;
    const unsubs = friends.map((friend) =>
      onSnapshot(
        doc(db, 'users', friend.uid),
        (snap) => {
          if (snap.exists()) {
            setPresence((previous) => ({ ...previous, [friend.uid]: Boolean(snap.data().online) }));
          }
        },
        (error) => {
          console.warn(`Friend presence snapshot failed for ${friend.uid}:`, error?.message || error);
        }
      )
    );
    return () => unsubs.forEach((unsub) => unsub());
  }, [friendUidKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const acceptRequest = async (requestId) => {
    if (!db) return;
    await updateDoc(doc(db, 'friend_requests', requestId), { status: 'accepted' });
  };

  const declineRequest = async (requestId) => {
    if (!db) return;
    await deleteDoc(doc(db, 'friend_requests', requestId));
  };

  const removeFriend = async (requestId, name) => {
    if (!db) return;
    if (!window.confirm(`Remove ${name} from friends?`)) return;
    await deleteDoc(doc(db, 'friend_requests', requestId));
  };

  const getChatId = (uid) => [currentUser.uid, uid].sort().join('_');

  return (
    <div className="social-section">
      <h4 className="social-section-title">Friends</h4>
      {pendingIncoming.length > 0 && (
        <div className="friend-requests-inbox">
          <p className="muted" style={{ marginBottom: '0.4rem', fontSize: '0.85rem' }}>Friend Requests:</p>
          {pendingIncoming.map((request) => (
            <div key={request.id} className="friend-request-item">
              <span className="friend-request-name">{request.fromName || 'Player'}</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button className="btn btn-primary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }} onClick={() => acceptRequest(request.id)}>
                  Accept
                </button>
                <button className="btn btn-ghost" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }} onClick={() => declineRequest(request.id)}>
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {friends.length === 0 && pendingIncoming.length === 0 && (
        <p className="muted">No friends yet. Click a player in the leaderboard to add them.</p>
      )}
      {friends.map((friend) => (
        <div key={friend.uid} className="friend-item">
          <span
            className={`presence-dot${presence[friend.uid] ? ' presence-dot--online' : ''}`}
            title={presence[friend.uid] ? 'Online' : 'Offline'}
          />
          <button className="friend-name-btn" onClick={() => onPlayerClick({ id: friend.uid })}>
            {friend.name || 'Player'}
          </button>
          <div className="friend-actions">
            <button
              className="btn btn-ghost"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
              onClick={() => onOpenDm({ chatId: getChatId(friend.uid), partnerUid: friend.uid, partnerName: friend.name || 'Player' })}
            >
              Message
            </button>
            {onChallengeFriend && !isBotUid(friend.uid) && (
              <button
                className="btn btn-primary"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                onClick={() => onChallengeFriend(friend.uid, friend.name || 'Player')}
              >
                Challenge
              </button>
            )}
            <button
              className="btn btn-ghost friend-remove-btn"
              onClick={() => removeFriend(friend.reqId, friend.name || 'Player')}
              title="Remove friend"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
