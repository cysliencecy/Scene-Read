import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { ImportScreen } from './src/screens/ImportScreen';
import { ReaderScreen } from './src/screens/ReaderScreen';
import { ShelfScreen } from './src/screens/ShelfScreen';
import { StyleScreen } from './src/screens/StyleScreen';
import { colors } from './src/theme/colors';
import type { Screen, VisualStyle } from './src/types/app';

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

  const goBack = () => {
    if (screen === 'reader') setScreen('shelf');
    if (screen === 'style') setScreen('import');
    if (screen === 'import') setScreen('shelf');
  };

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
            <Pressable accessibilityRole="button" onPress={goBack} style={styles.roundButton}>
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
});
