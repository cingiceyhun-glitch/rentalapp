// The bookmarklet runs on the ad page the user already has open, so it sees
// exactly what they see: no bot checks, no logins. It takes a small snapshot of
// the page (see src/shared/snapshot/snapshot.js, also used by the Android app)
// and opens HomeHunt with it in the URL. HomeHunt parses it locally.
//
// It navigates the same tab instead of opening a pop-up, so it also works in
// Chrome on Android, where bookmarklets are launched from the address bar.
import snapshot from '../shared/snapshot/snapshot.js?raw';

export function bookmarkletCode(origin: string): string {
  const src =
    `(()=>{const p=${snapshot.trim()};` +
    `location.href=${JSON.stringify(origin)}+'/#/add?via=bookmarklet&url='+encodeURIComponent(location.href)+'&page='+encodeURIComponent(p)})()`;
  return `javascript:${encodeURIComponent(src)}`;
}
