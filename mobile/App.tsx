import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import {
  createBook,
  createChapter,
  deleteBook,
  fetchBooks,
  fetchChapter,
  fetchChapters,
  fetchGenerationTasks,
  fetchSceneImages,
  fetchSceneCandidates,
  retryGenerationTask,
  submitChapterGenerationTask,
} from './src/api/client';
import { pickAndParseBook, type ImportedBookDraft } from './src/import/bookImport';
import {
  getRouteTitle,
  initialNavigationState,
  type AppNavigationState,
  type AppRoute,
} from './src/navigation/routes';
import { ImportScreen } from './src/screens/ImportScreen';
import { ReaderScreen, type ReaderChapterEntry } from './src/screens/ReaderScreen';
import { loadLastReaderChapter, saveLastReaderChapter } from './src/reader/storage';
import { SceneDebugScreen } from './src/screens/SceneDebugScreen';
import { ShelfScreen } from './src/screens/ShelfScreen';
import { StyleScreen } from './src/screens/StyleScreen';
import { colors } from './src/theme/colors';
import type { Book, Chapter, ChapterBlock, GenerationTask, SceneCandidate, SceneImage, VisualStyle } from './src/types/app';

const POLLING_INTERVAL_MS = 3000;

const isPendingTask = (task: GenerationTask) =>
  task.status === 'queued' || task.status === 'recognizing' || task.status === 'generating';

const getFallbackInsertAfterBlockId = (blocks: ChapterBlock[]) => {
  const paragraphIds = blocks.filter((block) => block.type === 'paragraph').map((block) => block.id);
  if (paragraphIds.length === 0) return null;
  return paragraphIds[Math.min(1, paragraphIds.length - 1)];
};

const getDistributedFallbackBlockIds = (blocks: ChapterBlock[], count: number) => {
  const paragraphIds = blocks.filter((block) => block.type === 'paragraph').map((block) => block.id);
  if (paragraphIds.length === 0 || count <= 0) return [];
  const ratios = count <= 1 ? [0.3] : count === 2 ? [0.3, 0.75] : [0.3, 0.6, 0.85];
  return ratios.slice(0, count).map((ratio) => paragraphIds[Math.min(paragraphIds.length - 1, Math.floor(paragraphIds.length * ratio))]);
};

const withReaderGeneratedBlocks = (
  chapter: Chapter | null,
  tasks: GenerationTask[],
  images: SceneImage[],
): Chapter | null => {
  if (!chapter) return null;

  const chapterImages = images.filter((image) => image.chapterId === chapter.id);
  const chapterTasks = tasks.filter((task) => task.chapterId === chapter.id);
  const fallbackBlockId = getFallbackInsertAfterBlockId(chapter.blocks);
  const fallbackImages = chapterImages.filter((image) => !image.sourceBlockId);
  const fallbackBlockIds = getDistributedFallbackBlockIds(chapter.blocks, fallbackImages.length);
  const pendingTask = chapterTasks.find(isPendingTask);
  const imageIds = new Set(chapterImages.map((image) => image.id));
  const taskIds = new Set(chapterTasks.map((task) => task.id));
  const hasInlineImage = chapter.blocks.some((block) => block.type === 'scene-image' && imageIds.has(block.imageId));
  const hasInlineTask = chapter.blocks.some((block) => block.type === 'scene-placeholder' && taskIds.has(block.taskId));

  if (hasInlineImage || hasInlineTask || (!fallbackBlockId && chapterImages.length === 0 && !pendingTask)) {
    return chapter;
  }

  const blocks: ChapterBlock[] = [];
  chapter.blocks.forEach((block) => {
    blocks.push(block);
    if (block.type !== 'paragraph') return;

    chapterImages
      .filter((image) => image.sourceBlockId === block.id)
      .forEach((image) => blocks.push({ id: `${image.id}-block`, type: 'scene-image', imageId: image.id }));

    if (!hasInlineImage && block.id === fallbackBlockId) {
      fallbackImages
        .filter((_image, index) => !fallbackBlockIds[index])
        .forEach((image) => blocks.push({ id: `${image.id}-fallback-block`, type: 'scene-image', imageId: image.id }));
    }

    if (!hasInlineImage) {
      fallbackImages
        .filter((_image, index) => fallbackBlockIds[index] === block.id)
        .forEach((image) => blocks.push({ id: `${image.id}-distributed-fallback-block`, type: 'scene-image', imageId: image.id }));
    }

    if (!hasInlineTask && pendingTask && chapterImages.length === 0 && block.id === fallbackBlockId) {
      blocks.push({ id: `${pendingTask.id}-block`, type: 'scene-placeholder', taskId: pendingTask.id });
    }
  });

  return { ...chapter, blocks };
};

