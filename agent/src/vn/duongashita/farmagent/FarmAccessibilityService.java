package vn.duongashita.farmagent;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Bundle;
import android.provider.Settings;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Dich vu Tro nang (Accessibility) cua Farm Agent — nen tang tu dong hoa
 * thao tac man hinh: cham (tap), vuot (swipe), nhap chu (input_text), phim
 * dieu huong (key).
 *
 * Nguoi dung phai tu bat dich vu nay mot lan trong Cai dat > Tro nang cua
 * dien thoai (Android khong cho app tu bat). Khi chua bat, cac lenh thao tac
 * tra loi loi "no_accessibility".
 *
 * Cac ham thao tac tra ve null neu thanh cong, nguoc lai tra ve ma loi
 * (no_focus, gesture_cancelled, key_not_supported, ...).
 */
public class FarmAccessibilityService extends AccessibilityService {

    private static volatile FarmAccessibilityService instance;

    public static FarmAccessibilityService instance() {
        return instance;
    }

    public static boolean isRunning() {
        return instance != null;
    }

    /** Kiem tra ten dich vu co nam trong danh sach tro nang dang bat cua may khong. */
    public static boolean isEnabledInSettings(Context c) {
        try {
            String enabled = Settings.Secure.getString(
                    c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            if (enabled == null) return false;
            ComponentName me = new ComponentName(c, FarmAccessibilityService.class);
            String flat = me.flattenToString();
            String shortFlat = c.getPackageName() + "/.FarmAccessibilityService";
            for (String part : enabled.split(":")) {
                if (part.equalsIgnoreCase(flat) || part.equalsIgnoreCase(shortFlat)) return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // Khong theo doi su kien — chi thao tac khi co lenh tu server.
    }

    @Override
    public void onInterrupt() {
    }

    // ---------------- Thao tac ----------------

    public String tap(int x, int y) {
        Path p = new Path();
        p.moveTo(x, y);
        GestureDescription g = new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(p, 0, 60))
                .build();
        return dispatch(g);
    }

    public String swipe(int x1, int y1, int x2, int y2, long durationMs) {
        if (durationMs <= 0) durationMs = 300;
        if (durationMs > 10000) durationMs = 10000;
        Path p = new Path();
        p.moveTo(x1, y1);
        p.lineTo(x2, y2);
        GestureDescription g = new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(p, 0, durationMs))
                .build();
        return dispatch(g);
    }

    private String dispatch(GestureDescription g) {
        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicBoolean cancelled = new AtomicBoolean(false);
        boolean started;
        try {
            started = dispatchGesture(g, new GestureResultCallback() {
                @Override
                public void onCompleted(GestureDescription gd) {
                    latch.countDown();
                }

                @Override
                public void onCancelled(GestureDescription gd) {
                    cancelled.set(true);
                    latch.countDown();
                }
            }, null);
        } catch (Exception e) {
            return "gesture_failed";
        }
        if (!started) return "gesture_failed";
        try {
            latch.await(3, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            return "interrupted";
        }
        if (cancelled.get()) return "gesture_cancelled";
        return null;
    }

    /** Go chu vao o nhap dang duoc focus. Tra ve "no_focus" neu khong co o nhap nao. */
    public String inputText(String text) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return "no_focus";
        AccessibilityNodeInfo target = null;
        try {
            target = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        } catch (Exception ignored) {
        }
        if (target == null || !target.isEditable()) {
            AccessibilityNodeInfo alt = findFocusedEditable(root);
            if (alt != null) target = alt;
        }
        if (target == null || !target.isEditable()) return "no_focus";
        Bundle b = new Bundle();
        b.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                text == null ? "" : text);
        boolean ok = false;
        try {
            ok = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b);
            if (!ok) {
                target.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
                ok = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b);
            }
        } catch (Exception e) {
            return "set_text_failed";
        }
        return ok ? null : "set_text_failed";
    }

    private AccessibilityNodeInfo findFocusedEditable(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (node.isFocused() && node.isEditable()) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            AccessibilityNodeInfo r = findFocusedEditable(child);
            if (r != null) return r;
        }
        return null;
    }

    // ---------------- Doc cay giao dien (Giai doan 3) ----------------

    public static final int DUMP_CAP = 500;

    /** Ket qua tim node theo chu (dung cho tap_text / wait_text). */
    public static class TextHit {
        public String text = "";
        public int left, top, right, bottom;
    }

    /**
     * Gom toan bo node cua cua so dang hoat dong thanh danh sach phang,
     * moi node: {text, desc, className, bounds:[l,t,r,b], clickable}.
     * Toi da DUMP_CAP node (duyet theo chieu sau, tu goc).
     * Tra ve null neu xong, nguoc lai tra ma loi (no_root / dump_failed).
     */
    public String dumpUi(JSONArray out) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return "no_root";
        try {
            collectNode(root, out);
        } catch (Exception e) {
            return "dump_failed";
        }
        return null;
    }

    private void collectNode(AccessibilityNodeInfo node, JSONArray out) throws Exception {
        if (node == null || out.length() >= DUMP_CAP) return;
        JSONObject o = new JSONObject();
        CharSequence t = node.getText();
        o.put("text", t == null ? "" : t.toString());
        CharSequence d = node.getContentDescription();
        o.put("desc", d == null ? "" : d.toString());
        CharSequence cn = node.getClassName();
        o.put("className", cn == null ? "" : cn.toString());
        Rect rc = new Rect();
        node.getBoundsInScreen(rc);
        JSONArray b = new JSONArray();
        b.put(rc.left);
        b.put(rc.top);
        b.put(rc.right);
        b.put(rc.bottom);
        o.put("bounds", b);
        o.put("clickable", node.isClickable());
        out.put(o);
        int n = node.getChildCount();
        for (int i = 0; i < n; i++) {
            if (out.length() >= DUMP_CAP) return;
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) collectNode(child, out);
        }
    }

    /**
     * Tim node dang thay duoc (visible) dau tien co text hoac desc khop.
     * match: "exact" (bang het) hoac "contains" (chua chuoi, mac dinh).
     * Tim thay: dien hit va tra null. Khong thay: tra "text_not_found".
     */
    public String findText(String needle, String match, TextHit hit) {
        if (needle == null || needle.isEmpty()) return "text_not_found";
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return "no_root";
        AccessibilityNodeInfo found;
        try {
            found = findTextNode(root, needle, "exact".equals(match));
        } catch (Exception e) {
            return "dump_failed";
        }
        if (found == null) return "text_not_found";
        Rect rc = new Rect();
        found.getBoundsInScreen(rc);
        CharSequence t = found.getText();
        CharSequence d = found.getContentDescription();
        hit.text = (t != null && t.length() > 0) ? t.toString() : (d == null ? "" : d.toString());
        hit.left = rc.left;
        hit.top = rc.top;
        hit.right = rc.right;
        hit.bottom = rc.bottom;
        return null;
    }

    private AccessibilityNodeInfo findTextNode(AccessibilityNodeInfo node, String needle, boolean exact) {
        if (node == null) return null;
        if (node.isVisibleToUser()) {
            if (textMatches(node.getText(), needle, exact) || textMatches(node.getContentDescription(), needle, exact)) {
                return node;
            }
        }
        int n = node.getChildCount();
        for (int i = 0; i < n; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            AccessibilityNodeInfo r = findTextNode(child, needle, exact);
            if (r != null) return r;
        }
        return null;
    }

    private boolean textMatches(CharSequence cs, String needle, boolean exact) {
        if (cs == null) return false;
        String s = cs.toString();
        if (s.isEmpty()) return false;
        return exact ? s.equals(needle) : s.contains(needle);
    }

    /** Cham vao tam cua node dau tien co chu khop. Loi: text_not_found / loi cua findText / loi gesture. */
    public String tapText(String needle, String match, TextHit hit) {
        String err = findText(needle, match, hit);
        if (err != null) return err;
        int cx = (hit.left + hit.right) / 2;
        int cy = (hit.top + hit.bottom) / 2;
        return tap(cx, cy);
    }

    /**
     * Cho toi khi chu xuat hien tren man hinh (khop "contains"), kiem tra
     * moi 500ms. Tra ve true neu thay trong thoi gian cho.
     */
    public boolean waitText(String needle, long timeoutMs) {
        if (timeoutMs < 0) timeoutMs = 0;
        if (timeoutMs > 30000) timeoutMs = 30000;
        long deadline = System.currentTimeMillis() + timeoutMs;
        TextHit hit = new TextHit();
        while (true) {
            if (findText(needle, "contains", hit) == null) return true;
            if (System.currentTimeMillis() >= deadline) return false;
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                return false;
            }
        }
    }

    /** key: back | home | recents | enter */
    public String key(String key) {
        if (key == null) return "unknown_key";
        switch (key.toLowerCase()) {
            case "back":
                return performGlobalAction(GLOBAL_ACTION_BACK) ? null : "key_failed";
            case "home":
                return performGlobalAction(GLOBAL_ACTION_HOME) ? null : "key_failed";
            case "recents":
                return performGlobalAction(GLOBAL_ACTION_RECENTS) ? null : "key_failed";
            case "enter": {
                // Accessibility khong co global action cho Enter. Thu qua lenh
                // shell "input keyevent" — chi chay duoc neu tien trinh co quyen
                // inject (thuong khong co tren may chua root) nen tra loi
                // key_not_supported de server biet ma dung o buoc cham tay.
                try {
                    Process p = Runtime.getRuntime().exec(new String[]{"input", "keyevent", "66"});
                    int code = p.waitFor();
                    return code == 0 ? null : "key_not_supported";
                } catch (Exception e) {
                    return "key_not_supported";
                }
            }
            default:
                return "unknown_key";
        }
    }
}
