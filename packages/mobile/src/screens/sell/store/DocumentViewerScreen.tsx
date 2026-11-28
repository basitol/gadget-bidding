import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  Platform,
  ActivityIndicator,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassScreen, GlassHeader, GlassCard, PrimaryButton, SecondaryButton, FooterBar } from '../../../components/glass';
import { fonts } from '../../../constants';
import { sellerApplicationService, DocumentKind, DocumentLink } from '../../../services/sellerApplication.service';
import { Note, TINT } from '../onboarding/kit';
import { FactRow, LoadingScreen, toast, errText, s as shared } from './shared';
import { StatusChip, docChip, fullDay, useDocumentUpload } from './BusinessDocumentsScreen';

const LABELS: Record<DocumentKind, string> = {
  cac_certificate: 'CAC certificate',
  owner_id: "Owner's ID",
  shop_address: 'Proof of shop address',
};

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.5;

/** "1.2 MB" / "84 KB" */
const fileSize = (bytes: number | null) => {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const expired = (link: DocumentLink | null) => !link || Date.now() >= Date.parse(link.expires_at);

/**
 * A photo, zoomable. iOS: the scroll view zooms natively (pinch, or − / + drive it).
 * Android scroll views can't zoom, so − / + resize the image inside a two-way scroll.
 */
const ZoomableImage: React.FC<{
  uri: string;
  /** What's shown now (pinching updates it through onZoom). */
  zoom: number;
  /** What − / + asked for; only this drives the iOS scroll view, so pinching isn't fought. */
  target: number;
  /** Bumped by − / +, so iOS applies a target even when it repeats. */
  nonce: number;
  onZoom: (z: number) => void;
  onError: () => void;
  label: string;
}> = ({ uri, zoom, target, nonce, onZoom, onError, label }) => {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const image = (w: number, h: number) => (
    <Image
      source={{ uri }}
      style={{ width: w, height: h }}
      resizeMode="contain"
      onError={onError}
      accessibilityIgnoresInvertColors
      accessible
      accessibilityLabel={label}
    />
  );

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.fill} onLayout={onLayout}>
        {box.w ? (
          <ScrollView
            // A tiny offset makes a repeated value a new prop, so a tap always applies.
            zoomScale={target + nonce * 1e-6}
            minimumZoomScale={ZOOM_MIN}
            maximumZoomScale={ZOOM_MAX}
            centerContent
            bouncesZoom
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={64}
            onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
              const z = e.nativeEvent.zoomScale;
              if (typeof z === 'number' && Math.abs(z - zoom) > 0.04) onZoom(z);
            }}
          >
            {image(box.w, box.h)}
          </ScrollView>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.fill} onLayout={onLayout}>
      {box.w ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={zoom === 1 ? styles.center : undefined}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {image(box.w * zoom, box.h * zoom)}
          </ScrollView>
        </ScrollView>
      ) : null}
    </View>
  );
};

/**
 * Store › Business documents › one document. Photos zoom; PDFs show in the system viewer (iOS:
 * scroll through the pages, pinch to zoom). Links to the file last about 10 minutes; we fetch a
 * fresh one when it runs out (on Download, or when the file stops loading).
 */
