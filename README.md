# HomeHunt

Keep track of every home you're considering — to rent or to buy — in one place, instead of
browser tabs, notes and spreadsheets.

Paste the link of an ad and HomeHunt reads the price, photos, size, address and agent details.
Then you add the viewing date, your rating, your own photos and notes (typed or dictated).

## What works today (v0.1)

- **Add a home from a link**: the server reads Open Graph tags, schema.org JSON-LD and Portuguese
  ad conventions (`T2`, `m²`, `1.500 €/mês`, "para arrendar"). It has photo-gallery rules for
  idealista, Imovirtual, Casa Sapo and SUPERCASA. You can also enter a home by hand.
- **Faster ways to add a home**
  - Android: install the app, then use **Share → HomeHunt** from any app or browser (Web Share Target).
  - iPhone: an iOS Shortcut in the Share sheet. The steps are under *More*.
  - Computer: a **bookmark button** that reads the ad straight from the page you have open.
    It still works on sites that block automatic reading, like idealista.
- **Photo gallery** of the ad's photos plus **your own photos** from the camera, stored on the device.
- **Call / WhatsApp / SMS / email the agent** with one tap and a pre-filled message.
- **Status** (interested → contacted → viewing booked → viewed → applied), **star rating**,
  **favourites** and a **manual ranking** you reorder with ▲▼.
- **Viewings** agenda, with **Add to calendar** (.ics with a 1-hour reminder).
- **Voice notes**: tap *Speak* and talk while you walk around the flat (Web Speech API; language set in *More*).
- **Search** across title, address, agent, notes; filters and sorts by price, rating or viewing date.
- **Export to Excel (CSV)**, plus a full **backup/restore** (with photos) so you can move between devices.
- Installable **PWA** that works offline. Your data stays on your device (IndexedDB).

## Running it

```bash
npm install
npm run dev        # http://localhost:5173 (with the /api/extract endpoint)
npm test           # parser + CSV tests
npm run build && npm start   # production server on $PORT (default 3000)
```

Requires Node 22.18+ (the server runs TypeScript directly).

## Putting it online (Render, free)

`render.yaml` describes the whole setup.

1. Sign in at <https://dashboard.render.com> with your GitHub account.
2. **New → Blueprint**, then give Render access to the `rentalapp` repository and select it.
3. Click **Apply**. The first build takes a few minutes, then you get an address like
   `https://homehunt-xxxx.onrender.com`. Every push to the branch redeploys automatically.

On the free plan the server sleeps after about 15 minutes idle. The app itself still opens
instantly (it's cached on your phone), but the first "Get details" after a break can take
around 50 seconds.

## Turning on sync between devices (Supabase, free)

Homes, notes, ratings and your own photos sync through a free Supabase project.
Without it, each device keeps its own list.

1. Create a free account at <https://supabase.com> and a **New project** (region: *West EU*
   is closest to Portugal). Save the database password somewhere; HomeHunt doesn't need it.
2. In the project, open **SQL Editor → New query**, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Open **Project Settings → API** (or **Connect**). Copy the **Project URL** and the
   **anon / public** key.
4. In Render, open the `homehunt` service → **Environment** → add `SUPABASE_URL` and
   `SUPABASE_ANON_KEY` with those two values → **Save, rebuild and deploy**.
5. In HomeHunt, go to **More → Sync across devices → Create account**. Confirm the email
   Supabase sends, then **Sign in** on each device with the same email and password.
   The homes already on a device are uploaded the first time it signs in.

Optional, once your devices are signed in: in Supabase, open **Authentication → Sign In / Providers**
and turn off **Allow new users to sign up**, so nobody else can create an account on your HomeHunt.

How it works: each device keeps working offline from its own copy, and syncs when the app opens,
comes back online, a couple of seconds after each change, and every minute while it's open. If the
same home was edited on two devices, the most recent edit wins. The logic is in `src/sync/engine.ts`
and tested in `test/sync.test.ts`.

### Install on Android

Open the address in **Chrome**, then go to **⋮ → Add to Home screen → Install**. Once installed,
**HomeHunt** appears in the Share menu of the idealista app, Imovirtual, Chrome and other apps.

## Project layout

```
src/shared/parse.ts   ad-page parser (runs on both server and browser)
server/api.ts         /api/extract – fetches an ad (with SSRF guard) and parses it
server/index.ts       production static + API server
src/db.ts             IndexedDB (Dexie) storage
src/pages/            Homes list, Add, Detail, Edit, Viewings, More
public/               PWA manifest (incl. share target), service worker, icons
```

## Roadmap

Ideas from the original brainstorm, roughly in order:

1. **Sharing with a partner** or flatmates (comments and votes on each home). Sync between
   your own devices is done.
2. **Native app wrappers** (Capacitor) for App Store / Play Store, with a real iOS share extension.
   Also a **browser extension** to replace the bookmark button.
3. **Ad-change tracking**: re-check saved ads and flag price drops or removed listings.
4. **Map view** of all saved homes, plus commute times to work or school.
5. **Comparison table** of 2–4 homes side by side.
6. **AI help**: summarise a long ad, pull out the important lines (deposit, fiador, energy
   certificate), suggest questions for the viewing, turn dictated notes into pros and cons, and
   **suggest similar properties**.
7. **Floor plan & furniture fitting**: trace or upload the plan and drag furniture to scale.
8. **Search across portals** (the "Trivago for homes" vision). This needs data partnerships or
   official feeds: idealista has an API program, and many agencies publish XML feeds. Scraping
   portals at scale breaks their terms, so this step is a business and partnership question
   more than a coding one.
