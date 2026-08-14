/**
 * FirebaseRecaptcha.tsx
 *
 * A custom ApplicationVerifier for Firebase Phone Auth on React Native.
 * Because the Firebase JS SDK's built-in RecaptchaVerifier requires a DOM,
 * we render an invisible reCAPTCHA inside a hidden WebView that communicates
 * the token back via postMessage.
 *
 * Root-cause fix (v2):
 *   The WebView auto-fires reCAPTCHA on load and posts the token immediately.
 *   Previously, _resolve was still null at that moment so the token was silently
 *   dropped, leaving every subsequent verify() Promise hanging forever.
 *   Now we cache the token (or error) so verify() can return it instantly, and
 *   we reload the WebView whenever a fresh token is needed (e.g. resend).
 *
 * On web (Platform.OS === 'web') use Firebase's native RecaptchaVerifier instead.
 */

import React, {
  useRef,
  useState,
  useEffect,
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

/**
 * Firebase's internal phone-auth flow uses this private method when it needs
 * to reset a reCAPTCHA after a failed attempt. The public ApplicationVerifier
 * type does not expose it, but the Web SDK expects it to exist at runtime.
 */
export function getPhoneAuthErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";

  switch (code) {
    case "auth/invalid-phone-number":
      return "رقم الهاتف غير صحيح، يرجى التحقق منه والمحاولة مجدداً";
    case "auth/too-many-requests":
      return "تم تجاوز عدد المحاولات المسموح، يرجى الانتظار والمحاولة لاحقاً";
    case "auth/quota-exceeded":
      return "تم تجاوز حد إرسال الرسائل مؤقتاً، يرجى المحاولة لاحقاً";
    case "auth/captcha-check-failed":
    case "auth/missing-recaptcha-token":
      return "تعذّر إكمال التحقق الأمني، يرجى المحاولة مجدداً";
    case "auth/network-request-failed":
      return "تعذّر الاتصال بالخادم، تحقق من الإنترنت وأعد المحاولة";
    case "auth/operation-not-allowed":
      return "تسجيل الدخول برقم الهاتف غير مفعّل حالياً";
    case "auth/phone-number-already-exists":
      return "رقم الهاتف مستخدم مسبقاً";
    default: {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("verifier") || message.includes("_reset")) {
        return "تعذّر تجهيز التحقق الأمني، أعد المحاولة";
      }
      return message || "تعذّر إرسال رمز التحقق، يرجى المحاولة مجدداً";
    }
  }
}

// ─── Internal verifier class ──────────────────────────────────────────────────

class WebViewRecaptchaVerifier implements ApplicationVerifier {
  readonly type = "recaptcha";

  // Pending verify() callbacks
  private _resolve: ((token: string) => void) | null = null;
  private _reject: ((err: Error) => void) | null = null;

  // Cache for tokens/errors that arrive before verify() is called
  private _cachedToken: string | null = null;
  private _cachedError: string | null = null;

  /**
   * Called by the component when it needs to reload the WebView to
   * generate a new reCAPTCHA token (e.g. resend scenario).
   */
  _onNeedRefresh: (() => void) | null = null;

  verify(): Promise<string> {
    console.log("[RecaptchaVerifier] verify() called");

    // ── Case 1: token already arrived before verify() was called ──
    if (this._cachedToken) {
      const token = this._cachedToken;
      this._cachedToken = null;
      console.log("[RecaptchaVerifier] returning cached token ✓");
      return Promise.resolve(token);
    }

    // ── Case 2: error already arrived before verify() was called ──
    if (this._cachedError) {
      const msg = this._cachedError;
      this._cachedError = null;
      console.warn("[RecaptchaVerifier] returning cached error:", msg);
      return Promise.reject(new Error(msg));
    }

    // ── Case 3: no token yet — reload WebView to trigger a fresh one ──
    console.log("[RecaptchaVerifier] no cached token; requesting WebView refresh");
    this._onNeedRefresh?.();

    return new Promise<string>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  _onToken(token: string) {
    console.log("[RecaptchaVerifier] _onToken received, length:", token.length);
    if (this._resolve) {
      // verify() is already waiting — resolve it immediately
      this._resolve(token);
      this._resolve = null;
      this._reject = null;
    } else {
      // verify() hasn't been called yet — cache for when it is
      console.log("[RecaptchaVerifier] caching early token for later use");
      this._cachedToken = token;
    }
  }

  _onError(message: string) {
    console.warn("[RecaptchaVerifier] _onError:", message);
    if (this._reject) {
      this._reject(new Error(message));
      this._resolve = null;
      this._reject = null;
    } else {
      this._cachedError = message;
    }
  }

  /** Flush all pending state (call before reloading WebView) */
  reset() {
    this._resolve = null;
    this._reject = null;
    this._cachedToken = null;
    this._cachedError = null;
  }

  /**
   * Firebase Auth calls ApplicationVerifier._reset() internally after an
   * unsuccessful phone-auth attempt. Keep this compatibility method in sync
   * with the public reset implementation instead of letting that call crash.
   */
  _reset() {
    this.reset();
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
    function postMsg(obj) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch(e) {}
    }
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
            postMsg({ type: 'token', token: token });
          },
          'expired-callback': function() {
            postMsg({ type: 'error', message: 'reCAPTCHA expired — please try again' });
          }
        }
      );

      // render() فقط — التوكن يصل عبر callback أعلاه، لا عبر verify()
      // هذا يتجنب أخطاء "Failed to initialize reCAPTCHA Enterprise config"
      // التي تُفشل سلسلة verify() لكن لا تمنع callback من الاستجابة
      verifier.render().catch(function(err) {
        var msg = (err && err.message) ? err.message : String(err);
        // أخطاء Enterprise تحذيرية فقط وليست فادحة — تجاهلها
        if (msg.indexOf('Enterprise') !== -1 || msg.indexOf('enterprise') !== -1) {
          console.warn('[reCAPTCHA] Enterprise init warning (ignored):', msg);
          return;
        }
        postMsg({ type: 'error', message: msg });
      });
    } catch(e) {
      postMsg({ type: 'error', message: e.message || 'init error' });
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
  // Incrementing this key forces the WebView to fully remount and re-fire reCAPTCHA
  const [webviewKey, setWebviewKey] = useState(0);

  // Wire the refresh callback into the verifier
  useEffect(() => {
    const v = verifierRef.current;
    v._onNeedRefresh = () => {
      console.log("[FirebaseRecaptcha] remounting WebView for fresh token");
      // إعادة تعيين State فقط — لا استدعاء لأي دالة reset()
      setWebviewKey((k) => k + 1);
    };
    return () => {
      v._onNeedRefresh = null;
    };
  }, []);

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
        key={webviewKey}
        style={styles.webview}
        source={{ html: buildHtml(firebaseConfig) }}
        onMessage={handleMessage}
        javaScriptEnabled
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
