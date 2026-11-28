import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Image,
  ActionSheetIOS,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassScreen, GlassHeader, FooterBar, PrimaryButton, GlassKeyboardView } from '../../../components/glass';
import { fonts } from '../../../constants';
import {
  Case,
  PickedCaseFile,
  SellerCaseFile,
  SELLER_CASE_FILE_MAX,
  sellerCaseService,
  pickCasePhotos,
  takeCasePhoto,
  pickCaseVideoFile,
  pickCasePdf,
  clipLength,
} from '../../../services/case.service';
import { mediaUrl } from '../../../utils';
import { Label, TINT } from '../onboarding/kit';
import { useSellerCase, CaseLoading, ItemCard, RadioCard, TipNote, toast, errText, cs } from './shared';

const MIN_CHARS = 30;
const MAX_CHARS = 2000;

type Position = 'matched' | 'partly';

/** Your reply: position, what happened (30+ characters) and photos, a video or receipts. */
export const CaseReplyScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const disputeId: string = route.params?.disputeId;
  const { c, setC, load, error } = useSellerCase(disputeId);
  if (!c) return <CaseLoading title="Your reply" onBack={() => navigation.goBack()} error={error} onRetry={load} />;
  return <ReplyForm c={c} setC={setC} navigation={navigation} />;
};

