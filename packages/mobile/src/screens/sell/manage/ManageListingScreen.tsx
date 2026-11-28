import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  GadgetImage,
  CheckList,
  FooterBar,
  PrimaryButton,
  useNow,
  isUrgent,
} from '../../../components/glass';
import { fonts } from '../../../constants';
import { timeLeftLong } from '../../../services/sellerTabs.service';
import { shortNaira } from '../../../services/listingManage.service';
import { Note, Label, TINT } from '../onboarding/kit';
import { CaseLoading } from '../case/shared';
import { ActionRow, Stat, StatusPill, addListingPhoto, k, naira, plural, shortDay, toast, useManageView } from './kit';

/**
 * Manage listing ('ManageListing', { auctionId }). No bids: edit or end it. Bids in: the price and
 * details are locked, so a note for bidders, a photo, or ending early.
 */
export const ManageListingScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const auctionId: string = route.params?.auctionId;
  const { view: v, setView, error, reload } = useManageView(auctionId);
  const now = useNow(1000);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);

  if (!v)
    return <CaseLoading title="Manage listing" onBack={() => navigation.goBack()} error={error} onRetry={reload} />;

  const running = v.status === 'active' || v.status === 'scheduled';
  const ended = v.status === 'ended' || v.status === 'cancelled';
  const facts = [
    v.grade,
    v.battery != null ? `battery ${v.battery}%` : null,
    v.listed_at ? `listed ${shortDay(v.listed_at)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const endsIn = v.end_time ? timeLeftLong(v.end_time, now) : '—';
  const urgent = v.status === 'active' && !!v.end_time && isUrgent(v.end_time, now);

  const addPhoto = async () => {
    setAdding(true);
    const next = await addListingPhoto(auctionId);
    setAdding(false);
    if (next) {
      setView(next);
      toast('Photo sent. Our team checks it before it shows.', 'success');
    }
  };

  // "Getting no bids?": only things we know (watchers, real sales, our own auctions).
  const tips: string[] = [];
  if (v.can_edit && v.status === 'active') {
    if (v.watching > 0)
      tips.push(
        `${plural(v.watching, 'person is', 'people are')} watching — a lower starting price often gets the first bid`
      );
    if (v.similar_sold)
      tips.push(
        `Similar ${v.similar_sold.model} sold for ${shortNaira(v.similar_sold.low)}–${shortNaira(v.similar_sold.high)} in the last 30 days`
      );
    if (v.photo_tip)
      tips.push(
        `Listings with ${v.photo_tip.threshold}+ photos got ${v.photo_tip.ratio}× more bids here. Yours has ${v.photos.length}.`
      );
  }
  const pendingCount = v.pending_photos.length + (v.bidder_note_pending ? 1 : 0);

  return (
    <GlassScreen>
      <GlassHeader title="Manage listing" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={k.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={G.blue}
            onRefresh={async () => {
              setRefreshing(true);
              await reload();
              setRefreshing(false);
            }}
          />
        }
      >
        <GlassCard style={styles.hero}>
          <GadgetImage uri={v.image} size={132} style={styles.heroImage} />
          <StatusPill status={v.status} sold={v.sold} />
        </GlassCard>

        <Text style={styles.title}>{v.title}</Text>
        {facts ? <Text style={styles.facts}>{facts}</Text> : null}

        <View style={k.stats}>
          {v.bids > 0 && v.highest_bid ? (
            <Stat label="Highest bid" value={naira(v.highest_bid.amount)} />
          ) : (
            <Stat label="Starting price" value={naira(v.starting_price)} />
          )}
          <Stat label="Bids" value={String(v.bids)} />
          <Stat label="Watching" value={String(v.watching)} />
          <Stat
            label={v.status === 'scheduled' ? 'Starts in' : ended ? 'Ended' : 'Ends in'}
            value={
              v.status === 'scheduled' && v.start_time
                ? timeLeftLong(v.start_time, now)
                : ended
                  ? shortDay(v.end_time)
                  : endsIn
            }
            urgent={urgent}
          />
        </View>

        {v.status === 'paused' ? (
          <Note tone="amber" style={styles.gap}>
            Our team paused this listing. Check your email for why, or reply to it to ask about it.
          </Note>
        ) : v.sold ? (
          <Note style={styles.gap}>This sold. Follow it in Orders.</Note>
        ) : ended ? (
          <Note style={styles.gap}>
            {v.end_reason ? 'You ended this listing.' : 'This ended without a sale.'} You can put it up again.
          </Note>
        ) : v.can_edit ? (
          <View style={styles.greenNote}>
            <Text style={styles.greenText}>No bids yet, so you can still change anything or end it for free.</Text>
          </View>
        ) : (
          <Note tone="amber" style={styles.gap}>
            People have bid on this, so the price, grade and details are locked. That keeps it fair for bidders.
          </Note>
        )}

        {pendingCount > 0 && running ? (
          <Note style={styles.gapSmall}>
            {[
              v.pending_photos.length ? plural(v.pending_photos.length, 'new photo') : null,
              v.bidder_note_pending ? 'your note for bidders' : null,
            ]
              .filter(Boolean)
              .join(' and ')}{' '}
            {pendingCount > 1 ? 'are' : 'is'} waiting for our team to check.
          </Note>
        ) : null}

        {running && v.can_edit ? (
          <GlassCard style={[k.card, styles.gap]}>
            <ActionRow
              icon="pencil"
              title="Edit listing"
              sub="Price, photos, description, how long it runs"
              onPress={() => navigation.navigate('EditListing', { auctionId })}
            />
            <ActionRow
              icon="stop-circle-outline"
              tone="red"
              title="End listing"
              sub="Take it down. It moves to Didn't sell so you can relist."
              onPress={() => navigation.navigate('EndListing', { auctionId })}
              last
            />
          </GlassCard>
        ) : null}

        {running && v.locked ? (
          <>
            <Label style={styles.sectionLabel}>What you can still do</Label>
            <GlassCard style={k.card}>
              <ActionRow
                icon="document-text-outline"
                title="Add a note for bidders"
                sub={v.bidder_note_pending ? 'Waiting for our team to check' : 'Extra info, like a receipt or warranty'}
                onPress={() => navigation.navigate('BidderNote', { auctionId })}
              />
              <ActionRow
                icon="image-outline"
                title="Add a photo"
                sub="Checked before it shows"
                onPress={adding ? undefined : addPhoto}
                right={adding ? <ActivityIndicator color={G.blue} /> : undefined}
              />
              <ActionRow icon="create-outline" title="Edit price or details" sub="Locked once someone bids" disabled />
              <ActionRow
                icon="stop-circle-outline"
                tone="red"
                title="End early"
                sub="Sell now to the highest bidder, or cancel"
                onPress={() => navigation.navigate('EndEarly', { auctionId })}
                last
              />
            </GlassCard>
          </>
        ) : null}

        {v.bidder_note && running ? (
          <GlassCard style={[styles.noteCard, styles.gap]}>
            <Text style={styles.noteHead}>Bidders see your note</Text>
            <Text style={styles.noteBody}>{v.bidder_note}</Text>
          </GlassCard>
        ) : null}

        {tips.length ? (
          <GlassCard style={[styles.tips, styles.gap]}>
            <Text style={styles.tipsTitle}>Getting no bids?</Text>
            <CheckList items={tips} />
          </GlassCard>
        ) : null}
      </ScrollView>

      {ended && !v.sold ? (
        <FooterBar>
          <PrimaryButton label="Relist" onPress={() => navigation.navigate('Relist', { auctionId })} />
        </FooterBar>
      ) : null}
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  hero: { height: 168, alignItems: 'center', justifyContent: 'center' },
  heroImage: { width: 140, height: 140, backgroundColor: 'transparent' },
  title: { color: G.ink, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, fontFamily: fonts.medium, marginTop: 18 },
  facts: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 4 },
  gap: { marginTop: 16 },
  gapSmall: { marginTop: 10 },
  greenNote: { marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: TINT.green.bg },
  greenText: { color: TINT.green.text, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  sectionLabel: { marginTop: 22, marginBottom: 10 },
  noteCard: { padding: 16, gap: 6 },
  noteHead: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  noteBody: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  tips: { padding: 16, gap: 12 },
  tipsTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
});
