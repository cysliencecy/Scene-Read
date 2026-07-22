import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImportedBookDraft } from '../import/bookImport';
import { colors } from '../theme/colors';
import { sharedStyles } from '../theme/sharedStyles';

export function ImportScreen({
  error,
  importedDraft,
  isImporting,
  onPickBook,
}: {
  error: string | null;
  importedDraft: ImportedBookDraft | null;
  isImporting: boolean;
  onPickBook: () => void;
}) {
  return (
    <View style={[sharedStyles.screen, styles.centerScreen]}>
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
  );
}

const formatFileSize = (size?: number) => {
  if (!size) return '大小未知';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const styles = StyleSheet.create({
  centerScreen: { paddingHorizontal: 22, justifyContent: 'center' },
  importPanel: {
    minHeight: 286,
    borderRadius: 28,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#bdb2a2',
    backgroundColor: 'rgba(255,255,255,0.56)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  importIcon: {
    width: 74,
    height: 74,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.deep,
    marginBottom: 18,
  },
  importIconText: { color: '#fff', fontSize: 34, fontWeight: '700' },
  importTitle: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  importDescription: { marginTop: 10, color: colors.muted, fontSize: 14 },
  fileCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(37,34,30,0.08)',
    backgroundColor: 'rgba(255,255,255,0.72)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 18,
  },
  fileName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  fileMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  errorText: { color: '#9d3b34', fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: 'center' },
  disabledButton: { opacity: 0.72 },
});
