import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  TextInput,
  LayoutAnimation,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  GadgetImage,
  PrimaryButton,
  TextButton,
  CheckList,
  FooterBar,
  CONDITION_LABEL,
  useNow,
} from '../../components/glass';
import { AuthShell, AuthButton } from '../../components/auth/GlassAuthKit';
import { fonts } from '../../constants';
import { orderService } from '../../services';
import { meService } from '../../services/me.service';
import { caseService, pickCaseVideo, clipLength, CASE_VIDEO_MAX_SECONDS, CaseVideo } from '../../services/case.service';
import { getAlertPrefs, getPushPermission, registerForPush, saveAlertPrefs } from '../../services/pushNotifications';
import { useToastStore } from '../../store/toastStore';
import { formatCurrency, mediaUrl } from '../../utils';

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** "Nov 24 · 9:12 pm" */
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()}`;
};
/** "11h 59m" */
const hm = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};
const ORDINAL = ['', 'first', 'second', 'third'];

const Hero: React.FC<{ icon: any; tint: string; title: string; sub: string }> = ({ icon, tint, title, sub }) => (
  <View style={styles.hero}>
    <View style={[styles.heroTile, { backgroundColor: tint }]}>
      <Image source={icon} style={styles.heroImg} />
    </View>
    <Text style={styles.heroTitle} accessibilityRole="header">
      {title}
    </Text>
    <Text style={styles.heroSub}>{sub}</Text>
  </View>
);

/** Turn on push + order alerts (payment reminders live under "orders"). */
const turnOnPaymentReminders = async () => {
  const [perm, prefs] = await Promise.all([getPushPermission(), getAlertPrefs().catch(() => null)]);
  if (perm === 'granted' && prefs?.orders !== false) {
    toast('Payment reminders are already on.', 'success');
    return;
  }
  const granted = (await registerForPush({ ask: true })) === 'granted';
  if (!granted) {
    toast('Turn on notifications for Gadgets Bidding in Settings to get reminders.');
    return;
  }
  await saveAlertPrefs({ orders: true }).catch(() => {});
  toast("Done. We'll remind you before your time to pay runs out.", 'success');
};

/* ================= Time to pay ran out ================= */

export const MissedPaymentScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { missedPaymentId } = route.params;
  const [m, setM] = useState<Awaited<ReturnType<typeof meService.missedPayment>> | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    meService
      .missedPayment(missedPaymentId)
      .then(setM)
      .catch(e => toast(errText(e, "Couldn't load this order")));
  }, [missedPaymentId]);

  if (!m) {
    return (
      <GlassScreen>
        <GlassHeader title="Order" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={G.blue} style={styles.loader} />
      </GlassScreen>
    );
  }

  const short = m.gadget_title.split(' · ')[0];
  const paused = m.bidding_paused_until ? new Date(m.bidding_paused_until) : null;
  const strikeText = paused
    ? `That's ${m.strike_limit} missed payments, so bidding is paused until ${paused.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })}.`
    : m.nth >= m.strike_limit - 1
      ? `This is your ${ORDINAL[m.nth] ?? `${m.nth}th`} missed payment. One more and we pause bidding on your account for ${m.pause_days} days.`
      : `This is your ${ORDINAL[m.nth] ?? `${m.nth}th`} missed payment. After ${m.strike_limit}, we pause bidding on your account for ${m.pause_days} days.`;

  const faqs = [
    {
      q: 'Was I charged anything?',
      a:
        m.forfeited_amount > 0
          ? `We kept the ${formatCurrency(m.forfeited_amount)} bid commitment that was held when you bid. Nothing else was taken from your wallet or card.`
          : 'No. Nothing was taken from your wallet or card.',
    },
    {
      q: 'Can I still buy it?',
      a:
        m.outcome === 'cancelled'
          ? 'Not this one. Nobody else bid, so the sale was cancelled. Similar items come up often.'
          : "Not this one. It's been offered to the next highest bidder. Similar items come up often.",
    },
    {
      q: 'How do I avoid this next time?',
      a: `Pay within 24 hours of winning. Turn on payment reminders and we'll nudge you before time runs out. A saved card makes it one tap.`,
    },
  ];

  const toggle = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(o => (o === i ? null : i));
  };

  return (
    <GlassScreen>
      <GlassHeader title="Order" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Hero
          icon={require('../../../assets/icons/bell.png')}
          tint="#FFF6EE"
          title="Your 24 hours to pay ran out"
          sub={
            m.outcome === 'cancelled'
              ? `We didn't get payment for the ${short}, so the sale was cancelled.`
              : `We didn't get payment for the ${short}, so it's been offered to the next highest bidder.`
          }
        />

        <GlassCard style={styles.item}>
          <ItemImage uri={m.gadget_image} />
          <View style={styles.flex}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {m.gadget_title}
            </Text>
            <Text style={styles.itemSub}>You won at {formatCurrency(m.winning_bid)}</Text>
            {m.auction_ended_at ? <Text style={styles.itemSub}>Auction ended {when(m.auction_ended_at)}</Text> : null}
          </View>
        </GlassCard>

        <GlassCard style={styles.strikes}>
          <Text style={styles.cardTitle}>Missed payments</Text>
          <View style={styles.strikeBar} accessibilityLabel={`${Math.min(m.strikes, m.strike_limit)} of ${m.strike_limit} missed payments`}>
            {Array.from({ length: m.strike_limit }).map((_, i) => (
              <View key={i} style={[styles.strikeSeg, i < m.strikes && styles.strikeSegOn]} />
            ))}
          </View>
          <Text style={styles.cardText}>{strikeText}</Text>
        </GlassCard>

        <GlassCard style={styles.faq}>
          {faqs.map((f, i) => (
            <View key={f.q} style={[i < faqs.length - 1 && styles.divider]}>
              <Pressable
                onPress={() => toggle(i)}
                style={styles.faqRow}
                accessibilityRole="button"
                accessibilityState={{ expanded: open === i }}
              >
                <Text style={styles.faqQ}>{f.q}</Text>
                <Ionicons name={open === i ? 'remove' : 'add'} size={18} color={G.muted} />
              </Pressable>
              {open === i ? <Text style={styles.faqA}>{f.a}</Text> : null}
            </View>
          ))}
        </GlassCard>
      </ScrollView>
      <FooterBar>
        <PrimaryButton
          label="Browse similar auctions"
          onPress={() => navigation.navigate('MainTabs', { screen: 'Explore', params: { category: m.category_slug } })}
        />
        <TextButton label="Turn on payment reminders" onPress={turnOnPaymentReminders} />
      </FooterBar>
    </GlassScreen>
  );
};

