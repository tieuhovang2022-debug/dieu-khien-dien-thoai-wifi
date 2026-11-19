package vn.duongashita.farmagent;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Camera;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;

/**
 * Giai doan 5 — trinh quet ma QR ghep noi ngay trong app (Camera1 +
 * ZXing core, jar dong san trong libs/). Man hinh chi co khung xem
 * camera + mot dong huong dan; quet thay ma farmpair://pair thi luu
 * IP/cong/ma vao Prefs, ep AgentService ket noi lai ngay va dong.
 * Ma QR khac (khong phai ma ghep noi) thi bao mot cau roi quet tiep.
 */
public class PairScanActivity extends Activity implements SurfaceHolder.Callback, Camera.PreviewCallback {
    private static final int REQ_CAMERA = 2002;

    private SurfaceView preview;
    private TextView hint;
    private Camera camera;
    private boolean surfaceReady = false;
    private boolean decoded = false;
    private int previewW = 0;
    private int previewH = 0;
    private long lastDecodeTry = 0;
    private final MultiFormatReader reader = new MultiFormatReader();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
        hints.put(DecodeHintType.POSSIBLE_FORMATS, Collections.singletonList(BarcodeFormat.QR_CODE));
        hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
        reader.setHints(hints);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);

        hint = new TextView(this);
        hint.setText("Chĩa camera vào mã QR “Ghép nối” trên trang điều khiển (mục Thêm máy). Mã chỉ sống 300 giây.");
        hint.setTextSize(16);
        int pad = Math.round(16 * getResources().getDisplayMetrics().density);
        hint.setPadding(pad, pad, pad, pad);
        root.addView(hint);

        preview = new SurfaceView(this);
        root.addView(preview, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        preview.getHolder().addCallback(this);
        setContentView(root);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (Build.VERSION.SDK_INT >= 23
                && checkSelfPermission(android.Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.CAMERA}, REQ_CAMERA);
        } else if (surfaceReady) {
            startCamera();
        }
    }

    @Override
    protected void onPause() {
        stopCamera();
        super.onPause();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (surfaceReady) startCamera();
            } else {
                hint.setText("Chưa có quyền camera nên không quét trong app được. Cách khác: dùng app Camera/Lens của máy quét mã QR trên trang điều khiển — mã sẽ tự mở Farm Agent.");
                Toast.makeText(this, "Chưa có quyền camera — hãy quét bằng app Camera/Lens của máy", Toast.LENGTH_LONG).show();
            }
        }
    }

    // ---------- SurfaceHolder.Callback ----------

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        surfaceReady = true;
        if (Build.VERSION.SDK_INT < 23
                || checkSelfPermission(android.Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        }
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        surfaceReady = false;
        stopCamera();
    }

    // ---------- Camera ----------

    private void startCamera() {
        if (camera != null || decoded) return;
        try {
            camera = Camera.open();
            Camera.Parameters params = camera.getParameters();
            Camera.Size best = null;
            for (Camera.Size s : params.getSupportedPreviewSizes()) {
                if (s.width <= 1280 && (best == null || s.width > best.width)) best = s;
            }
            if (best != null) params.setPreviewSize(best.width, best.height);
            try {
                params.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
            } catch (Exception ignored) {
            }
            camera.setParameters(params);
            Camera.Size sz = camera.getParameters().getPreviewSize();
            previewW = sz.width;
            previewH = sz.height;
            camera.setDisplayOrientation(90);
            camera.setPreviewDisplay(preview.getHolder());
            camera.setPreviewCallback(this);
            camera.startPreview();
        } catch (Exception e) {
            hint.setText("Không mở được camera (" + e.getMessage() + "). Cách khác: dùng app Camera/Lens của máy quét mã QR trên trang điều khiển.");
            stopCamera();
        }
    }

    private void stopCamera() {
        if (camera != null) {
            try {
                camera.setPreviewCallback(null);
                camera.stopPreview();
            } catch (Exception ignored) {
            }
            camera.release();
            camera = null;
        }
    }

    @Override
    public void onPreviewFrame(byte[] data, Camera cam) {
        if (decoded || data == null || previewW == 0 || previewH == 0) return;
        long now = System.currentTimeMillis();
        if (now - lastDecodeTry < 200) return;
        lastDecodeTry = now;
        try {
            PlanarYUVLuminanceSource source = new PlanarYUVLuminanceSource(
                    data, previewW, previewH, 0, 0, previewW, previewH, false);
            BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(source));
            Result result = reader.decodeWithState(bitmap);
            if (result != null && result.getText() != null) {
                onDecoded(result.getText().trim());
            }
        } catch (Exception ignored) {
            // Khong thay ma trong khung nay — thu khung sau.
        } finally {
            reader.reset();
        }
    }

    private void onDecoded(String text) {
        Uri uri = null;
        try {
            uri = Uri.parse(text);
        } catch (Exception ignored) {
        }
        if (uri == null || !"farmpair".equals(uri.getScheme())) {
            hint.setText("Mã vừa quét không phải mã ghép nối Farm Agent — hãy quét mã ở mục “Thêm máy → Ghép nối bằng QR” trên trang điều khiển.");
            return;
        }
        String host = uri.getQueryParameter("h");
        String code = uri.getQueryParameter("c");
        int port = 8787;
        try {
            port = Integer.parseInt(uri.getQueryParameter("p"));
        } catch (Exception ignored) {
        }
        if (host == null || host.trim().isEmpty() || code == null || code.trim().isEmpty()) {
            hint.setText("Mã ghép nối thiếu thông tin — tạo mã mới trên trang điều khiển rồi quét lại.");
            return;
        }
        decoded = true;
        stopCamera();
        // Giu nguyen nhan may hien tai (nhan van sua duoc o man hinh chinh).
        Prefs.save(this, host.trim(), port, Prefs.label(this), true);
        Prefs.setPairCode(this, code.trim());
        startAgentService();
        AgentService.requestReconnect();
        Toast.makeText(this, "Đã nhận mã ghép nối — đang kết nối về " + host.trim() + ":" + port + "...", Toast.LENGTH_LONG).show();
        finish();
    }

    private void startAgentService() {
        Intent svc = new Intent(this, AgentService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(svc);
        } else {
            startService(svc);
        }
    }
}
