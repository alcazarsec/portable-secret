### What does this do?

It creates a [Portable Secret](https://mprimi.github.io/portable-secret/): a self-contained HTML file that unlocks encrypted data when you enter the password.

The file bundles an encrypted payload and the JavaScript needed to decrypt it using your browser's Web Crypto APIs. You can open it with any browser, even offline.

### Is my password or data sent to a server?

No. Everything happens locally in your browser.

The decryption logic lives inside the file. When you enter the password, the browser derives a key and decrypts the data in memory. Nothing is uploaded or sent anywhere.

### How should I open it safely?

Open it offline in a private window.

Treat the file like a program you run locally. For extra assurance, open a private window and turn off wifi/data before entering the password.

### What happens if I forget the password?

The data is unrecoverable.

There is no "Forgot Password" flow or master key. If the password is lost, the encryption cannot be reversed. Use a memorable passphrase and a hint you will recognize later.

### What kind of data can be inside?

Text plus multiple file attachments.

Portable Secrets can include notes, images, documents, archives, and other files. After decryption, you can view or download each item.

### Will this work on my phone or tablet?

Yes, on most modern browsers.

Any reasonably recent browser (Safari, Chrome, Firefox, Edge) should open and decrypt the file without extra apps. Saving decrypted files depends on your device's file handling.

### Can I store this on cloud drives or a USB stick?

Yes, if your password is strong.

The payload is encrypted at rest, so the file is safe to store in "insecure" locations. Without the password, the file is useless to an attacker.

### How secure is the encryption? (Technical)

It uses modern, standard cryptography.

The payload is encrypted with `AES-GCM`. A key is derived from your password with a KDF: `Argon2id` (default, stronger, memory-hard) or `PBKDF2` (browser-native). The file includes whichever KDF was chosen during creation.

### How is this different from a password-protected ZIP?

Better compatibility and safer cryptographic defaults.

You do not need special software, only a browser. Many ZIP tools use weaker encryption or require extraction to view files. Portable Secret uses modern cryptography and can display content directly.

### Will this still work in 10 or 20 years?

Very likely.

The file is plain HTML and JavaScript, relying on web standards and the Web Crypto API. Browsers are built for long-term backward compatibility.

### Is this open source? Can I see the code?

Yes. The code is open source and can be reviewed at [github.com/alcazarsec/portable-secret](https://github.com/alcazarsec/portable-secret).