const ItemImage: React.FC<{ uri?: string | null }> = ({ uri }) => (
  <View style={styles.itemThumb}>
    {uri ? (
      <Image source={{ uri: mediaUrl(uri) }} style={styles.itemImg} resizeMode="contain" />
    ) : (
      <Ionicons name="phone-portrait-outline" size={22} color={G.faint} />
    )}
  </View>
);

/* ================= Second chance ================= */

export const SecondChanceScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { orderId } = route.params;
  const now = useNow(30_000);
  const [order, setOrder] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      orderService
        .getOrder(orderId)
        .then(r => setOrder(r.data))
        .catch(e => toast(errText(e, "Couldn't load this offer")));
    }, [orderId])
  );

  if (!order) {
    return (
      <GlassScreen>
        <GlassHeader title="Second chance" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={G.blue} style={styles.loader} />
      </GlassScreen>
    );
  }

  const ends = order.offer_expires_at ? new Date(order.offer_expires_at).getTime() : 0;
  const live = ends > now && order.payment_status !== 'paid';
  const bid = Number(order.item_amount ?? Number(order.total_amount) - Number(order.delivery_fee ?? 0));
  const meta = [order.seller?.full_name ? `Verified seller ${order.seller.full_name}` : null, CONDITION_LABEL[order.gadget?.condition]]
    .filter(Boolean)
    .join(' · ');

  const accept = async () => {
    setBusy(true);
    try {
      await orderService.acceptOffer(orderId);
      navigation.replace('Checkout', { orderId });
    } catch (e) {
      toast(errText(e, "We couldn't accept the offer. It may have ended."));
    } finally {
      setBusy(false);
    }
  };

  const decline = () =>
    Alert.alert('Pass on this offer?', "It's free and won't count against you. The next bidder gets the chance.", [
      { text: 'Keep the offer', style: 'cancel' },
      {
        text: 'No thanks',
        style: 'destructive',
        onPress: async () => {
          try {
            await orderService.declineOffer(orderId);
            toast("No problem. We've passed it on.", 'success');
            navigation.goBack();
          } catch (e) {
            toast(errText(e, "We couldn't do that. Try again."));
          }
        },
      },
    ]);

  return (
    <GlassScreen>
      <GlassHeader title="Second chance" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Hero
          icon={require('../../../assets/icons/tag.png')}
          tint="#F5F2FF"
          title={live ? 'It can still be yours' : 'This offer has ended'}
          sub={
            live
              ? "The winner didn't pay in time. As the next highest bidder, you can buy it at your own last bid."
              : 'The time to decide has passed, so it went to the next bidder.'
          }
        />
        <GlassCard style={styles.offer}>
          <View style={styles.offerTop}>
            <GadgetImage uri={order.gadget?.images?.[0]} size={44} style={styles.offerThumb} />
            <View style={styles.flex}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {order.gadget?.title ?? 'Your gadget'}
              </Text>
              {meta ? <Text style={styles.itemSub}>{meta}</Text> : null}
              <Text style={styles.offerPrice}>{formatCurrency(bid)}</Text>
            </View>
          </View>
          {live ? (
            <View style={styles.offerEnds}>
              <Text style={styles.offerEndsLabel}>Offer ends in</Text>
              <Text style={styles.offerEndsValue}>{hm(ends - now)}</Text>
            </View>
          ) : null}
        </GlassCard>
        {live ? (
          <CheckList
            style={styles.checks}
            items={[
              'Same hub inspection and escrow protection as any win',
              "You'll have 24 hours to pay once you accept",
              "Saying no is free and won't count against you",
            ]}
          />
        ) : null}
      </ScrollView>
      {live ? (
        <FooterBar>
          <PrimaryButton label={busy ? 'Accepting…' : `Accept and pay ${formatCurrency(bid)}`} onPress={accept} disabled={busy} />
          <TextButton label="No thanks" onPress={decline} />
        </FooterBar>
      ) : null}
    </GlassScreen>
  );
};

