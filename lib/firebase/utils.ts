import {
  doc,
  query,
  where,
  limit,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  increment,
  arrayUnion,
  arrayRemove,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './app';
import {
  usersCollection,
  tweetsCollection,
  userStatsCollection,
  userBookmarksCollection
} from './collections';
import type { WithFieldValue } from 'firebase/firestore';
import type { EditableUserData } from '@lib/types/user';
import type { FilesWithId, ImagesPreview } from '@lib/types/file';
import type { Bookmark } from '@lib/types/bookmark';

export async function checkUsernameAvailability(
  username: string
): Promise<boolean> {
  const { empty } = await getDocs(
    query(usersCollection, where('username', '==', username), limit(1))
  );
  return empty;
}

export async function updateUserData(
  userId: string,
  userData: EditableUserData
): Promise<void> {
  const userRef = doc(usersCollection, userId);
  await updateDoc(userRef, {
    ...userData,
    updatedAt: serverTimestamp()
  });
}

export async function updateUsername(
  userId: string,
  username?: string
): Promise<void> {
  const userRef = doc(usersCollection, userId);
  await updateDoc(userRef, {
    updatedAt: serverTimestamp(),
    ...(username && { username })
  });
}

export async function managePinnedTweet(
  type: 'pin' | 'unpin',
  userId: string,
  tweetId: string
): Promise<void> {
  const userRef = doc(usersCollection, userId);
  await updateDoc(userRef, {
    updatedAt: serverTimestamp(),
    pinnedTweet: type === 'pin' ? tweetId : null
  });
}

export async function manageFollow(
  type: 'follow' | 'unfollow',
  userId: string,
  targetUserId: string
): Promise<void> {
  const userDocRef = doc(usersCollection, userId);
  const targetUserDocRef = doc(usersCollection, targetUserId);

  if (type === 'follow')
    await Promise.all([
      updateDoc(userDocRef, {
        following: arrayUnion(targetUserId),
        updatedAt: serverTimestamp()
      }),
      updateDoc(targetUserDocRef, {
        followers: arrayUnion(userId),
        updatedAt: serverTimestamp()
      })
    ]);
  else
    await Promise.all([
      updateDoc(userDocRef, {
        following: arrayRemove(targetUserId),
        updatedAt: serverTimestamp()
      }),
      updateDoc(targetUserDocRef, {
        followers: arrayRemove(userId),
        updatedAt: serverTimestamp()
      })
    ]);
}

export async function removeTweet(tweetId: string): Promise<void> {
  const userRef = doc(tweetsCollection, tweetId);
  await deleteDoc(userRef);
}

export async function uploadImages(
  userId: string,
  files: FilesWithId
): Promise<ImagesPreview | null> {
  if (!files.length) return null;

  const imagesPreview = await Promise.all(
    files.map(async (file) => {
      let src: string;

      const { id, name: alt } = file;

      const storageRef = ref(storage, `images/${userId}/${alt}`);

      try {
        src = await getDownloadURL(storageRef);
      } catch {
        await uploadBytesResumable(storageRef, file);
        src = await getDownloadURL(storageRef);
      }

      return { id, src, alt };
    })
  );

  return imagesPreview;
}

export async function manageReply(
  type: 'increment' | 'decrement',
  tweetId: string
): Promise<void> {
  const tweetRef = doc(tweetsCollection, tweetId);

  try {
    await updateDoc(tweetRef, {
      userReplies: increment(type === 'increment' ? 1 : -1),
      updatedAt: serverTimestamp()
    });
  } catch {
    // do nothing, because parent tweet was deleted
  }
}

export async function manageTotalTweets(
  type: 'increment' | 'decrement',
  userId: string
): Promise<void> {
  const userRef = doc(usersCollection, userId);
  await updateDoc(userRef, {
    totalTweets: increment(type === 'increment' ? 1 : -1),
    updatedAt: serverTimestamp()
  });
}

export async function manageTotalPhotos(
  type: 'increment' | 'decrement',
  userId: string
): Promise<void> {
  const userRef = doc(usersCollection, userId);
  await updateDoc(userRef, {
    totalPhotos: increment(type === 'increment' ? 1 : -1),
    updatedAt: serverTimestamp()
  });
}

export async function manageUserTweet(
  type: 'tweet' | 'untweet',
  userId: string,
  tweetId: string
): Promise<void> {
  const userStatsRef = doc(userStatsCollection(userId), 'stats');
  await updateDoc(userStatsRef, {
    tweets: type === 'tweet' ? arrayUnion(tweetId) : arrayRemove(tweetId),
    updatedAt: serverTimestamp()
  });
}

export function manageRetweet(
  type: 'retweet' | 'unretweet',
  userId: string,
  tweetId: string
) {
  return async (): Promise<void> => {
    const tweetRef = doc(tweetsCollection, tweetId);

    if (type === 'retweet')
      await Promise.all([
        updateDoc(tweetRef, {
          userRetweets: arrayUnion(userId),
          updatedAt: serverTimestamp()
        }),
        manageUserTweet('tweet', userId, tweetId)
      ]);
    else
      await Promise.all([
        updateDoc(tweetRef, {
          userRetweets: arrayRemove(userId),
          updatedAt: serverTimestamp()
        }),
        manageUserTweet('untweet', userId, tweetId)
      ]);
  };
}

export async function manageUserLike(
  type: 'like' | 'unlike',
  userId: string,
  tweetId: string
): Promise<void> {
  const userStatsRef = doc(userStatsCollection(userId), 'stats');
  await updateDoc(userStatsRef, {
    likes: type === 'like' ? arrayUnion(tweetId) : arrayRemove(tweetId),
    updatedAt: serverTimestamp()
  });
}

export function manageLike(
  type: 'like' | 'unlike',
  userId: string,
  tweetId: string
) {
  return async (): Promise<void> => {
    const tweetRef = doc(tweetsCollection, tweetId);

    if (type === 'like')
      await Promise.all([
        updateDoc(tweetRef, {
          userLikes: arrayUnion(userId),
          updatedAt: serverTimestamp()
        }),
        manageUserLike('like', userId, tweetId)
      ]);
    else
      await Promise.all([
        updateDoc(tweetRef, {
          userLikes: arrayRemove(userId),
          updatedAt: serverTimestamp()
        }),
        manageUserLike('unlike', userId, tweetId)
      ]);
  };
}

export async function manageBookmark(
  type: 'bookmark' | 'unbookmark',
  userId: string,
  tweetId: string
): Promise<void> {
  const bookmarkRef = doc(userBookmarksCollection(userId), tweetId);

  if (type === 'bookmark') {
    const bookmarkData: WithFieldValue<Omit<Bookmark, 'id'>> = {
      ref: doc(tweetsCollection, tweetId),
      createdAt: serverTimestamp()
    };
    await setDoc(bookmarkRef, bookmarkData);
  } else await deleteDoc(bookmarkRef);
}
