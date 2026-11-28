import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassScreen, GlassHeader, GlassCard, PrimaryButton } from '../../../components/glass';
import { Field, TextField } from '../../../components/auth/GlassAuthKit';
import { BottomSheet } from '../../../components/motion';
import { fonts } from '../../../constants';
import {
  sellerStoreService,
  StoreReviews,
  StoreReview,
  ReviewFilter,
  ReviewMetric,
  shortDay,
} from '../../../services/sellerStore.service';
import { LoadingScreen, Stars, toast, errText, s as shared } from './shared';

const STAR = '#F5A524';

const FILTERS: { key: ReviewFilter; label: string; star?: boolean }[] = [
  { key: 'all', label: 'All' },
  { key: '5', label: '5', star: true },
  { key: '4', label: '4', star: true },
  { key: '3_or_less', label: '3', star: true },
  { key: 'not_replied', label: 'Not replied' },
];

const EMPTY: Record<ReviewFilter, { title: string; text: string }> = {
  all: { title: 'No reviews yet', text: 'Buyers can rate your store once their order arrives.' },
  '5': { title: 'No 5-star reviews yet', text: 'They show here when buyers leave them.' },
  '4': { title: 'No 4-star reviews', text: 'They show here when buyers leave them.' },
  '3_or_less': { title: 'No reviews of 3 stars or less', text: 'Nice work. Keep it that way.' },
  not_replied: { title: "You've replied to every review", text: 'New reviews show here until you reply.' },
};

const reviewsLabel = (n: number) => (n === 1 ? '1 review' : `${n.toLocaleString('en-NG')} reviews`);

/**
 * Ratings buyers left, the three figures behind them, and public replies. Buyers show as
 * "Buyer •••7": sellers never see buyer names.
 */
