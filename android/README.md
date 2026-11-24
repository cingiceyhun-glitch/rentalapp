# "Add to HomeHunt" for Android

A tiny app that adds **Add to HomeHunt** to Android's Share menu. It opens the shared ad
inside the phone (where portals such as idealista let a real person through), reads it with
`src/shared/snapshot/snapshot.js` (the same script as the web app's bookmark button) and
opens the HomeHunt web app with the details filled in.

GitHub Actions builds it on every change (`.github/workflows/android.yml`) and commits the
result to `public/homehunt.apk`, so it is downloadable from the HomeHunt site at `/homehunt.apk`.

`homehunt.keystore` signs every build with the same key, so new versions install as updates.
It is committed on purpose: the app is installed by hand, not from a store. If you ever
publish to Google Play, create a new private key for that and keep it out of the repository.
