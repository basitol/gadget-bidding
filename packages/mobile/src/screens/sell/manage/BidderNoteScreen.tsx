import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet } from 'react-native';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  GlassKeyboardView,
  FooterBar,
  PrimaryButton,
} from '../../../components/glass';
import { fonts } from '../../../constants';
import { listingManageService } from '../../../services/listingManage.service';
import { CaseLoading, StatusChip } from '../case/shared';
import { ItemCard, errText, k, toast, useManageView } from './kit';

const MAX = 500;

/**
 * Add a note for bidders ('BidderNote', { auctionId }): extra information once bids are in, like a
 * receipt or warranty. Our team checks it before bidders see it; a new note replaces the old one.
 */
export const BidderNoteScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const auctionId: string = route.params?.auctionId;
  const { view: v, error, reload } = useManageView(auctionId);
  const [note, setNote] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (v && !ready) {
      setNote(v.bidder_note_pending ?? '');
      setReady(true);
    }
  }, [v, ready]);

  if (!v || !ready)
    return <CaseLoading title="Note for bidders" onBack={() => navigation.goBack()} error={error} onRetry={reload} />;

  const send = async () => {
    if (note.trim().length < 5) return toast('Add a little more to the note.');
    setBusy(true);
    try {
      await listingManageService.addBidderNote(auctionId, note.trim());
      toast('Sent. Bidders see it once our team has checked it.', 'success');
      navigation.goBack();
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassScreen>
      <GlassHeader title="Note for bidders" onBack={() => navigation.goBack()} />
      <GlassKeyboardView>
        <ScrollView
          contentContainerStyle={k.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ItemCard
            image={v.image}
            title={v.title}
            lines={[`${v.bids} bid${v.bids === 1 ? '' : 's'} · ${v.watching} watching`]}
          />

          {v.bidder_note ? (
            <GlassCard style={styles.current}>
              <View style={styles.head}>
                <Text style={styles.headText}>Bidders see now</Text>
                <StatusChip label="Live" tone="green" />
              </View>
              <Text style={styles.body}>{v.bidder_note}</Text>
            </GlassCard>
          ) : null}

          <Text style={k.label}>{v.bidder_note ? 'Replace it with' : 'Your note'}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={MAX}
            style={[k.input, styles.textarea]}
            placeholder="e.g. Comes with the original receipt and 3 months of Apple warranty left."
            placeholderTextColor={G.faint}
            accessibilityLabel="Note for bidders"
            textAlignVertical="top"
            autoFocus={!v.bidder_note}
          />
          <View style={styles.foot}>
            <Text style={k.caption}>
              {v.bidder_note_pending
                ? 'Your last note is waiting for our team. Sending again replaces it.'
                : 'Our team checks it before bidders see it.'}
            </Text>
            <Text style={[k.caption, styles.count]}>
              {note.length}/{MAX}
            </Text>
          </View>
          <Text style={k.caption}>Add facts only. The price, grade and details stay as they are.</Text>
        </ScrollView>
        <FooterBar>
          <PrimaryButton
            label={busy ? 'Sending…' : 'Send to our team'}
            onPress={send}
            disabled={busy || note.trim().length < 5}
          />
        </FooterBar>
      </GlassKeyboardView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  current: { padding: 16, gap: 8, marginTop: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headText: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  body: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  textarea: { minHeight: 130, paddingTop: 14, paddingBottom: 14, lineHeight: 22 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  count: { fontVariant: ['tabular-nums'] },
});
