import { useNavigation } from '@react-navigation/native';

/**
 * True when this screen is mounted as a bottom-tab root.
 * Tab roots should not show a back button — use the tab bar to leave.
 *
 * Note: `getParent()` from a tab screen is the stack *above* the tabs,
 * so we must check this screen's own navigator state, not the parent.
 */
export function useIsTabRoot(): boolean {
  const navigation = useNavigation();
  return navigation.getState()?.type === 'tab';
}
