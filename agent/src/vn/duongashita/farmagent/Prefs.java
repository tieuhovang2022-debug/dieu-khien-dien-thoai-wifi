package vn.duongashita.farmagent;

import android.content.Context;
import android.content.SharedPreferences;

public final class Prefs {
    private static final String NAME = "farm_agent_prefs";
    public static final String KEY_HOST = "host";
    public static final String KEY_PORT = "port";
    public static final String KEY_LABEL = "label";
    public static final String KEY_ENABLED = "enabled";

    private Prefs() {}

    public static SharedPreferences get(Context c) {
        return c.getSharedPreferences(NAME, Context.MODE_PRIVATE);
    }

    public static String host(Context c) {
        return get(c).getString(KEY_HOST, "");
    }

    public static int port(Context c) {
        return get(c).getInt(KEY_PORT, 8787);
    }

    public static String label(Context c) {
        return get(c).getString(KEY_LABEL, "");
    }

    public static boolean enabled(Context c) {
        return get(c).getBoolean(KEY_ENABLED, false);
    }

    public static void save(Context c, String host, int port, String label, boolean enabled) {
        get(c).edit()
                .putString(KEY_HOST, host)
                .putInt(KEY_PORT, port)
                .putString(KEY_LABEL, label)
                .putBoolean(KEY_ENABLED, enabled)
                .apply();
    }

    public static void setEnabled(Context c, boolean enabled) {
        get(c).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }
}
