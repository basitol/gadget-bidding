import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  Chip,
  PrimaryButton,
  SecondaryButton,
  FooterBar,
} from '../../components/glass';
import { BottomSheet } from '../../components/motion';
import { fonts } from '../../constants';
import { meService, orderService, supportService, getErrorMessage } from '../../services';
import type { ContactTopic } from '../../services';
import { useToastStore } from '../../store/toastStore';
import {
  HELP_CATEGORIES,
  HELP_ARTICLES,
  POPULAR_ARTICLES,
  HelpArticle,
  HelpCategoryKey,
  HelpStep,
  articleBySlug,
  categoryOf,
  searchArticles,
} from './helpContent';

const toast = (msg: string, type: 'success' | 'error' = 'success') => useToastStore.getState().show(msg, type);

/* ================= Shared pieces ================= */

/** Rows of questions with chevrons. */
const ArticleList: React.FC<{ articles: HelpArticle[]; onOpen: (a: HelpArticle) => void }> = ({ articles, onOpen }) => (
  <GlassCard style={styles.list}>
    {articles.map((a, i) => (
      <Pressable
        key={a.slug}
        onPress={() => onOpen(a)}
        style={({ pressed }) => [styles.row, i < articles.length - 1 && styles.divider, pressed && styles.rowPressed]}
        accessibilityRole="button"
      >
        <Text style={styles.rowText}>{a.title}</Text>
        <Ionicons name="chevron-forward" size={18} color={G.faint} />
      </Pressable>
    ))}
  </GlassCard>
);

/** Dark "Contact support" card at the bottom of Help. */
const ContactCard: React.FC<{ onPress: () => void }> = ({ onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.contact, pressed && styles.contactPressed]}
    accessibilityRole="button"
    accessibilityLabel="Contact support. We reply within 1 working day."
  >
    <Image source={require('../../../assets/icons/bell.png')} style={styles.contactIcon} />
    <View style={styles.flex}>
      <Text style={styles.contactTitle}>Contact support</Text>
      <Text style={styles.contactSub}>We reply within 1 working day</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
  </Pressable>
);

/* ================= Help ================= */

export const HelpScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchArticles(query), [query]);
  const popular = useMemo(
    () => POPULAR_ARTICLES.map(articleBySlug).filter((a): a is HelpArticle => !!a),
    []
  );
  const open = (a: HelpArticle) => navigation.navigate('HelpArticle', { slug: a.slug });
  const searching = query.trim().length > 0;

  return (
    <GlassScreen>
      <GlassHeader title="Help" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={G.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search for help"
            placeholderTextColor={G.faint}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search for help"
          />
        </View>

        {searching ? (
          results.length ? (
            <>
              <Text style={styles.overline}>
                {results.length === 1 ? '1 ANSWER' : `${results.length} ANSWERS`}
              </Text>
              <ArticleList articles={results} onOpen={open} />
            </>
          ) : (
            <GlassCard style={styles.noResults}>
              <Text style={styles.noResultsTitle}>No answers for "{query.trim()}"</Text>
              <Text style={styles.noResultsText}>Try another word, or ask us and we'll help.</Text>
            </GlassCard>
          )
        ) : (
          <>
            <View style={styles.tiles}>
              {HELP_CATEGORIES.map(c => (
                <Pressable
                  key={c.key}
                  onPress={() => navigation.navigate('HelpCategory', { category: c.key })}
                  style={({ pressed }) => [styles.tileWrap, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={c.title}
                >
                  <GlassCard style={styles.tile}>
                    <Image source={c.icon} style={styles.tileIcon} />
                    <Text style={styles.tileTitle}>{c.title}</Text>
                  </GlassCard>
                </Pressable>
              ))}
            </View>

            <Text style={styles.overline}>POPULAR</Text>
            <ArticleList articles={popular} onOpen={open} />
          </>
        )}

        <ContactCard onPress={() => navigation.navigate('ContactSupport')} />
      </ScrollView>
    </GlassScreen>
  );
};

/* ================= Help › category ================= */

export const HelpCategoryScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const key: HelpCategoryKey = route.params?.category ?? 'bidding';
  const category = categoryOf(key) ?? HELP_CATEGORIES[0];
  const articles = HELP_ARTICLES.filter(a => a.category === category.key);

  return (
    <GlassScreen>
      <GlassHeader title="Help" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.categoryHead}>
          <Image source={category.icon} style={styles.categoryIcon} />
          <Text style={styles.title} accessibilityRole="header">
            {category.title}
          </Text>
        </View>
        <ArticleList articles={articles} onOpen={a => navigation.navigate('HelpArticle', { slug: a.slug })} />
        <ContactCard onPress={() => navigation.navigate('ContactSupport')} />
      </ScrollView>
    </GlassScreen>
  );
};