export const StoreReviewsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [data, setData] = useState<StoreReviews | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [switching, setSwitching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [replying, setReplying] = useState<StoreReview | null>(null);
  const latest = useRef<ReviewFilter>('all');
  const loaded = useRef(false);

  const load = useCallback(async (f: ReviewFilter) => {
    latest.current = f;
    setFailed(null);
    try {
      const next = await sellerStoreService.reviews(f);
      // A slower answer for an older chip doesn't win.
      if (latest.current !== f) return;
      loaded.current = true;
      setData(next);
    } catch (e) {
      if (latest.current !== f) return;
      if (loaded.current) toast(errText(e, "Couldn't load those reviews"));
      else setFailed(errText(e, "Couldn't load your reviews"));
    }
  }, []);

  useEffect(() => {
    load('all');
  }, [load]);

  if (!data) return <LoadingScreen title="Reviews" onBack={() => navigation.goBack()} failed={failed} onRetry={() => load(filter)} />;

  const choose = async (f: ReviewFilter) => {
    if (f === filter) return;
    setFilter(f);
    setSwitching(true);
    await load(f);
    setSwitching(false);
  };

  const onReplied = (r: StoreReview) =>
    setData(d => {
      if (!d) return d;
      const was = d.reviews.find(x => x.id === r.id);
      const firstReply = !!was && !was.reply;
      return {
        ...d,
        // "Not replied" drops it once answered.
        reviews: d.filter === 'not_replied' ? d.reviews.filter(x => x.id !== r.id) : d.reviews.map(x => (x.id === r.id ? r : x)),
        counts: firstReply ? { ...d.counts, not_replied: Math.max(0, d.counts.not_replied - 1) } : d.counts,
      };
    });

  const top = Math.max(1, ...data.breakdown.map(b => b.count));
  const shown = data.filter === filter ? data.reviews : [];

  const header = (
    <View>
      <GlassCard style={styles.summary}>
        <View style={styles.big}>
          <Text style={styles.average}>{data.average != null ? data.average.toFixed(1) : '–'}</Text>
          <Stars score={Math.round(data.average ?? 0)} size={15} />
          <Text style={styles.count}>{reviewsLabel(data.count)}</Text>
        </View>
        <View style={styles.bars}>
          {data.breakdown.map(b => (
            <View key={b.score} style={styles.barRow} accessibilityLabel={`${b.score} stars: ${b.count}`}>
              <Text style={styles.barLabel}>{b.score}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(b.count / top) * 100}%` }]} />
              </View>
              <Text style={styles.barCount}>{b.count.toLocaleString('en-NG')}</Text>
            </View>
          ))}
        </View>
      </GlassCard>

      <View style={styles.tiles}>
        <MetricTile metric={data.metrics.as_described} label="As described" of="completed sales" />
        <MetricTile metric={data.metrics.well_packed} label="Well packed" of="buyers who answered" />
        <MetricTile metric={data.metrics.fast_dropoff} label="Fast drop-off" of="drop-offs in 90 days" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipScroll}>
        {FILTERS.map(f => {
          const on = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => choose(f.key)}
              style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && shared.pressed]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={f.key === '3_or_less' ? '3 stars or less' : f.star ? `${f.label} stars` : f.label}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
              {f.star ? <Ionicons name="star" size={12} color={on ? '#FFFFFF' : G.ink} /> : null}
              {f.key === '3_or_less' ? <Text style={[styles.chipText, on && styles.chipTextOn]}>or less</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {switching ? <ActivityIndicator color={G.blue} style={styles.switching} /> : null}
    </View>
  );

  return (
    <GlassScreen>
      <GlassHeader title="Reviews" onBack={() => navigation.goBack()} />
      <FlatList
        data={switching ? [] : shown}
        keyExtractor={r => r.id}
        contentContainerStyle={shared.content}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={G.blue}
            onRefresh={async () => {
              setRefreshing(true);
              await load(filter);
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          switching ? null : (
            <GlassCard style={shared.empty}>
              <Text style={shared.emptyTitle}>{EMPTY[filter].title}</Text>
              <Text style={shared.emptyText}>{EMPTY[filter].text}</Text>
            </GlassCard>
          )
        }
        renderItem={({ item }) => <ReviewCard review={item} onReply={() => setReplying(item)} />}
      />

      <ReplySheet review={replying} max={data.reply_max} onClose={() => setReplying(null)} onSaved={onReplied} />
    </GlassScreen>
  );
};

const MetricTile: React.FC<{ metric: ReviewMetric; label: string; of: string }> = ({ metric, label, of }) => (
  <GlassCard style={styles.tile}>
    <View
      accessible
      accessibilityLabel={
        metric.percent != null ? `${metric.percent}% ${label.toLowerCase()}, of ${metric.out_of} ${of}` : `${label}: not enough yet`
      }
    >
      <Text style={styles.tileValue}>{metric.percent != null ? `${metric.percent}%` : '–'}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  </GlassCard>
);

const ReviewCard: React.FC<{ review: StoreReview; onReply: () => void }> = ({ review, onReply }) => (
  <GlassCard style={styles.review}>
    <View style={styles.reviewTop}>
      <Stars score={review.score} size={13} />
      <Text style={styles.buyer}>{review.buyer}</Text>
      <View style={shared.flex} />
      <Text style={styles.date}>{shortDay(review.created_at)}</Text>
    </View>
    {review.item ? <Text style={styles.item}>{review.item}</Text> : null}
    {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
    {review.reply ? (
      <View style={styles.replyBlock}>
        <View style={styles.replyHead}>
          <Text style={styles.replyLabel}>Your reply</Text>
          <Pressable onPress={onReply} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit your reply">
            <Text style={styles.replyEdit}>Edit</Text>
          </Pressable>
        </View>
        <Text style={styles.replyText}>{review.reply.text}</Text>
      </View>
    ) : (
      <Pressable
        onPress={onReply}
        style={({ pressed }) => [styles.replyButton, pressed && shared.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Reply to ${review.buyer}`}
      >
        <Text style={styles.replyButtonText}>Reply</Text>
      </Pressable>
    )}
  </GlassCard>
);

