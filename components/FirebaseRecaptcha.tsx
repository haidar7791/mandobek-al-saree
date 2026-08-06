/**
 * FirebaseRecaptcha.tsx
 *
 * A custom ApplicationVerifier for Firebase Phone Auth on React Native.
 * Because the Firebase JS SDK's built-in RecaptchaVerifier requires a DOM,
 * we render an invisible reCAPTCHA inside a hidden WebView that communicates
 * the token back via postMessage.
 *
 * On web (Platform.OS === 'web') we use Firebase's native RecaptchaVerifier
 * and this component is not needed.
 */

import React, {
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { type ApplicationVerifier } from "firebase/auth";
import { firebaseConfig } from "@/lib/firebase";

// ─── Public API ───────────────────────────────────────────────────────────────

export interface FirebaseRecaptchaHandle {
  /** Implements ApplicationVerifier — pass to signInWithPhoneNumber */
  readonly verifier: ApplicationVerifier;
}

// ─── Internal verifier class ──────────────────────────────────────────────────

class WebViewRecaptchaVerifier implements ApplicationVerifier {
  readonly type = "recaptcha";

  private _resolve: ((token: string) => void) | null = null;
  private _reject: ((err: Error) => void) | null = null;

  verify(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  _onToken(token: string) {
    if (this._resolve) {
      this._resolve(token);
      this._resolve = null;
      this._reject = null;
    }
  }

  _onError(message: string) {
    if (this._reject) {
      this._reject(new Error(message));
      this._resolve = null;
      this._reject = null;
    }
  }
}

// ─── HTML page for the invisible reCAPTCHA ────────────────────────────────────

function buildHtml(config: typeof firebaseConfig): string {
  const sdkVersion = "10.12.2";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <script src="https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-auth-compat.js"></script>
</head>
<body>
  <div id="recaptcha-container"></div>
  <script>
    try {
      var apps = firebase.apps;
      var app = apps.length > 0
        ? apps[0]
        : firebase.initializeApp(${JSON.stringify(config)});
      var auth = firebase.auth(app);
      auth.useDeviceLanguage();

      var verifier = new firebase.auth.RecaptchaVerifier(
        'recaptcha-container',
        {
          size: 'invisible',
          callback: function(token) {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({ type: 'token', token: token })
            );
          },
          'expired-callback': function() {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({ type: 'error', message: 'reCAPTCHA expired — please try again' })
            );
          }
        }
      );

      verifier.render().then(function() {
        return verifier.verify();
      }).then(function(token) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'token', token: token })
        );
      }).catch(function(err) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'error', message: err.message || 'reCAPTCHA failed' })
        );
      });
    } catch(e) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'error', message: e.message || 'init error' })
      );
    }
  </script>
</body>
</html>`;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Render this component (hidden) whenever you need phone auth on native.
 * Access the `verifier` via the forwarded ref and pass it to signInWithPhoneNumber.
 *
 * @example
 * const recaptchaRef = useRef<FirebaseRecaptchaHandle>(null);
 * ...
 * <FirebaseRecaptcha ref={recaptchaRef} />
 * ...
 * const confirmation = await signInWithPhoneNumber(
 *   auth, phoneNumber, recaptchaRef.current!.verifier
 * );
 */
const FirebaseRecaptcha = forwardRef<FirebaseRecaptchaHandle>((_, ref) => {
  const verifierRef = useRef(new WebViewRecaptchaVerifier());

  useImperativeHandle(ref, () => ({
    verifier: verifierRef.current,
  }));

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type: "token" | "error";
        token?: string;
        message?: string;
      };
      if (data.type === "token" && data.token) {
        verifierRef.current._onToken(data.token);
      } else if (data.type === "error") {
        verifierRef.current._onError(data.message ?? "reCAPTCHA error");
      }
    } catch {
      verifierRef.current._onError("Failed to parse reCAPTCHA response");
    }
  }, []);

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        style={styles.webview}
        source={{ html: buildHtml(firebaseConfig) }}
        onMessage={handleMessage}
        javaScriptEnabled
        // Don't let the WebView steal focus
        focusable={false}
        accessible={false}
      />
    </View>
  );
});

FirebaseRecaptcha.displayName = "FirebaseRecaptcha";

export default FirebaseRecaptcha;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
    pointerEvents: "none",
  },
  webview: { width: 1, height: 1 },
});
