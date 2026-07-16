import { StyleSheet } from 'react-native';
import { colors } from './colors';

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  screenContent: {
    paddingHorizontal: 22,
    paddingBottom: 34,
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
});
