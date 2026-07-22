import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import {
  fetchBooks,
  fetchChapter,
  fetchGenerationTasks,
  fetchSceneImages,
} from './src/api/client';
import {
  getRouteTitle,
  initialNavigationState,
  type AppNavigationState,
  type AppRoute,
} from './src/navigation/routes';
import {
  books as initialBooks,
  findBook,
  findChapter,
  generationTasks as initialGenerationTasks,
  sceneImages as initialSceneImages,
} from './src/data/mockData';
import { pickAndParseBook, type ImportedBookDraft } from './src/import/bookImport';
import { ImportScreen } from './src/screens/ImportScreen';
import { ReaderScreen } from './src/screens/ReaderScreen';
import { ShelfScreen } from './src/screens/ShelfScreen';
import { StyleScreen } from './src/screens/StyleScreen';
import { colors } from './src/theme/colors';
import type { Book, Chapter, GenerationTask, SceneImage, VisualStyle } from './src/types/app';

export default function App() {
  const [navigation, setNavigation] = useState<AppNavigationState>(initialNavigationState);
  const [shelfBooks, setShelfBooks] = useState<Book[]>(initialBooks);
  const [chaptersById, setChaptersById] = useState<Record<string, Chapter>>({});
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>(initialGenerationTasks);
  const [sceneImages, setSceneImages] = useState<SceneImage[]>(initialSceneImages);
  const [apiStatus, setApiStatus] = useState<'loading' | 'connected' | 'fallback'>('loading');
  const [pendingImportDraft, setPendingImportDraft] = useState<ImportedBookDraft | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isEditingShelf, setIsEditingShelf] = useState(false);
  const [selectedImportedBookIds, setSelectedImportedBookIds] = useState<string[]>([]);
  const route = navigation.route;

  const currentBook = useMemo(
    () => shelfBooks.find((book) => book.id === navigation.selectedBookId) ?? findBook(navigation.selectedBookId),
    [navigation.selectedBookId, shelfBooks],
  );
  const currentChapter = useMemo(
    () => chaptersById[navigation.selectedChapterId] ?? findChapter(navigation.selectedChapterId),
    [chaptersById, navigation.selectedChapterId],
  );

  const title = useMemo(() => getRouteTitle(route, currentChapter.title), [currentChapter.title, route]);

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
        setShelfBooks(apiBooks.length > 0 ? apiBooks : initialBooks);
        setGenerationTasks(apiTasks);
        setSceneImages(apiImages);
        setApiStatus('connected');
      } catch {
        if (cancelled) return;
        setShelfBooks(initialBooks);
        setGenerationTasks(initialGenerationTasks);
        setSceneImages(initialSceneImages);
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
      if (chaptersById[navigation.selectedChapterId]) {
        return;
      }

      try {
        const apiChapter = await fetchChapter(navigation.selectedChapterId);
        if (cancelled) return;
        setChaptersById((current) => ({ ...current, [apiChapter.id]: apiChapter }));
        setApiStatus('connected');
      } catch {
        if (cancelled) return;
        setChaptersById((current) => {
          if (current[navigation.selectedChapterId]) return current;
          return {
            ...current,
            [navigation.selectedChapterId]: findChapter(navigation.selectedChapterId),
          };
        });
        setApiStatus((current) => (current === 'connected' ? current : 'fallback'));
      }
    }

    loadChapter();

    return () => {
      cancelled = true;
    };
  }, [chaptersById, navigation.selectedChapterId]);

  const navigate = (nextRoute: AppRoute) => {
    setNavigation((current) => ({ ...current, route: nextRoute }));
  };

  const openBook = (bookId: string) => {
    const book = shelfBooks.find((item) => item.id === bookId) ?? findBook(bookId);

    setNavigation((current) => ({
      ...current,
      selectedBookId: book.id,
      selectedChapterId: book.currentChapterId,
      route: { name: 'Reader' },
    }));
  };

  const clearShelfEditing = () => {
    setIsEditingShelf(false);
    setSelectedImportedBookIds([]);
  };

  const toggleShelfEditing = () => {
    setIsEditingShelf((current) => {
      if (current) {
        setSelectedImportedBookIds([]);
      }

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

  const removeSelectedImportedBooks = () => {
    const selectedIds = new Set(selectedImportedBookIds.filter((bookId) => bookId.startsWith('import-')));
    if (selectedIds.size === 0) return;

    setShelfBooks((current) => {
      const nextBooks = current.filter((book) => !selectedIds.has(book.id));
      const fallbackBook = nextBooks[0] ?? initialBooks[0];

      setNavigation((currentNavigation) => {
        if (!selectedIds.has(currentNavigation.selectedBookId)) {
          return currentNavigation;
        }

        return {
          ...currentNavigation,
          selectedBookId: fallbackBook.id,
          selectedChapterId: fallbackBook.currentChapterId,
          route: { name: 'Shelf' },
        };
      });

      return nextBooks;
    });

    setChaptersById((current) => {
      const next: Record<string, Chapter> = {};
      Object.entries(current).forEach(([chapterId, chapter]) => {
        if (!selectedIds.has(chapter.bookId)) {
          next[chapterId] = chapter;
        }
      });
      return next;
    });

    clearShelfEditing();
  };
  const setVisualStyle = (visualStyle: VisualStyle) => {
    setNavigation((current) => ({ ...current, visualStyle }));
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

  const completeMockImport = () => {
    const draft = pendingImportDraft;

    if (draft) {
      const importedBook = { ...draft.book, visualStyle: navigation.visualStyle };
      const importedChapters = draft.chapters;
      setShelfBooks((current) => {
        const withoutExisting = current.filter((book) => book.id !== importedBook.id);
        return [...withoutExisting, importedBook];
      });
      setChaptersById((current) => {
        const next = { ...current };
        importedChapters.forEach((chapter) => {
          next[chapter.id] = chapter;
        });
        return next;
      });
      setNavigation((current) => ({
        ...current,
        selectedBookId: importedBook.id,
        selectedChapterId: importedBook.currentChapterId,
        route: { name: 'Reader' },
      }));
      setPendingImportDraft(null);
      return;
    }

    navigate({ name: 'Reader' });
  };

  const goBack = () => {
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
            featuredBookId={currentBook.id}
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
        ) : (
          <View style={styles.header}>
            <Pressable accessibilityRole="button" onPress={goBack} style={styles.roundButton}>
              <Text style={styles.roundButtonText}>{'<'}</Text>
            </Pressable>
            <Text style={styles.headerTitle}>{title}</Text>
            {route.name === 'Reader' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowControls((value) => !value)}
                style={styles.roundButton}
              >
                <Text style={styles.menuText}>☰</Text>
              </Pressable>
            ) : (
              <View style={styles.headerSpacer} />
            )}
          </View>
        )}

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
        {route.name === 'Reader' && (
          <ReaderScreen
            chapter={currentChapter}
            generationTasks={generationTasks}
            sceneImages={sceneImages}
            visualStyle={navigation.visualStyle}
            showControls={showControls}
            onCloseControls={() => setShowControls(false)}
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
  menuText: {
    color: colors.deep,
    fontSize: 20,
    fontWeight: '800',
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
});
