import { Image, Pressable, StyleSheet, View } from 'react-native';

export function SceneImage({
  imageUrl,
  variant,
  onPreview,
}: {
  imageUrl?: string;
  variant: 'street' | 'office';
  onPreview?: (imageUrl: string) => void;
}) {
  if (imageUrl) {
    return (
      <Pressable accessibilityRole="imagebutton" onPress={() => onPreview?.(imageUrl)} style={styles.sceneImage}>
        <Image source={{ uri: imageUrl }} resizeMode="cover" style={styles.sceneImageContent} />
      </Pressable>
    );
  }

  return (
    <View style={[styles.sceneImage, variant === 'office' ? styles.officeArt : styles.streetArt]}>
      <View style={styles.sceneLayerOne} />
      <View style={styles.sceneLayerTwo} />
      <View style={styles.sceneLayerThree} />
    </View>
  );
}

const styles = StyleSheet.create({
  sceneImage: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(37,34,30,0.08)',
    marginTop: 2,
    marginBottom: 22,
  },
  sceneImageContent: {
    width: '100%',
    height: '100%',
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
});
