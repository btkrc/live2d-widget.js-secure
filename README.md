# live2d-widget-secure

A modified version of [xiazeyu/live2d-widget.js](https://github.com/xiazeyu/live2d-widget.js) with added support for encrypted assets.

## About

The original live2d-widget loads plaintext `.moc` files and related configs, which makes them easy to scrape.

This version adds a custom decryption step in the loading pipeline. Encrypted model assets are decrypted in memory before being passed to the Live2D renderer.

## Main Changes

- Added decryption handling for `.moc` files in `src/PlatformManager.js`
- Added decryption handling for config JSONs in `src/Utils/ModelSettingJson.js`
- Uses a custom multi-byte stream cipher (XOR, dynamic shifting, etc.)
- Supports stripping fake file headers that were added during encryption
- Code structure works well with heavy obfuscators like JSVMP

Full encryption scripts and usage notes are available on my blog: [https://www.zkryn.com/posts/5a8a6c8d/](https://www.zkryn.com/posts/5a8a6c8d/)

## Important Notes

1. **This repository contains no model assets** (no `.moc` files, textures, or encrypted configs).
2. Production keys have been replaced with placeholders. If you want to build and test it yourself, fill in your own keys in `PlatformManager.js`.
3. The version running on my blog is protected with JSVMP obfuscation. The code in this repo is the readable source, provided for open-source compliance.

## License & Credits

This project is licensed under the **AGPL-3.0** License. See the [LICENSE](LICENSE) file for details.

**Original Project:**
- Author: xiazeyu
- Repository: https://github.com/xiazeyu/live2d-widget.js
- License: AGPL-3.0

**Modifications by:**
- Zekalryn (李晟赫)
- Blog: https://www.zkryn.com
