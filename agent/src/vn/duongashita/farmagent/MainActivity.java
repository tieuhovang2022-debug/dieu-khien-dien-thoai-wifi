package vn.duongashita.farmagent;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final int REQ_CAPTURE = 1001;

    private EditText hostEt;
    private EditText portEt;
    private EditText labelEt;
    private TextView statusTv;
    private TextView capsTv;
    private final Handler uiHandler = new Handler();
    private final Runnable refresher = new Runnable() {
        @Override
        public void run() {
            if (statusTv != null) {
                statusTv.setText("Trạng thái: " + AgentService.statusText);
            }
            if (capsTv != null) {
                capsTv.setText("Device Owner: " + (AgentService.isDeviceOwner(MainActivity.this) ? "Có ✔ (reset từ xa được)" : "Chưa (chỉ có sau khi ghi danh QR lúc máy vừa reset)")
                        + "\nTrợ năng (chạm/nhập chữ tự động): " + (FarmAccessibilityService.isRunning() ? "Đã bật ✔" : "Chưa bật"));
            }
            uiHandler.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("Farm Agent");
        title.setTextSize(26);
        root.addView(title);

        TextView desc = new TextView(this);
        desc.setText("Agent kết nối điện thoại này về máy chủ điều khiển (MacBook) qua WiFi.\nNhập IP của MacBook và nhãn máy, rồi bấm Lưu & Kết nối.");
        desc.setTextSize(15);
        root.addView(desc);

        root.addView(label("IP máy chủ (MacBook):"));
        hostEt = new EditText(this);
        hostEt.setHint("Ví dụ: 192.168.1.10");
        hostEt.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        hostEt.setText(Prefs.host(this));
        root.addView(hostEt);

        root.addView(label("Cổng (port):"));
        portEt = new EditText(this);
        portEt.setInputType(InputType.TYPE_CLASS_NUMBER);
        portEt.setText(String.valueOf(Prefs.port(this)));
        root.addView(portEt);

        root.addView(label("Nhãn máy (ví dụ: Máy 01):"));
        labelEt = new EditText(this);
        labelEt.setHint("Máy 01");
        labelEt.setInputType(InputType.TYPE_CLASS_TEXT);
        labelEt.setText(Prefs.label(this));
        root.addView(labelEt);

        Button connectBtn = new Button(this);
        connectBtn.setText("Lưu & Kết nối");
        connectBtn.setOnClickListener(v -> {
            String host = hostEt.getText().toString().trim();
            int port = 8787;
            try {
                port = Integer.parseInt(portEt.getText().toString().trim());
            } catch (Exception ignored) {
            }
            String lbl = labelEt.getText().toString().trim();
            Prefs.save(this, host, port, lbl, true);
            startAgent();
            Toast.makeText(this, "Đã lưu. Đang kết nối...", Toast.LENGTH_SHORT).show();
        });
        root.addView(connectBtn);

        Button stopBtn = new Button(this);
        stopBtn.setText("Ngắt kết nối");
        stopBtn.setOnClickListener(v -> {
            Prefs.setEnabled(this, false);
            stopService(new Intent(this, AgentService.class));
            AgentService.statusText = "Đã ngắt kết nối";
            Toast.makeText(this, "Đã ngắt kết nối", Toast.LENGTH_SHORT).show();
        });
        root.addView(stopBtn);

        Button shotBtn = new Button(this);
        shotBtn.setText("Cho phép chụp màn hình");
        shotBtn.setOnClickListener(v -> {
            MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            if (mpm != null) {
                startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE);
            }
        });
        root.addView(shotBtn);

        Button batteryBtn = new Button(this);
        batteryBtn.setText("Tắt tối ưu pin cho agent");
        batteryBtn.setOnClickListener(v -> openBatterySettings());
        root.addView(batteryBtn);

        TextView a11yDesc = new TextView(this);
        a11yDesc.setText("Để server điều khiển được thao tác trên màn hình (chạm, vuốt, nhập chữ — ví dụ tự nhập Gmail), cần bật dịch vụ Trợ năng cho Farm Agent một lần trong Cài đặt. Agent chỉ thao tác khi có lệnh từ MacBook của bạn.");
        a11yDesc.setTextSize(15);
        a11yDesc.setPadding(0, dp(16), 0, 0);
        root.addView(a11yDesc);

        Button a11yBtn = new Button(this);
        a11yBtn.setText("Mở Cài đặt Trợ năng");
        a11yBtn.setOnClickListener(v -> {
            try {
                startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
            } catch (Exception e) {
                Toast.makeText(this, "Không mở được Cài đặt. Vào Cài đặt > Trợ năng > Farm Agent.", Toast.LENGTH_LONG).show();
            }
        });
        root.addView(a11yBtn);

        capsTv = new TextView(this);
        capsTv.setTextSize(15);
        capsTv.setPadding(0, dp(12), 0, 0);
        root.addView(capsTv);

        statusTv = new TextView(this);
        statusTv.setTextSize(16);
        statusTv.setPadding(0, dp(16), 0, 0);
        root.addView(statusTv);

        ScrollView sv = new ScrollView(this);
        sv.addView(root);
        setContentView(sv);

        if (Prefs.enabled(this)) {
            startAgent();
        }
    }

    private TextView label(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(15);
        t.setPadding(0, dp(14), 0, dp(2));
        return t;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void startAgent() {
        Intent svc = new Intent(this, AgentService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(svc);
        } else {
            startService(svc);
        }
    }

    private void openBatterySettings() {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception e) {
            try {
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception e2) {
                Toast.makeText(this, "Không mở được cài đặt pin. Vào Cài đặt > Pin > Farm Agent > Không hạn chế.", Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_CAPTURE) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                MediaPerm.resultCode = resultCode;
                MediaPerm.data = data;
                MediaPerm.granted = true;
                Toast.makeText(this, "Đã có quyền chụp màn hình ✔", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "Chưa cấp quyền chụp màn hình", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        uiHandler.post(refresher);
    }

    @Override
    protected void onPause() {
        uiHandler.removeCallbacks(refresher);
        super.onPause();
    }
}
