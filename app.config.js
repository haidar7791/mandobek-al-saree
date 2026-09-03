// Dynamic Expo config. Keep the complete app configuration here so Expo Doctor
// and EAS have a single source of truth.
//
// Prefer REACT_NATIVE_PACKAGER_HOSTNAME during development and fall back to
// REPLIT_DEV_DOMAIN. Both values are plain hostnames without a protocol.
const rawDomain =
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME ||
  process.env.REPLIT_DEV_DOMAIN ||
  "";

const replitDomain =
  rawDomain &&
  rawDomain.includes(".") &&
  !rawDomain.includes("127.0.0.1") &&
  !rawDomain.includes("localhost")
    ? rawDomain
    : "";

console.log("[app.config.js] REACT_NATIVE_PACKAGER_HOSTNAME =", process.env.REACT_NATIVE_PACKAGER_HOSTNAME);
console.log("[app.config.js] REPLIT_DEV_DOMAIN             =", process.env.REPLIT_DEV_DOMAIN);
console.log("[app.config.js] baking replitDomain =", replitDomain || "(empty — will use fallback)");

module.exports = {
  name: "فورس",
  slug: "sanad-app",
  version: "21",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "forus",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0D1421",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.haidar.forus",
    buildNumber: "1",
    infoPlist: {
      CFBundleDisplayName: "فورس",
      CFBundleName: "فورس",
      UIBackgroundModes: ["remote-notification"],
    },
  },
  android: {
    package: "com.haidar.forus",
    googleServicesFile: "./google-services.json",
    versionCode: 21,
    adaptiveIcon: {
      backgroundColor: "#0D1421",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
    },
    permissions: [
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.USE_BIOMETRIC",
      "android.permission.USE_FINGERPRINT",
      "android.permission.INTERNET",
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [
          {
            scheme: "https",
            host: "forus-backend-911663879269.europe-west1.run.app",
            pathPrefix: "/product",
          },
        ],
      },
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [
          {
            scheme: "https",
            host: "forus-backend-911663879269.europe-west1.run.app",
            pathPrefix: "/profile",
          },
        ],
      },
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [
          {
            scheme: "https",
            host: "forus-backend-911663879269.europe-west1.run.app",
            pathPrefix: "/user",
          },
        ],
      },
    ],
  },
  web: {
    favicon: "./assets/images/favicon.png",
    name: "فورس",
  },
  plugins: [
    [
      "expo-router",
      {
        origin: "https://mandobek-al-saree.firebaseapp.com/",
      },
    ],
    "@react-native-google-signin/google-signin",
    "expo-font",
    "expo-web-browser",
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
        color: "#0D1421",
        defaultChannel: "default",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "فورس - ForUs تحتاج إلى الوصول لصورك لرفع صورة الملف الشخصي.",
        cameraPermission: "فورس - ForUs تحتاج إلى الكاميرا لالتقاط صورة الملف الشخصي.",
        writeExternalStoragePermission: false,
      },
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission: "فورس - ForUs تحتاج إلى موقعك لعرض مزودي الخدمات القريبين.",
        locationWhenInUsePermission: "فورس - ForUs تحتاج إلى موقعك لعرض مزودي الخدمات القريبين.",
      },
    ],
    "expo-local-authentication",
    "expo-secure-store",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {
      origin: "https://mandobek-al-saree.firebaseapp.com/",
    },
    eas: {
      projectId: "1f2d5e60-adb9-45e4-9a08-d42a3de90285",
    },
    replitDomain,
  },
  owner: "haidar7791",
};
