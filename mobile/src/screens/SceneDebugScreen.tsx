import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { CanonicalImageType, Chapter, SceneCandidateDebugDetail, SceneImage } from '../types/app';
import { buildSceneDebugModel, CANONICAL_IMAGE_TYPES, imageTypeLabel } from './sceneDebugModel';

type CommandState = { status: 'idle' | 'pending' | 'success' | 'error'; message?: string };

const makeIdempotencyKey = (candidateId: string, imageType: CanonicalImageType) =>
  `mobile:${candidateId}:${imageType}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;

export function SceneDebugScreen({
  chapter,
  candidates,
  sceneImages,
  onConfirmRegeneration,
}: {
  chapter: Chapter | null;
  candidates: SceneCandidateDebugDetail[];
  sceneImages: SceneImage[];
  onConfirmRegeneration: (
    candidateId: string,
    overrideImageType: CanonicalImageType,
    idempotencyKey: string,
  ) => Promise<void>;
}) {
  const [selectedOverrides, setSelectedOverrides] = useState<Record<string, CanonicalImageType>>({});
  const [commandStates, setCommandStates] = useState<Record<string, CommandState>>({});
  const idempotencyKeys = useRef<Record<string, string>>({});
  const chapterCandidates = useMemo(
    () => candidates.filter((candidate) => !chapter || candidate.chapterId === chapter.id),
    [candidates, chapter],
  );

  const selectOverride = (candidateId: string, imageType: CanonicalImageType) => {
    delete idempotencyKeys.current[candidateId];
    setSelectedOverrides((current) => ({ ...current, [candidateId]: imageType }));
    setCommandStates((current) => ({ ...current, [candidateId]: { status: 'idle' } }));
  };

  const confirmRegeneration = async (candidateId: string, imageType: CanonicalImageType) => {
    if (commandStates[candidateId]?.status === 'pending') return;
    const idempotencyKey = idempotencyKeys.current[candidateId]
      ?? makeIdempotencyKey(candidateId, imageType);
    idempotencyKeys.current[candidateId] = idempotencyKey;
    setCommandStates((current) => ({ ...current, [candidateId]: { status: 'pending' } }));

    try {
      await onConfirmRegeneration(candidateId, imageType, idempotencyKey);
      setCommandStates((current) => ({
        ...current,
        [candidateId]: { status: 'success', message: '重新生成请求已进入队列，历史记录已刷新。' },
      }));
    } catch (error) {
      setCommandStates((current) => ({
        ...current,
        [candidateId]: {
          status: 'error',
          message: error instanceof Error ? `重新生成失败：${error.message}` : '重新生成请求失败。',
        },
      }));
    }
  };

  if (!chapter) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>尚未选择章节</Text>
        <Text style={styles.emptyText}>请先打开一个章节，再查看插图生成详情。</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>{chapter.title}</Text>
        <Text style={styles.summaryText}>
          共 {chapterCandidates.length} 个候选场景。分类、依据、提示词、审核和类型调整仅用于调试。
        </Text>
      </View>

      {chapterCandidates.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>暂无候选场景详情</Text>
          <Text style={styles.emptyText}>请等待候选场景分类完成，或检查服务端连接。</Text>
        </View>
      ) : chapterCandidates.map((candidate, index) => {
        const model = buildSceneDebugModel(candidate);
        const selectedType = selectedOverrides[candidate.id] ?? model.initialOverrideType;
        const commandState = commandStates[candidate.id] ?? { status: 'idle' as const };
        const publishedImage = sceneImages.find((image) => image.candidateId === candidate.id)
          ?? sceneImages.find((image) => image.chapterId === candidate.chapterId && image.sourceBlockId === candidate.sourceBlockId);

        return (
          <View key={candidate.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.order}>候选场景 #{candidate.order + 1 || index + 1}</Text>
              <Text style={styles.confidence}>
                {model.primaryConfidencePercent === null ? '旧版数据 / 未分类' : `首选置信度 ${model.primaryConfidencePercent}%`}
              </Text>
            </View>

            <Text style={[styles.statusBanner, model.classificationStatus !== 'eligible' && styles.warningBanner]}>
              {model.classificationMessage}
            </Text>
            <Text style={styles.meta}>来源段落 ID：{model.sourceBlockId}</Text>
            <Text style={styles.meta}>分类模型：{model.classificationModel ?? '未分类'} / {model.promptVersion ?? '无版本信息'}</Text>
            <Text style={styles.meta}>构图协议：{model.contractVersion ?? '无版本信息'}</Text>
            <Text style={styles.meta}>配置版本：{model.profileVersion ?? '无'}</Text>
            <Text style={styles.meta}>保存类型 / 生效类型：{imageTypeLabel(candidate.storedImageType ?? candidate.imageType)} / {imageTypeLabel(candidate.effectiveImageType)}</Text>

            <Text style={styles.sectionLabel}>图片类型排名</Text>
            {model.rankedTypes.length === 0 ? (
              <Text style={styles.bodyText}>该旧版候选场景没有保存标准图片类型排名。</Text>
            ) : (
              <View style={styles.rankList}>
                {model.rankedTypes.map((ranked, rankIndex) => (
                <View key={ranked.imageType} style={styles.rankRow}>
                  <Text style={styles.rankName}>{rankIndex + 1}. {imageTypeLabel(ranked.imageType)}{ranked.isPrimary ? '（首选）' : ''}</Text>
                  <Text style={styles.rankConfidence}>{ranked.confidencePercent}%</Text>
                </View>
                ))}
              </View>
            )}

            <Text style={styles.sectionLabel}>分类依据</Text>
            {model.evidence.map((evidence) => (
              <View key={`${evidence.sourceBlockId}:${evidence.sourceText}`} style={styles.sourceBox}>
                <Text style={styles.sourceLabel}>{evidence.sourceBlockId}</Text>
                <Text style={styles.sourceText}>{evidence.sourceText}</Text>
              </View>
            ))}
            <Text style={styles.bodyText}>{model.reason}</Text>
            <View style={styles.tagRow}>
              {model.auxiliaryTags.map((tag) => <Text key={tag} style={styles.tag}>{tag}</Text>)}
            </View>

            <Text style={styles.sectionLabel}>候选提示词</Text>
            <Text style={styles.promptText}>草稿：{candidate.promptDraft || '-'}</Text>
            <Text style={styles.promptText}>最终版本：{candidate.finalPrompt ?? '-'}</Text>

            <Text style={styles.sectionLabel}>生成历史（最新在前）</Text>
            {model.history.length === 0 ? <Text style={styles.bodyText}>暂无生成记录。</Text> : model.history.map((attempt) => (
              <View key={attempt.id} style={styles.historyCard}>
                <View style={styles.cardHeader}>
                  <Text style={styles.historyTitle}>{attempt.trigger === 'manual' ? '手动' : '自动'} · {imageTypeLabel(attempt.requestedType)}</Text>
                  <Text style={[styles.historyStatus, attempt.status === 'blocked' && styles.blockedText]}>{attempt.statusLabel}</Text>
                </View>
                <Text style={styles.meta}>{attempt.createdAt}</Text>
                <Text style={styles.meta}>服务商 / 模型：{attempt.provider ?? '-'} / {attempt.model ?? '-'}</Text>
                <Text style={styles.promptText}>{attempt.prompt}</Text>
                {attempt.imageUrl ? (
                  <Image
                    accessible
                    accessibilityLabel={`${attempt.statusLabel}的生成图片`}
                    source={{ uri: attempt.imageUrl }}
                    style={styles.previewImage}
                  />
                ) : null}
                {attempt.audit ? (
                  <>
                    <Text style={styles.meta}>
                      审核：{attempt.audit.verdict === 'publishable' ? '可发布' : '已阻止'} · {attempt.audit.provider}/{attempt.audit.model} · {attempt.audit.auditVersion}
                    </Text>
                    {attempt.auditRules.map((rule) => (
                      <View key={`${attempt.id}:${rule.rule}`} style={styles.auditRule}>
                        <Text style={[styles.auditSeverity, rule.severity === 'severe' && styles.blockedText]}>
                          {rule.severityLabel} · {rule.passed ? '通过' : '未通过'} · {rule.rule}
                        </Text>
                        <Text style={styles.bodyText}>{rule.explanation}</Text>
                      </View>
                    ))}
                  </>
                ) : null}
              </View>
            ))}

            {publishedImage?.imageUrl ? (
              <Text style={styles.meta}>阅读页图片记录：{publishedImage.id}</Text>
            ) : null}

            <Text style={styles.sectionLabel}>手动调整标准图片类型</Text>
            {model.canConfirmOverride && selectedType ? (
              <>
                <View style={styles.typeGrid}>
                  {CANONICAL_IMAGE_TYPES.map((imageType) => {
                    const selected = selectedType === imageType;
                    return (
                      <Pressable
                        accessibilityLabel={`将候选场景 ${candidate.id} 调整为${imageTypeLabel(imageType)}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={imageType}
                        onPress={() => selectOverride(candidate.id, imageType)}
                        style={[styles.typeButton, selected && styles.typeButtonSelected]}
                      >
                        <Text style={[styles.typeButtonText, selected && styles.typeButtonTextSelected]}>{imageTypeLabel(imageType)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.bodyText}>当前选择只保存在本页，点击确认后才会创建重新生成请求。</Text>
                <Pressable
                  accessibilityLabel={`确认将候选场景 ${candidate.id} 按${imageTypeLabel(selectedType)}重新生成`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: commandState.status === 'pending' }}
                  disabled={commandState.status === 'pending'}
                  onPress={() => confirmRegeneration(candidate.id, selectedType)}
                  style={[styles.confirmButton, commandState.status === 'pending' && styles.confirmButtonDisabled]}
                >
                  <Text style={styles.confirmButtonText}>
                    {commandState.status === 'pending' ? '正在提交…' : `确认按${imageTypeLabel(selectedType)}重新生成`}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.bodyText}>重新分类并获得标准图片类型后，才能确认类型调整。</Text>
            )}
            {commandState.message ? (
              <Text style={commandState.status === 'error' ? styles.errorText : styles.successText}>{commandState.message}</Text>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
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
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 14, backgroundColor: '#fffaf1', gap: 9 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  order: { color: colors.deep, fontSize: 16, fontWeight: '900' },
  confidence: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  statusBanner: { color: colors.deep, backgroundColor: colors.sageSoft, borderRadius: 6, padding: 9, fontSize: 12, fontWeight: '800' },
  warningBanner: { color: '#754719', backgroundColor: '#f7dfbd' },
  meta: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  sectionLabel: { color: colors.deep, fontSize: 12, fontWeight: '900', marginTop: 3 },
  rankList: { borderWidth: 1, borderColor: colors.line, borderRadius: 6, overflow: 'hidden' },
  rankRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line },
  rankName: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  rankConfidence: { color: colors.deep, fontSize: 12, fontWeight: '900' },
  sourceBox: { borderLeftWidth: 3, borderLeftColor: colors.deep, padding: 10, backgroundColor: '#efe6d6' },
  sourceLabel: { color: colors.deep, fontSize: 11, fontWeight: '900', marginBottom: 4 },
  sourceText: { color: colors.ink, fontSize: 13, lineHeight: 20 },
  bodyText: { color: colors.ink, fontSize: 12, lineHeight: 18 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { color: colors.deep, backgroundColor: colors.sageSoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, fontSize: 11 },
  historyCard: { borderWidth: 1, borderColor: colors.line, borderRadius: 7, padding: 10, gap: 6, backgroundColor: '#f7f1e7' },
  historyTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  historyStatus: { color: colors.deep, fontSize: 11, fontWeight: '900' },
  blockedText: { color: '#a13225' },
  promptText: { color: colors.ink, fontSize: 11, lineHeight: 16, padding: 8, backgroundColor: '#eee5d6', borderRadius: 5 },
  previewImage: { width: '100%', aspectRatio: 3 / 2, borderRadius: 7, backgroundColor: '#eadfce' },
  auditRule: { borderLeftWidth: 2, borderLeftColor: colors.line, paddingLeft: 8, gap: 3 },
  auditSeverity: { color: colors.muted, fontSize: 11, fontWeight: '900' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  typeButton: { minWidth: '30%', flexGrow: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 9, alignItems: 'center' },
  typeButtonSelected: { backgroundColor: colors.deep, borderColor: colors.deep },
  typeButtonText: { color: colors.deep, fontSize: 11, fontWeight: '800' },
  typeButtonTextSelected: { color: '#fff' },
  confirmButton: { minHeight: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.deep, paddingHorizontal: 14 },
  confirmButtonDisabled: { opacity: 0.55 },
  confirmButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  successText: { color: '#2f684b', fontSize: 11, fontWeight: '800' },
  errorText: { color: '#a13225', fontSize: 11, fontWeight: '800' },
});