const ReplyForm: React.FC<{
  c: Case;
  setC: (c: Case) => void;
  navigation: any;
}> = ({ c, setC, navigation }) => {
  const [position, setPosition] = useState<Position>('matched');
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  /** Picked here, not uploaded yet. Files already on the case (an earlier try) come from c.seller.files. */
  const [picked, setPicked] = useState<PickedCaseFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const uploaded: SellerCaseFile[] = c.seller?.files ?? [];
  const count = uploaded.length + picked.length;
  const room = SELLER_CASE_FILE_MAX - count;
  const hasVideo = uploaded.some(f => f.kind === 'video') || picked.some(f => f.kind === 'video');
  const chars = text.trim().length;
  const valid = chars >= MIN_CHARS;
  const closed = !c.seller?.can_reply;

  const add = async (pick: () => Promise<PickedCaseFile[]>) => {
    try {
      const files = await pick();
      if (files.length) setPicked(p => [...p, ...files].slice(0, SELLER_CASE_FILE_MAX - uploaded.length));
    } catch (e) {
      toast(errText(e, "We couldn't add that file. Try another."));
    }
  };

  const chooseFile = () => {
    if (room <= 0) return toast(`You can add up to ${SELLER_CASE_FILE_MAX} files.`);
    const choices: [string, () => Promise<PickedCaseFile[]>][] = [
      ['Take a photo', takeCasePhoto],
      ['Choose photos', () => pickCasePhotos(room)],
      ...(!hasVideo
        ? ([['Choose a video (up to 60 s)', pickCaseVideoFile]] as [string, () => Promise<PickedCaseFile[]>][])
        : []),
      ['Add a PDF receipt', pickCasePdf],
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Add evidence',
          options: [...choices.map(x => x[0]), 'Cancel'],
          cancelButtonIndex: choices.length,
        },
        i => {
          if (i < choices.length) add(choices[i][1]);
        }
      );
    } else {
      Alert.alert('Add evidence', undefined, [
        ...choices.map(([label, fn]) => ({
          text: label,
          onPress: () => add(fn),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  const removeUploaded = async (f: SellerCaseFile) => {
    setBusy('remove');
    try {
      setC(await sellerCaseService.removeFile(c.id, f.url));
    } catch (e) {
      toast(errText(e, "We couldn't remove that file. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!valid || busy) return;
    let latest = c;
    let left = [...picked];
    try {
      // Upload one at a time; each one that lands moves from "picked" to the case's files.
      for (let i = 0; i < picked.length; i++) {
        setBusy(`Uploading ${i + 1} of ${picked.length}…`);
        latest = await sellerCaseService.addFile(c.id, picked[i]);
        left = left.slice(1);
        setPicked(left);
        setC(latest);
      }
      setBusy('Sending…');
      latest = await sellerCaseService.reply(c.id, position, text.trim());
      setC(latest);
      navigation.replace('CaseReplySent', { disputeId: c.id });
    } catch (e) {
      toast(errText(e, "Your reply didn't send. Try again."));
      setBusy(null);
    }
  };

  const fileLabel = (kind: string, name: string, seconds?: number) =>
    kind === 'video' ? (seconds ? `Video · ${clipLength(seconds)}` : 'Video') : kind === 'pdf' ? name : 'Photo';

  return (
    <GlassScreen>
      <GlassHeader title="Your reply" onBack={() => navigation.goBack()} />
      <GlassKeyboardView>
        <ScrollView contentContainerStyle={cs.content} keyboardShouldPersistTaps="handled">
          <ItemCard c={c} opened={false} />

          <Label style={cs.section}>Your position</Label>
          <View style={styles.options} accessibilityRole="radiogroup">
            <RadioCard
              on={position === 'matched'}
              title="It matched my listing"
              sub="Show us why — our team decides"
              onPress={() => setPosition('matched')}
            />
            <RadioCard
              on={position === 'partly'}
              title="Partly right"
              sub="Explain what you think happened"
              onPress={() => setPosition('partly')}
            />
          </View>

          <Text style={styles.fieldLabel} nativeID="explainLabel">
            Explain what happened
          </Text>
          <TextInput
            value={text}
            onChangeText={t => setText(t.slice(0, MAX_CHARS))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="e.g. Battery was 88% when I listed it on Nov 18 — screenshot attached. It may have dropped during charging tests."
            placeholderTextColor={G.faint}
            style={[styles.textarea, focused && styles.textareaFocused]}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Explain what happened"
            accessibilityLabelledBy="explainLabel"
          />
          <Text style={[cs.caption, styles.counter, valid && styles.counterOk]}>
            {valid
              ? `${chars.toLocaleString()} / ${MAX_CHARS.toLocaleString()} characters`
              : `At least ${MIN_CHARS} characters (${chars}/${MIN_CHARS})`}
          </Text>

          <Label style={cs.section}>Photos, video or receipts</Label>
          <View style={styles.files}>
            {uploaded.map(f => (
              <FileTile
                key={f.url}
                kind={f.kind}
                uri={f.kind === 'photo' ? mediaUrl(f.url) : null}
                label={fileLabel(f.kind, f.name, f.seconds)}
                onRemove={() => removeUploaded(f)}
                disabled={!!busy}
              />
            ))}
            {picked.map((f, i) => (
              <FileTile
                key={`${f.uri}-${i}`}
                kind={f.kind}
                uri={f.kind === 'photo' ? f.uri : null}
                label={fileLabel(f.kind, f.name, f.seconds)}
                onRemove={() => setPicked(p => p.filter((_, j) => j !== i))}
                disabled={!!busy}
              />
            ))}
            {room > 0 ? (
              <Pressable
                onPress={chooseFile}
                disabled={!!busy || closed}
                style={({ pressed }) => [styles.addTile, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Add a photo, video or receipt"
              >
                <Ionicons name="add" size={24} color={G.blue} />
              </Pressable>
            ) : null}
          </View>
          <Text style={[cs.caption, styles.counter]}>
            Up to {SELLER_CASE_FILE_MAX} files: photos, one video up to 60 seconds, or PDF receipts.
          </Text>

          <TipNote style={cs.gap}>
            Helpful: a dated battery screenshot, the original purchase receipt, or a video of the device before
            drop-off.
          </TipNote>
        </ScrollView>
        <FooterBar>
          <PrimaryButton
            label={busy && busy !== 'remove' ? busy : valid ? 'Send reply' : 'Write your reply to continue'}
            onPress={send}
            disabled={!valid || !!busy || closed}
          />
          {closed ? <Text style={[cs.caption, styles.footHint]}>This case no longer takes replies.</Text> : null}
        </FooterBar>
      </GlassKeyboardView>
    </GlassScreen>
  );
};

const FileTile: React.FC<{
  kind: 'photo' | 'video' | 'pdf';
  uri: string | null;
  label: string;
  onRemove: () => void;
  disabled?: boolean;
}> = ({ kind, uri, label, onRemove, disabled }) => (
  <View style={styles.fileTile} accessible accessibilityLabel={label}>
    {uri ? (
      <Image source={{ uri }} style={styles.fileImage} />
    ) : (
      <View style={styles.fileIcon}>
        <Ionicons name={kind === 'pdf' ? 'document-text-outline' : 'videocam-outline'} size={20} color={G.slate} />
        <Text style={styles.fileText} numberOfLines={2}>
          {label}
        </Text>
      </View>
    )}
    <Pressable
      onPress={onRemove}
      disabled={disabled}
      hitSlop={10}
      style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Remove ${label}`}
    >
      <Ionicons name="close" size={14} color="#FFFFFF" />
    </Pressable>
  </View>
);

const TILE = 76;

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  options: { gap: 10 },
  fieldLabel: {
    color: G.slate,
    fontSize: 14,
    fontFamily: fonts.medium,
    marginTop: 24,
    marginBottom: 8,
  },
  textarea: {
    minHeight: 128,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: G.ink,
  },
  textareaFocused: { borderColor: G.blue },
  counter: { marginTop: 8 },
  counterOk: { color: G.green },
  files: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addTile: {
    width: TILE,
    height: TILE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9D5FF',
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileTile: {
    width: TILE,
    height: TILE,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  fileImage: { width: TILE, height: TILE },
  fileIcon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
    backgroundColor: TINT.fill,
  },
  fileText: {
    color: G.slate,
    fontSize: 11,
    fontFamily: fonts.regular,
    textAlign: 'center',
  },
  remove: {
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
  footHint: { textAlign: 'center', marginTop: 8 },
});
