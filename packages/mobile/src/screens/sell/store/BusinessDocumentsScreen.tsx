import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActionSheetIOS,
  Platform,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassScreen, GlassHeader, GlassCard } from '../../../components/glass';
import { fonts } from '../../../constants';
import {
  sellerApplicationService,
  pickDocumentPdf,
  pickDocumentPhoto,
  takeDocumentPhoto,
  ApplicationDocument,
  DocumentKind,
  PickedFile,
  ProofOfAddress,
  SellerApplication,
} from '../../../services/sellerApplication.service';
import { Note, TINT } from '../onboarding/kit';
import { LoadingScreen, Overline, LinkRow, toast, errText, s as shared } from './shared';

/* ---------------- Shared with the document viewer ---------------- */

/** "Nov 12, 2024" */
export const fullDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
/** "Nov 2024" */
const monthYear = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';

/** "Proof of shop address" → "proof of shop address"; "CAC certificate" stays. */
const inSentence = (label: string) => (/^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label);

export type DocChip = { label: string; tone: { bg: string; text: string } };

/** Verified / In review / Update needed. A proof of address past 12 months needs updating too. */
export const docChip = (
  doc: Pick<ApplicationDocument, 'kind' | 'status' | 'uploaded'>,
  proof?: Pick<ProofOfAddress, 'state'> | null
): DocChip => {
  if (!doc.uploaded || !doc.status) return { label: 'Not uploaded', tone: { bg: TINT.fill, text: G.ink } };
  if (doc.status === 'needs_fix') return { label: 'Update needed', tone: TINT.amber };
  if (doc.status === 'submitted') return { label: 'In review', tone: TINT.blue };
  if (doc.kind === 'shop_address' && (proof?.state === 'expiring' || proof?.state === 'expired')) {
    return { label: 'Update needed', tone: TINT.amber };
  }
  return { label: 'Verified', tone: TINT.green };
};

export const StatusChip: React.FC<{ chip: DocChip }> = ({ chip }) => (
  <View style={[styles.chip, { backgroundColor: chip.tone.bg }]}>
    <Text style={[styles.chipText, { color: chip.tone.text }]}>{chip.label}</Text>
  </View>
);

const CHOICES: [string, () => Promise<PickedFile | null>][] = [
  ['Take a photo', takeDocumentPhoto],
  ['Choose a photo', pickDocumentPhoto],
  ['Choose a PDF', pickDocumentPdf],
];

/**
 * "Replace" / "Upload new": photo, camera or PDF, then upload. The new file goes to our team to
 * check; the seller stays approved meanwhile. Resolves with the updated application, or null.
 */
export const useDocumentUpload = () => {
  const [uploading, setUploading] = useState<DocumentKind | null>(null);

  const upload = useCallback(async (kind: DocumentKind, pick: () => Promise<PickedFile | null>) => {
    let file: PickedFile | null;
    try {
      file = await pick();
    } catch (e) {
      toast(errText(e));
      return null;
    }
    if (!file) return null;
    setUploading(kind);
    try {
      const app = await sellerApplicationService.uploadDocument(kind, file);
      toast('Sent. Our team will check it, and you can keep selling.', 'success');
      return app;
    } catch (e) {
      toast(errText(e));
      return null;
    } finally {
      setUploading(null);
    }
  }, []);

  const choose = useCallback(
    (kind: DocumentKind, label: string) =>
      new Promise<SellerApplication | null>(resolve => {
        const run = (i: number) => (i < CHOICES.length ? upload(kind, CHOICES[i][1]).then(resolve) : resolve(null));
        if (Platform.OS === 'ios') {
          ActionSheetIOS.showActionSheetWithOptions(
            { title: label, options: [...CHOICES.map(c => c[0]), 'Cancel'], cancelButtonIndex: CHOICES.length },
            run
          );
        } else {
          // Android alerts show up to three buttons: the three choices; tapping outside cancels.
          Alert.alert(
            label,
            undefined,
            CHOICES.map(([text], i) => ({ text, onPress: () => run(i) })),
            { cancelable: true, onDismiss: () => resolve(null) }
          );
        }
      }),
    [upload]
  );

  return { uploading, choose };
};

/* ---------------- One document ---------------- */

const CardButton: React.FC<{ label: string; onPress: () => void; primary?: boolean; busy?: boolean; a11y?: string }> = ({
  label,
  onPress,
  primary,
  busy,
  a11y,
}) => (
  <Pressable
    onPress={onPress}
    disabled={busy}
    style={({ pressed }) => [styles.button, primary && styles.buttonPrimary, pressed && shared.pressed]}
    accessibilityRole="button"
    accessibilityLabel={a11y ?? label}
    accessibilityState={{ busy }}
  >
    {busy ? (
      <ActivityIndicator size="small" color={primary ? '#FFFFFF' : G.blue} />
    ) : (
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
    )}
  </Pressable>
);