/* ================= Help article ================= */

/** Green filled dots for done, blue ring for the current (last) step. */
const Timeline: React.FC<{ steps: HelpStep[] }> = ({ steps }) => (
  <GlassCard style={styles.timeline}>
    {steps.map((s, i) => {
      const last = i === steps.length - 1;
      return (
        <View key={s.title} style={styles.step} accessibilityLabel={`${s.title}. ${s.sub}${last ? '. This is the step you do.' : ''}`}>
          <View style={styles.rail}>
            <View style={last ? styles.dotCurrent : styles.dotDone} />
            {!last ? <View style={styles.railLine} /> : null}
          </View>
          <View style={[styles.flex, !last && styles.stepGap]}>
            <Text style={[styles.stepTitle, last && styles.stepTitleCurrent]}>{s.title}</Text>
            <Text style={styles.stepSub}>{s.sub}</Text>
          </View>
        </View>
      );
    })}
  </GlassCard>
);

export const HelpArticleScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const article = articleBySlug(route.params?.slug ?? '');
  const [answer, setAnswer] = useState<boolean | null>(null);

  const rate = (helpful: boolean) => {
    if (!article) return;
    setAnswer(helpful);
    // Saved for our team; the thank-you shows either way.
    meService.helpFeedback(article.slug, helpful).catch(() => {});
  };

  if (!article) {
    return (
      <GlassScreen>
        <GlassHeader title="Help" onBack={() => navigation.goBack()} />
        <View style={styles.content}>
          <GlassCard style={styles.noResults}>
            <Text style={styles.noResultsTitle}>We couldn't find that answer</Text>
            <Text style={styles.noResultsText}>Go back to Help and pick another question.</Text>
          </GlassCard>
        </View>
      </GlassScreen>
    );
  }

  return (
    <GlassScreen>
      <GlassHeader title="Help" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.articleOverline}>{categoryOf(article.category).title.toUpperCase()}</Text>
        <Text style={styles.title} accessibilityRole="header">
          {article.title}
        </Text>
        {article.body.map((p, i) => (
          <Text key={i} style={styles.body}>
            {p}
          </Text>
        ))}

        {article.steps ? <Timeline steps={article.steps} /> : null}

        {article.note ? (
          <View style={styles.note}>
            <Text style={styles.noteText}>{article.note}</Text>
          </View>
        ) : null}

        <GlassCard style={styles.helpful}>
          {answer === null ? (
            <>
              <Text style={styles.helpfulTitle}>Was this helpful?</Text>
              <View style={styles.helpfulButtons}>
                <SecondaryButton label="Yes" compact onPress={() => rate(true)} style={styles.helpfulButton} />
                <SecondaryButton label="No" compact onPress={() => rate(false)} style={styles.helpfulButton} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.helpfulTitle}>Thanks for telling us</Text>
              {answer ? null : (
                <>
                  <Text style={styles.helpfulText}>Still stuck? Send us a message and we'll sort it out.</Text>
                  <Pressable
                    onPress={() => navigation.navigate('ContactSupport')}
                    hitSlop={8}
                    style={styles.helpfulLink}
                    accessibilityRole="link"
                  >
                    <Text style={styles.link}>Contact support</Text>
                  </Pressable>
                </>
              )}
            </>
          )}
        </GlassCard>
      </ScrollView>
    </GlassScreen>
  );
};

/* ================= Contact support ================= */

const TOPICS: { key: ContactTopic; label: string }[] = [
  { key: 'order', label: 'An order' },
  { key: 'paying', label: 'Paying' },
  { key: 'account', label: 'My account' },
  { key: 'other', label: 'Something else' },
];
const MIN_LENGTH = 10;

