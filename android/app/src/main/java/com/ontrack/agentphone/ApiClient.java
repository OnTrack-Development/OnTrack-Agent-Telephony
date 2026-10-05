package com.ontrack.agentphone;

import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class ApiClient {
    private ApiClient() {}

    static JSONObject post(String baseUrl, String path, JSONObject body, String token) throws Exception {
        return request("POST", baseUrl, path, body, token);
    }

    static JSONObject get(String baseUrl, String path, String token) throws Exception {
        return request("GET", baseUrl, path, null, token);
    }

    private static JSONObject request(String method, String baseUrl, String path, JSONObject body, String token) throws Exception {
        String base = baseUrl == null ? "" : baseUrl.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        if (!base.startsWith("https://")) throw new IllegalArgumentException("Server must use HTTPS");

        HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(10000);
        c.setReadTimeout(15000);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        if (token != null && !token.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + token);

        if (body != null) {
            c.setDoOutput(true);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = c.getOutputStream()) { out.write(bytes); }
        }

        int code = c.getResponseCode();
        InputStream stream = code >= 200 && code < 400 ? c.getInputStream() : c.getErrorStream();
        StringBuilder text = new StringBuilder();
        if (stream != null) {
            try (BufferedReader br = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) text.append(line);
            }
        }
        JSONObject json = text.length() == 0 ? new JSONObject() : new JSONObject(text.toString());
        if (code < 200 || code >= 300) {
            throw new RuntimeException(json.optString("error", "HTTP " + code));
        }
        return json;
    }
}
