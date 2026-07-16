import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { styleOptions } from '../data/mockData';
import { colors } from '../theme/colors';
import { sharedStyles } from '../theme/sharedStyles';
import type { VisualStyle } from '../types/app';

export function StyleScreen({
  selected,
  onSelect,
  onStart,
}: {
  selected: VisualStyle;
  onSelect: (style: VisualStyle) => void;
  onStart: () => void;
}) {
  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={styles.helperText}>风格会用于整本书，阅读中不频繁切换，避免破坏连续性。</Text>

      <View style={styles.styleList}>
        {styleOptions.map((option) => {
          const active = selected === option.name;
          return (
            <Pressable
              accessibilityRole="button"
              key={option.name}
              onPress={() => onSelect(option.name)}
              style={[styles.styleCard, active && styles.styleCardActive]}
            >
              <View
                style={[
                  styles.stylePreview,
                  { backgroundColor: option.colors[0], borderColor: option.colors[1] },
                ]}
              />
              <View style={styles.styleCopy}>
                <Text style={styles.styleName}>{option.name}</Text>
                <Text style={styles.styleDescription}>{option.description}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioActive]} />
            </Pressable>
          );
        })}
      </View>

      <Pressable accessibilityRole="button" onPress={onStart} style={sharedStyles.primaryButton}>
        <Text style={sharedStyles.primaryButtonText}>开始阅读</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  helperText: { marginTop: 8, color: colors.muted, fontSize: 14, lineHeight: 24 },
  styleList: { marginTop: 22, gap: 12 },
  styleCard: {
    minHeight: 112,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(37,34,30,0.08)',
    backgroundColor: 'rgba(255,255,255,0.68)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  styleCardActive: { borderColor: 'rgba(32,54,48,0.5)', backgroundColor: colors.sageSoft },
  stylePreview: { width: 84, height: 84, borderRadius: 16, borderWidth: 12 },
  styleCopy: { flex: 1 },
  styleName: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  styleDescription: { marginTop: 6, color: colors.muted, fontSize: 12, lineHeight: 18 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#c7bdae' },
  radioActive: { borderWidth: 6, borderColor: colors.deep },
});
