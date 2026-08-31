// Firebase 12.17.1 ships the public runtime entry points for these packages
// without a top-level declaration file. Re-export the matching package types
// so the app's direct imports remain type-safe.
declare module "firebase/storage" {
  export * from "@firebase/storage";
}

declare module "firebase/remote-config" {
  export * from "@firebase/remote-config";
}