/* ================= Report a problem ================= */

const PROBLEMS: { key: string; title: string; sub?: string }[] = [
  { key: 'item_not_as_described', title: 'Not as described', sub: 'Grade, storage, colour or battery is different' },
  { key: 'not_working', title: "It doesn't work properly", sub: "Won't turn on, faulty screen, buttons or speakers" },
  { key: 'missing_parts', title: 'Missing parts', sub: 'Charger, box or accessories that were listed' },
  { key: 'wrong_item', title: 'Wrong item', sub: 'A different model than the one I won' },
  { key: 'item_damaged', title: 'Damaged in delivery', sub: 'Cracks, dents or a crushed box' },
  { key: 'other', title: 'Something else' },
];
const MAX_PHOTOS = 4;

export const ReportProblemScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { orderId } = route.params;
  const [order, setOrder] = useState<any>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [video, setVideo] = useState<(CaseVideo & { seconds: number }) | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    orderService
      .getOrder(orderId)
      .then(r => setOrder(r.data))
      .catch(() => {});
  }, [orderId]);

  const back = () => (step > 0 ? setStep((step - 1) as 0 | 1) : navigation.goBack());
  const enough = details.trim().length >= 20;
  const chosen = PROBLEMS.find(p => p.key === problem);
  const subline = order ? `${(order.gadget?.title ?? 'Your order').split(' · ')[0]} · Order ${order.order_number}` : '';

  const addPhotos = async () => {
    const left = MAX_PHOTOS - photos.length;
    if (left <= 0) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: left,
      quality: 0.8,
    });
    if (!res.canceled) setPhotos(p => [...p, ...res.assets.map(a => a.uri)].slice(0, MAX_PHOTOS));
  };

  const addVideo = async () => {
    try {
      const picked = await pickCaseVideo();
      if (picked) setVideo(picked);
    } catch (e) {
      toast(errText(e, "We couldn't open that video. Try another one."));
    }
  };

  const send = async () => {
    if (!problem || !enough) return;
    setBusy(true);
    try {
      const urls = await meService.uploadPhotos(photos);
      const res = await orderService.createDispute(orderId, problem as any, details.trim(), urls);
      const disputeId = (res as any)?.data?.id;
      let videoSent = !video;
      if (video && disputeId) {
        // The report is in; the video goes onto the case next.
        videoSent = await caseService.addVideo(disputeId, video).then(
          () => true,
          () => false
        );
      }
      if (videoSent) toast("Sent. We've put the seller's payment on hold and will reply within a day.", 'success');
      else toast("Your report is in, but the video didn't upload. Add it again from your case.");
      if (disputeId) navigation.replace('Case', { disputeId });
      else navigation.goBack();
    } catch (e) {
      toast(errText(e, "We couldn't send your report. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const footer =
    step === 0 ? (
      <AuthButton label="Continue" onPress={() => setStep(1)} disabled={!problem} />
    ) : step === 1 ? (
      <AuthButton label="Continue" onPress={() => setStep(2)} disabled={!enough} />
    ) : (
      <AuthButton label="Send report" onPress={send} busy={busy} />
    );

  return (
    <AuthShell title="Report a problem" onBack={back} progress={{ step: step + 1, of: 3 }} footer={footer}>
      {step === 0 ? (
        <>
          <Text style={styles.stepTitle} accessibilityRole="header">
            What's wrong with it?
          </Text>
          {subline ? <Text style={styles.stepSub}>{subline}</Text> : null}
          <View style={styles.problems} accessibilityRole="radiogroup">
            {PROBLEMS.map(p => {
              const on = p.key === problem;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => setProblem(p.key)}
                  style={[styles.problem, on && styles.problemOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                  <View style={styles.flex}>
                    <Text style={styles.problemTitle}>{p.title}</Text>
                    {p.sub ? <Text style={styles.problemSub}>{p.sub}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : step === 1 ? (
        <>
          <Text style={styles.stepTitle} accessibilityRole="header">
            Tell us what you found
          </Text>
          <Text style={styles.stepSub}>{chosen?.title}. A few sentences and a photo or short video help us sort it faster.</Text>
          <Text style={styles.fieldLabel}>What happened?</Text>
          <TextInput
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={1000}
            placeholder="e.g. The battery health shows 71%, but the listing said 92%."
            placeholderTextColor={G.faint}
            style={styles.textArea}
            accessibilityLabel="What happened"
          />
          <Text style={styles.hint}>{enough ? ' ' : '20 characters or more'}</Text>
          <Text style={styles.fieldLabel}>Photos (optional)</Text>
          <View style={styles.photos}>
            {photos.map(uri => (
              <View key={uri} style={styles.photo}>
                <Image source={{ uri }} style={styles.photoImg} />
                <Pressable
                  onPress={() => setPhotos(p => p.filter(x => x !== uri))}
                  style={styles.photoRemove}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Ionicons name="close" size={14} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <Pressable onPress={addPhotos} style={styles.addPhoto} accessibilityRole="button" accessibilityLabel="Add photos">
                <Ionicons name="camera-outline" size={22} color={G.blue600} />
                <Text style={styles.addPhotoText}>Add</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Video (optional)</Text>
          <View style={styles.photos}>
            {video ? (
              <View style={[styles.photo, styles.videoTile]}>
                <View
                  style={styles.videoInfo}
                  accessible
                  accessibilityLabel={video.seconds ? `Video, ${clipLength(video.seconds)} long` : 'Video added'}
                >
                  <Ionicons name="videocam" size={22} color={G.slate} />
                  <Text style={styles.videoLength}>{video.seconds ? clipLength(video.seconds) : 'Video'}</Text>
                </View>
                <Pressable
                  onPress={() => setVideo(null)}
                  style={styles.photoRemove}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove video"
                >
                  <Ionicons name="close" size={14} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={addVideo} style={styles.addPhoto} accessibilityRole="button" accessibilityLabel="Add a video">
                <Ionicons name="videocam-outline" size={22} color={G.blue600} />
                <Text style={styles.addPhotoText}>Add</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.hint}>One video, up to {CASE_VIDEO_MAX_SECONDS} seconds. Show the fault happening.</Text>
        </>
      ) : (
        <>
          <Text style={styles.stepTitle} accessibilityRole="header">
            Check and send
          </Text>
          <Text style={styles.stepSub}>{subline}</Text>
          <GlassCard style={styles.review}>
            <ReviewRow k="Problem" v={chosen?.title ?? ''} />
            <ReviewRow k="What you told us" v={details.trim()} />
            <ReviewRow k="Photos" v={photos.length ? `${photos.length} added` : 'None'} />
            <ReviewRow k="Video" v={video ? (video.seconds ? `1 added · ${clipLength(video.seconds)}` : '1 added') : 'None'} last />
          </GlassCard>
          <Text style={styles.fieldLabel}>What happens next</Text>
          <CheckList
            items={[
              "We hold the seller's payment while we look into it",
              'We reply within a day, in the app and by email',
              'We may ask you to bring it to our Computer Village hub',
            ]}
          />
        </>
      )}
    </AuthShell>
  );
};

const ReviewRow: React.FC<{ k: string; v: string; last?: boolean }> = ({ k, v, last }) => (
  <View style={[styles.reviewRow, !last && styles.divider]}>
    <Text style={styles.reviewKey}>{k}</Text>
    <Text style={styles.reviewVal}>{v}</Text>
  </View>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loader: { marginTop: 60 },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  divider: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,31,42,0.05)' },

  hero: { alignItems: 'center', marginTop: 8, marginBottom: 20 },
  heroTile: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  heroImg: { width: 60, height: 60, resizeMode: 'contain' },
  heroTitle: { color: G.ink, fontSize: 24, fontFamily: fonts.medium, marginTop: 16, textAlign: 'center' },
  heroSub: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 6, textAlign: 'center', paddingHorizontal: 8 },

  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  itemThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: G.tile, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  itemImg: { width: 48, height: 48 },
  itemTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  itemSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },

  strikes: { padding: 16, marginTop: 12 },
  cardTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  strikeBar: { flexDirection: 'row', gap: 6, marginTop: 12 },
  strikeSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(28,31,42,0.07)' },
  strikeSegOn: { backgroundColor: '#F0A04B' },
  cardText: { color: G.slate, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, marginTop: 12 },

  faq: { marginTop: 12, overflow: 'hidden' },
  faqRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 56 },
  faqQ: { color: G.ink, fontSize: 15, fontFamily: fonts.medium, flex: 1 },
  faqA: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, paddingHorizontal: 16, paddingBottom: 16, marginTop: -4 },

  offer: { overflow: 'hidden' },
  offerTop: { flexDirection: 'row', gap: 12, padding: 14, alignItems: 'center' },
  offerThumb: { width: 56, height: 56, borderRadius: 12 },
  offerPrice: { color: G.ink, fontSize: 22, fontFamily: fonts.medium, marginTop: 6, fontVariant: ['tabular-nums'] },
  offerEnds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,31,42,0.05)',
  },
  offerEndsLabel: { color: G.muted, fontSize: 14, fontFamily: fonts.regular },
  offerEndsValue: { color: '#DB7A2E', fontSize: 15, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  checks: { marginTop: 20 },

  stepTitle: { color: G.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, fontFamily: fonts.medium },
  stepSub: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 6, marginBottom: 16 },
  problems: { gap: 10 },
  problem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(255,255,255,0.56)',
  },
  problemOn: { borderColor: '#AFC0F6', backgroundColor: 'rgba(238,242,255,0.85)' },
  problemTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  problemSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#CED3DF', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: G.blue, backgroundColor: G.blue },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },

  fieldLabel: { color: G.slate, fontSize: 14, fontFamily: fonts.medium, marginTop: 8, marginBottom: 8 },
  fieldLabelSpaced: { marginTop: 16 },
  textArea: {
    minHeight: 120,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 14,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: G.ink,
    textAlignVertical: 'top',
  },
  hint: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 6, marginBottom: 8 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden' },
  photoImg: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(28,31,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(62,106,240,0.4)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPhotoText: { color: G.blue600, fontSize: 12, fontFamily: fonts.medium },
  videoTile: { backgroundColor: '#F5F6F9', alignItems: 'center', justifyContent: 'center' },
  videoInfo: { alignItems: 'center', gap: 2 },
  videoLength: { color: G.ink, fontSize: 12, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },

  review: { overflow: 'hidden', marginBottom: 12 },
  reviewRow: { paddingHorizontal: 16, paddingVertical: 12 },
  reviewKey: { color: G.muted, fontSize: 12, fontFamily: fonts.regular },
  reviewVal: { color: G.ink, fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, marginTop: 3 },
});
