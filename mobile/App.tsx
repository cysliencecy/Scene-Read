import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import {
  deleteBook,
  fetchBooks,
  fetchChapter,
  fetchChapters,
  fetchGenerationTasks,
  fetchIllustrationSettings,
  fetchSceneImages,
  importBook,
  importOnlineBook,
  mergeOnlineBookSearchPages,
  onlineBookErrorMessage,
  fetchSceneCandidateDetails,
  requestManualRegeneration,
  saveBookIllustrationSetting,
  saveIllustrationSettings,
  searchOnlineBooks,
  submitChapterGenerationTask,
} from './src/api/client';
import { pickAndParseBook, type ImportedBookDraft } from './src/import/bookImport';
import {
  books as mockBooks,
  chapters as mockChapters,
  generationTasks as mockGenerationTasks,
  sceneCandidateDebugDetails as mockSceneCandidates,
  sceneImages as mockSceneImages,
} from './src/data/mockData';
import {
  getRouteTitle,
  initialNavigationState,
  type AppNavigationState,
  type AppRoute,
} from './src/navigation/routes';
import { ImportScreen } from './src/screens/ImportScreen';
import { BookSourceDebugScreen } from './src/screens/BookSourceDebugScreen';
import { ReaderScreen, type ReaderChapterEntry } from './src/screens/ReaderScreen';
import { loadLastReaderChapter, saveLastReaderChapter } from './src/reader/storage';
import { withReaderGeneratedBlocks } from './src/reader/generatedBlocks';
import { SceneDebugScreen } from './src/screens/SceneDebugScreen';
import { ShelfScreen } from './src/screens/ShelfScreen';
import { StyleScreen } from './src/screens/StyleScreen';
import { colors } from './src/theme/colors';
import type {
  Book,
  OnlineBook,
  OnlineBookSearchPage,
  CanonicalImageType,
  Chapter,
  GenerationTask,
  IllustrationSettings,
  SceneCandidateDebugDetail,
  SceneImage,
  VisualStyle,
} from './src/types/app';

const POLLING_INTERVAL_MS = 3000;

const withDevelopmentDebugFixtures = (
  candidates: SceneCandidateDebugDetail[],
  chapterId: string,
) => candidates.length > 0 || !__DEV__
  ? candidates
  : mockSceneCandidates.filter((candidate) => candidate.chapterId === chapterId);