/** Write or change the public reply. Same rules as "About your shop": no contact details or business name. */
const ReplySheet: React.FC<{
  review: StoreReview | null;
  max: number;
  onClose: () => void;
  onSaved: (r: StoreReview) => void;
}> = ({ review, max, onClose, onSaved }) => {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shownReview, setShownReview] = useState<StoreReview | null>(review);

  useEffect(() => {
    if (review) {
      setShownReview(review);
      setText(review.reply?.text ?? '');
      setError(null);
    }
  }, [review]);

  const r = review ?? shownReview;
  const length = text.trim().length;
  const editing = !!r?.reply;
  const unchanged = editing && text.trim() === r?.reply?.text;

  const save = async () => {
    if (!r) return;
    if (!length) return setError('Write your reply first.');
    if (length > max) return setError(`Keep it to ${max} characters.`);
    setBusy(true);
    try {
      const saved = await sellerStoreService.reply(r.id, text.trim());
      onSaved(saved);
      onClose();
      toast(editing ? 'Reply updated.' : 'Reply posted. Buyers see it on your seller page.', 'success');
    } catch (e) {
      setError(errText(e, "We couldn't post that. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={!!review} onClose={() => !busy && onClose()}>
      {r ? (
        <View>
          <Text style={styles.sheetTitle}>{editing ? 'Edit your reply' : `Reply to ${r.buyer}`}</Text>
          <Text style={styles.sheetSub}>Your reply is public. Buyers see it under this review on your seller page.</Text>
          <View style={styles.quote}>
            <Stars score={r.score} size={12} />
            {r.comment ? (
              <Text style={styles.quoteText} numberOfLines={3}>
                {r.comment}
              </Text>
            ) : null}
          </View>
          <Field label="Your reply" error={error} style={styles.replyField}>
            <TextField
              value={text}
              onChangeText={v => {
                setText(v);
                if (error) setError(null);
              }}
              multiline
              maxLength={max}
              textAlignVertical="top"
              style={styles.replyInput}
              placeholder="Thank them, or say what you'll do differently"
              invalid={!!error}
              accessibilityLabel="Your reply"
            />
          </Field>
          <Text style={[shared.help, styles.replyCounter]}>
            {length}/{max} · leave out phone numbers, links and your business name
          </Text>
          <PrimaryButton
            label={busy ? 'Posting…' : editing ? 'Save reply' : 'Post reply'}
            onPress={save}
            disabled={busy || !length || unchanged}
            style={styles.sheetButton}
          />
        </View>
      ) : null}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 20, padding: 16, marginTop: 8 },
  big: { alignItems: 'center', gap: 4, minWidth: 92 },
  average: { color: G.ink, fontSize: 32, lineHeight: 38, letterSpacing: -0.6, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  count: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  bars: { flex: 1, justifyContent: 'center', gap: 8 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, width: 10, fontVariant: ['tabular-nums'] },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(28,31,42,0.06)', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: STAR },
  barCount: { color: G.slate, fontSize: 13, fontFamily: fonts.regular, minWidth: 28, textAlign: 'right', fontVariant: ['tabular-nums'] },

  tiles: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tile: { flex: 1, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' },
  tileValue: { color: G.ink, fontSize: 19, fontFamily: fonts.medium, textAlign: 'center', fontVariant: ['tabular-nums'] },
  tileLabel: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', marginTop: 2 },

  chipScroll: { marginTop: 16, marginHorizontal: -20 },
  chips: { gap: 8, paddingHorizontal: 20, paddingBottom: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  chipOn: { backgroundColor: G.ink },
  chipText: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  chipTextOn: { color: '#FFFFFF' },
  switching: { marginTop: 8, marginBottom: 16 },

  gap: { height: 12 },
  review: { padding: 16 },
  reviewTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buyer: { color: G.slate, fontSize: 13, fontFamily: fonts.medium },
  date: { color: G.muted, fontSize: 13, fontFamily: fonts.regular },
  item: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 6 },
  comment: { color: G.ink, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 8 },
  replyButton: {
    alignSelf: 'flex-start',
    height: 36,
    minWidth: 64,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  replyButtonText: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  replyBlock: { backgroundColor: '#F1F5FF', borderRadius: 12, padding: 12, marginTop: 12 },
  replyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  replyLabel: { color: G.blue600, fontSize: 13, fontFamily: fonts.medium },
  replyEdit: { color: G.blue600, fontSize: 13, fontFamily: fonts.medium },
  replyText: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginTop: 4 },

  sheetTitle: { color: G.ink, fontSize: 19, letterSpacing: -0.2, fontFamily: fonts.medium },
  sheetSub: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginTop: 4, marginBottom: 12 },
  quote: { backgroundColor: '#F5F6F9', borderRadius: 12, padding: 12, gap: 6, marginBottom: 16 },
  quoteText: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  replyField: { marginBottom: 8 },
  replyInput: { height: 120, paddingTop: 14, paddingBottom: 14, lineHeight: 22 },
  replyCounter: { marginTop: 0 },
  sheetButton: { marginTop: 16 },
});
