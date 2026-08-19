import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

export function SceneImage({
  imageUrl,
  variant,
  onPreview,
}: {
  imageUrl?: string;
  variant: 'street' | 'office';
  onPreview?: (imageUrl: string) => void;
}) {
  const [loading, setLoading] = useState(Boolean(imageUrl));
  const [failed, setFailed] = useState(false);

  if (imageUrl) {
    return (
      <Pressable
        accessibilityRole="imagebutton"
        onPress={(event) => {
          event.stopPropagation();
          onPreview?.(imageUrl);
        }}
        style={styles.sceneImage}
      >
        <Image
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
          onLoadEnd={() => setLoading(false)}
          onLoadStart={() => {
            setFailed(false);
            setLoading(true);
          }}
          source={{ uri: imageUrl }}
          resizeMode="cover"
          style={styles.sceneImageContent}
        />
        {loading ? (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <ActivityIndicator color="#4d7565" size="small" />
            <Text style={styles.loadingText}>图片加载中</Text>
          </View>
        ) : null}
        {failed ? (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>图片加载失败</Text>
          </View>
        ) : null}
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
  loadingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f0eadf',
  },
  loadingText: { color: '#756f64', fontSize: 12, fontWeight: '700' },
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
