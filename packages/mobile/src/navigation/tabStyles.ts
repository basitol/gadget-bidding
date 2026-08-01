import { StyleSheet } from 'react-native';
import { fonts, spacing, borderRadius } from '../constants';

export const tabBarStyles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1,
    height: 76,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    elevation: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  tabLabel: {
    fontSize: fonts.sizes.xs,
    fontFamily: fonts.semiBold,
    marginTop: 2,
  },
  tabIconWrap: {
    alignItems: 'center',
  },
  tabIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 8,
  },
});
