import test, { before, beforeEach, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'knightaura-rules-test';
const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

let testEnv;

async function seedGame(overrides = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'games', 'game-1'), {
      whiteId: 'white-player',
      blackId: 'black-player',
      status: 'active',
      fen: 'start-fen',
      moveSeq: 0,
      createdAt: new Date().toISOString(),
      ...overrides,
    });
  });
}

async function seedDm(overrides = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'dms', 'dm-1'), {
      participants: ['white-player', 'black-player'],
      updatedAt: new Date().toISOString(),
      ...overrides,
    });
  });
}

async function seedPublicReadData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'ranked-player'), {
      uid: 'ranked-player',
      displayName: 'Ranked Player',
      usernameKey: 'ranked player',
      rating: 1234,
      wins: 3,
      losses: 1,
      draws: 0,
    });
    await setDoc(doc(db, 'announcements', 'announcement-1'), {
      text: 'Welcome to the lobby.',
      authorId: 'ranked-player',
      authorName: 'Ranked Player',
      createdAt: new Date().toISOString(),
    });
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedGame();
  await seedDm();
  await seedPublicReadData();
});

after(async () => {
  await testEnv.cleanup();
});

test('game participants can update the active game document', async () => {
  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertSucceeds(
    updateDoc(doc(whiteDb, 'games', 'game-1'), {
      lastMove: 'e2e4',
      updatedAt: new Date().toISOString(),
    })
  );
});

test('non-participants cannot update the game document', async () => {
  const outsiderDb = testEnv.authenticatedContext('outsider').firestore();

  await assertFails(
    updateDoc(doc(outsiderDb, 'games', 'game-1'), {
      lastMove: 'e2e4',
    })
  );
});

test('dm participants can read the dm root document', async () => {
  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertSucceeds(getDoc(doc(whiteDb, 'dms', 'dm-1')));
});

test('non-participants cannot read the dm root document', async () => {
  const outsiderDb = testEnv.authenticatedContext('outsider').firestore();

  await assertFails(getDoc(doc(outsiderDb, 'dms', 'dm-1')));
});

test('dm participants can update dm metadata without changing participants', async () => {
  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertSucceeds(
    setDoc(doc(whiteDb, 'dms', 'dm-1'), {
      participants: ['white-player', 'black-player'],
      updatedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    }, { merge: true })
  );
});

test('dm participants cannot rewrite the participants list', async () => {
  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertFails(
    setDoc(doc(whiteDb, 'dms', 'dm-1'), {
      participants: ['white-player', 'outsider'],
    }, { merge: true })
  );
});

test('dm participants can create dm messages', async () => {
  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertSucceeds(
    setDoc(doc(whiteDb, 'dms', 'dm-1', 'messages', 'msg-1'), {
      text: 'hello',
      senderId: 'white-player',
      senderName: 'White',
      createdAt: new Date().toISOString(),
    })
  );
});

test('non-participants cannot create dm messages', async () => {
  const outsiderDb = testEnv.authenticatedContext('outsider').firestore();

  await assertFails(
    setDoc(doc(outsiderDb, 'dms', 'dm-1', 'messages', 'msg-1'), {
      text: 'hello',
      senderId: 'outsider',
      senderName: 'Outsider',
      createdAt: new Date().toISOString(),
    })
  );
});

test('unauthenticated users cannot update games', async () => {
  const anonymousDb = testEnv.unauthenticatedContext().firestore();

  await assertFails(
    updateDoc(doc(anonymousDb, 'games', 'game-1'), { lastMove: 'e2e4' })
  );
});

test('unauthenticated users can read public rank profiles', async () => {
  const anonymousDb = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(anonymousDb, 'users', 'ranked-player')));
});

test('unauthenticated users can list public rank profiles', async () => {
  const anonymousDb = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(getDocs(query(collection(anonymousDb, 'users'), orderBy('rating', 'desc'))));
});

test('unauthenticated users cannot create rank profiles', async () => {
  const anonymousDb = testEnv.unauthenticatedContext().firestore();

  await assertFails(
    setDoc(doc(anonymousDb, 'users', 'anonymous-profile'), {
      uid: 'anonymous-profile',
      displayName: 'Anonymous Profile',
      usernameKey: 'anonymous profile',
    })
  );
});

test('unauthenticated users can read announcements', async () => {
  const anonymousDb = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(anonymousDb, 'announcements', 'announcement-1')));
});

test('unauthenticated users cannot create announcements', async () => {
  const anonymousDb = testEnv.unauthenticatedContext().firestore();

  await assertFails(
    setDoc(doc(anonymousDb, 'announcements', 'anonymous-announcement'), {
      text: 'Posting should be blocked.',
      authorId: 'anonymous-profile',
      authorName: 'Anonymous',
      createdAt: new Date().toISOString(),
    })
  );
});

test('participants cannot change fen without incrementing moveSeq', async () => {
  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertFails(
    updateDoc(doc(whiteDb, 'games', 'game-1'), {
      fen: 'next-fen',
      lastMove: {
        from: 'e2',
        to: 'e4',
        san: 'e4',
      },
      updatedAt: new Date().toISOString(),
    })
  );
});

test('participants can change fen when moveSeq increments and lastMove.seq matches', async () => {
  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertSucceeds(
    updateDoc(doc(whiteDb, 'games', 'game-1'), {
      fen: 'next-fen',
      moveSeq: 1,
      lastMove: {
        from: 'e2',
        to: 'e4',
        san: 'e4',
        seq: 1,
      },
      updatedAt: new Date().toISOString(),
    })
  );
});
