import { StyleSheet, Text } from 'react-native';

export function ReaderParagraph({
  children,
  fontSize,
  lineHeight,
  color,
}: {
  children: string;
  fontSize: number;
  lineHeight: number;
  color: string;
}) {
  return <Text style={[styles.paragraph, { color, fontSize, lineHeight }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  paragraph: {
    marginBottom: 16,
  },
});
