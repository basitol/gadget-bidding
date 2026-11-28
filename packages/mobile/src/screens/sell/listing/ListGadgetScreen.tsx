import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, ScrollView, View, ActivityIndicator, StyleSheet } from 'react-native';
import { LISTING_CATEGORIES, isValidImei, maskIdentifier, profileByKey } from '@gadget-bidding/shared';
import { A, AuthButton, AuthShell } from '../../../components/auth/GlassAuthKit';
import { useAuthStore } from '../../../store';
import { DEFAULT_LISTING_CONFIG, listingService, type ListingConfig } from '../../../services/listing.service';
import { listingPauseService } from '../../../services/listingPause.service';
import type { Gadget } from '../../../types';
import { whenLabel } from '../onboarding/kit';
import {
  Draft,
  EMPTY_DRAFT,
  STEPS,
  STEP_NAMES,
  applyFound,
  buildPayload,
  clearDraft,
  draftFromGadget,
  firstOpenStep,
  hasProgress,
  loadDraft,
  normalizeIdentifier,
  saveDraft,
  stepDone,
} from './draft';
import { ScannerModal, scannerAvailable } from './ScannerModal';
import { ItemStep } from './steps/ItemStep';
import { ModelStep } from './steps/ModelStep';
import { SpecsStep } from './steps/SpecsStep';
import { ConditionStep } from './steps/ConditionStep';
import { RepairsStep } from './steps/RepairsStep';
import { PhotosStep } from './steps/PhotosStep';
import { AuctionStep } from './steps/AuctionStep';
import { ReviewStep } from './steps/ReviewStep';
import { SetDraft, errMsg, idWord, toast } from './steps/types';

/**
 * "List a gadget" (route 'CreateGadget'): 8 steps, saved on the phone as the seller goes.
 * With `gadget` (a listing our team sent back), it opens on the review with their note and saves with PUT.
 */
