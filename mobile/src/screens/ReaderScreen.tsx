import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type GestureResponderEvent,
  Image,
  type LayoutChangeEvent,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GeneratingSceneCard } from '../components/GeneratingSceneCard';
import { ReaderControlsSheet, type ReaderControlPanel } from '../components/ReaderControlsSheet';
import { SceneImage } from '../components/SceneImage';
import {
  DEFAULT_READER_PREFERENCES,
  findPageForAnchor,
  getReaderTypography,
  paginateChapter,
  type ReaderAnchor,
  type ReaderPage,
  type ReaderPreferences,
} from '../reader/pagination';
import {
  loadReaderPosition,
  loadReaderPreferences,
  saveReaderPosition,
  saveReaderPreferences,
} from '../reader/storage';
import type { Chapter, GenerationTask, SceneImage as SceneImageData } from '../types/app';
import { filterPublishableReaderImages } from './sceneDebugModel';

export type ReaderChapterEntry = 'saved' | 'start' | 'end';

const readerThemeTokens: Record<
  ReaderPreferences['theme'],
  { background: string; text: string; title: string; hint: string; overlay: string; border: string }
> = {
  纸张: {
    background: '#fbf8f1',
    text: '#28231d',
    title: '#25221e',
    hint: '#756f64',
    overlay: 'rgba(251,248,241,0.96)',
    border: 'rgba(37,34,30,0.1)',
  },
  暖色: {
    background: '#f6ecd9',
    text: '#30251a',
    title: '#2b2117',
    hint: '#806b50',
    overlay: 'rgba(246,236,217,0.96)',
    border: 'rgba(92,67,37,0.12)',
  },
  夜间: {
    background: '#171916',
    text: '#ded7c8',
    title: '#f3ead7',
    hint: '#a59b8a',
    overlay: 'rgba(23,25,22,0.96)',
    border: 'rgba(255,255,255,0.12)',
  },
};

type RestoreTarget = ReaderAnchor | 'loading' | 'start' | 'end' | null;
const SIDE_TAP_ZONE_RATIO = 0.3;

