import React, { useEffect } from 'react';
import { View, ScrollView, StyleSheet, BackHandler, ImageSourcePropType } from 'react-native';
import { AuthButton, TextLink } from '../../../components/auth/GlassAuthKit';
import { GlassScreen } from '../../../components/glass';
import { Hero, Timeline } from '../onboarding/kit';

const CAMERA = require('../../../../assets/icons/camera.png') as ImageSourcePropType;

/** After "Submit for review": what happens next. No back — the listing is with our team. */
export const ListingSubmittedScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const idWord: string = route.params?.idWord ?? 'IMEI';

  const home = () => navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Home' } }] });

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      home();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GlassScreen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Hero
          icon={CAMERA}
          title="Sent for review"
          sub="Our team checks every listing before it goes live. This usually takes under 2 hours."
        />
        <Timeline
          steps={[
            { title: 'Submitted', sub: 'Just now', state: 'done' },
            { title: 'Review', sub: `Photos, details and ${idWord}`, state: 'current' },
            { title: 'Live', sub: "We'll notify you when bidding starts", state: 'todo' },
          ]}
        />
      </ScrollView>
      <View style={s.footer}>
        <AuthButton label="Back to seller home" onPress={home} />
        <TextLink label="List another gadget" onPress={() => navigation.replace('CreateGadget')} style={s.another} muted />
      </View>
    </GlassScreen>
  );
};

const s = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  another: { alignSelf: 'center', paddingVertical: 14 },
});
