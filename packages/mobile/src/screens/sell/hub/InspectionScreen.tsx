import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SELLER_POLICY } from '@gadget-bidding/shared';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  PrimaryButton,
  SecondaryButton,
  FooterBar,
} from '../../../components/glass';
import { fonts } from '../../../constants';
import { LoadingScreen } from '../store/shared';
import { Hero, Label, Note, TINT } from '../onboarding/kit';
import { RadioCard } from '../case/shared';
import { FailedChoice, HubView, sellerHubService } from '../../../services/sellerHub.service';
import { HUB_ICONS, KeyRow, dayLabel, errText, hs, naira, shortTitle, toast, useHubView } from './shared';

/**
 * The hub's check (route 'HubInspection', { orderId }). Passed: each check and the money. Didn't
 * pass: what the hub found, then collect it (free for 7 days), a rider to the shop, or once a
 * second check. Collect or deliver refunds the buyer.
 */

const goHome = (navigation: any) => navigation.navigate('MainTabs', { screen: 'Home' });

export const InspectionScreen: React.FC<{ navigation: any; route: { params?: { orderId?: string } } }> = ({
  navigation,
  route,
}) => {
  const orderId = route.params?.orderId ?? '';
  const { view, setView, error, load } = useHubView(orderId);
  if (!view)
    return <LoadingScreen title="Inspection" onBack={() => navigation.goBack()} failed={error} onRetry={load} />;
  if (!view.inspection) {
    return (
      <GlassScreen>
        <GlassHeader title="Inspection" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={hs.content}>
          <Hero
            icon={HUB_ICONS.box}
            tint={TINT.blue.bg}
            title={view.checked_in_at ? 'The hub is checking it' : 'Not checked yet'}
            sub={
              view.checked_in_at
                ? "Usually the same day. We'll tell you as soon as it's done."
                : 'The hub checks it once it has been checked in.'
            }
          />
        </ScrollView>
      </GlassScreen>
    );
  }
  if (view.inspection.result === 'passed') return <Passed v={view} navigation={navigation} />;
  return <Failed v={view} setView={setView} navigation={navigation} orderId={orderId} />;
};

const Passed: React.FC<{ v: HubView; navigation: any }> = ({ v, navigation }) => {
  const pickup = v.delivery_method === 'pickup';
  const next =
    v.stage === 'moved_on'
      ? pickup
        ? 'It’s ready for the buyer to collect.'
        : 'It’s on its way to the buyer.'
      : pickup
        ? 'It’s ready for the buyer to collect next.'
        : 'It goes out to the buyer next.';
  return (
    <GlassScreen>
      <GlassHeader title="Inspection" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={hs.content} showsVerticalScrollIndicator={false}>
        <Hero
          icon={HUB_ICONS.shield}
          tint={TINT.green.bg}
          title="Passed inspection"
          sub={`Your ${shortTitle(v.item.title)} matched the listing. ${next}`}
        />
        <GlassCard style={hs.rows}>
          {v.inspection!.checks.map((c, i, all) => (
            <KeyRow key={c.label} k={c.label} v="Passed" vColor={G.green} last={i === all.length - 1} />
          ))}
        </GlassCard>
        <GlassCard style={[hs.rows, hs.gap]}>
          <KeyRow k="You'll receive" v={naira(v.money.you_receive)} />
          <KeyRow
            k="When"
            v={`After the buyer confirms, or ${SELLER_POLICY.confirmWindowHours}h after delivery`}
            last
          />
        </GlassCard>
      </ScrollView>
      <FooterBar>
        <PrimaryButton label="Back to seller home" onPress={() => goHome(navigation)} />
      </FooterBar>
    </GlassScreen>
  );
};