type OrderOption = { id: string; label: string };

export const ContactSupportScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const initialOrder: string | null = route.params?.orderId ?? null;
  const [topic, setTopic] = useState<ContactTopic>(route.params?.topic ?? 'order');
  const [orders, setOrders] = useState<OrderOption[] | null>(null);
  const [orderId, setOrderId] = useState<string | null>(initialOrder);
  const [body, setBody] = useState('');
  const [left, setLeft] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [sending, setSending] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const res = await orderService.getMyOrders(1, 50);
      setOrders(
        (res.data ?? []).map((o: any) => ({
          id: o.id,
          label: [o.order_number, o.gadget?.title].filter(Boolean).join(' · '),
        }))
      );
    } catch {
      setOrders([]);
    }
  }, []);
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const chosen = orders?.find(o => o.id === orderId) ?? null;
  const length = body.trim().length;
  const valid = length >= MIN_LENGTH;
  const showError = left && length > 0 && !valid;

  const send = async () => {
    if (!valid || sending) return;
    setSending(true);
    try {
      const res = await supportService.contact({ topic, order_id: orderId, body: body.trim() });
      toast(res.message || "Message sent. We'll reply within 1 working day.");
      // The reply lands in the support chat, so show them where it will appear.
      navigation.replace('SupportChat');
    } catch (e) {
      toast(getErrorMessage(e) || "We couldn't send that. Try again.", 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <GlassScreen>
      <GlassHeader title="Contact support" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title} accessibilityRole="header">
            How can we help?
          </Text>

          <Text style={[styles.overline, styles.overlineForm]}>TOPIC</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {TOPICS.map(t => (
              <Chip key={t.key} label={t.label} selected={topic === t.key} onPress={() => setTopic(t.key)} />
            ))}
          </View>

          <Text style={styles.label}>Which order? (optional)</Text>
          <Pressable
            onPress={() => setSheet(true)}
            disabled={!orders?.length}
            style={({ pressed }) => [styles.input, styles.select, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Which order, optional. ${chosen ? chosen.label : 'None chosen'}`}
            accessibilityHint="Opens your orders"
          >
            {orders === null ? (
              <ActivityIndicator color={G.blue} />
            ) : (
              <Text style={[styles.selectText, !chosen && styles.selectPlaceholder]} numberOfLines={1}>
                {chosen ? chosen.label : orders.length ? 'Choose an order' : 'No orders yet'}
              </Text>
            )}
            <Ionicons name="chevron-down" size={16} color={orders?.length ? G.slate : G.faint} />
          </Pressable>

          <Text style={styles.label}>Message</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            onBlur={() => setLeft(true)}
            placeholder="Tell us what's going on"
            placeholderTextColor={G.faint}
            multiline
            maxLength={1800}
            textAlignVertical="top"
            style={[styles.input, styles.textarea, showError && styles.inputError]}
            accessibilityLabel="Message"
            accessibilityHint="At least 10 characters"
          />
          <Text style={[styles.helper, showError && styles.helperError]}>
            {showError ? `Write at least ${MIN_LENGTH} characters so we can help.` : `At least ${MIN_LENGTH} characters`}
          </Text>
        </ScrollView>
        <FooterBar>
          <PrimaryButton label={sending ? 'Sending…' : 'Send message'} onPress={send} disabled={!valid || sending} />
        </FooterBar>
      </KeyboardAvoidingView>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)}>
        <Text style={styles.sheetTitle}>Which order?</Text>
        <Text style={styles.sheetSub}>We'll see its details with your message.</Text>
        <ScrollView style={styles.sheetList}>
          {[{ id: '', label: 'No order' }, ...(orders ?? [])].map(o => {
            const on = (orderId ?? '') === o.id;
            return (
              <Pressable
                key={o.id || 'none'}
                onPress={() => {
                  setOrderId(o.id || null);
                  setSheet(false);
                }}
                style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.sheetRowText, on && styles.sheetRowTextOn]} numberOfLines={1}>
                  {o.label}
                </Text>
                {on ? <Ionicons name="checkmark" size={18} color={G.blue} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40 },

  title: { color: G.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.52, fontFamily: fonts.medium },
  body: { color: G.slate, fontSize: 16, lineHeight: 24, fontFamily: fonts.regular, marginTop: 12 },
  overline: {
    color: G.muted,
    fontSize: 13,
    letterSpacing: 0.52,
    fontFamily: fonts.medium,
    marginTop: 24,
    marginBottom: 8,
  },
  overlineForm: { marginTop: 20 },
  articleOverline: { color: G.muted, fontSize: 13, letterSpacing: 0.52, fontFamily: fonts.medium, marginBottom: 8 },
  link: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium },

  // Search
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEFF4',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  searchInput: { flex: 1, height: '100%', color: G.ink, fontSize: 16, fontFamily: fonts.regular },
  noResults: { padding: 16, gap: 4, marginTop: 4 },
  noResultsTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  noResultsText: { color: G.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },

  // Category tiles
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tileWrap: { width: '48.8%' },
  tile: { padding: 16, minHeight: 92, justifyContent: 'space-between', gap: 12 },
  tileIcon: { width: 32, height: 32, resizeMode: 'contain' },
  tileTitle: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },

  // Question list
  list: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 54, paddingVertical: 12 },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.6)' },
  divider: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,31,42,0.05)' },
  rowText: { flex: 1, color: G.ink, fontSize: 16, lineHeight: 22, fontFamily: fonts.regular },

  // Contact card
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: G.ink,
    marginTop: 16,
  },
  contactPressed: { opacity: 0.9 },
  contactIcon: { width: 40, height: 40, resizeMode: 'contain' },
  contactTitle: { color: '#FFFFFF', fontSize: 16, fontFamily: fonts.medium },
  contactSub: { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },

  categoryHead: { gap: 12, marginBottom: 16 },
  categoryIcon: { width: 40, height: 40, resizeMode: 'contain' },

  // Article
  timeline: { padding: 16, marginTop: 20 },
  step: { flexDirection: 'row', gap: 12 },
  rail: { width: 14, alignItems: 'center' },
  dotDone: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#2E9E5E', marginTop: 4 },
  dotCurrent: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: G.blue,
    backgroundColor: '#FFFFFF',
    marginTop: 3,
  },
  railLine: { flex: 1, width: 2, backgroundColor: '#2E9E5E', marginTop: 4, marginBottom: -4 },
  stepGap: { paddingBottom: 16 },
  stepTitle: { color: G.ink, fontSize: 16, lineHeight: 20, fontFamily: fonts.medium },
  stepTitleCurrent: { color: G.blue600 },
  stepSub: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2 },
  note: { padding: 16, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.55)', marginTop: 16 },
  noteText: { color: G.slate, fontSize: 14, lineHeight: 21, fontFamily: fonts.regular },
  helpful: { padding: 16, alignItems: 'center', marginTop: 16 },
  helpfulTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  helpfulText: { color: G.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, textAlign: 'center', marginTop: 4 },
  helpfulButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  helpfulButton: { minWidth: 64, minHeight: 44 },
  helpfulLink: { marginTop: 8, minHeight: 32, justifyContent: 'center' },

  // Contact form
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { color: G.slate, fontSize: 14, fontFamily: fonts.medium, marginTop: 20, marginBottom: 8 },
  input: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: G.ink,
    borderWidth: 1,
    borderColor: '#EDEFF4',
  },
  inputError: { borderColor: '#D9536A' },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  selectText: { flex: 1, color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  selectPlaceholder: { color: G.faint, fontFamily: fonts.regular },
  textarea: { height: 132, paddingTop: 14, paddingBottom: 14 },
  helper: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 8 },
  helperError: { color: '#D9536A' },

  sheetTitle: { color: G.ink, fontSize: 19, fontFamily: fonts.medium },
  sheetSub: { color: G.muted, fontSize: 14, fontFamily: fonts.regular, marginTop: 4, marginBottom: 8 },
  sheetList: { maxHeight: 420 },
  sheetRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: G.line,
  },
  sheetRowText: { flex: 1, color: G.ink, fontSize: 16, fontFamily: fonts.regular },
  sheetRowTextOn: { color: G.blue600, fontFamily: fonts.medium },
});
