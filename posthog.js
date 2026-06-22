// posthog.js
// PostHog frontend analytics + session replay, shared across every page of the portfolio.
//
// To add analytics to any new page, put this one line in its <head>:
//     <script src="/posthog.js"></script>
//
// SETUP: replace the placeholder key below with your PostHog Project API key (starts with
// phc_). It is write-only and safe to live in public client code. The key only needs to be
// set here, in this one file, and every page that includes it is covered.
//
// With defaults '2026-01-30' and session replay enabled in your PostHog project, this turns
// on pageviews, autocapture (clicks), and session recording automatically. US Cloud host.

!function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init os ds Ie us vs ss ls capture calculateEventProperties register register_once register_for_session unregister unregister_for_session ws getFeatureFlag getFeatureFlagPayload getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty bs ps createPersonProfile setInternalOrTestUser ys es $s opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing cs debug M gs getPageViewId captureTraceFeedback captureTraceMetric Qr".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

posthog.init('phc_REPLACE_WITH_YOUR_PROJECT_KEY', {
    api_host: 'https://us.i.posthog.com',
    defaults: '2026-01-30',
});