const Failed: React.FC<{ v: HubView; setView: (v: HubView) => void; navigation: any; orderId: string }> = ({
  v,
  setView,
  navigation,
  orderId,
}) => {
  const f = v.failed!;
  const settled = f.choice === 'collect' || f.choice === 'deliver';
  const [choice, setChoice] = useState<FailedChoice>(settled ? (f.choice as FailedChoice) : 'collect');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (f.choice === 'collect' || f.choice === 'deliver') setChoice(f.choice);
  }, [f.choice]);

  const title = shortTitle(v.item.title);
  const findings = v.inspection!.findings.length ? v.inspection!.findings : v.inspection!.failed_checks;
  const pending = f.second_check_pending;
  const returned = !!f.returned_at;
  const changed = settled && choice !== f.choice;

  const confirm = async () => {
    setBusy(true);
    try {
      const next = await sellerHubService.chooseAfterFail(orderId, choice);
      setView(next);
      if (choice === 'collect') {
        navigation.navigate('HubCollect', { orderId });
      } else if (choice === 'deliver') {
        toast(
          `Our rider will bring it to your shop. ${naira(v.fees.return_delivery)} comes off your next payout.`,
          'success'
        );
      } else {
        toast('A senior inspector will check it again.', 'success');
      }
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  };

  let footer: React.ReactNode;
  if (returned || pending) {
    footer = <PrimaryButton label="Back to seller home" onPress={() => goHome(navigation)} />;
  } else if (settled && !changed) {
    footer =
      f.choice === 'collect' ? (
        <PrimaryButton label="Show collection code" onPress={() => navigation.navigate('HubCollect', { orderId })} />
      ) : (
        <SecondaryButton label="Back to seller home" onPress={() => goHome(navigation)} />
      );
  } else {
    footer = (
      <PrimaryButton label={busy ? 'Saving…' : settled ? 'Save' : 'Confirm'} onPress={confirm} disabled={busy} />
    );
  }

  return (
    <GlassScreen>
      <GlassHeader title="Inspection" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={hs.content} showsVerticalScrollIndicator={false}>
        <Hero
          icon={HUB_ICONS.box}
          tint={TINT.red.bg}
          title={f.second_check_at && !pending ? 'Didn’t pass the second check' : 'Didn’t pass inspection'}
          sub={`Your ${title} doesn't match the listing, so we can't send it to the buyer.`}
        />

        <GlassCard style={hs.card}>
          <Text style={hs.question}>What our hub found</Text>
          <View style={styles.bullets}>
            {findings.map(line => (
              <View key={line} style={styles.bulletRow}>
                <View style={styles.bullet} />
                <Text style={styles.bulletText}>{line}</Text>
              </View>
            ))}
          </View>
          {v.inspection!.photos.length ? (
            <View style={styles.photos}>
              {v.inspection!.photos.slice(0, 3).map((url, i) => (
                <Pressable
                  key={url}
                  onPress={() => Linking.openURL(url)}
                  style={({ pressed }) => [styles.photo, pressed && hs.pressed]}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`Hub photo ${i + 1}`}
                >
                  <Image source={{ uri: url }} style={styles.photoImage} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {v.inspection!.findings.length && v.inspection!.failed_checks.length ? (
            <Text style={[hs.caption, styles.failedChecks]}>
              What failed: {v.inspection!.failed_checks.join(' · ')}
            </Text>
          ) : null}
        </GlassCard>

        {returned ? (
          <Note style={hs.gap}>{`It's back with you since ${dayLabel(f.returned_at!)}. The buyer was refunded.`}</Note>
        ) : pending ? (
          <Note style={hs.gap}>
            A senior inspector is checking it again, usually the same day. If it passes, it goes to the buyer as normal.
            We'll tell you the result.
          </Note>
        ) : (
          <>
            <Label style={hs.section}>What do you want to do?</Label>
            <View style={styles.options} accessibilityRole="radiogroup">
              <RadioCard
                on={choice === 'collect'}
                title="Collect it from the hub"
                sub={`Free within ${v.fees.free_collection_days} days`}
                onPress={() => setChoice('collect')}
              />
              <RadioCard
                on={choice === 'deliver'}
                title="Send it back to my shop"
                sub="Rider delivers it"
                right={naira(v.fees.return_delivery)}
                onPress={() => setChoice('deliver')}
              />
              {f.can_second_check && !settled ? (
                <RadioCard
                  on={choice === 'second_check'}
                  title="I think this is wrong"
                  sub="Ask for a second check by a senior inspector"
                  onPress={() => setChoice('second_check')}
                />
              ) : null}
            </View>
            <Text style={[hs.caption, hs.gap]}>
              {settled
                ? 'The buyer has been refunded. You can switch until it’s handed back to you.'
                : `The buyer is refunded either way. Failed checks count against your store: ${SELLER_POLICY.failedSaleLimit} in ${SELLER_POLICY.failedSaleWindowDays} days pause new listings.`}
            </Text>
          </>
        )}
      </ScrollView>
      <FooterBar>{footer}</FooterBar>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  bullets: { marginTop: 10, gap: 8 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: G.red, marginTop: 7 },
  bulletText: { flex: 1, color: G.ink, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  photos: { flexDirection: 'row', gap: 8, marginTop: 14 },
  photo: { flex: 1, aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: TINT.fill },
  photoImage: { width: '100%', height: '100%' },
  failedChecks: { marginTop: 12 },
  options: { gap: 10 },
});
