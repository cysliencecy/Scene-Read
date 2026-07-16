import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export function GeneratingSceneCard({ progress, label }: { progress: number; label: string }) {
  return (
    <View style={styles.generatingCard}>
      <View style={styles.progressBadge}>
        <Text style={styles.progressBadgeText}>{progress}</Text>
      </View>
      <View style={styles.generatingCopy}>
        <Text style={styles.generatingTitle}>场景图生成中</Text>
        <Text style={styles.generatingText}>{label}</Text>
        <View style={styles.miniProgress}>
          <View style={[styles.miniProgressFill, { width: `${progress}%` }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  generatingCard: {
    minHeight: 112,
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
