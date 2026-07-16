import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Screen = 'shelf' | 'import' | 'style' | 'reader';
type VisualStyle = '写实' | '动漫' | '插画';

type Book = {
  id: string;
  title: string;
  progress: string;
  accent: string;
};

const books: Book[] = [
  { id: 'rain', title: '雨夜之后', progress: '38%', accent: '#2f4a40' },
  { id: 'street', title: '旧街书店', progress: '最近阅读', accent: '#8b6b3c' },
  { id: 'station', title: '风穿过站台', progress: '新导入', accent: '#526b83' },
];

const styleOptions: Array<{
  name: VisualStyle;
  description: string;
  colors: [string, string];
}> = [
  {
    name: '写实',
    description: '适合都市、悬疑、现实题材，画面克制。',
    colors: ['#253631', '#c6b894'],
  },
  {
    name: '动漫',
    description: '适合轻小说和青春题材，角色感更强。',
    colors: ['#384a70', '#d8a7a1'],
  },
  {
    name: '插画',
    description: '适合温和叙事，保留文字阅读的安静感。',
    colors: ['#56624d', '#d8c58e'],
  },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>('shelf');
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('写实');
  const [showControls, setShowControls] = useState(false);

  const title = useMemo(() => {
    if (screen === 'import') return '导入书籍';
    if (screen === 'style') return '选择画面风格';
    if (screen === 'reader') return '第一章 雨夜之后';
    return '阅境';
  }, [screen]);

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.phoneFrame}>
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>9:41</Text>
          <Text style={styles.statusText}>5G  ◐  ▰</Text>
        </View>

        {screen === 'shelf' ? (
          <ShelfScreen onImport={() => setScreen('import')} onRead={() => setScreen('reader')} />
        ) : (
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (screen === 'reader') setScreen('shelf');
                if (screen === 'style') setScreen('import');
                if (screen === 'import') setScreen('shelf');
              }}
              style={styles.roundButton}
            >
              <Text style={styles.roundButtonText}>‹</Text>
            </Pressable>
            <Text style={styles.headerTitle}>{title}</Text>
            {screen === 'reader' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowControls((value) => !value)}
                style={styles.roundButton}
              >
                <Text style={styles.menuText}>☰</Text>
              </Pressable>
            ) : (
              <View style={styles.headerSpacer} />
            )}
          </View>
        )}

        {screen === 'import' && <ImportScreen onNext={() => setScreen('style')} />}
        {screen === 'style' && (
          <StyleScreen
            selected={visualStyle}
            onSelect={setVisualStyle}
            onStart={() => setScreen('reader')}
          />
        )}
        {screen === 'reader' && (
          <ReaderScreen
            visualStyle={visualStyle}
            showControls={showControls}
            onCloseControls={() => setShowControls(false)}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function ShelfScreen({
  onImport,
  onRead,
}: {
  onImport: () => void;
  onRead: () => void;
}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <View style={styles.shelfHeader}>
        <Text style={styles.logo}>阅境</Text>
      </View>

      <Pressable accessibilityRole="button" onPress={onRead} style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>继续阅读</Text>
        <Text style={styles.heroTitle}>雨夜之后</Text>
        <Text style={styles.heroDescription}>上次读到清晨街道，阅读到 38%</Text>
        <View style={styles.heroAction}>
          <Text style={styles.heroActionText}>继续</Text>
        </View>
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>我的书架</Text>
        <Pressable accessibilityRole="button" onPress={onImport} style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>导入本地书</Text>
        </Pressable>
      </View>

      <View style={styles.bookGrid}>
        {books.map((book) => (
          <Pressable
            accessibilityRole="button"
            key={book.id}
            onPress={onRead}
            style={[styles.bookCover, { backgroundColor: book.accent }]}
          >
            <View style={styles.bookShine} />
            <Text style={styles.bookTitle}>{book.title}</Text>
            <Text style={styles.bookMeta}>{book.progress}</Text>
          </Pressable>
        ))}

        <Pressable accessibilityRole="button" onPress={onImport} style={styles.importBookCover}>
          <View style={styles.importBookIcon}>
            <Text style={styles.importBookPlus}>＋</Text>
          </View>
          <Text style={styles.importBookTitle}>导入书籍</Text>
          <Text style={styles.importBookMeta}>支持 TXT、EPUB</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ImportScreen({ onNext }: { onNext: () => void }) {
  return (
    <View style={[styles.screen, styles.centerScreen]}>
      <View style={styles.importPanel}>
        <View style={styles.importIcon}>
          <Text style={styles.importIconText}>＋</Text>
        </View>
        <Text style={styles.importTitle}>选择一本书</Text>
        <Text style={styles.importDescription}>支持 TXT / EPUB</Text>
        <Pressable accessibilityRole="button" onPress={onNext} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>从文件中导入</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StyleScreen({
  selected,
  onSelect,
  onStart,
}: {
  selected: VisualStyle;
  onSelect: (style: VisualStyle) => void;
  onStart: () => void;
}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <Text style={styles.helperText}>
        风格会用于整本书，阅读中不频繁切换，避免破坏连续性。
      </Text>

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

      <Pressable accessibilityRole="button" onPress={onStart} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>开始阅读</Text>
      </Pressable>
    </ScrollView>
  );
}

function ReaderScreen({
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

function SceneImage({ variant }: { variant: 'street' | 'office' }) {
  return (
    <View style={[styles.sceneImage, variant === 'office' ? styles.officeArt : styles.streetArt]}>
      <View style={styles.sceneLayerOne} />
      <View style={styles.sceneLayerTwo} />
      <View style={styles.sceneLayerThree} />
    </View>
  );
}

const colors = {
  page: '#ece8df',
  paper: '#fbf8f1',
  ink: '#25221e',
  muted: '#756f64',
  line: '#e2d9ca',
  deep: '#203630',
  sage: '#6d897c',
  sageSoft: '#e6eee9',
  amber: '#bb8842',
};

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneFrame: {
    width: '100%',
    maxWidth: 430,
    flex: 1,
    backgroundColor: colors.paper,
    overflow: 'hidden',
  },
  statusBar: {
    height: 42,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  screenContent: {
    paddingHorizontal: 22,
    paddingBottom: 34,
  },
  shelfHeader: {
    height: 50,
    justifyContent: 'center',
  },
  logo: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: '800',
  },
  heroCard: {
    minHeight: 184,
    borderRadius: 24,
    padding: 18,
    backgroundColor: colors.deep,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 12,
  },
  heroTitle: {
    marginTop: 8,
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
  },
  heroDescription: {
    marginTop: 8,
    maxWidth: 250,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    lineHeight: 20,
  },
  heroAction: {
    alignSelf: 'flex-start',
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  heroActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  sectionAction: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(32,54,48,0.16)',
  },
  sectionActionText: {
    color: colors.deep,
    fontSize: 12,
    fontWeight: '800',
  },
  bookGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  bookCover: {
    width: 104,
    height: 152,
    borderRadius: 13,
    padding: 12,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bookShine: {
    position: 'absolute',
    left: -20,
    right: -20,
    top: -26,
    height: 96,
    backgroundColor: 'rgba(255,255,255,0.16)',
    transform: [{ rotate: '-14deg' }],
  },
  bookTitle: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  bookMeta: {
    marginTop: 5,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10,
  },
  importBookCover: {
    width: 104,
    height: 152,
    borderRadius: 13,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#b9ad9b',
    backgroundColor: 'rgba(255,255,255,0.56)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  importBookIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sageSoft,
    marginBottom: 10,
  },
  importBookPlus: {
    color: colors.deep,
    fontSize: 22,
    fontWeight: '700',
  },
  importBookTitle: {
    color: colors.deep,
    fontSize: 13,
    fontWeight: '800',
  },
  importBookMeta: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 10,
    textAlign: 'center',
  },
  header: {
    height: 54,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
  },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(37,34,30,0.08)',
  },
  roundButtonText: {
    color: colors.deep,
    fontSize: 30,
    lineHeight: 32,
  },
  menuText: {
    color: colors.deep,
    fontSize: 20,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 38,
  },
  centerScreen: {
    paddingHorizontal: 22,
    justifyContent: 'center',
  },
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
  importIconText: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '700',
  },
  importTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '800',
  },
  importDescription: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 14,
  },
  primaryButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.deep,
    marginTop: 28,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  helperText: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 24,
  },
  styleList: {
    marginTop: 22,
    gap: 12,
  },
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
  styleCardActive: {
    borderColor: 'rgba(32,54,48,0.5)',
    backgroundColor: colors.sageSoft,
  },
  stylePreview: {
    width: 84,
    height: 84,
    borderRadius: 16,
    borderWidth: 12,
  },
  styleCopy: {
    flex: 1,
  },
  styleName: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  styleDescription: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#c7bdae',
  },
  radioActive: {
    borderWidth: 6,
    borderColor: colors.deep,
  },
  readerShell: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  readerScroll: {
    flex: 1,
  },
  readerContent: {
    paddingHorizontal: 24,
    paddingBottom: 78,
  },
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
  toastDot: {
    color: '#fff',
    fontSize: 18,
  },
  toastText: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
  },
  chapterTitle: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '800',
    marginBottom: 18,
  },
  paragraph: {
    color: '#28231d',
    fontSize: 17,
    lineHeight: 34,
    marginBottom: 16,
  },
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
  progressBadgeText: {
    color: colors.deep,
    fontSize: 14,
    fontWeight: '900',
  },
  generatingCopy: {
    flex: 1,
  },
  generatingTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  generatingText: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
  },
  miniProgress: {
    width: 158,
    height: 4,
    borderRadius: 9,
    backgroundColor: '#dfd5c6',
    marginTop: 10,
    overflow: 'hidden',
  },
  miniProgressFill: {
    width: '68%',
    height: '100%',
    borderRadius: 9,
    backgroundColor: colors.sage,
  },
  sceneImage: {
    height: 146,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(37,34,30,0.08)',
    marginTop: 2,
    marginBottom: 22,
  },
  streetArt: {
    backgroundColor: '#2c4054',
  },
  officeArt: {
    backgroundColor: '#334b48',
  },
  sceneLayerOne: {
    position: 'absolute',
    left: 28,
    top: 22,
    width: 72,
    height: 96,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  sceneLayerTwo: {
    position: 'absolute',
    right: 44,
    top: 34,
    width: 118,
    height: 78,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  sceneLayerThree: {
    position: 'absolute',
    left: -20,
    right: -20,
    bottom: -28,
    height: 74,
    borderRadius: 80,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  readerHint: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
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
  readingProgressFill: {
    width: '46%',
    height: '100%',
    borderRadius: 9,
    backgroundColor: colors.deep,
  },
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
  controlRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  controlPill: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0eadf',
  },
  controlText: {
    color: colors.deep,
    fontSize: 13,
    fontWeight: '800',
  },
  slider: {
    height: 4,
    borderRadius: 9,
    backgroundColor: '#dfd5c6',
    overflow: 'hidden',
  },
  sliderFill: {
    width: '46%',
    height: '100%',
    borderRadius: 9,
    backgroundColor: colors.deep,
  },
  sheetProgress: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },
});
