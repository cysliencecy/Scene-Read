import { useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { Chapter, SceneCandidate, SceneImage } from '../types/app';

type CopyStatus = Record<string, string>;

async function copyText(text: string) {
  const clipboard = globalThis.navigator?.clipboard;
  if (Platform.OS === 'web' && clipboard?.writeText) {
    await clipboard.writeText(text);
    return true;
  }
  return false;
}

export function SceneDebugScreen({
  chapter,
  candidates,
  sceneImages,
}: {
  chapter: Chapter | null;
  candidates: SceneCandidate[];
  sceneImages: SceneImage[];
}) {
  const [expandedRawIds, setExpandedRawIds] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>({});
  const chapterCandidates = useMemo(
    () => candidates.filter((candidate) => !chapter || candidate.chapterId === chapter.id),
    [candidates, chapter],
  );

  const handleCopy = async (key: string, value: string) => {
    const copied = await copyText(value);
    setCopyStatus((current) => ({ ...current, [key]: copied ? '已复制' : '当前端不支持复制' }));
  };

  const toggleRaw = (candidateId: string) => {
    setExpandedRawIds((current) =>
      current.includes(candidateId) ? current.filter((id) => id !== candidateId) : [...current, candidateId],
    );
  };

  if (!chapter) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>暂无章节</Text>
        <Text style={styles.emptyText}>进入阅读页后再查看生成调试信息。</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>{chapter.title}</Text>
        <Text style={styles.summaryText}>候选场景 {chapterCandidates.length} 个。这里展示 Kimi 识别位\u7f6、理由和最终生图 prompt，只用于调试。</Text>
      </View>

      {chapterCandidates.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>暂无候选记录</Text>
          <Text style={styles.emptyText}>如果刚导入书籍，请等待 Worker 完成识别；如果 Supabase 还未执行新表 schema，后端会返回空列表。</Text>
        </View>
      ) : (
        chapterCandidates.map((candidate, index) => {
          const matchedImage = sceneImages.find(
            (image) => image.chapterId === candidate.chapterId && image.sourceBlockId === candidate.sourceBlockId,
          );
          const promptDraftKey = candidate.id + ':draft';
          const finalPrompt = candidate.finalPrompt ?? matchedImage?.prompt ?? candidate.promptDraft;
          const finalPromptKey = candidate.id + ':final';
          const rawExpanded = expandedRawIds.includes(candidate.id);

          return (
            <View key={candidate.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.order}>#{candidate.order + 1 || index + 1}</Text>
                <Text style={styles.confidence}>置信度 {Math.round(candidate.confidence * 100)}%</Text>
              </View>

              <Text style={styles.meta}>sourceBlockId: {candidate.sourceBlockId || '-'}</Text>
              <Text style={styles.meta}>position: {candidate.position}</Text>

              <View style={styles.sourceBox}>
                <Text style={styles.sourceLabel}>原文片段</Text>
                <Text style={styles.sourceText}>{candidate.sourceText || '无原文片段'}</Text>
              </View>

              <Text style={styles.sectionLabel}>Kimi 理由</Text>
              <Text style={styles.bodyText}>{candidate.reason || '-'}</Text>
              <Text style={styles.bodyText}>locationChange: {candidate.locationChange || '-'}</Text>

              <PromptBlock title="promptDraft" value={candidate.promptDraft} status={copyStatus[promptDraftKey]} onCopy={() => handleCopy(promptDraftKey, candidate.promptDraft)} />
              <PromptBlock title="finalPrompt" value={finalPrompt} status={copyStatus[finalPromptKey]} onCopy={() => handleCopy(finalPromptKey, finalPrompt)} />

              <Text style={styles.sectionLabel}>生成图片关系</Text>
              {matchedImage?.imageUrl ? (
                <Image source={{ uri: matchedImage.imageUrl }} style={styles.previewImage} />
              ) : (
                <Text style={styles.bodyText}>暂未匹配到已生成图片。</Text>
              )}
              <Text style={styles.bodyText}>当前规则：第一版每章默认生成第 1 个候选。</Text>
              <Text style={styles.meta}>provider: {candidate.provider || '-'}</Text>
              <Text style={styles.meta}>model: {candidate.model || '-'}</Text>
              <Text style={styles.meta}>promptVersion: {candidate.promptVersion || '-'}</Text>

              <Pressable accessibilityRole="button" onPress={() => toggleRaw(candidate.id)} style={styles.rawButton}>
                <Text style={styles.rawButtonText}>{rawExpanded ? '收起 raw Kimi JSON' : '展开 raw Kimi JSON'}</Text>
              </Pressable>
              {rawExpanded && <Text style={styles.rawText}>{JSON.stringify(candidate.rawResponse ?? {}, null, 2)}</Text>}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function PromptBlock({ title, value, status, onCopy }: { title: string; value: string; status?: string; onCopy: () => void }) {
  return (
    <View style={styles.promptBlock}>
      <View style={styles.promptHeader}>
        <Text style={styles.sectionLabel}>{title}</Text>
        <Pressable accessibilityRole="button" onPress={onCopy} style={styles.copyButton}>
          <Text style={styles.copyButtonText}>复制</Text>
        </Pressable>
      </View>
      <Text style={styles.promptText}>{value || '-'}</Text>
      {status ? <Text style={styles.copyStatus}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 20, paddingBottom: 48, gap: 14 },
  summary: { paddingBottom: 4 },
  summaryTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', marginBottom: 6 },
  summaryText: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  emptyState: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '900', marginBottom: 8 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 14, backgroundColor: '#fffaf1', gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  order: { color: colors.deep, fontSize: 16, fontWeight: '900' },
  confidence: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  sourceBox: { borderLeftWidth: 3, borderLeftColor: colors.deep, padding: 10, backgroundColor: '#efe6d6' },
  sourceLabel: { color: colors.deep, fontSize: 12, fontWeight: '900', marginBottom: 6 },
  sourceText: { color: colors.ink, fontSize: 14, lineHeight: 24 },
  sectionLabel: { color: colors.deep, fontSize: 12, fontWeight: '900' },
  bodyText: { color: colors.ink, fontSize: 13, lineHeight: 20 },
  promptBlock: { gap: 6 },
  promptHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  promptText: { color: colors.ink, fontSize: 12, lineHeight: 18, padding: 10, backgroundColor: '#f5efe4', borderRadius: 6 },
  copyButton: { minWidth: 54, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.deep },
  copyButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  copyStatus: { color: colors.muted, fontSize: 11 },
  previewImage: { width: '100%', aspectRatio: 1.42, borderRadius: 8, backgroundColor: '#eadfce' },
  rawButton: { height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  rawButtonText: { color: colors.deep, fontSize: 12, fontWeight: '900' },
  rawText: { color: colors.ink, fontSize: 11, lineHeight: 16, padding: 10, backgroundColor: '#f5efe4', borderRadius: 6 },
});
