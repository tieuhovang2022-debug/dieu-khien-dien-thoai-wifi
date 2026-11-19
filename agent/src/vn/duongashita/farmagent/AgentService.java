package vn.duongashita.farmagent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.admin.DevicePolicyManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.Surface;
import android.view.WindowManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class AgentService extends Service {
    public static volatile String statusText = "Chưa kết nối";
    private static final String CHANNEL_ID = "farm_agent_channel";
    private static final int NOTIF_ID = 1001;

    // Giai doan 5 — ghep noi QR: pairBlocked=true khi server tu choi
    // ma ghep noi (het han / da dung / khong hop le). Khi bi chan,
    // connectLoop KHONG tu ket noi lai nua — chi khi nguoi dung quet
    // ma moi hoac bam "Luu & Ket noi" (hai noi do deu xoa co nay).
    public static volatile boolean pairBlocked = false;
    // Dat true de ep vong ket noi dong socket hien tai va ket noi
    // lai ngay (doc lai IP/cong/ma ghep noi vua luu trong Prefs).
    public static volatile boolean forceReconnect = false;
    private static volatile AgentService instance = null;

    /** MainActivity / PairScanActivity goi sau khi luu thong tin ghep noi moi. */
    public static void requestReconnect() {
        pairBlocked = false;
        forceReconnect = true;
        AgentService s = instance;
        if (s != null) s.closeSocket();
    }

    static String pairRejectMessage(String reason) {
        if ("expired".equals(reason)) {
            return "Mã ghép nối hết hạn — tạo mã mới trên trang điều khiển rồi quét lại";
        }
        if ("used".equals(reason)) {
            return "Mã ghép nối đã được dùng cho máy khác — tạo mã mới trên trang điều khiển rồi quét lại";
        }
        return "Mã ghép nối không hợp lệ — tạo mã mới trên trang điều khiển rồi quét lại";
    }

    private volatile boolean running = false;
    private Thread connectThread;
    private Socket socket;
    private BufferedWriter writer;
    private final Object writeLock = new Object();
    private final ExecutorService cmdExecutor = Executors.newCachedThreadPool();
    private volatile String currentHostPort = "";

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();
        startForegroundTyped("Đang khởi động...");
    }

    // Android 14 bat buoc: MediaProjection chi tao duoc khi dang co mot
    // foreground service loai mediaProjection dang chay (ban va agent v3.2 —
    // truoc day thieu type nay nen may Android moi bao loi
    // "Media projections require a foreground service of type ServiceInfo...").
    // Goi ban 3 tham so tu API 29+; loi thi lui ve ban 2 tham so —
    // ensureCaptureLocked() se goi lai ban co type ngay truoc khi tao projection.
    private void startForegroundTyped(String text) {
        Notification n = buildNotification(text);
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
                return;
            } catch (Exception ignored) {
            }
        }
        startForeground(NOTIF_ID, n);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!running) {
            running = true;
            connectThread = new Thread(this::connectLoop, "farm-agent-connect");
            connectThread.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        running = false;
        stopVideoInternal();
        closeSocket();
        synchronized (captureLock) {
            releaseCaptureLocked(true);
        }
        cmdExecutor.shutdownNow();
        setStatus("Đã dừng");
        super.onDestroy();
    }

    // ---------------- Ket noi ----------------

    private void connectLoop() {
        long backoff = 5000;
        while (running) {
            if (pairBlocked) {
                // Ma ghep noi bi server tu choi: dung yen, khong ket
                // noi lai bang ma cu (status da ghi ro ly do). Chi
                // quet ma moi / Luu & Ket noi moi xoa duoc co nay.
                sleep(3000);
                continue;
            }
            String host = Prefs.host(this);
            int port = Prefs.port(this);
            if (host == null || host.trim().isEmpty()) {
                setStatus("Chưa nhập IP máy chủ — mở Farm Agent để nhập");
                sleep(3000);
                continue;
            }
            currentHostPort = host + ":" + port;
            try {
                setStatus("Đang kết nối " + currentHostPort + " ...");
                Socket s = new Socket();
                s.connect(new InetSocketAddress(host, port), 8000);
                s.setTcpNoDelay(true);
                socket = s;
                synchronized (writeLock) {
                    writer = new BufferedWriter(new OutputStreamWriter(s.getOutputStream(), "UTF-8"));
                }
                setStatus("Đã kết nối " + currentHostPort);
                backoff = 5000;
                sendJson(buildHello());
                AtomicBoolean alive = new AtomicBoolean(true);
                Thread hb = new Thread(() -> heartbeatLoop(alive), "farm-agent-hb");
                hb.setDaemon(true);
                hb.start();
                BufferedReader reader = new BufferedReader(new InputStreamReader(s.getInputStream(), "UTF-8"));
                String line;
                while (running && (line = reader.readLine()) != null) {
                    final String l = line.trim();
                    if (l.isEmpty()) continue;
                    cmdExecutor.execute(() -> handleLine(l));
                }
                alive.set(false);
            } catch (Exception e) {
                setStatus("Mất kết nối (" + shortErr(e) + ") — thử lại sau " + (backoff / 1000) + "s");
            } finally {
                // Mat kenh lenh = server khong con xem nua: dung
                // encoder video ngay (khong ma hoa khi khong ai xem).
                stopVideoInternal();
                closeSocket();
            }
            if (!running) break;
            if (forceReconnect) {
                // Vua quet ma ghep noi moi: ket noi lai gan nhu ngay.
                forceReconnect = false;
                backoff = 5000;
                sleep(300);
                continue;
            }
            sleep(backoff);
            backoff = Math.min(backoff * 2, 60000);
        }
        setStatus("Đã ngắt kết nối");
    }

    private void heartbeatLoop(AtomicBoolean alive) {
        while (running && alive.get() && socket != null && !socket.isClosed()) {
            try {
                Thread.sleep(30000);
            } catch (InterruptedException e) {
                return;
            }
            if (!alive.get()) return;
            try {
                sendJson(buildStatusMsg());
            } catch (Exception e) {
                return;
            }
        }
    }

    private void closeSocket() {
        try {
            if (socket != null) socket.close();
        } catch (Exception ignored) {
        }
        socket = null;
        synchronized (writeLock) {
            writer = null;
        }
    }

    private void sendJson(JSONObject obj) throws Exception {
        synchronized (writeLock) {
            if (writer == null) throw new Exception("not_connected");
            writer.write(obj.toString());
            writer.write("\n");
            writer.flush();
        }
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
        }
    }

    private String shortErr(Exception e) {
        String m = e.getMessage();
        if (m == null) m = e.getClass().getSimpleName();
        if (m.length() > 60) m = m.substring(0, 60);
        return m;
    }

    // ---------------- Trang thai thiet bi ----------------

    private int batteryLevel() {
        Intent i = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (i == null) return -1;
        int level = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = i.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        if (level < 0 || scale <= 0) return -1;
        return Math.round(level * 100f / scale);
    }

    private boolean isCharging() {
        Intent i = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (i == null) return false;
        int st = i.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        return st == BatteryManager.BATTERY_STATUS_CHARGING || st == BatteryManager.BATTERY_STATUS_FULL;
    }

    private String networkType() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return "none";
            NetworkInfo ni = cm.getActiveNetworkInfo();
            if (ni == null || !ni.isConnected()) return "none";
            if (ni.getType() == ConnectivityManager.TYPE_WIFI) return "wifi";
            if (ni.getType() == ConnectivityManager.TYPE_MOBILE) return "mobile";
            return "wifi";
        } catch (Exception e) {
            return "none";
        }
    }

    private boolean screenOn() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isInteractive();
    }

    private String androidId() {
        try {
            String id = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
            return id == null ? "" : id;
        } catch (Exception e) {
            return "";
        }
    }

    private String deviceLabel() {
        String l = Prefs.label(this);
        return (l == null || l.trim().isEmpty()) ? Build.MODEL : l;
    }

    public static boolean isDeviceOwner(Context c) {
        try {
            DevicePolicyManager dpm = (DevicePolicyManager) c.getSystemService(Context.DEVICE_POLICY_SERVICE);
            return dpm != null && dpm.isDeviceOwnerApp(c.getPackageName());
        } catch (Exception e) {
            return false;
        }
    }

    private JSONObject buildHello() throws Exception {
        JSONObject o = new JSONObject();
        o.put("type", "hello");
        o.put("label", deviceLabel());
        o.put("model", Build.MODEL);
        o.put("manufacturer", Build.MANUFACTURER);
        o.put("android", Build.VERSION.RELEASE);
        o.put("sdk", Build.VERSION.SDK_INT);
        o.put("androidId", androidId());
        o.put("battery", batteryLevel());
        o.put("agentVersion", "5.0");
        // Agent v4: co pipeline video H.264 theo yeu cau (lenh
        // video_start/video_stop + kenh TCP rieng) — server cu bo
        // qua truong nay, server moi dung de bat video cho may
        // dang duoc dieu khien.
        o.put("video", true);
        // Giai doan 5: ma ghep noi QR vua quet (neu co) — server kiem
        // tra mot lan roi tra pair_result / pair_rejected. Khong co
        // ma thi KHONG gui truong nay: may da cau hinh tu truoc ket
        // noi nhu cu, server cu cung bo qua truong la.
        String pairCode = Prefs.pairCode(this);
        if (pairCode != null && !pairCode.isEmpty()) o.put("pairCode", pairCode);
        o.put("deviceOwner", isDeviceOwner(this));
        o.put("accessibility", FarmAccessibilityService.isRunning());
        putForegroundPackage(o);
        return o;
    }

    private JSONObject telemetry() throws Exception {
        JSONObject o = new JSONObject();
        o.put("battery", batteryLevel());
        o.put("charging", isCharging());
        o.put("network", networkType());
        o.put("screenOn", screenOn());
        o.put("deviceOwner", isDeviceOwner(this));
        o.put("accessibility", FarmAccessibilityService.isRunning());
        putForegroundPackage(o);
        return o;
    }

    // Agent v3.3: kem package cua app dang o foreground (chi co khi
    // Tro nang dang chay; chua bat thi KHONG co truong nay — server
    // cu bo qua, server moi dung de kiem chung chinh xac app nao
    // dang mo thay vi doan qua noi dung dump_ui).
    private void putForegroundPackage(JSONObject o) throws Exception {
        String fg = FarmAccessibilityService.foregroundPackage();
        if (fg != null && !fg.isEmpty()) o.put("foregroundPackage", fg);
    }

    private JSONObject buildStatusMsg() throws Exception {
        JSONObject o = telemetry();
        o.put("type", "status");
        return o;
    }

    // ---------------- Xu ly lenh ----------------

    private void handleLine(String line) {
        // Giai doan 5: hai thong bao ghep noi KHONG phai lenh — xu ly
        // rieng, khong tra "result" ve server.
        try {
            JSONObject probe = new JSONObject(line);
            String type = probe.optString("type", "");
            if ("pair_result".equals(type)) {
                Prefs.clearPairCode(this);
                pairBlocked = false;
                setStatus("Ghép nối bằng QR thành công ✔ — đã kết nối " + currentHostPort);
                return;
            }
            if ("pair_rejected".equals(type)) {
                String reason = probe.optString("reason", "unknown");
                Prefs.clearPairCode(this);
                pairBlocked = true;
                setStatus(pairRejectMessage(reason));
                // Server cung se dong socket; dong chu dong o day de
                // vong doc thoat ngay va connectLoop thay pairBlocked.
                closeSocket();
                return;
            }
        } catch (Exception ignored) {
        }
        String id = "";
        try {
            JSONObject msg = new JSONObject(line);
            id = msg.optString("id", "");
            String cmd = msg.optString("cmd", "");
            JSONObject args = msg.optJSONObject("args");
            if (args == null) args = new JSONObject();
            JSONObject result = executeCommand(id, cmd, args);
            sendJson(result);
        } catch (Exception e) {
            try {
                JSONObject r = new JSONObject();
                r.put("type", "result");
                r.put("id", id);
                r.put("ok", false);
                r.put("error", "agent_error: " + shortErr(e));
                sendJson(r);
            } catch (Exception ignored) {
            }
        }
    }

    private JSONObject baseResult(String id) throws Exception {
        JSONObject r = new JSONObject();
        r.put("type", "result");
        r.put("id", id);
        return r;
    }

    /** Lay dich vu tro nang; neu chua bat thi dien loi no_accessibility vao r va tra null. */
    private FarmAccessibilityService a11y(JSONObject r) throws Exception {
        FarmAccessibilityService s = FarmAccessibilityService.instance();
        if (s == null) {
            r.put("ok", false);
            r.put("error", "no_accessibility");
            return null;
        }
        return s;
    }

    /** err == null -> ok:true; nguoc lai ok:false + error = err. */
    private JSONObject a11yResult(JSONObject r, String err) throws Exception {
        if (err == null) {
            r.put("ok", true);
        } else {
            r.put("ok", false);
            r.put("error", err);
        }
        return r;
    }

    private JSONObject executeCommand(String id, String cmd, JSONObject args) throws Exception {
        JSONObject r = baseResult(id);
        switch (cmd) {
            case "status": {
                JSONObject d = telemetry();
                d.put("label", deviceLabel());
                d.put("model", Build.MODEL);
                d.put("manufacturer", Build.MANUFACTURER);
                d.put("android", Build.VERSION.RELEASE);
                r.put("ok", true);
                r.put("data", d);
                return r;
            }
            case "open_app": {
                String pkg = args.optString("package", "");
                Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
                if (launch == null) {
                    r.put("ok", false);
                    r.put("error", "app_not_installed");
                    return r;
                }
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launch);
                JSONObject d = new JSONObject();
                d.put("opened", pkg);
                r.put("ok", true);
                r.put("data", d);
                return r;
            }
            case "open_google_signin": {
                // Mo thang man hinh "them tai khoan Google" cua Android —
                // dung cho quy trinh Cap Gmail tu dong (Giai doan 3.1).
                // Khong can Tro nang: day chi la startActivity thong thuong.
                try {
                    Intent gi = new Intent("android.settings.ADD_ACCOUNT_SETTINGS");
                    gi.putExtra(Settings.EXTRA_ACCOUNT_TYPES, new String[]{"com.google"});
                    gi.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(gi);
                } catch (Exception e1) {
                    // Thu lai khong kem extra (mot so ROM cat bot)
                    try {
                        Intent gi2 = new Intent("android.settings.ADD_ACCOUNT_SETTINGS");
                        gi2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(gi2);
                    } catch (Exception e2) {
                        r.put("ok", false);
                        r.put("error", "no_activity");
                        return r;
                    }
                }
                JSONObject d = new JSONObject();
                d.put("opened", "google_signin");
                r.put("ok", true);
                r.put("data", d);
                return r;
            }
            case "wake": {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                PowerManager.WakeLock wl = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                        "farmagent:wake");
                wl.acquire(10000);
                r.put("ok", true);
                return r;
            }
            case "install_url": {
                String url = args.optString("url", "");
                File f = downloadApk(url);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(ApkProvider.uriFor(f), "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(intent);
                JSONObject d = new JSONObject();
                d.put("installer", "opened");
                d.put("file", f.getName());
                r.put("ok", true);
                r.put("data", d);
                return r;
            }
            case "screenshot": {
                if (!MediaPerm.granted || MediaPerm.data == null) {
                    r.put("ok", false);
                    r.put("error", "no_permission");
                    return r;
                }
                // Agent v3.3: tham so tuy chon maxWidth (px) + quality
                // (JPEG 1-100). KHONG gui tham so = dung y hanh vi cu
                // (rong toi da 720, quality 70) — server cu khong bi
                // anh huong. Gia tri ngoai khoang an toan thi kep lai.
                int shotMaxW = args.optInt("maxWidth", 720);
                if (shotMaxW < 120) shotMaxW = 120;
                if (shotMaxW > 1440) shotMaxW = 1440;
                int shotQuality = args.optInt("quality", 70);
                if (shotQuality < 1) shotQuality = 1;
                if (shotQuality > 100) shotQuality = 100;
                String b64 = takeScreenshot(shotMaxW, shotQuality);
                JSONObject d = new JSONObject();
                d.put("image", b64);
                r.put("ok", true);
                r.put("data", d);
                return r;
            }
            case "video_start": {
                // Agent v4: bat pipeline video H.264 (xem muc Video
                // o cuoi file). Tham so do server gui: maxWidth
                // (mac dinh 720), bitrate (mac dinh 2.5 Mbps), fps
                // (mac dinh 30), keyframeSec (mac dinh 2) — gia tri
                // ngoai khoang an toan thi kep lai o startVideo().
                if (!MediaPerm.granted || MediaPerm.data == null) {
                    r.put("ok", false);
                    r.put("error", "no_permission");
                    return r;
                }
                String verr = startVideo(args);
                if (verr != null) {
                    r.put("ok", false);
                    r.put("error", verr);
                    return r;
                }
                JSONObject d = new JSONObject();
                d.put("streaming", true);
                d.put("width", videoW);
                d.put("height", videoH);
                r.put("ok", true);
                r.put("data", d);
                return r;
            }
            case "video_stop": {
                stopVideoInternal();
                r.put("ok", true);
                return r;
            }
            case "factory_reset": {
                if (!isDeviceOwner(this)) {
                    r.put("ok", false);
                    r.put("error", "not_device_owner");
                    return r;
                }
                // Tra loi OK truoc, wipe sau 1.5 giay de phan hoi kip ve server.
                new Thread(() -> {
                    try {
                        Thread.sleep(1500);
                    } catch (InterruptedException ignored) {
                    }
                    try {
                        DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
                        if (dpm != null) dpm.wipeData(0);
                    } catch (Exception ignored) {
                    }
                }, "farm-agent-wipe").start();
                JSONObject d = new JSONObject();
                d.put("wiping", true);
                r.put("ok", true);
                r.put("data", d);
                return r;
            }
            case "tap": {
                FarmAccessibilityService s = a11y(r);
                if (s == null) return r;
                return a11yResult(r, s.tap(args.optInt("x", 0), args.optInt("y", 0)));
            }
            case "swipe": {
                FarmAccessibilityService s = a11y(r);
                if (s == null) return r;
                return a11yResult(r, s.swipe(
                        args.optInt("x1", 0), args.optInt("y1", 0),
                        args.optInt("x2", 0), args.optInt("y2", 0),
                        args.optLong("durationMs", 300)));
            }
            case "input_text": {
                FarmAccessibilityService s = a11y(r);
                if (s == null) return r;
                return a11yResult(r, s.inputText(args.optString("text", "")));
            }
            case "key": {
                FarmAccessibilityService s = a11y(r);
                if (s == null) return r;
                return a11yResult(r, s.key(args.optString("key", "")));
            }
            case "dump_ui": {
                FarmAccessibilityService s = a11y(r);
                if (s == null) return r;
                JSONArray nodes = new JSONArray();
                String err = s.dumpUi(nodes);
                if (err != null) {
                    r.put("ok", false);
                    r.put("error", err);
                    return r;
                }
                JSONObject d = new JSONObject();
                d.put("nodes", nodes);
                d.put("count", nodes.length());
                r.put("ok", true);
                r.put("data", d);
                return r;
            }
            case "tap_text": {
                FarmAccessibilityService s = a11y(r);
                if (s == null) return r;
                String match = args.optString("match", "contains");
                FarmAccessibilityService.TextHit hit = new FarmAccessibilityService.TextHit();
                String err = s.tapText(args.optString("text", ""), match, hit);
                if (err != null) {
                    r.put("ok", false);
                    r.put("error", err);
                    return r;
                }
                JSONObject d = new JSONObject();
                d.put("tapped", true);
                d.put("text", hit.text);
                JSONArray b = new JSONArray();
                b.put(hit.left);
                b.put(hit.top);
                b.put(hit.right);
                b.put(hit.bottom);
                d.put("bounds", b);
                d.put("x", (hit.left + hit.right) / 2);
                d.put("y", (hit.top + hit.bottom) / 2);
                r.put("ok", true);
                r.put("data", d);
                return r;
            }
            case "wait_text": {
                FarmAccessibilityService s = a11y(r);
                if (s == null) return r;
                long tmo = args.optLong("timeoutMs", 10000);
                if (tmo < 0) tmo = 0;
                if (tmo > 30000) tmo = 30000;
                boolean found = s.waitText(args.optString("text", ""), tmo);
                JSONObject d = new JSONObject();
                d.put("found", found);
                r.put("ok", true);
                r.put("data", d);
                return r;
            }
            case "open_url": {
                FarmAccessibilityService s = a11y(r);
                if (s == null) return r;
                String url = args.optString("url", "");
                if (url == null || url.trim().isEmpty()
                        || !(url.startsWith("http://") || url.startsWith("https://"))) {
                    r.put("ok", false);
                    r.put("error", "bad_url");
                    return r;
                }
                try {
                    Intent view = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url.trim()));
                    view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(view);
                } catch (android.content.ActivityNotFoundException e) {
                    r.put("ok", false);
                    r.put("error", "no_activity");
                    return r;
                } catch (Exception e) {
                    r.put("ok", false);
                    r.put("error", "no_activity");
                    return r;
                }
                JSONObject d = new JSONObject();
                d.put("opened", url.trim());
                r.put("ok", true);
                r.put("data", d);
                return r;
            }
            default: {
                r.put("ok", false);
                r.put("error", "unknown_cmd");
                return r;
            }
        }
    }

    private File downloadApk(String url) throws Exception {
        if (url == null || url.isEmpty()) throw new Exception("empty_url");
        java.net.URL u = new java.net.URL(url);
        java.net.HttpURLConnection conn = (java.net.HttpURLConnection) u.openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(60000);
        conn.setInstanceFollowRedirects(true);
        conn.connect();
        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) throw new Exception("http_" + code);
        File f = new File(getCacheDir(), "install-" + System.currentTimeMillis() + ".apk");
        InputStream in = conn.getInputStream();
        FileOutputStream out = new FileOutputStream(f);
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
        }
        out.close();
        in.close();
        conn.disconnect();
        return f;
    }

    // ---------------- Chup man hinh ----------------
    // Thiet ke dung chung 1 MediaProjection cho moi lan chup (ban va v3.2):
    // consent Android 14 chi dung duoc 1 lan nen khong the tao projection moi
    // cho tung anh nhu ban cu. VirtualDisplay + ImageReader tao 1 lan roi
    // dung lai; xoay man hinh thi resize VirtualDisplay, khong tao lai projection.

    private final Object captureLock = new Object();
    private MediaProjection projection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread captureThread;
    private int capW = 0;
    private int capH = 0;

    private final MediaProjection.Callback projectionCallback = new MediaProjection.Callback() {
        @Override
        public void onStop() {
            // He thong / nguoi dung dung buoi chieu (hoac projection bi thu hoi):
            // don state + xoa consent da luu -> lan chup sau tra no_permission
            // de nguoi dung cap lai trong app, thay vi crash.
            stopVideoInternal();
            synchronized (captureLock) {
                releaseCaptureLocked(false);
                MediaPerm.granted = false;
                MediaPerm.resultCode = 0;
                MediaPerm.data = null;
            }
        }
    };

    /** Chi goi khi dang giu captureLock. stopProjection=false khi he thong da dung san. */
    private void releaseCaptureLocked(boolean stopProjection) {
        if (virtualDisplay != null) {
            try {
                virtualDisplay.release();
            } catch (Exception ignored) {
            }
            virtualDisplay = null;
        }
        if (imageReader != null) {
            try {
                imageReader.close();
            } catch (Exception ignored) {
            }
            imageReader = null;
        }
        if (projection != null) {
            try {
                projection.unregisterCallback(projectionCallback);
            } catch (Exception ignored) {
            }
            if (stopProjection) {
                try {
                    projection.stop();
                } catch (Exception ignored) {
                }
            }
            projection = null;
        }
        if (captureThread != null) {
            try {
                captureThread.quitSafely();
            } catch (Exception ignored) {
            }
            captureThread = null;
        }
        capW = 0;
        capH = 0;
    }

    /** Kich thuoc dich (da scale theo maxWidth, chan) + dpi cua man hinh that. Tra {w, h, dpi}. */
    private int[] scaledSize(int maxWidth) {
        WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        Display display = wm.getDefaultDisplay();
        android.graphics.Point size = new android.graphics.Point();
        display.getRealSize(size);
        int srcW = size.x;
        int srcH = size.y;
        double scale = srcW > maxWidth ? ((double) maxWidth / srcW) : 1.0;
        int w = Math.max(2, (int) (srcW * scale));
        int h = Math.max(2, (int) (srcH * scale));
        if ((w % 2) == 1) w -= 1;
        if ((h % 2) == 1) h -= 1;
        DisplayMetrics metrics = new DisplayMetrics();
        display.getMetrics(metrics);
        return new int[]{w, h, metrics.densityDpi};
    }

    /** Chi goi khi dang giu captureLock. Handler dung chung cho projection + cac VirtualDisplay. */
    private Handler captureHandlerLocked() {
        if (captureThread == null) {
            captureThread = new HandlerThread("farm-shot");
            captureThread.start();
        }
        return new Handler(captureThread.getLooper());
    }

    /**
     * Chi goi khi dang giu captureLock. Tra MediaProjection dung chung
     * (cho ca anh tinh lan video), tao moi neu chua co. FGS loai
     * mediaProjection phai dang chay TRUOC getMediaProjection
     * (Android 14) — goi lai startForeground co type ngay tai day cho
     * chac; Callback dang ky TRUOC moi createVirtualDisplay.
     */
    private MediaProjection ensureProjectionLocked() throws Exception {
        if (projection != null) return projection;
        startForegroundTyped(statusText);
        MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (mpm == null) throw new Exception("no_projection_service");
        Intent dataCopy = new Intent(MediaPerm.data);
        MediaProjection mp = mpm.getMediaProjection(MediaPerm.resultCode, dataCopy);
        if (mp == null) throw new Exception("projection_failed");
        mp.registerCallback(projectionCallback, captureHandlerLocked());
        projection = mp;
        return mp;
    }

    /** Chi goi khi dang giu captureLock. Tao moi projection neu chua co; resize neu doi kich thuoc. */
    private void ensureCaptureLocked(int maxWidth) throws Exception {
        int[] sz = scaledSize(maxWidth);
        int w = sz[0];
        int h = sz[1];
        int dpi = sz[2];

        if (projection != null) {
            if (w != capW || h != capH) {
                // Doi kich thuoc (xoay man hinh...): resize VirtualDisplay va
                // thay ImageReader — giu nguyen projection dang chay.
                ImageReader old = imageReader;
                ImageReader nr = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2);
                virtualDisplay.resize(w, h, dpi);
                virtualDisplay.setSurface(nr.getSurface());
                imageReader = nr;
                if (old != null) old.close();
                capW = w;
                capH = h;
            }
            return;
        }

        MediaProjection mp = ensureProjectionLocked();
        Handler handler = captureHandlerLocked();
        ImageReader reader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2);
        VirtualDisplay vd;
        try {
            vd = mp.createVirtualDisplay("farmagent-shot", w, h, dpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, handler);
        } catch (Exception e) {
            reader.close();
            releaseCaptureLocked(true);
            throw e;
        }
        imageReader = reader;
        virtualDisplay = vd;
        capW = w;
        capH = h;
    }

    private String takeScreenshot(int maxWidth, int quality) throws Exception {
        synchronized (captureLock) {
            ensureCaptureLocked(maxWidth);
            Bitmap bmp = null;
            long deadline = System.currentTimeMillis() + 4000;
            while (System.currentTimeMillis() < deadline && bmp == null) {
                Image img = null;
                try {
                    img = imageReader.acquireLatestImage();
                } catch (Exception ignored) {
                }
                if (img == null) {
                    Thread.sleep(120);
                    continue;
                }
                try {
                    bmp = imageToBitmap(img, capW, capH);
                } finally {
                    img.close();
                }
            }
            if (bmp == null) throw new Exception("capture_timeout");
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, quality, baos);
            bmp.recycle();
            return Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
        }
    }

    private Bitmap imageToBitmap(Image img, int w, int h) {
        Image.Plane plane = img.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer();
        int pixelStride = plane.getPixelStride();
        int rowStride = plane.getRowStride();
        int rowPadding = rowStride - pixelStride * w;
        int fullW = w + rowPadding / pixelStride;
        Bitmap tmp = Bitmap.createBitmap(fullW, h, Bitmap.Config.ARGB_8888);
        tmp.copyPixelsFromBuffer(buffer);
        if (fullW == w) return tmp;
        Bitmap cropped = Bitmap.createBitmap(tmp, 0, 0, w, h);
        tmp.recycle();
        return cropped;
    }

    // ---------------- Video H.264 (agent v4) ----------------
    // Pipeline theo yeu cau: MediaProjection (DUNG CHUNG voi anh tinh)
    // -> VirtualDisplay rieng -> MediaCodec H.264 (phan cung) ->
    // Annex-B qua MOT KET NOI TCP THU HAI ve dung host:port cua kenh
    // lenh (khong dung chung socket voi lenh/result de khung lon
    // khong chan lenh). Dinh dang tren kenh video:
    //   dong 1 (JSON): {"type":"video_hello","androidId":...,"streamId":...}
    //   dong 2 (JSON): {"type":"video_format","width":W,"height":H,"fps":F}
    //   sau do lap: [4 byte BE do dai][1 access unit Annex-B]
    // Access unit dau tien la codec-config (SPS+PPS), tiep theo la
    // cac khung (keyframe co co BUFFER_FLAG_KEY_FRAME o phia encoder;
    // server tu nhan dien IDR trong NAL).
    // KY LUAT: encoder CHI chay khi server ra lenh video_start va
    // dung ngay khi video_stop / mat kenh lenh / mat kenh video /
    // projection bi dung — khong bao gio ma hoa khi khong ai xem
    // (ton pin + nong may).

    private final Object videoLock = new Object();
    private MediaCodec videoEncoder;
    private VirtualDisplay videoDisplay;
    private Socket videoSocket;
    private OutputStream videoOut;
    private Thread videoThread;
    private volatile boolean videoRunning = false;
    private int videoW = 0;
    private int videoH = 0;

    /** Bat video. Tra null neu thanh cong, nguoc lai tra ma loi. */
    private String startVideo(JSONObject args) {
        int maxWidth = args.optInt("maxWidth", 720);
        if (maxWidth < 120) maxWidth = 120;
        if (maxWidth > 1440) maxWidth = 1440;
        int bitrate = args.optInt("bitrate", 2500000);
        if (bitrate < 200000) bitrate = 200000;
        if (bitrate > 12000000) bitrate = 12000000;
        int fps = args.optInt("fps", 30);
        if (fps < 1) fps = 1;
        if (fps > 60) fps = 60;
        int keySec = args.optInt("keyframeSec", 2);
        if (keySec < 1) keySec = 1;
        if (keySec > 10) keySec = 10;

        synchronized (videoLock) {
            if (videoRunning) return null; // dang chay san — idempotent
            String host = Prefs.host(this);
            int port = Prefs.port(this);
            if (host == null || host.trim().isEmpty()) return "no_server";
            int[] sz = scaledSize(maxWidth);
            int w = sz[0];
            int h = sz[1];
            int dpi = sz[2];
            Socket vs = null;
            try {
                MediaProjection proj;
                Handler handler;
                synchronized (captureLock) {
                    proj = ensureProjectionLocked();
                    handler = captureHandlerLocked();
                }
                MediaFormat format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h);
                format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
                format.setInteger(MediaFormat.KEY_BIT_RATE, bitrate);
                format.setInteger(MediaFormat.KEY_FRAME_RATE, fps);
                format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, keySec);
                MediaCodec encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
                encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
                Surface inputSurface = encoder.createInputSurface();
                // Gan field ngay de catch ben ngoai don dep duoc neu
                // cac buoc sau loi (releaseVideoLocked chiu trach nhiem).
                videoEncoder = encoder;
                VirtualDisplay vd = proj.createVirtualDisplay("farmagent-video", w, h, dpi,
                        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, inputSurface, null, handler);
                videoDisplay = vd;
                encoder.start();

                vs = new Socket();
                vs.connect(new InetSocketAddress(host, port), 8000);
                vs.setTcpNoDelay(true);
                OutputStream out = vs.getOutputStream();
                JSONObject hello = new JSONObject();
                hello.put("type", "video_hello");
                hello.put("androidId", androidId());
                hello.put("streamId", androidId() + "-" + System.currentTimeMillis());
                out.write((hello.toString() + "\n").getBytes("UTF-8"));
                JSONObject fmt = new JSONObject();
                fmt.put("type", "video_format");
                fmt.put("width", w);
                fmt.put("height", h);
                fmt.put("fps", fps);
                out.write((fmt.toString() + "\n").getBytes("UTF-8"));
                out.flush();

                videoSocket = vs;
                videoOut = out;
                videoW = w;
                videoH = h;
                videoRunning = true;
                Thread t = new Thread(this::videoDrainLoop, "farm-agent-video");
                t.setDaemon(true);
                videoThread = t;
                t.start();
                return null;
            } catch (Exception e) {
                if (vs != null && videoSocket != vs) {
                    try {
                        vs.close();
                    } catch (Exception ignored) {
                    }
                }
                releaseVideoLocked();
                return "video_failed: " + shortErr(e);
            }
        }
    }

    /** Giai phong encoder/display/socket video. Chi goi khi dang giu videoLock; idempotent. */
    private void releaseVideoLocked() {
        if (videoEncoder != null) {
            try {
                videoEncoder.stop();
            } catch (Exception ignored) {
            }
            try {
                videoEncoder.release();
            } catch (Exception ignored) {
            }
            videoEncoder = null;
        }
        if (videoDisplay != null) {
            try {
                videoDisplay.release();
            } catch (Exception ignored) {
            }
            videoDisplay = null;
        }
        if (videoSocket != null) {
            try {
                videoSocket.close();
            } catch (Exception ignored) {
            }
            videoSocket = null;
        }
        videoOut = null;
        videoW = 0;
        videoH = 0;
    }

    /** Dung video tu bat ky luong nao (lenh video_stop, mat ket noi, projection dung...). */
    private void stopVideoInternal() {
        Thread t;
        synchronized (videoLock) {
            videoRunning = false;
            t = videoThread;
            // Dong socket truoc de danh thuc moi lan ghi dang ket.
            if (videoSocket != null) {
                try {
                    videoSocket.close();
                } catch (Exception ignored) {
                }
            }
        }
        if (t != null && t != Thread.currentThread()) {
            try {
                t.join(1500);
            } catch (InterruptedException ignored) {
            }
        }
        synchronized (videoLock) {
            videoThread = null;
            releaseVideoLocked();
        }
    }

    /** Ghi 1 access unit: [4 byte BE do dai][du lieu Annex-B]. Loi ghi -> dung video. */
    private void sendVideoFrame(byte[] data) throws Exception {
        OutputStream out;
        synchronized (videoLock) {
            out = videoOut;
        }
        if (out == null) throw new Exception("video_closed");
        byte[] head = new byte[]{
                (byte) (data.length >>> 24), (byte) (data.length >>> 16),
                (byte) (data.length >>> 8), (byte) data.length};
        synchronized (out) {
            out.write(head);
            out.write(data);
            out.flush();
        }
    }

    private void videoDrainLoop() {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        try {
            while (videoRunning) {
                MediaCodec encoder;
                synchronized (videoLock) {
                    encoder = videoEncoder;
                }
                if (encoder == null) break;
                int idx;
                try {
                    idx = encoder.dequeueOutputBuffer(info, 100000);
                } catch (Exception e) {
                    break;
                }
                if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    // Gui codec-config (SPS + PPS, Annex-B) truoc moi khung.
                    try {
                        MediaFormat f = encoder.getOutputFormat();
                        ByteBuffer csd0 = f.getByteBuffer("csd-0");
                        ByteBuffer csd1 = f.getByteBuffer("csd-1");
                        ByteArrayOutputStream cfg = new ByteArrayOutputStream();
                        if (csd0 != null) {
                            byte[] b = new byte[csd0.remaining()];
                            csd0.get(b);
                            cfg.write(b, 0, b.length);
                        }
                        if (csd1 != null) {
                            byte[] b = new byte[csd1.remaining()];
                            csd1.get(b);
                            cfg.write(b, 0, b.length);
                        }
                        if (cfg.size() > 0) sendVideoFrame(cfg.toByteArray());
                    } catch (Exception e) {
                        break;
                    }
                } else if (idx >= 0) {
                    boolean eos = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
                    try {
                        ByteBuffer buf = encoder.getOutputBuffer(idx);
                        if (buf != null && info.size > 0) {
                            buf.position(info.offset);
                            buf.limit(info.offset + info.size);
                            byte[] data = new byte[info.size];
                            buf.get(data);
                            // Dau ra video/avc cua MediaCodec la Annex-B
                            // san (co start code), ke ca buffer
                            // BUFFER_FLAG_CODEC_CONFIG (SPS/PPS).
                            sendVideoFrame(data);
                        }
                    } catch (Exception e) {
                        try {
                            encoder.releaseOutputBuffer(idx, false);
                        } catch (Exception ignored) {
                        }
                        break;
                    }
                    try {
                        encoder.releaseOutputBuffer(idx, false);
                    } catch (Exception ignored) {
                    }
                    if (eos) break;
                }
            }
        } finally {
            // Kenh video chet / encoder loi / bi dung tu ngoai: tu don
            // dep — server se thay kenh dong va chuyen ve anh tinh.
            synchronized (videoLock) {
                videoRunning = false;
                if (videoThread == Thread.currentThread()) videoThread = null;
                releaseVideoLocked();
            }
        }
    }

    // ---------------- Thong bao ----------------

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Farm Agent", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Trạng thái kết nối của Farm Agent");
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open,
                Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_IMMUTABLE : 0);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return b.setContentTitle("Farm Agent đang chạy")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
    }

    private void setStatus(String s) {
        statusText = s;
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_ID, buildNotification(s));
        } catch (Exception ignored) {
        }
    }
}
