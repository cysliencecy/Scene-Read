import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GeneratingSceneCard } from '../components/GeneratingSceneCard';
import {
  ReaderControlsSheet,
  type ReaderFontSize,
  type ReaderTheme,
} from '../components/ReaderControlsSheet';
import { ReaderParagraph } from '../components/ReaderParagraph';
import { SceneImage } from '../components/SceneImage';
import { colors } from '../theme/colors';
import type { Chapter, GenerationTask, SceneImage as SceneImageData, VisualStyle } from '../types/app';

const readerThemeTokens: Record<
  ReaderTheme,
  {
    background: string;
    text: string;
    title: string;
    hint: string;
    progressTrack: string;
    progressFill: string;
  }
> = {
  纸张: {
    background: colors.paper,
    text: '#28231d',
    title: colors.ink,
    hint: colors.muted,
    progressTrack: '#e4d9c8',
    progressFill: colors.deep,
  },
  暖色: {
    background: '#f6ecd9',
    text: '#30251a',
    title: '#2b2117',
    hint: '#806b50',
    progressTrack: '#e7d1ad',
    progressFill: '#7c5a2f',
  },
  夜间: {
    background: '#171916',
    text: '#ded7c8',
    title: '#f3ead7',
    hint: '#a59b8a',
    progressTrack: '#3a3932',
    progressFill: '#9fbaaa',
  },
};

const fontSizeTokens: Record<ReaderFontSize, { paragraph: number; lineHeight: number }> = {
  小: { paragraph: 15, lineHeight: 30 },
  中: { paragraph: 17, lineHeight: 34 },
  大: { paragraph: 19, lineHeight: 38 },
};

export function ReaderScreen({
  chapter,
  generationTasks,
  sceneImages,
  visualStyle,
  showControls,
  onCloseControls,
}: {
  chapter: Chapter;
  generationTasks: GenerationTask[];
  sceneImages: SceneImageData[];
  visualStyle: VisualStyle;
  showControls: boolean;
  onCloseControls: () => void;
}) {
  const [fontSize, setFontSize] = useState<ReaderFontSize>('中');
  const [theme, setTheme] = useState<ReaderTheme>('纸张');

  const themeTokens = readerThemeTokens[theme];
  const typography = fontSizeTokens[fontSize];
  const readerStyle = useMemo(
    () => [styles.readerShell, { backgroundColor: themeTokens.background }],
    [themeTokens.background],
  );

  return (
    <View style={readerStyle}>
      <ScrollView style={styles.readerScroll} contentContainerStyle={styles.readerContent}>
        <View style={styles.toast}>
          <Text style={styles.toastDot}>◌</Text>
          <Text style={styles.toastText}>场景图正在后台生成，你可以先阅读原文。</Text>
        </View>

        <Text style={[styles.chapterTitle, { color: themeTokens.title }]}>{chapter.title}</Text>
        {chapter.blocks.map((block) => {
          if (block.type === 'paragraph') {
            return (
              <ReaderParagraph
                key={block.id}
                color={themeTokens.text}
                fontSize={typography.paragraph}
                lineHeight={typography.lineHeight}
              >
                {block.text}
              </ReaderParagraph>
            );
          }

          if (block.type === 'scene-placeholder') {
            const task = generationTasks.find((item) => item.id === block.taskId);
            if (!task) return null;
            return <GeneratingSceneCard key={block.id} progress={task.progress} label={task.label} />;
          }

          const image = sceneImages.find((item) => item.id === block.imageId);
          if (!image) return null;
          return <SceneImage key={block.id} variant={image.variant} />;
        })}

        <Text style={[styles.readerHint, { color: themeTokens.hint }]}>当前风格：{visualStyle}</Text>
      </ScrollView>

      <View style={[styles.readingProgress, { backgroundColor: themeTokens.progressTrack }]}>
        <View
          style={[
            styles.readingProgressFill,
            { width: `${chapter.progress}%`, backgroundColor: themeTokens.progressFill },
          ]}
        />
      </View>

      {showControls && (
        <Pressable style={styles.controlsBackdrop} onPress={onCloseControls}>
          <ReaderControlsSheet
            fontSize={fontSize}
            theme={theme}
            onFontSizeChange={setFontSize}
            onThemeChange={setTheme}
            progress={chapter.progress}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  readerShell: { flex: 1 },
  readerScroll: { flex: 1 },
  readerContent: { paddingHorizontal: 24, paddingBottom: 78 },
  toast: {
    minHeight: 46,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(32,54,48,0.92)',
    marginBottom: 16,
  },
  toastDot: { color: '#fff', fontSize: 18 },
  toastText: { flex: 1, color: '#fff', fontSize: 13, lineHeight: 18 },
  chapterTitle: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '800',
    marginBottom: 18,
  },
  readerHint: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  readingProgress: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 22,
    height: 3,
    borderRadius: 9,
    overflow: 'hidden',
  },
  readingProgressFill: { width: '46%', height: '100%', borderRadius: 9 },
  controlsBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
});