export default function App() {
  const [navigation, setNavigation] = useState<AppNavigationState>(initialNavigationState);
  const [shelfBooks, setShelfBooks] = useState<Book[]>([]);
  const [chaptersById, setChaptersById] = useState<Record<string, Chapter>>({});
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);
  const [sceneImages, setSceneImages] = useState<SceneImage[]>([]);
  const [sceneCandidates, setSceneCandidates] = useState<SceneCandidateDebugDetail[]>([]);
  const [apiStatus, setApiStatus] = useState<'loading' | 'connected' | 'fallback'>('loading');
  const [pendingImportDraft, setPendingImportDraft] = useState<ImportedBookDraft | null>(null);
  const [pendingOnlineBook, setPendingOnlineBook] = useState<OnlineBook | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [syncingBookIds, setSyncingBookIds] = useState<string[]>([]);
  const [onlineQuery, setOnlineQuery] = useState('');
  const [onlinePage, setOnlinePage] = useState<OnlineBookSearchPage | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [isImportingOnline, setIsImportingOnline] = useState(false);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [readerChapterEntry, setReaderChapterEntry] = useState<ReaderChapterEntry>('saved');
  const [isEditingShelf, setIsEditingShelf] = useState(false);
  const [selectedImportedBookIds, setSelectedImportedBookIds] = useState<string[]>([]);
  const [illustrationSettings, setIllustrationSettings] = useState<IllustrationSettings>({ enabled: false, monthlyTaskLimit: 100 });
  const [illustrationSettingsError, setIllustrationSettingsError] = useState<string | null>(null);
  const [isSavingIllustrationSettings, setIsSavingIllustrationSettings] = useState(false);
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
    () => withReaderGeneratedBlocks(currentChapter, generationTasks, sceneImages, sceneCandidates),
    [currentChapter, generationTasks, sceneImages, sceneCandidates],
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
        const [apiBooks, apiTasks, apiImages, illustrationData] = await Promise.all([
          fetchBooks(),
          fetchGenerationTasks(),
          fetchSceneImages(),
          fetchIllustrationSettings(),
        ]);

        if (cancelled) return;
        setShelfBooks(apiBooks);
        setGenerationTasks(apiTasks);
        setSceneImages(apiImages);
        setSceneCandidates([]);
        setIllustrationSettings(illustrationData.settings);
        setApiStatus('connected');
      } catch {
        if (cancelled) return;
        setShelfBooks(mockBooks);
        setChaptersById(Object.fromEntries(mockChapters.map((chapter) => [chapter.id, chapter])));
        setGenerationTasks(mockGenerationTasks);
        setSceneImages(mockSceneImages);
        setSceneCandidates(mockSceneCandidates);
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
    if (
      route.name !== 'Reader' ||
      !navigation.selectedBookId ||
      syncingBookIds.includes(navigation.selectedBookId)
    ) return;
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
  }, [navigation.selectedBookId, route.name, syncingBookIds]);

  useEffect(() => {
    if (
      (route.name !== 'Reader' && route.name !== 'SceneDebug') ||
      !currentChapter ||
      syncingBookIds.includes(currentChapter.bookId)
    ) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const refreshReaderGenerationState = async () => {
      try {
        const [apiTasks, apiImages, apiCandidates] = await Promise.all([
          fetchGenerationTasks(),
          fetchSceneImages(),
          fetchSceneCandidateDetails(currentChapter.id),
        ]);
        if (cancelled) return;
        setGenerationTasks(apiTasks);
        setSceneImages(apiImages);
        setSceneCandidates(withDevelopmentDebugFixtures(apiCandidates, currentChapter.id));
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
  }, [currentChapter, route.name, syncingBookIds]);

  useEffect(() => {
    if (
      route.name !== 'Reader' ||
      !currentChapter ||
      !illustrationSettings.enabled ||
      !currentBook?.illustrationsEnabled ||
      syncingBookIds.includes(currentChapter.bookId)
    ) return;
    const hasChapterTask = generationTasks.some(
      (task) => task.chapterId === currentChapter.id && task.status !== 'cancelled',
    );
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
  }, [currentBook?.illustrationsEnabled, currentChapter, generationTasks, illustrationSettings.enabled, route.name, sceneImages, syncingBookIds]);

  const navigate = (nextRoute: AppRoute) => {
    setNavigation((current) => ({ ...current, route: nextRoute }));
  };

  const openBookRecord = async (book: Book) => {
    const savedChapterId = await loadLastReaderChapter(book.id).catch(() => null);
    setReaderChapterEntry('saved');
    setNavigation((current) => ({
      ...current,
      selectedBookId: book.id,
      selectedChapterId: savedChapterId ?? book.currentChapterId,
      route: { name: 'Reader' },
    }));
  };

  const openBook = async (bookId: string) => {
    const book = shelfBooks.find((item) => item.id === bookId);
    if (book) await openBookRecord(book);
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
    setOnlinePage((current) => current ? {
      ...current,
      items: current.items.map((book) =>
        book.importedBookId && selectedIds.has(book.importedBookId)
          ? { ...book, importedBookId: undefined }
          : book,
      ),
    } : current);

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

  const updateGlobalIllustrationSettings = async (input: Partial<IllustrationSettings>) => {
    setIllustrationSettingsError(null);
    setIsSavingIllustrationSettings(true);
    try {
      const result = await saveIllustrationSettings(input);
      setIllustrationSettings(result.settings);
      if (!result.settings.enabled) setGenerationTasks(await fetchGenerationTasks());
      setApiStatus('connected');
    } catch (error) {
      setIllustrationSettingsError(error instanceof Error ? error.message : '插图设置保存失败');
    } finally {
      setIsSavingIllustrationSettings(false);
    }
  };

  const updateBookIllustrationSetting = async (bookId: string, enabled: boolean) => {
    setIllustrationSettingsError(null);
    setIsSavingIllustrationSettings(true);
    try {
      const book = await saveBookIllustrationSetting(bookId, enabled);
      setShelfBooks((current) => current.map((item) => item.id === book.id ? book : item));
      setApiStatus('connected');
    } catch (error) {
      setIllustrationSettingsError(error instanceof Error ? error.message : '书籍插图设置保存失败');
    } finally {
      setIsSavingIllustrationSettings(false);
    }
  };

  const runOnlineSearch = async (page = 1) => {
    const query = onlineQuery.trim();
    if (!query || isSearchingOnline) return;
    setOnlineError(null);
    setIsSearchingOnline(true);
    if (page === 1) setOnlinePage(null);

    try {
      const result = await searchOnlineBooks(query, page);
      setOnlinePage((current) =>
        page === 1 || !current ? result : mergeOnlineBookSearchPages(current, result),
      );
      setApiStatus('connected');
    } catch (error) {
      setOnlineError(onlineBookErrorMessage(error));
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const selectOnlineBook = async (book: OnlineBook) => {
    setOnlineError(null);
    if (book.importedBookId) {
      const localBook = shelfBooks.find((item) => item.id === book.importedBookId);
      if (localBook) {
        await openBookRecord(localBook);
        return;
      }
      try {
        const books = await fetchBooks();
        setShelfBooks(books);
        const importedBook = books.find((item) => item.id === book.importedBookId);
        if (importedBook) await openBookRecord(importedBook);
      } catch (error) {
        setOnlineError(onlineBookErrorMessage(error));
      }
      return;
    }

    setPendingImportDraft(null);
    setPendingOnlineBook(book);
    setStyleError(null);
    navigate({ name: 'Style' });
  };

  const confirmManualRegeneration = async (
    candidateId: string,
    overrideImageType: CanonicalImageType,
    idempotencyKey: string,
  ) => {
    await requestManualRegeneration(candidateId, overrideImageType, idempotencyKey);
    if (!currentChapter) return;
    const [apiTasks, apiImages, apiCandidates] = await Promise.all([
      fetchGenerationTasks(),
      fetchSceneImages(),
      fetchSceneCandidateDetails(currentChapter.id),
    ]);
    setGenerationTasks(apiTasks);
    setSceneImages(apiImages);
    setSceneCandidates(withDevelopmentDebugFixtures(apiCandidates, currentChapter.id));
    setApiStatus('connected');
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
      setPendingOnlineBook(null);
      setStyleError(null);
      navigate({ name: 'Style' });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'File parsing failed');
    } finally {
      setIsImporting(false);
    }
  };

  const completeImport = async () => {
    if (pendingOnlineBook) {
      setStyleError(null);
      setIsImportingOnline(true);
      try {
        const result = await importOnlineBook(
          pendingOnlineBook.source,
          pendingOnlineBook.sourceBookId,
          navigation.visualStyle,
        );
        setShelfBooks((current) => [result.book, ...current.filter((book) => book.id !== result.book.id)]);
        setChaptersById((current) => {
          const next = { ...current };
          result.chapters.forEach((chapter) => {
            next[chapter.id] = chapter;
          });
          return next;
        });
        setOnlinePage((current) => current ? {
          ...current,
          items: current.items.map((book) =>
            book.source === pendingOnlineBook.source && book.sourceBookId === pendingOnlineBook.sourceBookId
              ? { ...book, importedBookId: result.book.id }
              : book,
          ),
        } : current);
        setNavigation((current) => ({
          ...current,
          selectedBookId: result.book.id,
          selectedChapterId: result.book.currentChapterId,
          route: { name: 'Reader' },
        }));
        setReaderChapterEntry('start');
        saveLastReaderChapter(result.book.id, result.book.currentChapterId).catch(() => undefined);
        setPendingOnlineBook(null);
        setApiStatus('connected');
      } catch (error) {
        setStyleError(onlineBookErrorMessage(error));
      } finally {
        setIsImportingOnline(false);
      }
      return;
    }

    const draft = pendingImportDraft;
    if (!draft) {
      navigate({ name: 'Reader' });
      return;
    }

    const importedBook = {
      ...draft.book,
      visualStyle: navigation.visualStyle,
      illustrationsEnabled: illustrationSettings.enabled,
    };
    const pendingTask: GenerationTask = {
      id: `task-${importedBook.currentChapterId}-scene-image`,
      bookId: importedBook.id,
      chapterId: importedBook.currentChapterId,
      progress: 0,
      status: 'queued',
      taskType: 'scene_image',
      label: '正在后台保存书籍…',
    };

    setShelfBooks((current) => [importedBook, ...current.filter((book) => book.id !== importedBook.id)]);
    setChaptersById((current) => {
      const next = { ...current };
      draft.chapters.forEach((chapter) => {
        next[chapter.id] = chapter;
      });
      return next;
    });
    if (importedBook.illustrationsEnabled) {
      setGenerationTasks((current) => [...current.filter((task) => task.id !== pendingTask.id), pendingTask]);
    }
    setSyncingBookIds((current) => [...current.filter((id) => id !== importedBook.id), importedBook.id]);
    setNavigation((current) => ({
      ...current,
      selectedBookId: importedBook.id,
      selectedChapterId: importedBook.currentChapterId,
      route: { name: 'Reader' },
    }));
    setReaderChapterEntry('start');
    saveLastReaderChapter(importedBook.id, importedBook.currentChapterId).catch(() => undefined);
    setPendingImportDraft(null);

    void (async () => {
      let bookSaved = false;
      try {
        const persisted = await importBook(importedBook, draft.chapters);
        bookSaved = true;
        setShelfBooks((current) => [
          { ...persisted.book, visualStyle: navigation.visualStyle },
          ...current.filter((book) => book.id !== persisted.book.id),
        ]);
        if (persisted.book.illustrationsEnabled && illustrationSettings.enabled) {
          const generationTask = await submitChapterGenerationTask(persisted.book.currentChapterId);
          setGenerationTasks((current) => [
            ...current.filter((task) => task.id !== generationTask.id),
            generationTask,
          ]);
        }
        setApiStatus('connected');
      } catch (error) {
        const failedTask: GenerationTask = {
          ...pendingTask,
          status: 'failed',
          label: bookSaved ? '场景图生成任务提交失败' : '书籍后台保存失败',
          errorMessage:
            error instanceof Error ? error.message : '后端暂时不可用，正文已保留，可以稍后重试生成。',
        };
        setGenerationTasks((current) => [...current.filter((task) => task.id !== failedTask.id), failedTask]);
        setApiStatus((current) => (current === 'connected' ? current : 'fallback'));
      } finally {
        setSyncingBookIds((current) => current.filter((id) => id !== importedBook.id));
      }
    })();
  };

  const goBack = () => {
    if (route.name === 'SceneDebug') {
      setReaderChapterEntry('saved');
      navigate({ name: 'Reader' });
    }
    if (route.name === 'Reader') navigate({ name: 'Shelf' });
    if (route.name === 'BookSourceDebug') navigate({ name: 'Shelf' });
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
              setPendingImportDraft(null);
              setPendingOnlineBook(null);
              setImportError(null);
              setStyleError(null);
              navigate({ name: 'Import' });
            }}
            onRemoveSelectedImportedBooks={removeSelectedImportedBooks}
            onRead={openBook}
            illustrationsEnabled={illustrationSettings.enabled}
            illustrationToggleDisabled={isSavingIllustrationSettings}
            illustrationError={illustrationSettingsError}
            onOpenBookSourceDebug={__DEV__ ? () => navigate({ name: 'BookSourceDebug' }) : undefined}
            onToggleIllustrations={(enabled) => {
              void updateGlobalIllustrationSettings({ enabled });
            }}
            onToggleBookSelection={toggleBookSelection}
            onToggleEditingShelf={toggleShelfEditing}
          />
        ) : route.name !== 'Reader' ? (
          <View style={styles.header}>
            <Pressable accessibilityRole="button" disabled={isImportingOnline} onPress={goBack} style={styles.roundButton}>
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
            initialTab={pendingOnlineBook ? 'online' : 'local'}
            isImporting={isImporting}
            isSearching={isSearchingOnline}
            onlineError={onlineError}
            onlinePage={onlinePage}
            query={onlineQuery}
            onLoadMore={() => runOnlineSearch((onlinePage?.page ?? 0) + 1)}
            onPickBook={beginFileImport}
            onQueryChange={setOnlineQuery}
            onSearch={() => runOnlineSearch(1)}
            onSelectOnlineBook={selectOnlineBook}
          />
        )}
        {route.name === 'Style' && (
          <StyleScreen
            selected={navigation.visualStyle}
            error={styleError}
            isStarting={isImportingOnline}
            onSelect={setVisualStyle}
            onStart={completeImport}
          />
        )}
        {route.name === 'BookSourceDebug' && <BookSourceDebugScreen />}
        {route.name === 'Reader' &&
          (renderedChapter ? (
            <ReaderScreen
              chapter={renderedChapter}
              chapters={currentBookChapters.length > 0 ? currentBookChapters : [renderedChapter]}
              chapterEntry={readerChapterEntry}
              generationTasks={generationTasks}
              illustrationsEnabled={currentBook?.illustrationsEnabled ?? false}
              illustrationToggleDisabled={isSavingIllustrationSettings}
              sceneImages={sceneImages}
              onBack={goBack}
              onChapterChange={selectReaderChapter}
              onOpenSceneDebug={() => {
                navigate({ name: 'SceneDebug' });
              }}
              onToggleIllustrations={(enabled) => {
                if (currentBook) void updateBookIllustrationSetting(currentBook.id, enabled);
              }}
            />
          ) : (
            <View style={styles.emptyReader}>
              <Text style={styles.emptyReaderText}>???????</Text>
            </View>
          ))}

        {route.name === 'SceneDebug' && (
          <SceneDebugScreen
            chapter={currentChapter}
            candidates={sceneCandidates}
            sceneImages={sceneImages}
            onConfirmRegeneration={confirmManualRegeneration}
          />
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
