package app.homehunt.share;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URLEncoder;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Share → "Add to HomeHunt". Opens the shared ad inside the phone (where portals
 * like idealista let a real person through), reads it with the same snapshot
 * script as the web app's bookmark button, and hands the snapshot to the HomeHunt
 * web app, which fills in the new home.
 */
public class ShareActivity extends Activity {

    private static final Pattern URL = Pattern.compile("https?://[^\\s<>\"']+");
    /** Wait after a page finishes loading, so galleries and prices rendered by scripts are there. */
    private static final long SETTLE_MS = 1500;
    private static final long SLOW_MS = 20000;
    private static final String CHECK = "__HOMEHUNT_CHECK__";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView web;
    private TextView status;
    private String adUrl;
    private String snapshotJs;
    private boolean done;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        adUrl = findUrl(getIntent());
        if (adUrl == null) {
            Toast.makeText(this, "No link found in what was shared.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        try {
            snapshotJs = readAsset("snapshot.js").trim();
        } catch (Exception e) {
            openHomeHunt(null);
            return;
        }
        buildUi();
        web.loadUrl(adUrl);
        handler.postDelayed(() -> {
            if (!done) status.setText("This is taking a while… You can wait, or tap \"Save link only\".");
        }, SLOW_MS);
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(Color.rgb(15, 118, 110));
        int pad = dp(12);
        bar.setPadding(pad, pad + dp(24), pad, pad);

        status = new TextView(this);
        status.setText("Reading the ad…");
        status.setTextColor(Color.WHITE);
        status.setTextSize(15);
        status.setTypeface(Typeface.DEFAULT_BOLD);
        bar.addView(status, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

        Button linkOnly = new Button(this);
        linkOnly.setText("Save link only");
        linkOnly.setAllCaps(false);
        linkOnly.setOnClickListener(v -> openHomeHunt(null));
        bar.addView(linkOnly);
        root.addView(bar);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        // Look like regular Chrome rather than an embedded browser.
        s.setUserAgentString(s.getUserAgentString().replace("; wv", "").replaceAll("Version/[\\d.]+ ", ""));
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return !("http".equals(scheme) || "https".equals(scheme));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                handler.postDelayed(ShareActivity.this::tryRead, SETTLE_MS);
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
    }

    private void tryRead() {
        if (done || web == null) return;
        String js = "(function(){var h=document.documentElement.outerHTML;"
                + "if(/captcha-delivery\\.com|cf-chl-|challenge-platform/.test(h)&&h.length<300000)return '" + CHECK + "';"
                + "return " + snapshotJs + ";})()";
        web.evaluateJavascript(js, value -> {
            if (done) return;
            String page = decodeJsString(value);
            if (page == null || page.isEmpty()) return; // page still loading; next onPageFinished retries
            if (CHECK.equals(page)) {
                // A bot check: let the person solve it; the ad then loads and we read it.
                status.setText("Please complete the check below…");
                web.setVisibility(View.VISIBLE);
                return;
            }
            openHomeHunt(page);
        });
    }

    private void openHomeHunt(String page) {
        if (done) return;
        done = true;
        String current = web != null ? web.getUrl() : null;
        String url = current != null && current.startsWith("http") ? current : adUrl;
        StringBuilder target = new StringBuilder(BuildConfig.APP_URL).append("/#/add?");
        if (page != null) {
            target.append("via=bookmarklet&url=").append(encode(url)).append("&page=").append(encode(page));
        } else {
            target.append("via=share&url=").append(encode(adUrl));
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(target.toString())));
        } catch (Exception e) {
            Toast.makeText(this, "Could not open HomeHunt: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
        finish();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private static String findUrl(Intent intent) {
        if (intent == null) return null;
        for (String extra : new String[] {Intent.EXTRA_TEXT, Intent.EXTRA_SUBJECT}) {
            CharSequence text = intent.getCharSequenceExtra(extra);
            if (text == null) continue;
            Matcher m = URL.matcher(text);
            if (m.find()) return m.group().replaceAll("[).,;!?]+$", "");
        }
        return null;
    }

    /** evaluateJavascript hands back a JSON value; for a string, "\"…\"". */
    private static String decodeJsString(String json) {
        if (json == null || json.equals("null")) return null;
        try {
            return new JSONArray("[" + json + "]").optString(0, null);
        } catch (Exception e) {
            return null;
        }
    }

    private static String encode(String s) {
        try {
            return URLEncoder.encode(s, "UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    private String readAsset(String name) throws Exception {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
