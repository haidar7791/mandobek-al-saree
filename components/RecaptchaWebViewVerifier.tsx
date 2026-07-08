import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import WebView from "react-native-webview";
import { firebaseConfig } from "@/lib/firebase";

export interface RecaptchaWebViewVerifierHandle {
  /** Runs (or re-runs) the invisible reCAPTCHA challenge and resolves with a fresh token. */
  verify: () => Promise<string>;
}

/**
 * Replacement for `expo-firebase-recaptcha`'s `FirebaseRecaptchaVerifierModal`.
 *
 * That package pulls in `expo-firebase-core`, which breaks the Android Gradle
 * build (confirmed: every published version, including the latest 2.3.1,
 * still depends on `expo-firebase-core: ~6.0.0`). This component reproduces
 * the same mechanism — an invisible Google reCAPTCHA challenge bound to this
 * Firebase project's site key, run inside a WebView — without adding any
 * native module or Gradle dependency. It only needs `react-native-webview`,
 * which is pure JS/bridge and does not touch Gradle.
 *
 * How it works: a self-contained HTML page loads the Firebase Auth "compat"
 * SDK from a CDN, creates a real `firebase.auth.RecaptchaVerifier`, runs it,
 * and posts the resulting reCAPTCHA token back to React Native via
 * `postMessage`. On the RN side that token is wrapped in a plain
 * `{ type: "recaptcha", verify: () => Promise<string> }` object — exactly the
 * shape Firebase JS SDK's `ApplicationVerifier` interface expects — so it can
 * be passed directly to `linkWithPhoneNumber` / `signInWithPhoneNumber`.
 */
const RecaptchaWebViewVerifier = forwardRef<RecaptchaWebViewVerifierHandle>((_props, ref) => {
  const webviewRef = useRef<WebView>(null);
  const pendingRef = useRef<{ resolve: (token: string) => void; reject: (err: Error) => void } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const settlePending = (result: { ok: true; token: string } | { ok: false; error: Error }) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    if (result.ok) pending.resolve(result.token);
    else pending.reject(result.error);
  };

  useImperativeHandle(ref, () => ({
    verify: () =>
      new Promise<string>((resolve, reject) => {
        // Reject any still-unresolved previous attempt so it never hangs
        // forever (e.g. a rapid double-tap on "send code").
        settlePending({ ok: false, error: new Error("recaptcha-superseded") });
        pendingRef.current = { resolve, reject };
        timeoutRef.current = setTimeout(() => {
          settlePending({ ok: false, error: new Error("recaptcha-timeout") });
        }, 20000);
        // Force a fresh WebView load so we always get a brand-new,
        // single-use reCAPTCHA token per verification attempt.
        setReloadKey((k) => k + 1);
      }),
  }));

  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    let payload: { type: string; token?: string; message?: string };
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (payload.type === "verified" && payload.token) {
      settlePending({ ok: true, token: payload.token });
    } else if (payload.type === "error" || payload.type === "expired") {
      settlePending({ ok: false, error: new Error(payload.message || "recaptcha verification failed") });
    }
  };

  const html = buildRecaptchaHtml(firebaseConfig);

  return (
    <View style={styles.hiddenContainer} pointerEvents="none">
      <WebView
        key={reloadKey}
        ref={webviewRef}
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        onError={(e) => {
          settlePending({
            ok: false,
            error: new Error(e.nativeEvent.description || "webview load failed"),
          });
        }}
        style={styles.webview}
      />
    </View>
  );
});

RecaptchaWebViewVerifier.displayName = "RecaptchaWebViewVerifier";

function buildRecaptchaHtml(config: Record<string, string>): string {
  const configJson = JSON.stringify(config);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>html,body{margin:0;padding:0;background:transparent;}</style>
</head>
<body>
<div id="recaptcha-container"></div>
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
<script>
  function postToRN(msg) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
  }
  window.onerror = function (msg) { postToRN({ type: "error", message: String(msg) }); };

  try {
    firebase.initializeApp(${configJson});

    var verifier = new firebase.auth.RecaptchaVerifier("recaptcha-container", {
      size: "invisible",
      callback: function (token) { postToRN({ type: "verified", token: token }); },
      "expired-callback": function () { postToRN({ type: "expired" }); },
    });

    verifier.render()
      .then(function () { return verifier.verify(); })
      .then(function (token) { postToRN({ type: "verified", token: token }); })
      .catch(function (err) { postToRN({ type: "error", message: String((err && err.message) || err) }); });
  } catch (err) {
    postToRN({ type: "error", message: String((err && err.message) || err) });
  }
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  // The verifier is fully invisible — Google's reCAPTCHA "invisible" size
  // never renders a visible challenge UI unless the risk score requires it,
  // and we don't need to show anything for the happy path.
  hiddenContainer: { position: "absolute", width: 1, height: 1, opacity: 0, top: -1000 },
  webview: { width: 1, height: 1 },
});

export default RecaptchaWebViewVerifier;
