import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ImportedBookDraft } from '../import/bookImport';
import { colors } from '../theme/colors';
import { sharedStyles } from '../theme/sharedStyles';
import type { BookCopyrightStatus, OnlineBook, OnlineBookSearchPage } from '../types/app';

type ImportTab = 'local' | 'online';

export function ImportScreen({
  error,
  importedDraft,
  isImporting,
  initialTab = 'local',
  isSearching,
  onlineError,
  onlinePage,
  query,
  onLoadMore,
  onPickBook,
  onQueryChange,
  onSearch,
  onSelectOnlineBook,
}: {
  error: string | null;
  importedDraft: ImportedBookDraft | null;
  isImporting: boolean;
  initialTab?: ImportTab;
  isSearching: boolean;
  onlineError: string | null;
  onlinePage: OnlineBookSearchPage | null;
  query: string;
  onLoadMore: () => void;
  onPickBook: () => void;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onSelectOnlineBook: (book: OnlineBook) => void;
}) {
  const [tab, setTab] = useState<ImportTab>(initialTab);

  return (
    <View style={sharedStyles.screen}>
      <View style={styles.tabs}>
        <TabButton active={tab === 'local'} label="本地文件" onPress={() => setTab('local')} />
        <TabButton active={tab === 'online'} label="在线书库" onPress={() => setTab('online')} />
      </View>

      {tab === 'local' ? (
        <View style={styles.localScreen}>
          <View style={styles.importPanel}>
            <View style={styles.importIcon}>
              <Text style={styles.importIconText}>＋</Text>
            </View>
            <Text style={styles.importTitle}>选择一本书</Text>
            <Text style={styles.importDescription}>支持 TXT / EPUB</Text>
            <View style={styles.fileCard}>
              <Text style={styles.fileName}>{importedDraft?.fileName ?? '尚未选择文件'}</Text>
              <Text style={styles.fileMeta}>
                {importedDraft
                  ? `${importedDraft.fileType} · ${importedDraft.chapters.length} 章 · ${formatFileSize(importedDraft.fileSize)}`
                  : '从手机文件中选择一本本地书'}
              </Text>
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={isImporting}
              onPress={onPickBook}
              style={[sharedStyles.primaryButton, isImporting && styles.disabledButton]}
            >
              <Text style={sharedStyles.primaryButtonText}>{isImporting ? '正在解析' : '选择本地书'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={sharedStyles.screen}
          contentContainerStyle={styles.onlineContent}
        >
          <Text style={styles.onlineTitle}>搜索公版或授权书籍</Text>
          <Text style={styles.onlineDescription}>书籍由 Project Gutenberg 提供，导入后可离线阅读。</Text>
          <View style={styles.searchRow}>
            <TextInput
              accessibilityLabel="搜索在线书籍"
              onChangeText={onQueryChange}
              onSubmitEditing={onSearch}
              placeholder="输入书名或作者"
              placeholderTextColor="#9b9387"
              returnKeyType="search"
              style={styles.searchInput}
              value={query}
            />
            <Pressable
              accessibilityRole="button"
              disabled={isSearching || !query.trim()}
              onPress={onSearch}
              style={[styles.searchButton, (isSearching || !query.trim()) && styles.disabledButton]}
            >
              {isSearching && !onlinePage ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchButtonText}>搜索</Text>}
            </Pressable>
          </View>

          {onlineError ? <Text style={styles.errorText}>{onlineError}</Text> : null}
          {!onlinePage && !isSearching ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>从一个关键词开始</Text>
              <Text style={styles.emptyDescription}>搜索结果按 Gutenberg 原始顺序展示，不做个性化推荐。</Text>
            </View>
          ) : null}
          {onlinePage && onlinePage.items.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>没有找到匹配书籍</Text>
              <Text style={styles.emptyDescription}>试试作者名、原文书名或更短的关键词。</Text>
            </View>
          ) : null}
          <View style={styles.resultList}>
            {onlinePage?.items.map((book) => (
              <OnlineBookCard book={book} key={`${book.source}-${book.sourceBookId}`} onSelect={onSelectOnlineBook} />
            ))}
          </View>
          {onlinePage?.hasNextPage ? (
            <Pressable
              accessibilityRole="button"
              disabled={isSearching}
              onPress={onLoadMore}
              style={[styles.loadMoreButton, isSearching && styles.disabledButton]}
            >
              {isSearching ? <ActivityIndicator color={colors.deep} /> : <Text style={styles.loadMoreText}>加载更多</Text>}
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function TabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const copyrightLabel = (status: BookCopyrightStatus) => {
  if (status === 'public_domain') return '公版书';
  if (status === 'authorized') return 'Gutenberg 授权分发';
  return '版权状态未知';
};

function OnlineBookCard({ book, onSelect }: { book: OnlineBook; onSelect: (book: OnlineBook) => void }) {
  const disabled = !book.canImport;
  return (
    <View style={styles.resultCard}>
      {book.coverUrl ? (
        <Image accessibilityLabel={`${book.title} 封面`} source={{ uri: book.coverUrl }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}><Text style={styles.coverFallbackText}>阅境</Text></View>
      )}
      <View style={styles.resultCopy}>
        <Text numberOfLines={2} style={styles.resultTitle}>{book.title}</Text>
        <Text numberOfLines={2} style={styles.resultAuthor}>{book.authors.join(' · ') || '作者未知'}</Text>
        <Text style={styles.resultMeta}>{book.languages.join(', ') || '语言未知'} · {copyrightLabel(book.copyrightStatus)}</Text>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(book.sourceUrl)}>
          <Text style={styles.resultSource}>来源：Project Gutenberg ↗</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => onSelect(book)}
          style={[styles.importResultButton, book.importedBookId && styles.importedButton, disabled && styles.disabledButton]}
        >
          <Text style={styles.importResultButtonText}>
            {book.importedBookId ? '已导入 · 打开' : disabled ? '暂不支持' : '导入'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const formatFileSize = (size?: number) => {
  if (!size) return '大小未知';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const styles = StyleSheet.create({
  tabs: { marginHorizontal: 22, padding: 4, borderRadius: 16, flexDirection: 'row', backgroundColor: colors.sageSoft },
  tab: { flex: 1, minHeight: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: '#fff' },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  tabTextActive: { color: colors.deep },
  localScreen: { flex: 1, paddingHorizontal: 22, justifyContent: 'center' },
  importPanel: { minHeight: 286, borderRadius: 28, borderWidth: 1, borderStyle: 'dashed', borderColor: '#bdb2a2', backgroundColor: 'rgba(255,255,255,0.56)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  importIcon: { width: 74, height: 74, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.deep, marginBottom: 18 },
  importIconText: { color: '#fff', fontSize: 34, fontWeight: '700' },
  importTitle: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  importDescription: { marginTop: 10, color: colors.muted, fontSize: 14 },
  fileCard: { width: '100%', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(37,34,30,0.08)', backgroundColor: 'rgba(255,255,255,0.72)', paddingHorizontal: 14, paddingVertical: 12, marginTop: 18 },
  fileName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  fileMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  errorText: { color: '#9d3b34', fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: 'center' },
  disabledButton: { opacity: 0.55 },
  onlineContent: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 40 },
  onlineTitle: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  onlineDescription: { marginTop: 8, color: colors.muted, fontSize: 13, lineHeight: 20 },
  searchRow: { marginTop: 18, flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1, minHeight: 48, borderRadius: 16, paddingHorizontal: 15, color: colors.ink, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
  searchButton: { width: 72, minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.deep },
  searchButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  emptyState: { marginTop: 28, borderRadius: 20, padding: 20, backgroundColor: 'rgba(255,255,255,0.58)', alignItems: 'center' },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  emptyDescription: { marginTop: 6, color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  resultList: { marginTop: 18, gap: 12 },
  resultCard: { minHeight: 172, borderRadius: 20, padding: 12, flexDirection: 'row', gap: 14, backgroundColor: 'rgba(255,255,255,0.74)', borderWidth: 1, borderColor: 'rgba(37,34,30,0.08)' },
  cover: { width: 92, height: 138, borderRadius: 10, backgroundColor: colors.sageSoft },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  coverFallbackText: { color: colors.deep, fontWeight: '900' },
  resultCopy: { flex: 1, minWidth: 0 },
  resultTitle: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  resultAuthor: { marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 17 },
  resultMeta: { marginTop: 7, color: colors.amber, fontSize: 10, fontWeight: '800' },
  resultSource: { marginTop: 3, color: colors.muted, fontSize: 10 },
  importResultButton: { alignSelf: 'flex-start', minHeight: 32, marginTop: 10, borderRadius: 16, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.deep },
  importedButton: { backgroundColor: colors.sage },
  importResultButtonText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  loadMoreButton: { minHeight: 46, marginTop: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  loadMoreText: { color: colors.deep, fontSize: 13, fontWeight: '900' },
});
