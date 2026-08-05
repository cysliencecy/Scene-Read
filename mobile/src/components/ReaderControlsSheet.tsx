import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Chapter } from '../types/app';
import type {
  ReaderFontFamily,
  ReaderFontSize,
  ReaderLineSpacing,
  ReaderPreferences,
  ReaderTheme,
} from '../reader/pagination';

export type ReaderControlPanel = 'chapters' | 'theme' | 'font' | null;

const fontSizes: ReaderFontSize[] = ['小', '中', '大'];
const lineSpacings: ReaderLineSpacing[] = ['紧凑', '标准', '宽松'];
const fontFamilies: ReaderFontFamily[] = ['默认', '宋体'];
const themes: Array<{ value: ReaderTheme; color: string }> = [
  { value: '纸张', color: '#fbf8f1' },
  { value: '暖色', color: '#f6ecd9' },
  { value: '夜间', color: '#171916' },
];

export function ReaderControlsSheet({
  activePanel,
  chapters,
  currentChapterId,
  preferences,
  onActivePanelChange,
  onChapterChange,
  onPreferencesChange,
}: {
  activePanel: ReaderControlPanel;
  chapters: Chapter[];
  currentChapterId: string;
  preferences: ReaderPreferences;
  onActivePanelChange: (panel: ReaderControlPanel) => void;
  onChapterChange: (chapterId: string) => void;
  onPreferencesChange: (preferences: ReaderPreferences) => void;
}) {
  const panelTouchStartY = useRef(0);
  const isNight = preferences.theme === '夜间';
  const panelStyle = [styles.panel, isNight && styles.panelNight];
  const primaryTextStyle = [styles.primaryText, isNight && styles.primaryTextNight];
  const secondaryTextStyle = [styles.secondaryText, isNight && styles.secondaryTextNight];

  const updatePreference = <Key extends keyof ReaderPreferences>(key: Key, value: ReaderPreferences[Key]) => {
    onPreferencesChange({ ...preferences, [key]: value });
  };

  return (
    <View
      style={styles.shell}
      onTouchStart={(event) => {
        panelTouchStartY.current = event.nativeEvent.pageY;
      }}
      onTouchEnd={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.pageY - panelTouchStartY.current > 40) onActivePanelChange(null);
      }}
    >
      {activePanel === 'chapters' && (
        <View style={panelStyle}>
          <Text style={primaryTextStyle}>章节目录</Text>
          <ScrollView style={styles.chapterList} showsVerticalScrollIndicator={false}>
            {chapters.map((chapter, index) => {
              const active = chapter.id === currentChapterId;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={chapter.id}
                  onPress={() => onChapterChange(chapter.id)}
                  style={[styles.chapterRow, active && styles.chapterRowActive]}
                >
                  <Text style={[secondaryTextStyle, active && styles.activeText]}>{index + 1}</Text>
                  <Text numberOfLines={1} style={[primaryTextStyle, styles.chapterTitle, active && styles.activeText]}>
                    {chapter.title}
                  </Text>
                  {active && <Text style={styles.currentLabel}>当前</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {activePanel === 'theme' && (
        <View style={panelStyle}>
          <Text style={primaryTextStyle}>阅读颜色</Text>
          <View style={styles.optionRow}>
            {themes.map((option) => {
              const active = preferences.theme === option.value;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={option.value}
                  onPress={() => updatePreference('theme', option.value)}
                  style={[styles.themeOption, active && styles.optionActive]}
                >
                  <View style={[styles.themeSwatch, { backgroundColor: option.color }]} />
                  <Text style={[secondaryTextStyle, active && styles.activeText]}>{option.value}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {activePanel === 'font' && (
        <View style={panelStyle}>
          <Text style={primaryTextStyle}>字号</Text>
          <View style={styles.optionRow}>
            {fontSizes.map((option) => (
              <OptionButton
                active={preferences.fontSize === option}
                isNight={isNight}
                key={option}
                label={option}
                onPress={() => updatePreference('fontSize', option)}
              />
            ))}
          </View>
          <Text style={[primaryTextStyle, styles.groupLabel]}>行距</Text>
          <View style={styles.optionRow}>
            {lineSpacings.map((option) => (
              <OptionButton
                active={preferences.lineSpacing === option}
                isNight={isNight}
                key={option}
                label={option}
                onPress={() => updatePreference('lineSpacing', option)}
              />
            ))}
          </View>
          <Text style={[primaryTextStyle, styles.groupLabel]}>字体</Text>
          <View style={styles.optionRow}>
            {fontFamilies.map((option) => (
              <OptionButton
                active={preferences.fontFamily === option}
                isNight={isNight}
                key={option}
                label={option}
                onPress={() => updatePreference('fontFamily', option)}
              />
            ))}
          </View>
        </View>
      )}

      <View style={[styles.toolbar, isNight && styles.toolbarNight]}>
        {([
          ['chapters', '章节'],
          ['theme', '颜色'],
          ['font', '字体'],
        ] as const).map(([panel, label]) => {
          const active = activePanel === panel;
          return (
            <Pressable
              accessibilityRole="button"
              key={panel}
              onPress={() => onActivePanelChange(active ? null : panel)}
              style={[styles.toolbarButton, active && styles.toolbarButtonActive]}
            >
              <Text style={[secondaryTextStyle, styles.toolbarIcon]}>{panel === 'chapters' ? '☰' : panel === 'theme' ? '◐' : 'Aa'}</Text>
              <Text style={[secondaryTextStyle, active && styles.activeText]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function OptionButton({
  active,
  isNight,
  label,
  onPress,
}: {
  active: boolean;
  isNight: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.optionButton, isNight && styles.optionButtonNight, active && styles.optionActive]}
    >
      <Text style={[styles.secondaryText, isNight && styles.secondaryTextNight, active && styles.activeText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panel: {
    maxHeight: 340,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: 'rgba(251,248,241,0.98)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(37,34,30,0.1)',
  },
  panelNight: { backgroundColor: 'rgba(31,33,29,0.98)', borderTopColor: 'rgba(255,255,255,0.12)' },
  toolbar: {
    height: 72,
    paddingHorizontal: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(251,248,241,0.99)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(37,34,30,0.1)',
  },
  toolbarNight: { backgroundColor: 'rgba(23,25,22,0.99)', borderTopColor: 'rgba(255,255,255,0.12)' },
  toolbarButton: { minWidth: 72, height: 58, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 16 },
  toolbarButtonActive: { backgroundColor: 'rgba(109,137,124,0.16)' },
  toolbarIcon: { fontSize: 18, lineHeight: 22 },
  primaryText: { color: '#28231d', fontSize: 14, fontWeight: '800' },
  primaryTextNight: { color: '#f3ead7' },
  secondaryText: { color: '#756f64', fontSize: 13, fontWeight: '700' },
  secondaryTextNight: { color: '#bdb3a2' },
  activeText: { color: '#4d7565' },
  chapterList: { marginTop: 10 },
  chapterRow: { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12 },
  chapterRowActive: { backgroundColor: 'rgba(109,137,124,0.14)' },
  chapterTitle: { flex: 1 },
  currentLabel: { color: '#4d7565', fontSize: 11, fontWeight: '800' },
  optionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  optionButton: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#f0eadf' },
  optionButtonNight: { backgroundColor: '#30332e' },
  optionActive: { borderWidth: 1, borderColor: '#6d897c', backgroundColor: 'rgba(109,137,124,0.16)' },
  themeOption: { flex: 1, height: 72, alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14 },
  themeSwatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(37,34,30,0.14)' },
  groupLabel: { marginTop: 18 },
});
