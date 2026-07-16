import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SceneImage } from '../components/SceneImage';
import { colors } from '../theme/colors';
import type { VisualStyle } from '../types/app';

export function ReaderScreen({
  visualStyle,
  showControls,
  onCloseControls,
}: {
  visualStyle: VisualStyle;
  showControls: boolean;
  onCloseControls: () => void;
}) {
  return (
    <View style={styles.readerShell}>
      <ScrollView style={styles.readerScroll} contentContainerStyle={styles.readerContent}>
        <View style={styles.toast}>
          <Text style={styles.toastDot}>◌</Text>
          <Text style={styles.toastText}>场景图正在后台生成，你可以先阅读原文。</Text>
        </View>

        <Text style={styles.chapterTitle}>第一章 雨夜之后</Text>
        <Text style={styles.paragraph}>
          雨声在窗外持续了整夜。林知夏醒来时，手机屏幕上还停着昨晚没有发出去的消息。
        </Text>
        <Text style={styles.paragraph}>
          客厅里只剩下一盏落地灯，沙发边的杯子已经凉透。她在玄关站了很久，直到楼下传来第一班公交车的声音。
        </Text>
        <Text style={styles.paragraph}>她拿起外套，关上门，把身后的安静留在屋里。</Text>

        <View style={styles.generatingCard}>
          <View style={styles.progressBadge}>
            <Text style={styles.progressBadgeText}>68</Text>
          </View>
          <View style={styles.generatingCopy}>
            <Text style={styles.generatingTitle}>场景图生成中</Text>
            <Text style={styles.generatingText}>正在生成这段地点变化的插图</Text>
            <View style={styles.miniProgress}>
              <View style={styles.miniProgressFill} />
            </View>
          </View>
        </View>

        <Text style={styles.paragraph}>
          街道被雨水洗得发亮，便利店的招牌还亮着。她沿着人行道往地铁站走，耳机里没有音乐。
        </Text>
        <Text style={styles.paragraph}>只有雨滴从树叶上落下来的声音，一下，又一下。</Text>

        <SceneImage variant="street" />

        <Text style={styles.paragraph}>
          九点差五分，她推开公司玻璃门。前台的灯刚刚打开，走廊尽头的会议室已经坐了几个人。
        </Text>
        <Text style={styles.paragraph}>空气里有咖啡和打印纸混在一起的味道。</Text>

        <SceneImage variant="office" />

        <Text style={styles.readerHint}>当前风格：{visualStyle}</Text>
      </ScrollView>

      <View style={styles.readingProgress}>
        <View style={styles.readingProgressFill} />
      </View>

      {showControls && (
        <Pressable style={styles.controlsBackdrop} onPress={onCloseControls}>
          <View style={styles.controlsSheet}>
            <View style={styles.controlRow}>
              <View style={styles.controlPill}>
                <Text style={styles.controlText}>目录</Text>
              </View>
              <View style={styles.controlPill}>
                <Text style={styles.controlText}>字号</Text>
              </View>
              <View style={styles.controlPill}>
                <Text style={styles.controlText}>主题</Text>
              </View>
            </View>
            <View style={styles.slider}>
              <View style={styles.sliderFill} />
            </View>
            <Text style={styles.sheetProgress}>本章 46%</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  readerShell: { flex: 1, backgroundColor: colors.paper },
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
    color: colors.ink,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '800',
    marginBottom: 18,
  },
  paragraph: { color: '#28231d', fontSize: 17, lineHeight: 34, marginBottom: 16 },
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
  readerHint: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 8 },
  readingProgress: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 22,
    height: 3,
    borderRadius: 9,
    backgroundColor: '#e4d9c8',
    overflow: 'hidden',
  },
  readingProgressFill: { width: '46%', height: '100%', borderRadius: 9, backgroundColor: colors.deep },
  controlsBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  controlsSheet: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 28,
    backgroundColor: 'rgba(251,248,241,0.98)',
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  controlRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  controlPill: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0eadf',
  },
  controlText: { color: colors.deep, fontSize: 13, fontWeight: '800' },
  slider: { height: 4, borderRadius: 9, backgroundColor: '#dfd5c6', overflow: 'hidden' },
  sliderFill: { width: '46%', height: '100%', borderRadius: 9, backgroundColor: colors.deep },
  sheetProgress: { marginTop: 10, color: colors.muted, fontSize: 12, textAlign: 'center' },
});
