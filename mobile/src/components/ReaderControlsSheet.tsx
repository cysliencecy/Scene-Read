import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export type ReaderFontSize = '小' | '中' | '大';
export type ReaderTheme = '纸张' | '暖色' | '夜间';

export function ReaderControlsSheet({
  fontSize,
  theme,
  progress,
  onFontSizeChange,
  onThemeChange,
  onOpenSceneDebug,
}: {
  fontSize: ReaderFontSize;
  theme: ReaderTheme;
  progress: number;
  onFontSizeChange: (fontSize: ReaderFontSize) => void;
  onThemeChange: (theme: ReaderTheme) => void;
  onOpenSceneDebug: () => void;
}) {
  return (
    <View style={styles.controlsSheet}>
      <Text style={styles.groupLabel}>字号</Text>
      <View style={styles.controlRow}>
        {(['小', '中', '大'] as ReaderFontSize[]).map((option) => (
          <Pressable
            accessibilityRole="button"
            key={option}
            onPress={() => onFontSizeChange(option)}
            style={[styles.controlPill, fontSize === option && styles.controlPillActive]}
          >
            <Text style={[styles.controlText, fontSize === option && styles.controlTextActive]}>{option}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.groupLabel}>主题</Text>
      <View style={styles.controlRow}>
        {(['纸张', '暖色', '夜间'] as ReaderTheme[]).map((option) => (
          <Pressable
            accessibilityRole="button"
            key={option}
            onPress={() => onThemeChange(option)}
            style={[styles.controlPill, theme === option && styles.controlPillActive]}
          >
            <Text style={[styles.controlText, theme === option && styles.controlTextActive]}>{option}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable accessibilityRole="button" onPress={onOpenSceneDebug} style={styles.debugButton}>
        <Text style={styles.debugButtonText}>生成调试</Text>
      </Pressable>

      <View style={styles.slider}>
        <View style={[styles.sliderFill, { width: `${progress}%` }]} />
      </View>
      <Text style={styles.sheetProgress}>本章 {progress}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  controlsSheet: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 28,
    backgroundColor: 'rgba(251,248,241,0.98)',
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  groupLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  controlRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  controlPill: {
    flex: 1,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0eadf',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  controlPillActive: {
    backgroundColor: colors.sageSoft,
    borderColor: 'rgba(32,54,48,0.32)',
  },
  controlText: { color: colors.deep, fontSize: 13, fontWeight: '800' },
  controlTextActive: { color: colors.deep },
  debugButton: {
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.deep,
    marginBottom: 16,
  },
  debugButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  slider: { height: 4, borderRadius: 9, backgroundColor: '#dfd5c6', overflow: 'hidden' },
  sliderFill: { width: '46%', height: '100%', borderRadius: 9, backgroundColor: colors.deep },
  sheetProgress: { marginTop: 10, color: colors.muted, fontSize: 12, textAlign: 'center' },
});
