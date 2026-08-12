import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { Image } from 'react-native';
import { sharedStyles } from '../theme/sharedStyles';
import type { Book } from '../types/app';

const BOOK_GRID_GAP = 14;
const BOOK_COVER_ASPECT_RATIO = 104 / 152;

export function ShelfScreen({
  books,
  featuredBookId,
  isEditingShelf,
  selectedBookIds,
  onImport,
  onRemoveSelectedImportedBooks,
  onRead,
  illustrationsEnabled,
  illustrationToggleDisabled,
  illustrationError,
  onOpenBookSourceDebug,
  onToggleIllustrations,
  onToggleBookSelection,
  onToggleEditingShelf,
}: {
  books: Book[];
  featuredBookId?: string;
  isEditingShelf: boolean;
  selectedBookIds: string[];
  onImport: () => void;
  onRemoveSelectedImportedBooks: () => void;
  onRead: (bookId: string) => void;
  illustrationsEnabled: boolean;
  illustrationToggleDisabled: boolean;
  illustrationError?: string | null;
  onOpenBookSourceDebug?: () => void;
  onToggleIllustrations: (enabled: boolean) => void;
  onToggleBookSelection: (bookId: string) => void;
  onToggleEditingShelf: () => void;
}) {
  const [bookGridWidth, setBookGridWidth] = useState(0);
  const featuredBook = books.find((book) => book.id === featuredBookId) ?? books[0];
  const selectedCount = selectedBookIds.length;
  const bookCoverWidth =
    bookGridWidth > 0 ? Math.max(0, (bookGridWidth - BOOK_GRID_GAP * 2) / 3) : 104;

  return (
    <View style={styles.shell}>
      <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
        <View style={styles.shelfHeader}>
          <Text style={styles.logo}>阅境</Text>
          <View style={styles.illustrationSwitch}>
            <Pressable disabled={!onOpenBookSourceDebug} onLongPress={onOpenBookSourceDebug}>
              <Text style={styles.illustrationSwitchText}>插图</Text>
            </Pressable>
            <Switch
              accessibilityLabel="使用插图服务"
              disabled={illustrationToggleDisabled}
              onValueChange={onToggleIllustrations}
              value={illustrationsEnabled}
            />
          </View>
        </View>
        {illustrationError ? <Text style={styles.illustrationError}>{illustrationError}</Text> : null}

        {featuredBook ? (
          <Pressable
            accessibilityRole="button"
            disabled={isEditingShelf}
            onPress={() => onRead(featuredBook.id)}
            style={[styles.heroCard, isEditingShelf && styles.heroCardDisabled]}
          >
            <Text style={styles.heroEyebrow}>继续阅读</Text>
            <Text style={styles.heroTitle}>{featuredBook.title}</Text>
            <Text style={styles.heroDescription}>{featuredBook.lastReadLabel}</Text>
            <View style={styles.heroAction}>
              <Text style={styles.heroActionText}>继续</Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>我的阅读</Text>
            <Text style={styles.heroTitle}>导入第一本书</Text>
            <Text style={styles.heroDescription}>支持 TXT / EPUB，导入后可以直接进入第一章阅读。</Text>
            <Pressable accessibilityRole="button" onPress={onImport} style={styles.heroAction}>
              <Text style={styles.heroActionText}>导入书籍</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>我的书架</Text>
          <View style={styles.sectionActions}>
            <Pressable accessibilityRole="button" onPress={onImport} style={styles.sectionAction}>
              <Text style={styles.sectionActionText}>导入书籍</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onToggleEditingShelf} style={styles.sectionActionSecondary}>
              <Text style={styles.sectionActionText}>{isEditingShelf ? '完成' : '编辑'}</Text>
            </Pressable>
          </View>
        </View>

        <View
          onLayout={(event) => {
            const nextWidth = event.nativeEvent.layout.width;
            setBookGridWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
          }}
          style={styles.bookGrid}
        >
          {books.map((book) => {
            const canRemove = book.id.startsWith('import-');
            const selected = selectedBookIds.includes(book.id);

            return (
              <Pressable
                accessibilityRole="button"
                key={book.id}
                onPress={() => {
                  if (isEditingShelf) {
                    if (canRemove) onToggleBookSelection(book.id);
                    return;
                  }

                  onRead(book.id);
                }}
                style={[
                  styles.bookCover,
                  { width: bookCoverWidth },
                  { backgroundColor: book.accent },
                  isEditingShelf && !canRemove && styles.bookCoverLocked,
                  selected && styles.bookCoverSelected,
                ]}
              >
                {book.coverUrl ? <Image source={{ uri: book.coverUrl }} style={styles.bookCoverImage} /> : null}
                {isEditingShelf && canRemove ? (
                  <View style={[styles.selectionBadge, selected && styles.selectionBadgeActive]}>
                    <Text style={styles.selectionBadgeText}>{selected ? '✓' : ''}</Text>
                  </View>
                ) : null}
                <View style={[styles.bookShine, book.coverUrl && styles.bookImageShade]} />
                <Text style={styles.bookTitle}>{book.title}</Text>
                <Text style={styles.bookMeta}>{book.authors?.[0] ?? book.progress}</Text>
              </Pressable>
            );
          })}

          <Pressable
            accessibilityRole="button"
            disabled={isEditingShelf}
            onPress={onImport}
            style={[styles.importBookCover, { width: bookCoverWidth }]}
          >
            <View style={styles.importBookIcon}>
              <Text style={styles.importBookPlus}>＋</Text>
            </View>
            <Text style={styles.importBookTitle}>导入书籍</Text>
            <Text style={styles.importBookMeta}>支持 TXT、EPUB</Text>
          </Pressable>
        </View>
      </ScrollView>

      {isEditingShelf && selectedCount > 0 ? (
        <View style={styles.deleteBar}>
          <Text style={styles.deleteBarText}>已选择 {selectedCount} 本</Text>
          <Pressable accessibilityRole="button" onPress={onRemoveSelectedImportedBooks} style={styles.deleteButton}>
            <Text style={styles.deleteButtonText}>删除</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  shelfHeader: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { color: colors.ink, fontSize: 25, fontWeight: '800' },
  illustrationSwitch: { minHeight: 36, borderRadius: 18, paddingLeft: 12, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.sageSoft },
  illustrationSwitchText: { color: colors.deep, fontSize: 12, fontWeight: '800' },
  illustrationError: { marginTop: -4, marginBottom: 8, color: '#9d3b34', fontSize: 11, textAlign: 'right' },
  heroCard: {
    minHeight: 184,
    borderRadius: 24,
    padding: 18,
    backgroundColor: colors.deep,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  heroCardDisabled: { opacity: 0.82 },
  heroEyebrow: { color: 'rgba(255,255,255,0.74)', fontSize: 12 },
  heroTitle: { marginTop: 8, color: '#fff', fontSize: 26, fontWeight: '800' },
  heroDescription: {
    marginTop: 8,
    maxWidth: 250,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    lineHeight: 20,
  },
  heroAction: {
    alignSelf: 'flex-start',
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  heroActionText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  sectionActions: { flexDirection: 'row', gap: 8 },
  sectionAction: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(32,54,48,0.16)',
  },
  sectionActionSecondary: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sageSoft,
    borderWidth: 1,
    borderColor: 'rgba(32,54,48,0.16)',
  },
  sectionActionText: { color: colors.deep, fontSize: 12, fontWeight: '800' },
  bookGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: BOOK_GRID_GAP, paddingBottom: 72 },
  bookCover: {
    aspectRatio: BOOK_COVER_ASPECT_RATIO,
    borderRadius: 13,
    padding: 12,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  bookCoverLocked: { opacity: 0.5 },
  bookCoverSelected: { borderColor: '#fff' },
  bookCoverImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  selectionBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.86)',
  },
  selectionBadgeActive: { backgroundColor: colors.deep },
  selectionBadgeText: { color: '#fff', fontSize: 14, lineHeight: 16, fontWeight: '900' },
  bookShine: {
    position: 'absolute',
    left: -20,
    right: -20,
    top: -26,
    height: 96,
    backgroundColor: 'rgba(255,255,255,0.16)',
    transform: [{ rotate: '-14deg' }],
  },
  bookImageShade: { top: 72, height: 100, backgroundColor: 'rgba(16,24,21,0.58)', transform: [] },
  bookTitle: { color: '#fff', fontSize: 13, lineHeight: 18, fontWeight: '800' },
  bookMeta: { marginTop: 5, color: 'rgba(255,255,255,0.78)', fontSize: 10 },
  importBookCover: {
    aspectRatio: BOOK_COVER_ASPECT_RATIO,
    borderRadius: 13,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#b9ad9b',
    backgroundColor: 'rgba(255,255,255,0.56)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  importBookIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sageSoft,
    marginBottom: 10,
  },
  importBookPlus: { color: colors.deep, fontSize: 22, fontWeight: '700' },
  importBookTitle: { color: colors.deep, fontSize: 13, fontWeight: '800' },
  importBookMeta: { marginTop: 5, color: colors.muted, fontSize: 10, textAlign: 'center' },
  deleteBar: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    minHeight: 54,
    borderRadius: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(32,54,48,0.94)',
  },
  deleteBarText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  deleteButton: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2d7cf',
  },
  deleteButtonText: { color: '#6f2f28', fontSize: 13, fontWeight: '900' },
});
