import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { sharedStyles } from '../theme/sharedStyles';

export function ImportScreen({ onNext }: { onNext: () => void }) {
  return (
    <View style={[sharedStyles.screen, styles.centerScreen]}>
      <View style={styles.importPanel}>
        <View style={styles.importIcon}>
          <Text style={styles.importIconText}>＋</Text>
        </View>
        <Text style={styles.importTitle}>选择一本书</Text>
        <Text style={styles.importDescription}>支持 TXT / EPUB</Text>
        <Pressable accessibilityRole="button" onPress={onNext} style={sharedStyles.primaryButton}>
          <Text style={sharedStyles.primaryButtonText}>从文件中导入</Text>
        </Pressable>
      </View>
    </View>
  );
}

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
});