export const ListGadgetScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const editing = route.params?.gadget as (Gadget & Record<string, any>) | undefined;
  const user = useAuthStore(s => s.user);
  const initial = useRef<Draft>(editing ? draftFromGadget(editing) : EMPTY_DRAFT);
  const [d, setD] = useState<Draft>(initial.current);
  const [ready, setReady] = useState(!!editing);
  const [config, setConfig] = useState<ListingConfig>(DEFAULT_LISTING_CONFIG);
  const [backToReview, setBackToReview] = useState(false);
  const [checking, setChecking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState<Record<string, string>>({});
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const submitted = useRef(false);
  const latest = useRef(d);
  latest.current = d;

  const profile = profileByKey(d.profile);
  const step = d.step;

  const set: SetDraft = useCallback(
    patch => setD(prev => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) })),
    []
  );

  /* ---------- load ---------- */

  // New listings need an approved seller (editing stays open, as before).
  useEffect(() => {
    if (!editing && user && user.seller_kyb_status !== 'approved' && user.role !== 'admin') {
      navigation.replace(user.seller_kyb_status === 'not_started' ? 'SellerApply' : 'SellerStatus', { resume: true });
    }
  }, [editing, user, navigation]);

  // New listings paused (failed hub checks, or our team): explain why instead of letting them fill it in.
  // The draft prompt waits for this check so it never shows over the paused screen.
  const needsPauseCheck = !editing && user?.seller_kyb_status === 'approved';
  const [pauseChecked, setPauseChecked] = useState(!needsPauseCheck);
  useEffect(() => {
    if (!needsPauseCheck) return;
    let alive = true;
    listingPauseService
      .get()
      .then(p => {
        if (!alive) return;
        if (p.paused) navigation.replace('ListingsPaused');
        else setPauseChecked(true);
      })
      .catch(() => alive && setPauseChecked(true));
    return () => {
      alive = false;
    };
  }, [needsPauseCheck, navigation]);

  useEffect(() => {
    listingService.config().then(setConfig);
  }, []);

  // "Carry on with your draft?"
  useEffect(() => {
    if (!pauseChecked) return;
    if (editing || !user?.id) {
      setReady(true);
      return;
    }
    let alive = true;
    loadDraft(user.id).then(saved => {
      if (!alive) return;
      if (!saved || !hasProgress(saved)) {
        setReady(true);
        return;
      }
      const name = saved.model.trim() || LISTING_CATEGORIES.find(c => c.key === saved.category_key)?.label || 'Your listing';
      Alert.alert(
        'Carry on with your draft?',
        `${name} · step ${saved.step} of ${STEPS}${saved.saved_at ? `, saved ${whenLabel(saved.saved_at).replace(/^(Today|Yesterday)/, m => m.toLowerCase())}` : ''}.`,
        [
          {
            text: 'Start again',
            style: 'destructive',
            onPress: () => {
              clearDraft(user.id);
              setReady(true);
            },
          },
          {
            text: 'Carry on',
            style: 'cancel',
            onPress: () => {
              setD(saved);
              setReady(true);
            },
          },
        ],
        { cancelable: false }
      );
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pauseChecked]);

  // Saved as they go (new listings only).
  useEffect(() => {
    if (editing || !ready || !user?.id || !hasProgress(d)) return;
    const t = setTimeout(() => {
      if (!submitted.current) saveDraft(user.id, d);
    }, 400);
    return () => clearTimeout(t);
  }, [d, ready, editing, user?.id]);

  /* ---------- moving between steps ---------- */

  const goTo = (n: number) => {
    set({ step: n });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  /** Next step, or back to the review (via anything a change left unfinished). */
  const proceed = (nd: Draft) => {
    let target = nd.step + 1;
    if (backToReview) {
      const open = firstOpenStep(nd, config);
      target = nd.step === 1 && open > 2 ? 2 : open;
      if (target >= STEPS) setBackToReview(false);
    }
    setD({ ...nd, step: Math.min(target, STEPS) });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const next = () => {
    if (stepDone(d, step, config)) proceed(d);
  };

  const back = () => {
    if (backToReview && step !== STEPS) {
      setBackToReview(false);
      return goTo(STEPS);
    }
    // A listing sent back opens on the review: back from there leaves.
    if (step > 1 && !(editing && step === STEPS)) return goTo(step - 1);
    if (editing) {
      const changed = JSON.stringify({ ...d, step: 0 }) !== JSON.stringify({ ...initial.current, step: 0 });
      if (!changed) return navigation.goBack();
      Alert.alert('Leave without sending?', "Your changes to this listing won't be saved.", [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => navigation.goBack() },
      ]);
      return;
    }
    if (hasProgress(d)) toast('We saved your draft. Carry on any time.', 'info');
    navigation.goBack();
  };

  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      backRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  const edit = (n: number) => {
    setBackToReview(true);
    goTo(n);
  };

  /* ---------- step 2: the IMEI / serial ---------- */

  const runCheck = useCallback(
    async (raw?: string) => {
      const cur = latest.current;
      const p = profileByKey(cur.profile);
      if (!p || p.identifier === 'none') return;
      const id = normalizeIdentifier(raw ?? cur.identifier, p.identifier);
      if (!id || (p.identifier === 'imei' && !isValidImei(id))) return;
      setChecking(true);
      try {
        const r = await listingService.deviceCheck({ profile: p.key, identifier: id, ...(editing ? { gadget_id: editing.id } : {}) });
        set(prev => (normalizeIdentifier(prev.identifier, p.identifier) === id ? { check: r, checked: id, found_choice: null } : {}));
      } catch {
        // Can't reach the check right now: carry on; the hub matches the number at drop-off.
        set(prev =>
          normalizeIdentifier(prev.identifier, p.identifier) === id
            ? {
                check: { valid: true, message: null, masked: maskIdentifier(id), duplicate: false, lookup_available: false, found: null },
                checked: id,
                found_choice: null,
              }
            : {}
        );
      } finally {
        setChecking(false);
      }
    },
    [editing, set]
  );

  // Checked once they stop typing a full number.
  const typedId = profile && profile.identifier !== 'none' ? normalizeIdentifier(d.identifier, profile.identifier) : '';
  useEffect(() => {
    if (step !== 2 || !profile || !typedId || typedId === d.checked) return;
    const full = profile.identifier === 'imei' ? isValidImei(typedId) : typedId.length >= 8;
    if (!full) return;
    const t = setTimeout(() => runCheck(typedId), 700);
    return () => clearTimeout(t);
  }, [step, typedId, d.checked, profile, runCheck]);

  // Pressing Continue before the auto-check ran: check, then move on if that settles it.
  const advanceAfterCheck = useRef(false);
  useEffect(() => {
    if (!advanceAfterCheck.current || checking || step !== 2) return;
    advanceAfterCheck.current = false;
    if (stepDone(d, 2, config)) proceed(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, d.checked]);

  const onFound = (yes: boolean) => {
    if (!profile || !d.check?.found) return;
    proceed({ ...d, found_choice: yes ? 'yes' : 'no', ...applyFound(d, profile, d.check.found, yes) });
  };

  const onScanned = (value: string) => {
    setScanning(false);
    set({ identifier: value, identifier_skipped: false, found_choice: null });
    runCheck(value);
  };

  /* ---------- submit ---------- */

  const submit = async () => {
    const open = firstOpenStep(d, config);
    if (open < STEPS) {
      toast('Finish this step first, then come back to submit.');
      edit(open);
      return;
    }
    if (!attest || busy) return;
    setBusy(true);
    try {
      const payload = buildPayload(d);
      const saved = editing ? await listingService.update(editing.id, payload) : await listingService.create(payload);
      submitted.current = true;
      if (!editing && user?.id) await clearDraft(user.id);
      navigation.replace('ListingSubmitted', { gadgetId: saved?.id ?? editing?.id, idWord: idWord(profile), edited: !!editing });
    } catch (e) {
      toast(errMsg(e));
      // Paused while they were filling it in: the draft stays saved; show why.
      if (!editing) {
        listingPauseService
          .get()
          .then(p => p.paused && navigation.replace('ListingsPaused'))
          .catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  };

  /* ---------- footer ---------- */

  const done = stepDone(d, step, config);
  const footer = (() => {
    if (!ready) return null;
    if (step === 2 && profile && profile.identifier !== 'none') {
      const result = d.check && d.checked === typedId && typedId ? d.check : null;
      // "Yes, that's it" is the action until they answer.
      if (result?.valid && result.found && !d.found_choice) return null;
      const canCheck = !!typedId && typedId !== d.checked && (profile.identifier !== 'imei' || isValidImei(typedId));
      return (
        <AuthButton
          label="Continue"
          onPress={
            done
              ? next
              : () => {
                  advanceAfterCheck.current = true;
                  runCheck();
                }
          }
          disabled={checking || (!done && !canCheck)}
          busy={checking}
        />
      );
    }
    if (step === STEPS) {
      return <AuthButton label="Submit for review" onPress={submit} disabled={!attest} busy={busy} />;
    }
    return <AuthButton label="Continue" onPress={next} disabled={!done || (step === 6 && Object.keys(uploading).length > 0)} />;
  })();

  const eyebrow = `Step ${step} of ${STEPS} · ${STEP_NAMES[step - 1]}`;
  const props = { d, set, profile, config, eyebrow };

  return (
    <>
      <AuthShell title="List a gadget" onBack={back} progress={{ step, of: STEPS }} footer={footer} scrollRef={scrollRef}>
        {!ready ? (
          <View style={s.center}>
            <ActivityIndicator color={A.blue} />
          </View>
        ) : step === 1 ? (
          <ItemStep
            {...props}
            onScan={() => {
              if (!stepDone(d, 1, config)) return;
              proceed(d);
              if (scannerAvailable) setScanning(true);
            }}
          />
        ) : step === 2 ? (
          <ModelStep
            {...props}
            checking={checking}
            onCheck={() => runCheck()}
            onScan={() => setScanning(true)}
            onFound={onFound}
            onSkip={() => proceed({ ...d, identifier: '', identifier_skipped: true })}
          />
        ) : step === 3 ? (
          <SpecsStep {...props} />
        ) : step === 4 ? (
          <ConditionStep {...props} />
        ) : step === 5 ? (
          <RepairsStep {...props} />
        ) : step === 6 ? (
          <PhotosStep {...props} uploading={uploading} setUploading={setUploading} />
        ) : step === 7 ? (
          <AuctionStep {...props} />
        ) : (
          <ReviewStep
            {...props}
            teamNote={editing ? editing.rejection_reason || editing.admin_notes || null : null}
            attest={attest}
            onAttest={() => setAttest(a => !a)}
            onEdit={edit}
          />
        )}
      </AuthShell>
      {profile && profile.identifier !== 'none' ? (
        <ScannerModal visible={scanning} kind={profile.identifier} onScanned={onScanned} onClose={() => setScanning(false)} />
      ) : null}
    </>
  );
};

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
});
