package com.ontrackdevelopment.command.update;

import com.facebook.react.bridge.*;
import android.app.Activity;
import android.app.Dialog;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.CookieManager;
import android.view.ViewGroup;
import android.view.Window;
import java.util.concurrent.atomic.AtomicBoolean;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Scoped native administrator sessions for existing WHMCS addon routes only. */
public final class CommandAdminSessionModule extends ReactContextBaseJavaModule {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Map<String,java.net.CookieManager> jars = new HashMap<>();
    // In-memory WHMCS administrator session, scoped to the exact pairing key.
    private final Map<String,String> waBrowserCookies = new ConcurrentHashMap<>();
    private static final int MAX_RESPONSE = 2 * 1024 * 1024;
    public CommandAdminSessionModule(ReactApplicationContext ctx) { super(ctx); }
    @Override public String getName() { return "CommandAdminSession"; }

    static URI checked(String base, String directory, String target) throws Exception {
        URI root = new URI(base + "/");
        URI url = root.resolve(target);
        if (!directory.matches("[A-Za-z0-9_-]{2,64}") || !"https".equals(root.getScheme())
            || root.getHost() == null || root.getUserInfo() != null || root.getQuery() != null
            || root.getFragment() != null || (root.getPort() != -1 && root.getPort() != 443)
            || !root.getScheme().equals(url.getScheme()) || !root.getAuthority().equals(url.getAuthority())
            || url.getUserInfo() != null || url.getFragment() != null)
            throw new IllegalArgumentException("WHMCS HTTPS origin mismatch");
        String prefix = root.getPath();
        String path = url.getRawPath();
        if (path == null || !path.startsWith(prefix) || path.contains("%") || path.contains("..") || path.contains("\\"))
            throw new IllegalArgumentException("WHMCS route rejected");
        String relative = path.substring(prefix.length());
        boolean admin = relative.equals(directory + "/") || relative.matches(java.util.regex.Pattern.quote(directory) + "/(index|login|dologin|logout|twofa|supporttickets|addonmodules)\\.php");
        boolean module = relative.equals("modules/addons/whatsapp_notifications/ajax.php")
            || relative.equals("modules/addons/ai_support_agent/admin_snapshot.php");
        if (!admin && !module) throw new IllegalArgumentException("Unsupported WHMCS route");
        if (relative.equals(directory + "/addonmodules.php")) {
            String q = url.getQuery();
            int count = 0; boolean supported = false;
            if (q != null) for (String part : q.split("&")) {
                String[] pair = part.split("=",2);
                if (pair[0].equals("module")) {
                    count++;
                    supported = pair.length == 2 && (pair[1].equals("whatsapp_notifications") || pair[1].equals("ai_support_agent"));
                }
            }
            if (count != 1 || !supported) throw new IllegalArgumentException("Unsupported addon");
        }
        return url;
    }