export const DocumentViewerScreen: React.FC<{ navigation: any; route: { params?: { kind?: DocumentKind } } }> = ({
  navigation,
  route,
}) => {
  const kind = route.params?.kind ?? 'cac_certificate';
  const [link, setLink] = useState<DocumentLink | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [target, setTarget] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [page, setPage] = useState(1);
  const [broken, setBroken] = useState(false);
  const [webLoading, setWebLoading] = useState(true);
  const retried = useRef(false);
  const { uploading, choose } = useDocumentUpload();

  const load = useCallback(async () => {
    setFailed(null);
    try {
      const next = await sellerApplicationService.documentLink(kind);
      setLink(next);
      setBroken(false);
      setPage(1);
      return next;
    } catch (e) {
      setFailed(errText(e, "Couldn't open this document"));
      return null;
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  /** The file stopped loading: most likely the link ran out. Try once with a fresh one. */
  const onBroken = useCallback(() => {
    if (!retried.current) {
      retried.current = true;
      load();
    } else {
      setBroken(true);
    }
  }, [load]);

  if (!link) {
    return <LoadingScreen title={LABELS[kind]} onBack={() => navigation.goBack()} failed={failed} onRetry={load} />;
  }

  const pages = link.is_pdf ? link.pages : null;
  const chip = docChip({ kind, status: link.status, uploaded: true }, link.update_due ? { state: 'expiring' } : null);
  // Android's web view can't show PDFs: show page 1 as a picture when we have one.
  const androidPdf = link.is_pdf && Platform.OS === 'android';
  // A one-page PDF shows as its page image (zoomable, and clearer than the system PDF view's dark frame).
  // Longer PDFs scroll in the system viewer on iOS; Android has no inline PDF viewer, so page 1 shows there.
  const pdfAsImage = link.is_pdf && (androidPdf || pages === 1) && !!link.preview_url && link.preview_url !== link.url;
  const imageUri = link.is_pdf ? (pdfAsImage ? link.preview_url : null) : link.preview_url ?? link.url;
  const zoomable = !!imageUri;

  const setZoomBy = (step: number) => {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((zoom + step) * 2) / 2));
    setZoom(next);
    setTarget(next);
    setNonce(n => (n + 1) % 1000);
  };

  const download = async () => {
    const fresh = expired(link) ? await load() : link;
    if (!fresh) {
      toast("Couldn't get the file. Check your connection, then try again.");
      return;
    }
    try {
      await Linking.openURL(fresh.url);
    } catch {
      toast("Couldn't open the file. Try again.");
    }
  };

  const replace = async () => {
    const updated = await choose(kind, link.label);
    if (updated) {
      retried.current = false;
      setZoom(1);
      setTarget(1);
      await load();
    }
  };

  const fileLine = [link.name, pages ? `${pages} ${pages === 1 ? 'page' : 'pages'}` : null, fileSize(link.size)]
    .filter(Boolean)
    .join(' · ');

  return (
    <GlassScreen edges={['top']}>
      <GlassHeader title={link.label} onBack={() => navigation.goBack()} />
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <StatusChip chip={chip} />
          {pages && pages > 1 && !androidPdf ? (
            <Text style={styles.pageText} accessibilityLiveRegion="polite">{`Page ${page} of ${pages}`}</Text>
          ) : null}
        </View>

        <GlassCard style={styles.frame}>
          {broken ? (
            <View style={styles.center}>
              <Text style={styles.brokenTitle}>This file didn't load</Text>
              <Text style={styles.brokenText}>Check your connection, then try again.</Text>
              <PrimaryButton
                label="Try again"
                compact
                onPress={() => {
                  retried.current = false;
                  load();
                }}
                style={styles.retry}
              />
            </View>
          ) : imageUri ? (
            <ZoomableImage
              key={imageUri}
              uri={imageUri}
              zoom={zoom}
              target={target}
              nonce={nonce}
              onZoom={z => setZoom(Math.round(z * 20) / 20)}
              onError={onBroken}
              label={`${link.label}${link.is_pdf ? ', page 1' : ''}`}
            />
          ) : androidPdf ? (
            <View style={styles.center}>
              <Ionicons name="document-text-outline" size={36} color={G.muted} />
              <Text style={styles.brokenText}>Tap Download to open the PDF.</Text>
            </View>
          ) : (
            <View style={styles.fill}>
              <WebView
                key={link.url}
                source={{ uri: link.url }}
                style={styles.web}
                originWhitelist={['https://*', 'http://*']}
                onLoadStart={() => setWebLoading(true)}
                onLoadEnd={() => setWebLoading(false)}
                onError={onBroken}
                onHttpError={onBroken}
                onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                  const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                  if (!pages || pages < 2 || !contentSize.height) return;
                  const per = contentSize.height / pages;
                  const p = Math.min(pages, Math.max(1, Math.floor((contentOffset.y + layoutMeasurement.height / 2) / per) + 1));
                  setPage(prev => (prev === p ? prev : p));
                }}
                accessibilityLabel={`${link.label}, PDF`}
              />
              {webLoading ? <ActivityIndicator color={G.blue} style={StyleSheet.absoluteFill} /> : null}
            </View>
          )}
        </GlassCard>

        {zoomable && !broken ? (
          <View style={styles.controls}>
            <ControlButton icon="remove" label="Zoom out" disabled={zoom <= ZOOM_MIN} onPress={() => setZoomBy(-ZOOM_STEP)} />
            <View style={styles.zoomValue} accessibilityLabel={`Zoom ${Math.round(zoom * 100)} percent`}>
              <Text style={styles.zoomText}>{`${Math.round(zoom * 100)}%`}</Text>
            </View>
            <ControlButton icon="add" label="Zoom in" disabled={zoom >= ZOOM_MAX} onPress={() => setZoomBy(ZOOM_STEP)} />
          </View>
        ) : null}

        {link.status === 'needs_fix' && link.note ? (
          <Note tone="amber" style={styles.note}>{`Our team asked for a new one: ${link.note}`}</Note>
        ) : null}

        <GlassCard style={styles.facts}>
          <FactRow k="File" v={fileLine} />
          <FactRow k="Uploaded" v={fullDay(link.uploaded_at)} />
          <FactRow
            k="Checked by"
            v={link.checked_by ? `${link.checked_by} · ${fullDay(link.checked_at)}` : link.status === 'needs_fix' ? 'Waiting for a new copy' : 'With our team'}
            last
          />
        </GlassCard>
        <Text style={styles.privacy}>Only you and our verification team can see this file.</Text>
      </View>

      <FooterBar>
        <View style={styles.footer}>
          <SecondaryButton label="Download" onPress={download} style={shared.flex} />
          <PrimaryButton
            label={uploading ? 'Sending…' : chip.label === 'Update needed' ? 'Upload new' : 'Replace'}
            onPress={replace}
            disabled={!!uploading}
            style={shared.flex}
          />
        </View>
      </FooterBar>
    </GlassScreen>
  );
};

const ControlButton: React.FC<{
  icon: 'add' | 'remove';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}> = ({ icon, label, onPress, disabled }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [styles.control, (pressed || disabled) && shared.pressed]}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    hitSlop={4}
  >
    <Ionicons name={icon} size={20} color={disabled ? G.faint : G.ink} />
  </Pressable>
);

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 20 },
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, minHeight: 30 },
  pageText: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  frame: { flex: 1, minHeight: 240, padding: 12, overflow: 'hidden' },
  web: { flex: 1, backgroundColor: 'transparent', borderRadius: 12 },
  brokenTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium, textAlign: 'center' },
  brokenText: { color: G.muted, fontSize: 14, fontFamily: fonts.regular, textAlign: 'center' },
  retry: { marginTop: 8 },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 },
  control: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  zoomValue: { minWidth: 64, height: 44, borderRadius: 12, backgroundColor: TINT.fill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  zoomText: { color: G.ink, fontSize: 14, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  note: { marginTop: 12 },
  facts: { marginTop: 12, overflow: 'hidden' },
  privacy: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', marginTop: 10, marginBottom: 8 },
  footer: { flexDirection: 'row', gap: 12 },
});
