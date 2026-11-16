package vn.duongashita.farmagent;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

/**
 * Receiver cho Device Admin / Device Owner.
 * Khi Farm Agent duoc ghi danh la Device Owner (qua QR provisioning luc may
 * vua factory reset), lenh factory_reset tu server moi goi duoc
 * DevicePolicyManager.wipeData().
 */
public class AdminReceiver extends DeviceAdminReceiver {

    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
        Toast.makeText(context, "Farm Agent: đã bật quyền quản trị thiết bị", Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        super.onDisabled(context, intent);
        Toast.makeText(context, "Farm Agent: đã tắt quyền quản trị thiết bị", Toast.LENGTH_SHORT).show();
    }
}
