import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_READER_PREFERENCES,
  type ReaderAnchor,
  type ReaderPreferences,
} from './pagination';

const PREFERENCES_KEY = 'scene-reader:reader-preferences:v1';
const POSITION_KEY_PREFIX = 'scene-reader:reader-position:v1';
const LAST_CHAPTER_KEY_PREFIX = 'scene-reader:last-chapter:v1';

export async function loadReaderPreferences(): Promise<ReaderPreferences> {
  try {
    const saved = await AsyncStorage.getItem(PREFERENCES_KEY);
    return saved ? { ...DEFAULT_READER_PREFERENCES, ...(JSON.parse(saved) as Partial<ReaderPreferences>) } : DEFAULT_READER_PREFERENCES;
  } catch {
    return DEFAULT_READER_PREFERENCES;
  }
}

export async function saveReaderPreferences(preferences: ReaderPreferences) {
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

export async function loadReaderPosition(bookId: string, chapterId: string): Promise<ReaderAnchor | null> {
  try {
    const saved = await AsyncStorage.getItem(`${POSITION_KEY_PREFIX}:${bookId}:${chapterId}`);
    return saved ? (JSON.parse(saved) as ReaderAnchor) : null;
  } catch {
    return null;
  }
}

export async function saveReaderPosition(bookId: string, chapterId: string, anchor: ReaderAnchor) {
  await AsyncStorage.setItem(`${POSITION_KEY_PREFIX}:${bookId}:${chapterId}`, JSON.stringify(anchor));
}

export async function loadLastReaderChapter(bookId: string) {
  return AsyncStorage.getItem(`${LAST_CHAPTER_KEY_PREFIX}:${bookId}`);
}

export async function saveLastReaderChapter(bookId: string, chapterId: string) {
  await AsyncStorage.setItem(`${LAST_CHAPTER_KEY_PREFIX}:${bookId}`, chapterId);
}
