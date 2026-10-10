// The bookmarklet runs on the ad page the user already has open, so it sees
// exactly what they see — no bot checks, no logins. It opens HomeHunt and hands
// over the page HTML via postMessage; HomeHunt parses it locally.
export const PAGE_MESSAGE = 'homehunt-page';
export const READY_MESSAGE = 'homehunt-ready';

export function bookmarkletCode(origin: string): string {
  const src = `(()=>{const A=${JSON.stringify(origin)};const u=location.href;` +
    `const w=open(A+'/#/add?via=bookmarklet&url='+encodeURIComponent(u),'_blank');` +
    `if(!w){alert('Please allow pop-ups for this site to add it to HomeHunt.');return}` +
    `const h=e=>{if(e.origin===A&&e.data===${JSON.stringify(READY_MESSAGE)}){` +
    `w.postMessage({type:${JSON.stringify(PAGE_MESSAGE)},url:u,html:document.documentElement.outerHTML},A);` +
    `removeEventListener('message',h)}};addEventListener('message',h)})()`;
  return `javascript:${encodeURIComponent(src)}`;
}
