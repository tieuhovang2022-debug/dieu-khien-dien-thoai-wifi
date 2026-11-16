package vn.duongashita.farmagent;

import android.content.Intent;

// Giu ket qua cap quyen chup man hinh (MediaProjection) trong bo nho.
// Mat khi agent bi tat hoan toan -> nguoi dung cap lai trong MainActivity.
public final class MediaPerm {
    public static volatile boolean granted = false;
    public static volatile int resultCode = 0;
    public static volatile Intent data = null;

    private MediaPerm() {}
}
