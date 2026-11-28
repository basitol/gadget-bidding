import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { GlassScreen, GlassHeader, GlassCard, FooterBar, PrimaryButton } from '../../../components/glass';
import { Hero, Ticks, Timeline, TimelineStep } from '../onboarding/kit';
import { useSellerCase, CaseLoading, CASE_ICONS, dayLabel, sinceLabel, goHome, cs } from './shared';

/** Reply sent: our team is reviewing both sides, where the case is, and what happens meanwhile. */
export const CaseReplySentScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const disputeId: string = route.params?.disputeId;
  const { c, load, error } = useSellerCase(disputeId);
  if (!c) return <CaseLoading title="Reply sent" error={error} onRetry={load} />;

  const side = c.seller;
  const files = side?.files.length ?? 0;
  const steps: TimelineStep[] = [
    { title: 'Buyer reported a problem', sub: dayLabel(c.created_at), state: 'done' },
    {
      title: 'You replied',
      sub: `${side?.replied_at ? sinceLabel(side.replied_at) : 'Just now'}${files ? ` · ${files} file${files === 1 ? '' : 's'}` : ''}`,
      state: 'done',
    },
    c.in_review
      ? { title: 'Team review', sub: c.next_step || 'Usually within 2 working days', state: 'current' }
      : { title: 'Team review', sub: 'Done', state: 'done' },
    c.in_review
      ? { title: 'Decision', sub: "We'll notify you", state: 'todo' }
      : { title: 'Decision', sub: dayLabel(c.decided_at), state: 'done' },
  ];

  return (
    <GlassScreen>
      <GlassHeader title="Reply sent" />
      <ScrollView contentContainerStyle={[cs.content, styles.top]}>
        <Hero
          icon={CASE_ICONS.shield}
          title="Reply sent"
          sub="Our team is reviewing both sides. Most cases are decided within 2 working days."
        />
        <Timeline steps={steps} />
        <GlassCard style={[cs.card, cs.gap]}>
          <Text style={cs.cardTitle}>While you wait</Text>
          <Ticks
            items={[
              'Keep your phone on — we may call to ask a question',
              'Your payout stays on hold until the decision',
              'Your other listings keep running as normal',
            ]}
          />
        </GlassCard>
        {!c.in_review ? (
          <Pressable
            onPress={() => navigation.replace('SellerCase', { disputeId: c.id })}
            style={cs.linkWrap}
            accessibilityRole="link"
            hitSlop={6}
          >
            <Text style={cs.link}>Our team has decided. See the decision</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <FooterBar>
        <PrimaryButton label="Back to seller home" onPress={() => goHome(navigation)} />
      </FooterBar>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  top: { paddingTop: 12 },
});
