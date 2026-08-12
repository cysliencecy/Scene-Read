import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { GenerationTask } from '../types/app';

const getStatusTitle = (status?: GenerationTask['status']) => {
  if (status === 'queued') return '场景图排队中';
  if (status === 'recognizing') return '正在识别场景';
  if (status === 'failed') return '场景图生成失败';
  if (status === 'cancelled') return '插图任务已取消';
  if (status === 'completed') return '场景图已生成';
  return '场景图生成中';
};

export function GeneratingSceneCard({
  errorMessage,
  label,
  onRetry,
  progress,
  status,
}: {
  errorMessage?: string;
  onRetry?: () => void;
  progress: number;
  label: string;
  status?: GenerationTask['status'];
}) {
  return (
    <View style={[styles.generatingCard, status === 'failed' && styles.failedCard]}>
      <View style={styles.progressBadge}>
        <Text style={styles.progressBadgeText}>{progress}</Text>
      </View>
      <View style={styles.generatingCopy}>
        <Text style={styles.generatingTitle}>{getStatusTitle(status)}</Text>
        <Text style={styles.generatingText}>{errorMessage ?? label}</Text>
        {status === 'failed' && onRetry ? (
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>重新生成</Text>
          </Pressable>
        ) : null}
        <View style={styles.miniProgress}>
          <View style={[styles.miniProgressFill, { width: `${progress}%` }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  generatingCard: {
    height: 146,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(37,34,30,0.08)',
    backgroundColor: '#f4efe5',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 2,
    marginBottom: 22,
  },
  failedCard: { backgroundColor: '#f5e5df' },
  progressBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sageSoft,
  },
  progressBadgeText: { color: colors.deep, fontSize: 14, fontWeight: '900' },
  generatingCopy: { flex: 1 },
  generatingTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  generatingText: { marginTop: 4, color: colors.muted, fontSize: 12 },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: colors.deep,
    justifyContent: 'center',
    marginTop: 10,
    paddingHorizontal: 14,
  },
  retryButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  miniProgress: {
    width: 158,
    height: 4,
    borderRadius: 9,
    backgroundColor: '#dfd5c6',
    marginTop: 10,
    overflow: 'hidden',
  },
  miniProgressFill: { width: '68%', height: '100%', borderRadius: 9, backgroundColor: colors.sage },
});
