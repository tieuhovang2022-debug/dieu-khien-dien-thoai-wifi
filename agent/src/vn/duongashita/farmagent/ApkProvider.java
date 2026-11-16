package vn.duongashita.farmagent;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

// ContentProvider nho de cap file APK trong cache dir cho trinh cai dat cua Android.
// Chi phuc vu file nam trong cache dir cua app, ten file da duoc lam sach.
public class ApkProvider extends ContentProvider {
    public static final String AUTHORITY = "vn.duongashita.farmagent.apkprovider";

    public static Uri uriFor(File f) {
        return Uri.parse("content://" + AUTHORITY + "/" + Uri.encode(f.getName()));
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.contains("/") || name.contains("\\") || name.contains("..")) {
            throw new FileNotFoundException("bad name");
        }
        File f = new File(getContext().getCacheDir(), name);
        if (!f.isFile()) {
            throw new FileNotFoundException(name);
        }
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        return null;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