const DocumentCard: React.FC<{
  doc: ApplicationDocument;
  registration: string | null | undefined;
  proof: ProofOfAddress | undefined;
  busy: boolean;
  onView: () => void;
  onUpload: () => void;
}> = ({ doc, registration, proof, busy, onView, onUpload }) => {
  const chip = docChip(doc, proof);
  const needsUpdate = chip.label === 'Update needed';
  const sub = !doc.uploaded
    ? 'Not uploaded yet'
    : [doc.kind === 'cac_certificate' ? registration : null, `uploaded ${monthYear(doc.uploaded_at)}`].filter(Boolean).join(' · ');
  return (
    <GlassCard style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.docIcon}>
          <Ionicons name="document-outline" size={20} color={G.slate} />
        </View>
        <View style={shared.flex}>
          <Text style={styles.docTitle}>{doc.label}</Text>
          <Text style={styles.docSub}>{sub}</Text>
        </View>
        {doc.uploaded ? <StatusChip chip={chip} /> : null}
      </View>
      {doc.status === 'needs_fix' && doc.note ? (
        <Text style={styles.teamNote}>{`Our team: ${doc.note}`}</Text>
      ) : null}
      <View style={styles.buttons}>
        {doc.uploaded ? <CardButton label="View" onPress={onView} a11y={`View ${doc.label}`} /> : null}
        <CardButton
          label={!doc.uploaded ? 'Upload' : needsUpdate ? 'Upload new' : 'Replace'}
          primary={!doc.uploaded || needsUpdate}
          busy={busy}
          onPress={onUpload}
          a11y={`${!doc.uploaded ? 'Upload' : needsUpdate ? 'Upload a new' : 'Replace'} ${doc.label}`}
        />
      </View>
    </GlassCard>
  );
};

/* ---------------- The screen ---------------- */

const proofNote = (p: ProofOfAddress | undefined) => {
  if (p?.state === 'expiring') {
    const days = p.days_left ?? 0;
    const within = days <= 0 ? 'today' : days === 1 ? 'within 1 day' : `within ${days} days`;
    return `Your proof of address is over 12 months old. Upload a recent one ${within} to keep selling.`;
  }
  if (p?.state === 'expired') {
    return 'Your proof of address is over 12 months old, so new listings are paused. Upload a recent one to list again.';
  }
  return null;
};

/**
 * Store › Business documents: the three documents from the seller's application. Once approved the
 * seller can view and replace any of them; a replacement goes to our team and they keep selling.
 */
export const BusinessDocumentsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [app, setApp] = useState<SellerApplication | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { uploading, choose } = useDocumentUpload();

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setApp(await sellerApplicationService.get());
    } catch (e) {
      setFailed(errText(e, "Couldn't load your documents"));
    }
  }, []);

  useEffect(() => {
    load();
    // Back from the viewer (it may have replaced a file).
    return navigation.addListener?.('focus', load);
  }, [load, navigation]);

  if (!app) return <LoadingScreen title="Business documents" onBack={() => navigation.goBack()} failed={failed} onRetry={load} />;

  const approved = app.status === 'approved';
  const proof = app.proof_of_address;
  const proofWarning = approved ? proofNote(proof) : null;
  const flagged = app.documents.filter(d => d.status === 'needs_fix');

  const replace = async (d: ApplicationDocument) => {
    const updated = await choose(d.kind, d.label);
    if (updated) setApp(updated);
  };

  return (
    <GlassScreen>
      <GlassHeader title="Business documents" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={shared.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={G.blue}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        {!approved ? (
          <>
            <Note style={styles.first}>Your application is still with our team. Your documents are on your application.</Note>
            <LinkRow label="Open your application" onPress={() => navigation.navigate('SellerStatus')} />
          </>
        ) : (
          <>
            <View style={styles.verified} accessibilityRole="summary">
              <View style={styles.verifiedIcon}>
                <Ionicons name="shield-checkmark-outline" size={22} color={G.green} />
              </View>
              <View style={shared.flex}>
                <Text style={styles.verifiedTitle}>Business verified</Text>
                <Text style={styles.verifiedSub}>
                  {[app.approved_at ? `Since ${fullDay(app.approved_at)}` : null, app.registration].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>

            {proofWarning ? (
              <Note tone="amber" style={styles.noteGap}>
                {proofWarning}
              </Note>
            ) : null}
            {flagged.length ? (
              <Note tone="amber" style={styles.noteGap}>
                {flagged.length === 1
                  ? `Our team needs a new copy of your ${inSentence(flagged[0].label)}. You can keep selling while we check it.`
                  : `Our team needs new copies of ${flagged.length} documents. You can keep selling while we check them.`}
              </Note>
            ) : null}

            <Overline>Documents</Overline>
            <View style={styles.list}>
              {app.documents.map(d => (
                <DocumentCard
                  key={d.kind}
                  doc={d}
                  registration={app.registration}
                  proof={proof}
                  busy={uploading === d.kind}
                  onView={() => navigation.navigate('DocumentViewer', { kind: d.kind })}
                  onUpload={() => replace(d)}
                />
              ))}
            </View>

            <Note title="Who can see these?" style={styles.privacy}>
              Only our verification team. Buyers never see your documents or business name.
            </Note>
          </>
        )}
      </ScrollView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  first: { marginTop: 8 },
  noteGap: { marginTop: 12 },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: TINT.green.bg,
    borderWidth: 1,
    borderColor: 'rgba(46,158,94,0.14)',
  },
  verifiedIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  verifiedTitle: { color: G.green, fontSize: 16, fontFamily: fonts.medium },
  verifiedSub: { color: G.slate, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  list: { gap: 12 },
  card: { padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: TINT.fill, alignItems: 'center', justifyContent: 'center' },
  docTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  docSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  teamNote: { color: TINT.amber.text, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 10 },
  chip: { height: 30, paddingHorizontal: 10, borderRadius: 9, justifyContent: 'center', alignSelf: 'flex-start' },
  chipText: { fontSize: 13, fontFamily: fonts.medium },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 14 },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(28,31,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: G.blue, borderColor: G.blue },
  buttonText: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  buttonTextPrimary: { color: '#FFFFFF' },
  privacy: { marginTop: 16 },
});