    /**
     * Only the built-in WebView is used for administrator sign-in/2FA.
     * No new WHMCS server module, no Meta token and no administrator password in JS.
     * On success the existing native Inbox UI calls whatsapp_notifications/ajax.php.
     */
    @ReactMethod public void authorizeInWebView(String key, String base, String directory, Promise promise) {
        final URI inbox;
        try {
            inbox = checked(base,directory,directory + "/addonmodules.php?module=whatsapp_notifications&action=chat");
        } catch (Exception e) {
            promise.reject("INVALID_ROUTE","رابط WHMCS أو مجلد الإدارة غير صالح."); return;
        }
        final Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("NO_ACTIVITY","لا يمكن فتح تسجيل دخول WHMCS الآن."); return;
        }
        activity.runOnUiThread(() -> {
            final AtomicBoolean finished = new AtomicBoolean(false);
            final AtomicBoolean triedLanding = new AtomicBoolean(false);
            final Dialog dialog = new Dialog(activity);
            final WebView browser = new WebView(activity);
            browser.getSettings().setJavaScriptEnabled(true);
            browser.getSettings().setDomStorageEnabled(true);
            // Cookies stay within the Android app's WebView cookie store.
            CookieManager.getInstance().setAcceptCookie(true);
            browser.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    try {
                        URI next = new URI(request.getUrl().toString());
                        URI root = new URI(base + "/");
                        return !("https".equals(next.getScheme())
                            && root.getAuthority().equals(next.getAuthority())
                            && next.getRawPath() != null && next.getRawPath().startsWith(root.getRawPath()));
                    } catch (Exception e) { return true; }
                }
                @Override public void onPageFinished(WebView view, String url) {
                    if (finished.get()) return;
                    if (url.contains("/" + directory + "/addonmodules.php")
                        && url.contains("module=whatsapp_notifications")) {
                        view.evaluateJavascript(
                            "(function(){return typeof window.waCSRFToken==='string' && /^[a-f0-9]{32,128}$/i.test(window.waCSRFToken)})()",
                            result -> {
                                if (!"true".equals(result) || finished.get()) return;
                                String cookie = CookieManager.getInstance().getCookie(inbox.toString());
                                if (cookie == null || cookie.trim().isEmpty()) return;
                                if (finished.compareAndSet(false,true)) {
                                    waBrowserCookies.put(key,cookie);
                                    promise.resolve(true);
                                    dialog.dismiss();
                                    browser.destroy();
                                }
                            });
                    } else if (!triedLanding.get() &&
                        (url.contains("/" + directory + "/index.php") || url.endsWith("/" + directory + "/"))) {
                        // Some WHMCS installations redirect successful logins to their dashboard
                        // instead of returning to the requested Inbox. Try the Inbox only once.
                        view.evaluateJavascript(
                            "(function(){return !document.querySelector('input[type=password]') && " +
                            "!!document.querySelector('a[href*=logout],a[href*=addonmodules]')})()",
                            result -> {
                                if ("true".equals(result) && !finished.get()
                                    && triedLanding.compareAndSet(false,true)) view.loadUrl(inbox.toString());
                            });
                    }
                }
            });
            dialog.setContentView(browser,new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
            dialog.setOnCancelListener(d -> {
                if (finished.compareAndSet(false,true))
                    promise.reject("LOGIN_CANCELLED","تم إلغاء تسجيل الدخول إلى WHMCS.");
                browser.destroy();
            });
            dialog.show();
            Window window = dialog.getWindow();
            if (window != null) window.setLayout(
                ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT);
            browser.loadUrl(inbox.toString());
        });
    }

    private static String queryValue(String rawQuery, String expected) {
        if (rawQuery == null) return "";
        for (String item : rawQuery.split("&")) {
            String[] pair = item.split("=",2);
            if (pair.length == 2 && pair[0].equals(expected)) return pair[1];
        }
        return "";
    }

    @ReactMethod public void request(String key, String base, String directory, String target,
                                     String method, ReadableMap fields, ReadableMap headers, Promise promise) {
        // Snapshot React maps before moving to worker; no credential logging.
        final HashMap<String,Object> params = fields.toHashMap();
        final HashMap<String,Object> extraHeaders = headers.toHashMap();
        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                if (!method.equals("GET") && !method.equals("POST")) throw new IllegalArgumentException("Unsupported method");
                URI url = checked(base,directory,target);
                java.net.CookieManager jar = jars.get(key);
                if (jar == null) { jar = new java.net.CookieManager(null,CookiePolicy.ACCEPT_ORIGINAL_SERVER); jars.put(key,jar); }
                String currentMethod = method;
                StringBuilder form = new StringBuilder();
                for (Map.Entry<String,Object> field : params.entrySet()) {
                    if (form.length() > 0) form.append('&');
                    form.append(URLEncoder.encode(field.getKey(),"UTF-8")).append('=')
                        .append(URLEncoder.encode(String.valueOf(field.getValue()),"UTF-8"));
                }
                if (form.length() > 100000) throw new IllegalArgumentException("Request too large");
                for (int hop = 0; hop < 6; hop++) {
                    conn = (HttpURLConnection)url.toURL().openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(18000); conn.setReadTimeout(25000); conn.setUseCaches(false);
                    conn.setRequestMethod(currentMethod);
                    conn.setRequestProperty("Accept","application/json,text/html;q=0.9");
                    conn.setRequestProperty("User-Agent","WHMCS-Native-Admin/0.3.5");
                    conn.setRequestProperty("Cache-Control","no-cache");
                    conn.setRequestProperty("Referer",base+"/"+directory+"/index.php");
                    for (Map.Entry<String,List<String>> header : jar.get(url,Collections.emptyMap()).entrySet())
                        if (!header.getValue().isEmpty()) conn.setRequestProperty(header.getKey(),String.join("; ",header.getValue()));
                    // Use the cookies from a completed, same-origin WHMCS browser login.
                    // The native request still passes the original whitelist and same-origin checks.
                    String activeCookie = waBrowserCookies.get(key);
                    String relativeRoute = url.getRawPath().substring(new URI(base + "/").getRawPath().length());
                    boolean waRequest = relativeRoute.equals("modules/addons/whatsapp_notifications/ajax.php")
                        || (relativeRoute.equals(directory + "/addonmodules.php")
                            && "whatsapp_notifications".equals(queryValue(url.getRawQuery(),"module")));
                    if (waRequest && activeCookie != null && !activeCookie.isEmpty())
                        conn.setRequestProperty("Cookie",activeCookie);
                    for (Map.Entry<String,Object> header : extraHeaders.entrySet()) {
                        if (!Arrays.asList("X-WA-CSRF","X-AISA-ADMIN-TOKEN","X-Requested-With").contains(header.getKey()))
                            throw new IllegalArgumentException("Unsupported header");
                        if (hop == 0) conn.setRequestProperty(header.getKey(),String.valueOf(header.getValue()));
                    }
                    if (currentMethod.equals("POST")) {
                        conn.setRequestProperty("Content-Type","application/x-www-form-urlencoded; charset=UTF-8");
                        conn.setDoOutput(true);
                        byte[] body = form.toString().getBytes(StandardCharsets.UTF_8);
                        conn.setFixedLengthStreamingMode(body.length);
                        try (OutputStream out = conn.getOutputStream()) { out.write(body); }
                    }
                    int status = conn.getResponseCode();
                    jar.put(url,conn.getHeaderFields());
                    if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                        String location = conn.getHeaderField("Location");
                        if (location == null || ((status == 307 || status == 308) && currentMethod.equals("POST")))
                            throw new IOException("Unexpected WHMCS redirect; request not repeated");
                        url = checked(base,directory,url.resolve(location).toString());
                        currentMethod = "GET"; conn.disconnect(); conn = null; continue;
                    }
                    InputStream raw = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                    if (raw != null) try (InputStream in = raw) {
                        byte[] chunk = new byte[8192]; int n;
                        while ((n = in.read(chunk)) != -1) {
                            if (buffer.size() + n > MAX_RESPONSE) throw new IOException("WHMCS response too large");
                            buffer.write(chunk,0,n);
                        }
                    }
                    WritableMap result = Arguments.createMap();
                    result.putInt("status",status); result.putString("url",url.toString());
                    result.putString("body",buffer.toString("UTF-8"));
                    promise.resolve(result); return;
                }
                throw new IOException("Too many WHMCS redirects");
            } catch (Exception e) {
                promise.reject("ADMIN_NETWORK","تعذر الاتصال بجلسة إدارة WHMCS. تحقق من الرابط والاتصال.");
            } finally { if (conn != null) conn.disconnect(); }
        });
    }
    @ReactMethod public void resetAll(Promise promise) {
        executor.execute(() -> { for (java.net.CookieManager jar : jars.values()) jar.getCookieStore().removeAll();
            jars.clear(); waBrowserCookies.clear();
            getReactApplicationContext().runOnUiQueueThread(() ->
                CookieManager.getInstance().removeAllCookies(value -> {}));
            promise.resolve(null); });
    }
    @Override public void invalidate() { executor.shutdownNow(); jars.clear(); waBrowserCookies.clear(); super.invalidate(); }
}
