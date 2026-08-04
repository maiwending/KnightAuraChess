import React, { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { db, firebaseEnabled } from '../utils/firebase.js';
import { isBotUid } from '../utils/textAi.js';
import {
  claimDisplayName,
  INVALID_USERNAME_ERROR,
  USERNAME_TAKEN_ERROR
} from '../utils/usernames.js';

function Avatar({ photoURL, displayName, size = 'md' }) {
  const initial = (displayName || '?')[0].toUpperCase();
  if (photoURL) {
    return (
      <div className={`avatar avatar--${size}`}>
        <img src={photoURL} alt="" referrerPolicy="no-referrer" />
      </div>
    );
  }
  return (
    <div className={`avatar avatar--${size} avatar--initials`}>
      <span>{initial}</span>
    </div>
  );
}

export default function UserProfileModal({ profileUid, currentUser, currentUserName, onClose, onOpenDm, onChallengePlayer }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIntro, setEditIntro] = useState('');
  const [editPhoto, setEditPhoto] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [friendStatus, setFriendStatus] = useState(null); // null | 'pending_sent' | 'pending_received' | 'accepted'
  const [friendReqId, setFriendReqId] = useState(null);
  const [gameHistory, setGameHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const isOwn = currentUser?.uid === profileUid;

  useEffect(() => {
    if (!firebaseEnabled || !db || !profileUid) return;
    setLoading(true);
    getDoc(doc(db, 'users', profileUid)).then((snap) => {
      if (snap.exists()) setProfile({ id: snap.id, ...snap.data() });
      setLoading(false);
    });
  }, [profileUid]);

  useEffect(() => {
    if (!firebaseEnabled || !db || !profileUid) return;
    setLoadingHistory(true);
    const fetchHistory = async () => {
      try {
        // Fetch separately and sort client-side to avoid composite index requirement
        const [whiteSnap, blackSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'games'),
            where('whiteId', '==', profileUid),
            where('status', 'in', ['completed', 'draw', 'abandoned']),
            limit(20)
          )),
          getDocs(query(
            collection(db, 'games'),
            where('blackId', '==', profileUid),
            where('status', 'in', ['completed', 'draw', 'abandoned']),
            limit(20)
          ))
        ]);
        const games = [
          ...whiteSnap.docs.map((d) => ({ id: d.id, side: 'w', ...d.data() })),
          ...blackSnap.docs.map((d) => ({ id: d.id, side: 'b', ...d.data() }))
        ]
          .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0))
          .slice(0, 10);
        setGameHistory(games);
      } catch {
        setGameHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [profileUid]);

  useEffect(() => {
    if (!firebaseEnabled || !db || !currentUser || isOwn) return;
    const checkFriendship = async () => {
      const [outSnap, inSnap] = await Promise.all([
        getDocs(query(collection(db, 'friend_requests'), where('from', '==', currentUser.uid), where('to', '==', profileUid))),
        getDocs(query(collection(db, 'friend_requests'), where('from', '==', profileUid), where('to', '==', currentUser.uid)))
      ]);
      if (!outSnap.empty) {
        const req = outSnap.docs[0];
        setFriendReqId(req.id);
        setFriendStatus(req.data().status === 'accepted' ? 'accepted' : 'pending_sent');
      } else if (!inSnap.empty) {
        const req = inSnap.docs[0];
        setFriendReqId(req.id);
        setFriendStatus(req.data().status === 'accepted' ? 'accepted' : 'pending_received');
      }
    };
    checkFriendship();
  }, [profileUid, currentUser, isOwn]);

  const handleSave = async () => {
    if (!currentUser || !db || !profile) return;
    setSaving(true);
    setSaveError('');
    const nextDisplayName = editName.trim() || profile.displayName;
    const nextIntroduction = editIntro.trim();
    const nextPhotoURL = editPhoto.trim() || profile.photoURL || null;
    try {
      const { displayName, usernameKey } = await claimDisplayName({
        db,
        uid: currentUser.uid,
        desiredDisplayName: nextDisplayName,
        previousUsernameKey: profile.usernameKey || null,
        profilePatch: {
          introduction: nextIntroduction,
          photoURL: nextPhotoURL
        }
      });
      setProfile(p => ({
        ...p,
        displayName,
        usernameKey,
        introduction: nextIntroduction,
        photoURL: nextPhotoURL
      }));
      setEditing(false);
    } catch (error) {
      if (error?.code === USERNAME_TAKEN_ERROR) {
        setSaveError('That username is already taken.');
      } else if (error?.code === INVALID_USERNAME_ERROR) {
        setSaveError('Username cannot be empty or contain "/".');
      } else if (error?.code === 'permission-denied') {
        setSaveError('Profile save was blocked by Firestore rules. Deploy firestore.rules, then try again.');
      } else {
        console.warn('Profile save failed:', error?.message || error);
        setSaveError('Unable to save your profile right now.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAddFriend = async () => {
    if (!currentUser || !db || !profile) return;
    if (friendStatus === 'pending_received' && friendReqId) {
      await updateDoc(doc(db, 'friend_requests', friendReqId), { status: 'accepted' });
      setFriendStatus('accepted');
      return;
    }
    const docRef = await addDoc(collection(db, 'friend_requests'), {
      from: currentUser.uid,
      fromName: currentUserName,
      to: profileUid,
      toName: profile.displayName || 'Player',
      status: isBotUid(profileUid) ? 'accepted' : 'pending',
      createdAt: serverTimestamp()
    });
    setFriendReqId(docRef.id);
    setFriendStatus(isBotUid(profileUid) ? 'accepted' : 'pending_sent');
  };

  const handleMessage = () => {
    if (!currentUser || !profile) return;
    const chatId = [currentUser.uid, profileUid].sort().join('_');
    onOpenDm({ chatId, partnerUid: profileUid, partnerName: profile.displayName || 'Player' });
    onClose();
  };

  const friendButtonLabel = () => {
    if (friendStatus === 'accepted') return '✓ Friends';
    if (friendStatus === 'pending_sent') return 'Request Sent';
    if (friendStatus === 'pending_received') return 'Accept Request';
    return 'Add Friend';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box profile-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        {loading && <p className="muted" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</p>}
        {!loading && !profile && <p className="muted" style={{ padding: '2rem', textAlign: 'center' }}>Player not found.</p>}

        {!loading && profile && !editing && (
          <>
            {/* Colored header band */}
            <div className="profile-header-band">
              <Avatar photoURL={profile.photoURL} displayName={profile.displayName} size="lg" />
              <div className="profile-meta">
                <h2 className="profile-name">{profile.displayName || 'Player'}</h2>
                <div className="profile-rating-badge">{profile.rating ?? 1200} Elo</div>
                {profile.isAnonymous && <span className="profile-anon-tag">Anonymous</span>}
                <div className="profile-wld">
                  <span className="wld-item wld-win">{profile.wins ?? 0}W</span>
                  <span className="wld-sep">/</span>
                  <span className="wld-item wld-loss">{profile.losses ?? 0}L</span>
                  <span className="wld-sep">/</span>
                  <span className="wld-item wld-draw">{profile.draws ?? 0}D</span>
                </div>
              </div>
            </div>

            {/* Profile body */}
            <div className="profile-body">
              {profile.introduction ? (
                <p className="profile-intro">{profile.introduction}</p>
              ) : isOwn ? (
                <p className="profile-intro-empty">Add an introduction to tell others about yourself.</p>
              ) : null}
              <div className="profile-actions">
                {isOwn && (
                  <button className="btn btn-ghost" onClick={() => {
                    setEditName(profile.displayName || '');
                    setEditIntro(profile.introduction || '');
                    setEditPhoto(profile.photoURL || '');
                    setSaveError('');
                    setEditing(true);
                  }}>
                    Edit Profile
                  </button>
                )}
                {!isOwn && currentUser && (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={handleAddFriend}
                      disabled={friendStatus === 'accepted' || friendStatus === 'pending_sent'}
                    >
                      {friendButtonLabel()}
                    </button>
                    <button className="btn btn-ghost" onClick={handleMessage}>
                      Message
                    </button>
                    {onChallengePlayer && (
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          onChallengePlayer(profileUid, profile.displayName || 'Player');
                          onClose();
                        }}
                      >
                        Challenge
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Game history */}
            <div className="profile-history">
              <h4 className="profile-history-title">Recent Games</h4>
              {loadingHistory && <p className="muted">Loading...</p>}
              {!loadingHistory && gameHistory.length === 0 && (
                <p className="muted">No completed games yet.</p>
              )}
              {gameHistory.map((g) => {
                const isWhite = g.whiteId === profileUid;
                const opponent = isWhite ? (g.blackName || 'Opponent') : (g.whiteName || 'Opponent');
                const ratingBefore = isWhite ? (g.whiteRating ?? 1200) : (g.blackRating ?? 1200);
                const ratingAfter = isWhite ? g.whiteRatingAfter : g.blackRatingAfter;
                const delta = ratingAfter != null ? ratingAfter - ratingBefore : null;
                let resultLabel = 'Draw';
                let resultClass = 'result-draw';
                if (g.winner) {
                  const won = (g.winner === 'w' && isWhite) || (g.winner === 'b' && !isWhite);
                  resultLabel = won ? 'Win' : 'Loss';
                  resultClass = won ? 'result-win' : 'result-loss';
                }
                const date = g.updatedAt?.toDate?.()?.toLocaleDateString([], { month: 'short', day: 'numeric' });
                return (
                  <div key={g.id} className="history-row">
                    <span className={`history-result ${resultClass}`}>{resultLabel}</span>
                    <span className="history-opponent">vs {opponent}</span>
                    {delta != null && (
                      <span className={`history-delta ${delta >= 0 ? 'delta-pos' : 'delta-neg'}`}>
                        {delta >= 0 ? '+' : ''}{delta}
                      </span>
                    )}
                    {date && <span className="history-date">{date}</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!loading && profile && editing && (
          <div className="profile-edit-form" style={{ padding: '22px' }}>
            <h3 style={{ marginTop: 0 }}>Edit Profile</h3>
            <label className="edit-label">
              Display Name
              <input
                className="select"
                value={editName}
                onChange={(e) => {
                  setEditName(e.target.value);
                  if (saveError) setSaveError('');
                }}
                maxLength={40}
                placeholder="Your name"
              />
            </label>
            <p className="muted" style={{ margin: '-6px 0 0' }}>
              Usernames are unique and ignore letter case.
            </p>
            <label className="edit-label">
              Profile Picture URL
              <input
                className="select"
                value={editPhoto}
                onChange={(e) => setEditPhoto(e.target.value)}
                placeholder="https://..."
              />
            </label>
            <label className="edit-label">
              Introduction
              <textarea
                className="select edit-textarea"
                value={editIntro}
                onChange={(e) => setEditIntro(e.target.value)}
                maxLength={300}
                rows={4}
                placeholder="Tell others about yourself..."
              />
            </label>
            {saveError && <p className="error-text" style={{ margin: 0 }}>{saveError}</p>}
            <div className="profile-actions">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button className="btn btn-ghost" onClick={() => {
                setSaveError('');
                setEditing(false);
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
