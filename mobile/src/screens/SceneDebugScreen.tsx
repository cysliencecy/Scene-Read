import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { CanonicalImageType, Chapter, SceneCandidateDebugDetail, SceneImage } from '../types/app';
import { buildSceneDebugModel, CANONICAL_IMAGE_TYPES } from './sceneDebugModel';

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
        [candidateId]: { status: 'success', message: 'Regeneration queued and history refreshed.' },
      }));
    } catch (error) {
      setCommandStates((current) => ({
        ...current,
        [candidateId]: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Regeneration request failed.',
        },
      }));
    }
  };

  if (!chapter) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No chapter selected</Text>
        <Text style={styles.emptyText}>Open a chapter before inspecting image-generation details.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>{chapter.title}</Text>
        <Text style={styles.summaryText}>
          {chapterCandidates.length} candidate(s). Classification, evidence, prompts, audits, and override controls are debug-only.
        </Text>
      </View>

      {chapterCandidates.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No candidate details</Text>
          <Text style={styles.emptyText}>Wait for candidate classification or check the Server connection.</Text>
        </View>
      ) : chapterCandidates.map((candidate, index) => {
        const model = buildSceneDebugModel(candidate);
        const selectedType = selectedOverrides[candidate.id] ?? candidate.classification.primaryType;
        const commandState = commandStates[candidate.id] ?? { status: 'idle' as const };
        const publishedImage = sceneImages.find((image) => image.candidateId === candidate.id)
          ?? sceneImages.find((image) => image.chapterId === candidate.chapterId && image.sourceBlockId === candidate.sourceBlockId);

        return (
          <View key={candidate.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.order}>Candidate #{candidate.order + 1 || index + 1}</Text>
              <Text style={styles.confidence}>Primary {model.primaryConfidencePercent}%</Text>
            </View>

            <Text style={[styles.statusBanner, candidate.classification.status !== 'eligible' && styles.warningBanner]}>
              {model.thresholdMessage}
            </Text>
            <Text style={styles.meta}>sourceBlockId: {model.sourceBlockId}</Text>
            <Text style={styles.meta}>classification: {model.classificationModel} / {model.promptVersion}</Text>
            <Text style={styles.meta}>composition contract: {model.contractVersion}</Text>
            <Text style={styles.meta}>profile: {model.profileVersion ?? 'none'}</Text>
            <Text style={styles.meta}>stored/effective type: {candidate.storedImageType ?? candidate.imageType ?? '-'} / {candidate.effectiveImageType ?? '-'}</Text>

            <Text style={styles.sectionLabel}>Ranked image types</Text>
            <View style={styles.rankList}>
              {model.rankedTypes.map((ranked, rankIndex) => (
                <View key={ranked.imageType} style={styles.rankRow}>
                  <Text style={styles.rankName}>{rankIndex + 1}. {ranked.imageType}{ranked.isPrimary ? ' (primary)' : ''}</Text>
                  <Text style={styles.rankConfidence}>{ranked.confidencePercent}%</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Evidence</Text>
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

            <Text style={styles.sectionLabel}>Candidate prompts</Text>
            <Text style={styles.promptText}>draft: {candidate.promptDraft || '-'}</Text>
            <Text style={styles.promptText}>final: {candidate.finalPrompt ?? '-'}</Text>

            <Text style={styles.sectionLabel}>Generation history (newest first)</Text>
            {model.history.length === 0 ? <Text style={styles.bodyText}>No attempts.</Text> : model.history.map((attempt) => (
              <View key={attempt.id} style={styles.historyCard}>
                <View style={styles.cardHeader}>
                  <Text style={styles.historyTitle}>{attempt.trigger} · {attempt.requestedType}</Text>
                  <Text style={[styles.historyStatus, attempt.status === 'blocked' && styles.blockedText]}>{attempt.statusLabel}</Text>
                </View>
                <Text style={styles.meta}>{attempt.createdAt}</Text>
                <Text style={styles.meta}>provider: {attempt.provider ?? '-'} / {attempt.model ?? '-'}</Text>
                <Text style={styles.promptText}>{attempt.prompt}</Text>
                {attempt.imageUrl ? (
                  <Image
                    accessible
                    accessibilityLabel={`${attempt.statusLabel} generated image`}
                    source={{ uri: attempt.imageUrl }}
                    style={styles.previewImage}
                  />
                ) : null}
                {attempt.audit ? (
                  <>
                    <Text style={styles.meta}>
                      audit: {attempt.audit.verdict} · {attempt.audit.provider}/{attempt.audit.model} · {attempt.audit.auditVersion}
                    </Text>
                    {attempt.auditRules.map((rule) => (
                      <View key={`${attempt.id}:${rule.rule}`} style={styles.auditRule}>
                        <Text style={[styles.auditSeverity, rule.severity === 'severe' && styles.blockedText]}>
                          {rule.severityLabel} · {rule.passed ? 'pass' : 'fail'} · {rule.rule}
                        </Text>
                        <Text style={styles.bodyText}>{rule.explanation}</Text>
                      </View>
                    ))}
                  </>
                ) : null}
              </View>
            ))}

            {publishedImage?.imageUrl ? (
              <Text style={styles.meta}>Reader projection: {publishedImage.id}</Text>
            ) : null}

            <Text style={styles.sectionLabel}>Manual canonical override</Text>
            <View style={styles.typeGrid}>
              {CANONICAL_IMAGE_TYPES.map((imageType) => {
                const selected = selectedType === imageType;
                return (
                  <Pressable
                    accessibilityLabel={`Select ${imageType} override for candidate ${candidate.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={imageType}
                    onPress={() => selectOverride(candidate.id, imageType)}
                    style={[styles.typeButton, selected && styles.typeButtonSelected]}
                  >
                    <Text style={[styles.typeButtonText, selected && styles.typeButtonTextSelected]}>{imageType}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.bodyText}>Selection is local only. Confirm separately to create a request.</Text>
            <Pressable
              accessibilityLabel={`Confirm regeneration for candidate ${candidate.id} as ${selectedType}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: commandState.status === 'pending' }}
              disabled={commandState.status === 'pending'}
              onPress={() => confirmRegeneration(candidate.id, selectedType)}
              style={[styles.confirmButton, commandState.status === 'pending' && styles.confirmButtonDisabled]}
            >
              <Text style={styles.confirmButtonText}>
                {commandState.status === 'pending' ? 'Submitting…' : `Confirm regeneration as ${selectedType}`}
              </Text>
            </Pressable>
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
