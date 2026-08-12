import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { enablePrivateBookSource, fetchPrivateBookSources, importPrivateBookSource, validatePrivateBookSource } from '../api/client';
import { colors } from '../theme/colors';
import { sharedStyles } from '../theme/sharedStyles';
import type { BookSourceVersion } from '../types/app';

export function BookSourceDebugScreen() {
  const [sources, setSources] = useState<BookSourceVersion[]>([]);
  const [json, setJson] = useState('');
  const [variables, setVariables] = useState('{"query":"测试","bookId":"1","chapterId":"1","page":"1"}');
  const [format, setFormat] = useState<'scene-read' | 'legado'>('scene-read');
  const [message, setMessage] = useState('仅供本机调试；不会展示给普通用户。');
  const refresh = () => fetchPrivateBookSources().then(setSources).catch((error) => setMessage(String(error)));
  useEffect(() => { void refresh(); }, []);

  const importSource = async () => {
    try {
      const result = await importPrivateBookSource(JSON.parse(json), format);
      setMessage(result.validation.valid
        ? result.imported ? '配置已导入，必须完成四阶段预览后才能启用。' : '相同版本已经存在。'
        : result.validation.issues.map((item) => `${item.path}: ${item.code}`).join('\n'));
      refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : '导入失败'); }
  };

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={styles.warning}>私有单用户功能。仅执行声明式规则，不支持 JavaScript、登录、Cookie、验证码或动态解密。</Text>
      <View style={styles.tabs}>
        {(['scene-read', 'legado'] as const).map((item) => <Pressable key={item} onPress={() => setFormat(item)} style={[styles.tab, format === item && styles.tabActive]}><Text>{item === 'scene-read' ? 'Scene Read JSON' : 'Legado 安全子集'}</Text></Pressable>)}
      </View>
      <TextInput multiline placeholder="粘贴书源 JSON" value={json} onChangeText={setJson} style={styles.editor} />
      <Pressable accessibilityRole="button" onPress={importSource} style={sharedStyles.primaryButton}><Text style={sharedStyles.primaryButtonText}>导入为未启用版本</Text></Pressable>
      <Text style={styles.label}>预览变量</Text>
      <TextInput multiline value={variables} onChangeText={setVariables} style={styles.variables} />
      <Text style={styles.message}>{message}</Text>
      {sources.map((source) => (
        <View key={source.id} style={styles.card}>
          <Text style={styles.title}>{source.name} · v{source.version}</Text>
          <Text style={styles.meta}>{source.sourceId} · {source.enabled ? '已启用' : source.removedAt ? '已移除' : '未启用'}</Text>
          <View style={styles.actions}>
            <Pressable onPress={async () => { try { const result = await validatePrivateBookSource(source.sourceId, source.version, JSON.parse(variables)); setMessage(result.valid ? '四阶段预览通过，可以手动启用。' : result.issues.map((item) => `${item.path}: ${item.code}`).join('\n')); refresh(); } catch (error) { setMessage(String(error)); } }} style={styles.action}><Text>验证预览</Text></Pressable>
            <Pressable onPress={async () => { try { await enablePrivateBookSource(source.sourceId, source.version); setMessage('已启用，可随时切回已验证的旧版本。'); refresh(); } catch (error) { setMessage(String(error)); } }} style={styles.action}><Text>启用此版本</Text></Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  warning: { color: colors.muted, fontSize: 12, lineHeight: 18 }, tabs: { marginTop: 12, flexDirection: 'row', gap: 8 },
  tab: { padding: 10, borderRadius: 10, backgroundColor: '#eee' }, tabActive: { backgroundColor: colors.sageSoft },
  editor: { minHeight: 180, marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: '#fff', textAlignVertical: 'top', fontFamily: 'monospace' },
  label: { marginTop: 18, color: colors.ink, fontWeight: '800' }, variables: { minHeight: 70, marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: '#fff', textAlignVertical: 'top' },
  message: { marginVertical: 14, color: colors.muted, fontSize: 12, lineHeight: 18 }, card: { padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.72)', marginBottom: 10 },
  title: { color: colors.ink, fontSize: 14, fontWeight: '800' }, meta: { marginTop: 4, color: colors.muted, fontSize: 11 },
  actions: { marginTop: 10, flexDirection: 'row', gap: 8 }, action: { padding: 9, borderRadius: 10, backgroundColor: colors.sageSoft },
});
