package com.ontrackdevelopment.command.update;

import com.facebook.react.bridge.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** In-memory, per-account cookie jars. No WebView, browser cookies or global CookieHandler. */
public final class CommandAdminSessionModule extends ReactContextBaseJavaModule {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Map<String,CookieManager> jars = new HashMap<>();
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
                CookieManager jar = jars.get(key);
                if (jar == null) { jar = new CookieManager(null,CookiePolicy.ACCEPT_ORIGINAL_SERVER); jars.put(key,jar); }
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
        executor.execute(() -> { for (CookieManager jar : jars.values()) jar.getCookieStore().removeAll(); jars.clear(); promise.resolve(null); });
    }
    @Override public void invalidate() { executor.shutdownNow(); jars.clear(); super.invalidate(); }
}