export function ReaderScreen({
  chapter,
  chapters,
  chapterEntry,
  generationTasks,
  sceneImages,
  onBack,
  onChapterChange,
  onOpenSceneDebug,
  onRetryGenerationTask,
}: {
  chapter: Chapter;
  chapters: Chapter[];
  chapterEntry: ReaderChapterEntry;
  generationTasks: GenerationTask[];
  sceneImages: SceneImageData[];
  onBack: () => void;
  onChapterChange: (chapterId: string, entry: ReaderChapterEntry) => void;
  onOpenSceneDebug: () => void;
  onRetryGenerationTask: (taskId: string) => void;
}) {
  const listRef = useRef<FlatList<ReaderPage>>(null);
  const readerShellRef = useRef<View>(null);
  const readerShellLeft = useRef(0);
  const touchStart = useRef({ x: 0, y: 0, time: 0 });
  const currentAnchor = useRef<ReaderAnchor>({ blockId: `${chapter.id}:title`, offset: 0 });
  const restoreTarget = useRef<RestoreTarget>('loading');
  const [restoreVersion, setRestoreVersion] = useState(0);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [preferences, setPreferences] = useState(DEFAULT_READER_PREFERENCES);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [activePanel, setActivePanel] = useState<ReaderControlPanel>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const themeTokens = readerThemeTokens[preferences.theme];
  const typography = getReaderTypography(preferences);
  const fontFamily =
    preferences.fontFamily === '宋体'
      ? Platform.select({ ios: 'Songti SC', android: 'serif', web: 'SimSun, Songti SC, serif' })
      : undefined;
  const pages = useMemo(
    () =>
      layout.width > 0 && layout.height > 0
        ? paginateChapter({
            chapter,
            contentWidth: Math.max(layout.width - 48, 120),
            contentHeight: Math.max(layout.height - 68, 120),
            preferences,
          })
        : [],
    [chapter, layout.height, layout.width, preferences],
  );
  const chapterSceneImages = useMemo(
    () => filterPublishableReaderImages(sceneImages).filter((image) => image.chapterId === chapter.id),
    [chapter.id, sceneImages],
  );

  const currentChapterIndex = chapters.findIndex((item) => item.id === chapter.id);
  const progress = pages.length > 0 ? Math.round(((currentPage + 1) / pages.length) * 100) : 0;

  useEffect(() => {
    let cancelled = false;
    loadReaderPreferences().then((saved) => {
      if (cancelled) return;
      setPreferences(saved);
      setPreferencesHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!preferencesHydrated) return;
    saveReaderPreferences(preferences).catch(() => undefined);
  }, [preferences, preferencesHydrated]);

  useEffect(() => {
    let cancelled = false;
    restoreTarget.current = 'loading';
    setCurrentPage(0);
    setControlsVisible(false);
    setActivePanel(null);

    if (chapterEntry === 'start' || chapterEntry === 'end') {
      restoreTarget.current = chapterEntry;
      setRestoreVersion((value) => value + 1);
    } else {
      loadReaderPosition(chapter.bookId, chapter.id).then((anchor) => {
        if (cancelled) return;
        restoreTarget.current = anchor ?? 'start';
        setRestoreVersion((value) => value + 1);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [chapter.bookId, chapter.id, chapterEntry]);

  const scrollToPage = useCallback(
    (pageIndex: number, animated: boolean) => {
      if (layout.width <= 0 || pages.length === 0) return;
      const nextIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: nextIndex * layout.width, animated });
      });
      setCurrentPage(nextIndex);
      currentAnchor.current = pages[nextIndex].anchor;
    },
    [layout.width, pages],
  );

  useEffect(() => {
    if (pages.length === 0 || restoreTarget.current === 'loading') return;
    let targetIndex = 0;
    if (restoreTarget.current === 'end') targetIndex = pages.length - 1;
    if (typeof restoreTarget.current === 'object' && restoreTarget.current) {
      targetIndex = findPageForAnchor(pages, restoreTarget.current);
    }
    restoreTarget.current = null;
    scrollToPage(targetIndex, false);
  }, [pages, restoreVersion, scrollToPage]);

  useEffect(() => {
    if (pages.length === 0 || restoreTarget.current !== null) return;
    scrollToPage(findPageForAnchor(pages, currentAnchor.current), false);
  }, [pages, scrollToPage]);

  const recordPage = useCallback(
    (pageIndex: number) => {
      if (!pages[pageIndex]) return;
      setCurrentPage(pageIndex);
      currentAnchor.current = pages[pageIndex].anchor;
      saveReaderPosition(chapter.bookId, chapter.id, pages[pageIndex].anchor).catch(() => undefined);
    },
    [chapter.bookId, chapter.id, pages],
  );

  const goToAdjacentChapter = useCallback(
    (direction: -1 | 1) => {
      const nextChapter = chapters[currentChapterIndex + direction];
      if (!nextChapter) return;
      onChapterChange(nextChapter.id, direction > 0 ? 'start' : 'end');
    },
    [chapters, currentChapterIndex, onChapterChange],
  );

  const goToRelativePage = useCallback(
    (direction: -1 | 1) => {
      const nextPage = currentPage + direction;
      if (nextPage >= 0 && nextPage < pages.length) {
        scrollToPage(nextPage, true);
        recordPage(nextPage);
        return;
      }
      goToAdjacentChapter(direction);
    },
    [currentPage, goToAdjacentChapter, pages.length, recordPage, scrollToPage],
  );

  const turnPageFromTap = useCallback(
    (direction: -1 | 1) => {
      setControlsVisible(false);
      setActivePanel(null);
      goToRelativePage(direction);
    },
    [goToRelativePage],
  );

  const handleTouchStart = (event: GestureResponderEvent) => {
    touchStart.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
      time: Date.now(),
    };
  };

  const handleTouchEnd = (event: GestureResponderEvent) => {
    const deltaX = event.nativeEvent.pageX - touchStart.current.x;
    const deltaY = event.nativeEvent.pageY - touchStart.current.y;
    const duration = Date.now() - touchStart.current.time;

    if (Math.abs(deltaX) > 44 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (currentPage === pages.length - 1 && deltaX < 0) goToAdjacentChapter(1);
      if (currentPage === 0 && deltaX > 0) goToAdjacentChapter(-1);
      return;
    }

    if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8 || duration > 350 || layout.width === 0) return;
    const localX = event.nativeEvent.pageX - readerShellLeft.current;
    if (localX < layout.width * SIDE_TAP_ZONE_RATIO) {
      turnPageFromTap(-1);
    } else if (localX > layout.width * (1 - SIDE_TAP_ZONE_RATIO)) {
      turnPageFromTap(1);
    } else {
      setControlsVisible((visible) => {
        if (visible) setActivePanel(null);
        return !visible;
      });
    }
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (layout.width <= 0) return;
    recordPage(Math.round(event.nativeEvent.contentOffset.x / layout.width));
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((current) => (current.width === width && current.height === height ? current : { width, height }));
    readerShellRef.current?.measureInWindow((x) => {
      readerShellLeft.current = x;
    });
  };

  const renderPage = ({ item: page }: { item: ReaderPage }) => (
    <View style={[styles.page, { width: layout.width }]}>
      {page.items.map((item) => {
        if (item.type === 'title') {
          return (
            <Text key={item.key} style={[styles.chapterTitle, { color: themeTokens.title, fontFamily }]}>
              {item.text}
            </Text>
          );
        }
        if (item.type === 'paragraph') {
          return (
            <Text
              key={item.key}
              style={{
                color: themeTokens.text,
                fontFamily,
                fontSize: typography.fontSize,
                lineHeight: typography.lineHeight,
                marginBottom: item.isLastFragment ? 16 : 0,
              }}
            >
              {item.text}
            </Text>
          );
        }
        if (item.type === 'scene-placeholder') {
          const task = generationTasks.find((candidate) => candidate.id === item.block.taskId);
          return task ? (
            <GeneratingSceneCard
              key={item.key}
              errorMessage={task.errorMessage}
              progress={task.progress}
              label={task.label}
              onRetry={() => onRetryGenerationTask(task.id)}
              status={task.status}
            />
          ) : null;
        }
        const image = chapterSceneImages.find((candidate) => candidate.id === item.block.imageId);
        return image ? (
          <SceneImage
            key={item.key}
            imageUrl={image.imageUrl}
            variant={image.variant}
            onPreview={setPreviewImageUrl}
          />
        ) : null;
      })}
    </View>
  );

  return (
    <View
      onLayout={handleLayout}
      ref={readerShellRef}
      style={[styles.readerShell, { backgroundColor: themeTokens.background }]}
    >
      <View style={styles.pageGestureArea} onTouchEnd={handleTouchEnd} onTouchStart={handleTouchStart}>
        {layout.width > 0 && (
          <FlatList
            data={pages}
            decelerationRate="fast"
            getItemLayout={(_data, index) => ({ length: layout.width, offset: layout.width * index, index })}
            horizontal
            keyExtractor={(page) => page.key}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            pagingEnabled
            ref={listRef}
            renderItem={renderPage}
            showsHorizontalScrollIndicator={false}
            style={styles.pageList}
          />
        )}
      </View>

      {!controlsVisible && pages.length > 0 && (
        <Text pointerEvents="none" style={[styles.pageIndicator, { color: themeTokens.hint }]}>
          {currentPage + 1} / {pages.length}
        </Text>
      )}

      {controlsVisible && (
        <>
          <View style={[styles.readerHeader, { backgroundColor: themeTokens.overlay, borderBottomColor: themeTokens.border }]}>
            <Pressable accessibilityRole="button" onPress={onBack} style={styles.headerButton}>
              <Text style={[styles.backText, { color: themeTokens.text }]}>{'‹'}</Text>
            </Pressable>
            <Text numberOfLines={1} style={[styles.headerTitle, { color: themeTokens.title }]}>
              {chapter.title}
            </Text>
            <Pressable accessibilityRole="button" onPress={onOpenSceneDebug} style={styles.headerButton}>
              <Text style={[styles.debugText, { color: themeTokens.text }]}>调试</Text>
            </Pressable>
          </View>

          <View pointerEvents="none" style={styles.controlsProgress}>
            <Text style={[styles.controlsProgressText, { color: themeTokens.hint }]}>本章 {progress}%</Text>
          </View>
          <ReaderControlsSheet
            activePanel={activePanel}
            chapters={chapters}
            currentChapterId={chapter.id}
            preferences={preferences}
            onActivePanelChange={setActivePanel}
            onChapterChange={(chapterId) => {
              setControlsVisible(false);
              setActivePanel(null);
              onChapterChange(chapterId, 'saved');
            }}
            onPreferencesChange={setPreferences}
          />
        </>
      )}

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(previewImageUrl)}
        onRequestClose={() => setPreviewImageUrl(null)}
      >
        <View style={styles.previewOverlay}>
          <Pressable style={styles.previewBackdrop} onPress={() => setPreviewImageUrl(null)} />
          <View style={styles.previewHeader}>
            <Pressable accessibilityRole="button" onPress={() => setPreviewImageUrl(null)} style={styles.previewClose}>
              <Text style={styles.previewCloseText}>×</Text>
            </Pressable>
          </View>
          {previewImageUrl ? <Image source={{ uri: previewImageUrl }} resizeMode="contain" style={styles.previewImage} /> : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  readerShell: { flex: 1, overflow: 'hidden' },
  pageGestureArea: { flex: 1 },
  pageList: { flex: 1 },
  page: { height: '100%', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 44, overflow: 'hidden' },
  chapterTitle: { fontSize: 22, lineHeight: 30, fontWeight: '800', marginBottom: 18 },
  pageIndicator: { position: 'absolute', bottom: 16, alignSelf: 'center', fontSize: 11, fontWeight: '700' },
  readerHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 54,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  headerButton: { width: 50, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 34, lineHeight: 36, fontWeight: '400' },
  debugText: { fontSize: 12, fontWeight: '800' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '800' },
  controlsProgress: { position: 'absolute', left: 0, right: 0, bottom: 78, alignItems: 'center' },
  controlsProgressText: { fontSize: 11, fontWeight: '700' },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  previewBackdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  previewHeader: { position: 'absolute', top: 18, left: 0, right: 0, zIndex: 2, paddingHorizontal: 18, alignItems: 'flex-end' },
  previewClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  previewCloseText: { color: '#fff', fontSize: 30, lineHeight: 34, fontWeight: '500' },
  previewImage: { width: '100%', height: '82%' },
});