export default function App() {
  const [navigation, setNavigation] = useState<AppNavigationState>(initialNavigationState);
  const [shelfBooks, setShelfBooks] = useState<Book[]>([]);
  const [chaptersById, setChaptersById] = useState<Record<string, Chapter>>({});
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);
  const [sceneImages, setSceneImages] = useState<SceneImage[]>([]);
  const [sceneCandidates, setSceneCandidates] = useState<SceneCandidate[]>([]);
  const [apiStatus, setApiStatus] = useState<'loading' | 'connected' | 'fallback'>('loading');
  const [pendingImportDraft, setPendingImportDraft] = useState<ImportedBookDraft | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [readerChapterEntry, setReaderChapterEntry] = useState<ReaderChapterEntry>('saved');
  const [isEditingShelf, setIsEditingShelf] = useState(false);
  const [selectedImportedBookIds, setSelectedImportedBookIds] = useState<string[]>([]);
  const route = navigation.route;

  const currentBook = useMemo(() => {
    if (shelfBooks.length === 0) return null;
    return shelfBooks.find((book) => book.id === navigation.selectedBookId) ?? shelfBooks[0];
  }, [navigation.selectedBookId, shelfBooks]);
  const currentChapter = useMemo(
    () => chaptersById[navigation.selectedChapterId] ?? null,
    [chaptersById, navigation.selectedChapterId],
  );
  const renderedChapter = useMemo(
    () => withReaderGeneratedBlocks(currentChapter, generationTasks, sceneImages),
    [currentChapter, generationTasks, sceneImages],
  );
  const currentBookChapters = useMemo(
    () => Object.values(chaptersById).filter((chapter) => chapter.bookId === currentBook?.id),
    [chaptersById, currentBook?.id],
  );
  const title = useMemo(() => getRouteTitle(route, currentChapter?.title), [currentChapter?.title, route]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialApiData() {
      try {
        const [apiBooks, apiTasks, apiImages] = await Promise.all([
          fetchBooks(),
          fetchGenerationTasks(),
          fetchSceneImages(),
        ]);

        if (cancelled) return;
        setShelfBooks(apiBooks);
        setGenerationTasks(apiTasks);
        setSceneImages(apiImages);
        setSceneCandidates([]);
        setApiStatus('connected');
      } catch {
        if (cancelled) return;
        setShelfBooks([]);
        setGenerationTasks([]);
        setSceneImages([]);
        setSceneCandidates([]);
        setApiStatus('fallback');
      }
    }

    loadInitialApiData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadChapter() {
      if (!navigation.selectedChapterId || chaptersById[navigation.selectedChapterId]) return;

      try {
        const apiChapter = await fetchChapter(navigation.selectedChapterId);
        if (cancelled) return;
        setChaptersById((current) => ({ ...current, [apiChapter.id]: apiChapter }));
        setApiStatus('connected');
      } catch {
        if (cancelled) return;
        setApiStatus((current) => (current === 'connected' ? current : 'fallback'));
      }
    }

    loadChapter();

    return () => {
      cancelled = true;
    };
  }, [chaptersById, navigation.selectedChapterId]);

  useEffect(() => {
    if (route.name !== 'Reader' || !navigation.selectedBookId) return;
    let cancelled = false;

    async function loadBookChapters() {
      try {
        const chapters = await fetchChapters(navigation.selectedBookId);
        if (cancelled) return;
        setChaptersById((current) => {
          const next = Object.fromEntries(
            Object.entries(current).filter(([, chapter]) => chapter.bookId !== navigation.selectedBookId),
          );
          chapters.forEach((chapter) => {
            next[chapter.id] = chapter;
          });
          return next;
        });
        setApiStatus('connected');
      } catch {
        if (cancelled) return;
        setApiStatus((current) => (current === 'connected' ? current : 'fallback'));
      }
    }

    loadBookChapters();
    return () => {
      cancelled = true;
    };
  }, [navigation.selectedBookId, route.name]);

  useEffect(() => {
    if ((route.name !== 'Reader' && route.name !== 'SceneDebug') || !currentChapter) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const refreshReaderGenerationState = async () => {
      try {
        const [apiTasks, apiImages, apiCandidates] = await Promise.all([
          fetchGenerationTasks(),
          fetchSceneImages(),
          fetchSceneCandidates(currentChapter.id),
        ]);
        if (cancelled) return;
        setGenerationTasks(apiTasks);
        setSceneImages(apiImages);
        setSceneCandidates(apiCandidates);
        setApiStatus('connected');
      } catch {
        if (cancelled) return;
        setApiStatus((current) => (current === 'connected' ? current : 'fallback'));
      }
    };

    refreshReaderGenerationState();
    timer = setInterval(refreshReaderGenerationState, POLLING_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [currentChapter, route.name]);

  useEffect(() => {
    if (route.name !== 'Reader' || !currentChapter) return;
    const hasChapterTask = generationTasks.some((task) => task.chapterId === currentChapter.id);
    const hasChapterImage = sceneImages.some((image) => image.chapterId === currentChapter.id);
    if (hasChapterTask || hasChapterImage) return;

    let cancelled = false;
    async function submitMissingChapterTask() {
      try {
        const task = await submitChapterGenerationTask(currentChapter.id);
        if (cancelled) return;
        setGenerationTasks((current) => [...current.filter((item) => item.id !== task.id), task]);
        setApiStatus('connected');
      } catch {
        if (cancelled) return;
        setApiStatus((current) => (current === 'connected' ? current : 'fallback'));
      }
    }

    submitMissingChapterTask();
    return () => {
      cancelled = true;
    };
  }, [currentChapter, generationTasks, route.name, sceneImages]);

  const navigate = (nextRoute: AppRoute) => {
    setNavigation((current) => ({ ...current, route: nextRoute }));
  };

  const openBook = async (bookId: string) => {
    const book = shelfBooks.find((item) => item.id === bookId);
    if (!book) return;

    const savedChapterId = await loadLastReaderChapter(book.id).catch(() => null);
    setReaderChapterEntry('saved');
    setNavigation((current) => ({
      ...current,
      selectedBookId: book.id,
      selectedChapterId: savedChapterId ?? book.currentChapterId,
      route: { name: 'Reader' },
    }));
  };

  const selectReaderChapter = (chapterId: string, entry: ReaderChapterEntry) => {
    setReaderChapterEntry(entry);
    if (currentBook) saveLastReaderChapter(currentBook.id, chapterId).catch(() => undefined);
    setNavigation((current) => ({ ...current, selectedChapterId: chapterId }));
  };

  const clearShelfEditing = () => {
    setIsEditingShelf(false);
    setSelectedImportedBookIds([]);
  };

  const toggleShelfEditing = () => {
    setIsEditingShelf((current) => {
      if (current) setSelectedImportedBookIds([]);
      return !current;
    });
  };

  const toggleBookSelection = (bookId: string) => {
    if (!bookId.startsWith('import-')) return;

    setSelectedImportedBookIds((current) => {
      if (current.includes(bookId)) {
        return current.filter((selectedBookId) => selectedBookId !== bookId);
      }

      return [...current, bookId];
    });
  };

  const removeSelectedImportedBooks = async () => {
    const selectedIds = new Set(selectedImportedBookIds.filter((bookId) => bookId.startsWith('import-')));
    if (selectedIds.size === 0) return;
    const selectedChapterIds = new Set(
      shelfBooks.filter((book) => selectedIds.has(book.id)).map((book) => book.currentChapterId),
    );

    setShelfBooks((current) => {
      const nextBooks = current.filter((book) => !selectedIds.has(book.id));
      const fallbackBook = nextBooks[0];

      setNavigation((currentNavigation) => {
        if (!selectedIds.has(currentNavigation.selectedBookId)) return currentNavigation;

        return {
          ...currentNavigation,
          selectedBookId: fallbackBook?.id ?? currentNavigation.selectedBookId,
          selectedChapterId: fallbackBook?.currentChapterId ?? currentNavigation.selectedChapterId,
          route: { name: 'Shelf' },
        };
      });

      return nextBooks;
    });

    setChaptersById((current) => {
      const next: Record<string, Chapter> = {};
      Object.entries(current).forEach(([chapterId, chapter]) => {
        if (!selectedIds.has(chapter.bookId)) next[chapterId] = chapter;
      });
      return next;
    });
    setGenerationTasks((current) => current.filter((task) => !selectedChapterIds.has(task.chapterId)));
    setSceneImages((current) => current.filter((image) => !selectedChapterIds.has(image.chapterId)));
    setSceneCandidates((current) => current.filter((candidate) => !selectedChapterIds.has(candidate.chapterId)));

    clearShelfEditing();

    try {
      await Promise.all([...selectedIds].map((bookId) => deleteBook(bookId)));
      setApiStatus('connected');
    } catch {
      setApiStatus((current) => (current === 'connected' ? current : 'fallback'));
    }
  };

  const setVisualStyle = (visualStyle: VisualStyle) => {
    setNavigation((current) => ({ ...current, visualStyle }));
  };

  const retrySceneGeneration = async (taskId: string) => {
    setGenerationTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? { ...task, status: 'queued', progress: 0, label: '场景图生成已重新排队', errorMessage: undefined }
          : task,
      ),
    );

    try {
      const retriedTask = await retryGenerationTask(taskId);
      setGenerationTasks((current) => [...current.filter((task) => task.id !== retriedTask.id), retriedTask]);
      setApiStatus('connected');
    } catch (error) {
      setGenerationTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: 'failed',
                progress: 0,
                label: '场景图重新生成失败',
                errorMessage: error instanceof Error ? error.message : 'Retry request failed',
              }
            : task,
        ),
      );
      setApiStatus((current) => (current === 'connected' ? current : 'fallback'));
    }
  };

  const beginFileImport = async () => {
    clearShelfEditing();
    setImportError(null);
    setIsImporting(true);

    try {
      const draft = await pickAndParseBook();
      if (!draft) return;

      if (draft.chapters.length === 0 || draft.chapters[0].blocks.length === 0) {
        setImportError('No readable text found. Please choose a TXT or EPUB file.');
        return;
      }

      setPendingImportDraft(draft);
      navigate({ name: 'Style' });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'File parsing failed');
    } finally {
      setIsImporting(false);
    }
  };

  const completeMockImport = async () => {
    const draft = pendingImportDraft;

    if (draft) {
      const importedBook = { ...draft.book, visualStyle: navigation.visualStyle };
      let persistedBook: Book = importedBook;
      let persistedChapters: Chapter[] = draft.chapters;
      let generationTask: GenerationTask | null = null;

      try {
        persistedBook = await createBook(importedBook);
        persistedChapters = await Promise.all(draft.chapters.map((chapter) => createChapter(chapter)));
        generationTask = await submitChapterGenerationTask(persistedBook.currentChapterId);
        setApiStatus('connected');
      } catch {
        generationTask = {
          id: `task-${importedBook.currentChapterId}-scene-image`,
          bookId: importedBook.id,
          chapterId: importedBook.currentChapterId,
          progress: 0,
          status: 'failed',
          taskType: 'scene_image',
          label: '场景图生成任务提交失败',
          errorMessage: '后端暂时不可用，正文已保留，可以稍后重试生成。',
        };
        setApiStatus((current) => (current === 'connected' ? current : 'fallback'));
      }

      const displayBook = { ...persistedBook, visualStyle: navigation.visualStyle };
      setShelfBooks((current) => {
        const withoutExisting = current.filter((book) => book.id !== displayBook.id);
        return [displayBook, ...withoutExisting];
      });
      setChaptersById((current) => {
        const next = { ...current };
        persistedChapters.forEach((chapter) => {
          next[chapter.id] = chapter;
        });
        return next;
      });
      if (generationTask) {
        setGenerationTasks((current) => [...current.filter((task) => task.id !== generationTask.id), generationTask]);
      }
      setNavigation((current) => ({
        ...current,
        selectedBookId: displayBook.id,
        selectedChapterId: displayBook.currentChapterId,
        route: { name: 'Reader' },
      }));
      setReaderChapterEntry('start');
      saveLastReaderChapter(displayBook.id, displayBook.currentChapterId).catch(() => undefined);
      setPendingImportDraft(null);
      return;
    }

    navigate({ name: 'Reader' });
  };

  const goBack = () => {
    if (route.name === 'SceneDebug') {
      setReaderChapterEntry('saved');
      navigate({ name: 'Reader' });
    }
    if (route.name === 'Reader') navigate({ name: 'Shelf' });
    if (route.name === 'Style') navigate({ name: 'Import' });
    if (route.name === 'Import') navigate({ name: 'Shelf' });
  };

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.phoneFrame}>
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>9:41</Text>
          <Text style={styles.statusText}>5G</Text>
        </View>

        {route.name === 'Shelf' ? (
          <ShelfScreen
            books={shelfBooks}
            featuredBookId={currentBook?.id}
            isEditingShelf={isEditingShelf}
            selectedBookIds={selectedImportedBookIds}
            onImport={() => {
              clearShelfEditing();
              navigate({ name: 'Import' });
            }}
            onRemoveSelectedImportedBooks={removeSelectedImportedBooks}
            onRead={openBook}
            onToggleBookSelection={toggleBookSelection}
            onToggleEditingShelf={toggleShelfEditing}
          />
        ) : route.name !== 'Reader' ? (
          <View style={styles.header}>
            <Pressable accessibilityRole="button" onPress={goBack} style={styles.roundButton}>
              <Text style={styles.roundButtonText}>{'<'}</Text>
            </Pressable>
            <Text style={styles.headerTitle}>{title}</Text>
            <View style={styles.headerSpacer} />
          </View>
        ) : null}

        {route.name === 'Import' && (
          <ImportScreen
            error={importError}
            importedDraft={pendingImportDraft}
            isImporting={isImporting}
            onPickBook={beginFileImport}
          />
        )}
        {route.name === 'Style' && (
          <StyleScreen
            selected={navigation.visualStyle}
            onSelect={setVisualStyle}
            onStart={completeMockImport}
          />
        )}
        {route.name === 'Reader' &&
          (renderedChapter ? (
            <ReaderScreen
              chapter={renderedChapter}
              chapters={currentBookChapters.length > 0 ? currentBookChapters : [renderedChapter]}
              chapterEntry={readerChapterEntry}
              generationTasks={generationTasks}
              sceneImages={sceneImages}
              onBack={goBack}
              onChapterChange={selectReaderChapter}
              onOpenSceneDebug={() => {
                navigate({ name: 'SceneDebug' });
              }}
              onRetryGenerationTask={retrySceneGeneration}
            />
          ) : (
            <View style={styles.emptyReader}>
              <Text style={styles.emptyReaderText}>???????</Text>
            </View>
          ))}

        {route.name === 'SceneDebug' && (
          <SceneDebugScreen chapter={currentChapter} candidates={sceneCandidates} sceneImages={sceneImages} />
        )}
        {apiStatus === 'fallback' && (
          <View style={styles.apiBadge}>
            <Text style={styles.apiBadgeText}>Mock fallback</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneFrame: {
    width: '100%',
    maxWidth: 430,
    flex: 1,
    backgroundColor: colors.paper,
    overflow: 'hidden',
  },
  statusBar: {
    height: 42,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  header: {
    height: 54,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
  },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(37,34,30,0.08)',
  },
  roundButtonText: {
    color: colors.deep,
    fontSize: 30,
    lineHeight: 32,
  },
  headerSpacer: {
    width: 38,
  },
  apiBadge: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: 'rgba(32,54,48,0.82)',
  },
  apiBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  emptyReader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyReaderText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
});
