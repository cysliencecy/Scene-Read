import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { books } from '../data/mockData';
import { colors } from '../theme/colors';
import { sharedStyles } from '../theme/sharedStyles';

export function ShelfScreen({
  onImport,
  onRead,
}: {
  onImport: () => void;
  onRead: (bookId: string) => void;
}) {
  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <View style={styles.shelfHeader}>
        <Text style={styles.logo}>阅境</Text>
      </View>

      <Pressable accessibilityRole="button" onPress={() => onRead('rain')} style={styles.heroCard}>
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
            onPress={() => onRead(book.id)}
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

const styles = StyleSheet.create({
  shelfHeader: { height: 50, justifyContent: 'center' },
  logo: { color: colors.ink, fontSize: 25, fontWeight: '800' },
  heroCard: {
    minHeight: 184,
    borderRadius: 24,
    padding: 18,
    backgroundColor: colors.deep,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  heroEyebrow: { color: 'rgba(255,255,255,0.74)', fontSize: 12 },
  heroTitle: { marginTop: 8, color: '#fff', fontSize: 26, fontWeight: '800' },
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
  heroActionText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
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
  sectionActionText: { color: colors.deep, fontSize: 12, fontWeight: '800' },
  bookGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
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
  bookTitle: { color: '#fff', fontSize: 13, lineHeight: 18, fontWeight: '800' },
  bookMeta: { marginTop: 5, color: 'rgba(255,255,255,0.78)', fontSize: 10 },
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
  importBookPlus: { color: colors.deep, fontSize: 22, fontWeight: '700' },
  importBookTitle: { color: colors.deep, fontSize: 13, fontWeight: '800' },
  importBookMeta: { marginTop: 5, color: colors.muted, fontSize: 10, textAlign: 'center' },
});
